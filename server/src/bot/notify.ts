/**
 * Уведомления через бота: покупателю — о смене статуса, админам — о новых заказах и чеках.
 * Все функции «тихие»: ошибки Telegram логируются, но не пробрасываются в бизнес-логику.
 */
import { GrammyError, InlineKeyboard, InputFile } from 'grammy';
import { ORDER_STATUS_EMOJI, ORDER_STATUS_LABELS, formatMoney } from '@shop/shared';
import { prisma } from '../db';
import { resolveReceiptPath } from '../lib/files';
import { logger } from '../logger';
import { allAdminTelegramIds } from '../services/admin.service';
import { getSettings } from '../services/settings.service';
import { appUrl, bot, esc } from './instance';

/** Пользователь запретил боту писать / не запускал бота — помечаем, чтобы не спамить попытками */
async function handleSendError(err: unknown, telegramId: string): Promise<void> {
  if (err instanceof GrammyError && err.error_code === 403) {
    await prisma.user.updateMany({ where: { telegramId: BigInt(telegramId) }, data: { canWrite: false } });
    logger.info({ telegramId }, 'Пользователь не принимает сообщения от бота');
    return;
  }
  logger.warn({ err, telegramId }, 'Ошибка отправки сообщения в Telegram');
}

async function loadOrder(orderId: number) {
  return prisma.order.findUnique({ where: { id: orderId }, include: { items: true, user: true } });
}

type LoadedOrder = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

function orderSummary(order: LoadedOrder, currency: string): string {
  const lines = order.items.map(
    (i) => {
      const variant = [i.size, i.color].filter((x) => !/^стандарт$/i.test(x)).join(', ');
      return `• ${esc(i.title)}${variant ? ` (${esc(variant)})` : ''} × ${i.quantity} — ${formatMoney(i.price * i.quantity, currency)}`;
    },
  );
  const username = order.user.username ? ` (@${esc(order.user.username)})` : '';
  return [
    ...lines,
    '',
    `Доставка: ${esc(order.deliveryName)} — ${formatMoney(order.deliveryPrice, currency)}`,
    `<b>Итого: ${formatMoney(order.total, currency)}</b>`,
    '',
    `👤 ${esc(order.customerName)}${username}`,
    `📞 ${esc(order.phone)}`,
    order.address ? `📍 ${esc(order.address)}` : null,
    order.comment ? `💬 ${esc(order.comment)}` : null,
  ]
    .filter((l): l is string => l !== null)
    .join('\n');
}

/** Отправка всем админам; возвращает количество успешных отправок */
async function sendToAdmins(send: (chatId: string) => Promise<unknown>): Promise<number> {
  const ids = await allAdminTelegramIds();
  let ok = 0;
  for (const id of ids) {
    try {
      await send(id);
      ok++;
    } catch (err) {
      // Админ мог не запустить бота — подскажем в логах
      logger.warn({ err: err instanceof Error ? err.message : err, adminId: id }, 'Не удалось уведомить админа (он запускал бота командой /start?)');
    }
  }
  return ok;
}

export async function notifyAdminsNewOrder(orderId: number): Promise<void> {
  const [order, settings] = await Promise.all([loadOrder(orderId), getSettings()]);
  if (!order) return;
  const text = `🆕 <b>Новый заказ №${order.id}</b>\n\n${orderSummary(order, settings.currency)}`;
  const keyboard = new InlineKeyboard().webApp('Открыть в админке', appUrl(`/admin/orders/${order.id}`));
  await sendToAdmins((chatId) => bot.api.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: keyboard }));
}

/** Клавиатура модерации оплаты: подтверждение/отклонение прямо из чата */
export function paymentReviewKeyboard(orderId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Подтвердить оплату', `pay:ok:${orderId}`)
    .text('❌ Отклонить', `pay:no:${orderId}`)
    .row()
    .webApp('Открыть заказ', appUrl(`/admin/orders/${orderId}`));
}

export async function notifyAdminsReceipt(orderId: number): Promise<void> {
  const [order, settings] = await Promise.all([loadOrder(orderId), getSettings()]);
  if (!order?.receiptPath) return;

  const snapshot = order.paymentSnapshot as { title?: string } | null;
  const caption = [
    `🔎 <b>Чек по заказу №${order.id}</b>`,
    `Сумма к оплате: <b>${formatMoney(order.total, settings.currency)}</b>`,
    snapshot?.title ? `Способ: ${esc(snapshot.title)}` : null,
    `Покупатель: ${esc(order.customerName)}${order.user.username ? ` (@${esc(order.user.username)})` : ''}`,
    '',
    'Проверьте поступление и подтвердите оплату.',
  ]
    .filter((l): l is string => l !== null)
    .join('\n');

  const filePath = resolveReceiptPath(order.receiptPath);
  const isPdf = order.receiptPath.endsWith('.pdf');
  const keyboard = paymentReviewKeyboard(order.id);

  await sendToAdmins((chatId) =>
    isPdf
      ? bot.api.sendDocument(chatId, new InputFile(filePath), { caption, parse_mode: 'HTML', reply_markup: keyboard })
      : bot.api.sendPhoto(chatId, new InputFile(filePath), { caption, parse_mode: 'HTML', reply_markup: keyboard }),
  );
}

/** Сообщение покупателю о текущем статусе заказа */
export async function notifyUserStatus(orderId: number): Promise<void> {
  const [order, settings] = await Promise.all([loadOrder(orderId), getSettings()]);
  if (!order) return;

  const n = `№${order.id}`;
  let text: string;
  switch (order.status) {
    case 'AWAITING_PAYMENT':
      text = order.rejectReason
        ? `❗ Оплата заказа ${n} не подтверждена.\nПричина: ${esc(order.rejectReason)}\n\nПроверьте перевод и прикрепите чек повторно.`
        : `💳 Заказ ${n} ожидает оплаты: ${formatMoney(order.total, settings.currency)}.`;
      break;
    case 'PAYMENT_REVIEW':
      text = `🔎 Чек по заказу ${n} получен, проверяем оплату.`;
      break;
    case 'PAID':
      text = `✅ Оплата заказа ${n} подтверждена! Собираем ваш заказ.`;
      break;
    case 'SHIPPED':
      text = `🚚 Заказ ${n} отправлен!${order.trackingNumber ? `\nТрек-номер: <code>${esc(order.trackingNumber)}</code>` : ''}`;
      break;
    case 'DELIVERED':
      text = `📦 Заказ ${n} доставлен. Спасибо за покупку в «${esc(settings.shopName)}»!`;
      break;
    case 'CANCELLED':
      text = `❌ Заказ ${n} отменён.${settings.supportUsername ? `\nВопросы — @${esc(settings.supportUsername)}` : ''}`;
      break;
    default:
      text = `${ORDER_STATUS_EMOJI[order.status]} Статус заказа ${n}: ${ORDER_STATUS_LABELS[order.status]}`;
  }

  const telegramId = order.user.telegramId.toString();
  try {
    await bot.api.sendMessage(telegramId, text, {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().webApp('Открыть заказ', appUrl(`/orders/${order.id}`)),
    });
  } catch (err) {
    await handleSendError(err, telegramId);
  }
}
