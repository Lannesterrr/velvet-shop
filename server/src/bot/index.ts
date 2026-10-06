/**
 * Telegram-бот (grammY): запуск Mini App, команды, модерация оплат из чата.
 */
import type { Express } from 'express';
import { GrammyError, HttpError as TgHttpError, InlineKeyboard, webhookCallback } from 'grammy';
import { DEFAULT_DELIVERY_TEXT, ORDER_STATUS_EMOJI, ORDER_STATUS_LABELS, formatMoney } from '@shop/shared';
import { config } from '../config';
import { prisma } from '../db';
import { HttpError } from '../lib/errors';
import { logger } from '../logger';
import { forgetUserCache } from '../middleware/auth';
import { isAdmin } from '../services/admin.service';
import { confirmPayment, rejectPayment } from '../services/order.service';
import { getSettings } from '../services/settings.service';
import { appUrl, bot, esc } from './instance';

/** Причина по умолчанию при отклонении оплаты кнопкой из чата */
const DEFAULT_REJECT_REASON = 'Платёж не найден. Проверьте сумму и реквизиты перевода.';

function registerHandlers(): void {
  // /start — приветствие и кнопка открытия магазина
  bot.command('start', async (ctx) => {
    if (!ctx.from) return;
    // Пользователь написал боту → бот может присылать ему уведомления
    await prisma.user.upsert({
      where: { telegramId: BigInt(ctx.from.id) },
      create: {
        telegramId: BigInt(ctx.from.id),
        username: ctx.from.username ?? null,
        firstName: ctx.from.first_name ?? null,
        lastName: ctx.from.last_name ?? null,
        languageCode: ctx.from.language_code ?? null,
        canWrite: true,
      },
      update: { canWrite: true, username: ctx.from.username ?? null },
    });
    forgetUserCache(ctx.from.id);

    const settings = await getSettings();

    // Друг поделился корзиной: /start cart_<token>
    const shared = /^cart_([\w-]{8,32})$/.exec(String(ctx.match ?? ''));
    if (shared) {
      await ctx.reply('🎁 С вами поделились корзиной! Откройте, чтобы посмотреть товары и добавить их к себе.', {
        reply_markup: new InlineKeyboard().webApp('🛍 Открыть корзину', appUrl(`/cart/shared/${shared[1]}`)),
      });
      return;
    }

    const keyboard = new InlineKeyboard().webApp('🛍 Открыть магазин', appUrl('/'));
    if (await isAdmin(ctx.from.id)) keyboard.row().webApp('⚙️ Админ-панель', appUrl('/admin'));

    await ctx.reply(
      `Добро пожаловать в <b>${esc(settings.shopName)}</b>!\n\n` +
        '🔞 Магазин для взрослых — только 18+.\n' +
        '📦 Анонимная упаковка, доставка по всей России до 7 дней.\n\n' +
        'Нажмите кнопку ниже, чтобы открыть каталог. Сюда же будут приходить уведомления о ваших заказах.\n' +
        'Условия доставки — /delivery',
      { parse_mode: 'HTML', reply_markup: keyboard },
    );
  });

  // Условия доставки (текст редактируется в админке → Настройки)
  bot.command('delivery', async (ctx) => {
    const s = await getSettings();
    const methods = await prisma.deliveryMethod.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    const lines = methods.map((m) => {
      const price = m.price === 0 ? 'бесплатно' : formatMoney(m.price, s.currency);
      const free = m.freeFrom !== null && m.price > 0 ? ` (бесплатно от ${formatMoney(m.freeFrom, s.currency)})` : '';
      return `• <b>${esc(m.name)}</b> — ${price}${free}${m.description ? `\n   ${esc(m.description)}` : ''}`;
    });
    await ctx.reply(
      `🚚 <b>Доставка</b>\n\n${esc(s.deliveryText || DEFAULT_DELIVERY_TEXT)}` +
        (lines.length ? `\n\n<b>Способы доставки:</b>\n${lines.join('\n')}` : ''),
      { parse_mode: 'HTML', reply_markup: new InlineKeyboard().webApp('🛍 Открыть магазин', appUrl('/')) },
    );
  });

  bot.command('admin', async (ctx) => {
    if (!ctx.from || !(await isAdmin(ctx.from.id))) {
      await ctx.reply('Команда доступна только администраторам.');
      return;
    }
    await ctx.reply('Админ-панель магазина:', {
      reply_markup: new InlineKeyboard().webApp('⚙️ Открыть админ-панель', appUrl('/admin')),
    });
  });

  bot.command('orders', async (ctx) => {
    if (!ctx.from) return;
    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from.id) } });
    const orders = user
      ? await prisma.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 5 })
      : [];
    if (!orders.length) {
      await ctx.reply('У вас пока нет заказов.', {
        reply_markup: new InlineKeyboard().webApp('🛍 Открыть магазин', appUrl('/')),
      });
      return;
    }
    const { currency } = await getSettings();
    const lines = orders.map(
      (o) => `${ORDER_STATUS_EMOJI[o.status]} №${o.id} — ${formatMoney(o.total, currency)} — ${ORDER_STATUS_LABELS[o.status]}`,
    );
    await ctx.reply(`<b>Ваши последние заказы:</b>\n\n${lines.join('\n')}`, {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().webApp('Все заказы', appUrl('/orders')),
    });
  });

  bot.command('help', async (ctx) => {
    const s = await getSettings();
    const parts = [
      `<b>${esc(s.shopName)}</b>`,
      s.supportText ? esc(s.supportText) : null,
      s.supportUsername ? `Поддержка: @${esc(s.supportUsername)}` : null,
      s.supportPhone ? `Телефон: ${esc(s.supportPhone)}` : null,
      '',
      '/start — открыть магазин',
      '/delivery — доставка и сроки',
      '/orders — мои заказы',
      '/myid — узнать свой Telegram ID',
    ].filter((p): p is string => p !== null);
    await ctx.reply(parts.join('\n'), { parse_mode: 'HTML' });
  });

  // Помогает владельцу узнать ID для ADMIN_IDS или для добавления админа
  bot.command('myid', async (ctx) => {
    if (!ctx.from) return;
    await ctx.reply(`Ваш Telegram ID: <code>${ctx.from.id}</code>`, { parse_mode: 'HTML' });
  });

  // Кнопки «Подтвердить / Отклонить» под чеком у админа
  bot.callbackQuery(/^pay:(ok|no):(\d+)$/, async (ctx) => {
    const [, action, idRaw] = ctx.match;
    const orderId = Number(idRaw);
    if (!(await isAdmin(ctx.from.id))) {
      await ctx.answerCallbackQuery({ text: 'Недостаточно прав', show_alert: true });
      return;
    }

    try {
      const actor = { telegramId: BigInt(ctx.from.id) };
      if (action === 'ok') await confirmPayment(orderId, actor);
      else await rejectPayment(orderId, actor, DEFAULT_REJECT_REASON);

      const who = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
      const verdict = action === 'ok' ? `✅ Оплата подтверждена (${esc(who)})` : `❌ Оплата отклонена (${esc(who)})`;
      await ctx.answerCallbackQuery({ text: action === 'ok' ? 'Оплата подтверждена' : 'Оплата отклонена' });

      // Дописываем результат под сообщением и оставляем только кнопку открытия заказа
      const original = ctx.callbackQuery.message && 'caption' in ctx.callbackQuery.message ? ctx.callbackQuery.message.caption : undefined;
      const keyboard = new InlineKeyboard().webApp('Открыть заказ', appUrl(`/admin/orders/${orderId}`));
      if (original !== undefined) {
        await ctx.editMessageCaption({ caption: `${esc(original)}\n\n${verdict}`, parse_mode: 'HTML', reply_markup: keyboard });
      } else {
        await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
        await ctx.reply(`Заказ №${orderId}: ${verdict}`, { parse_mode: 'HTML' });
      }
    } catch (err) {
      if (err instanceof HttpError) {
        await ctx.answerCallbackQuery({ text: err.message, show_alert: true });
        return;
      }
      throw err;
    }
  });

  bot.catch((err) => {
    const e = err.error;
    if (e instanceof GrammyError) logger.error({ description: e.description }, 'Ошибка Telegram API');
    else if (e instanceof TgHttpError) logger.error({ err: e }, 'Нет связи с Telegram');
    else logger.error({ err: e }, 'Ошибка в обработчике бота');
  });
}

/** Настройка меню и команд бота (идемпотентно, при каждом старте) */
async function configureBot(): Promise<void> {
  try {
    await bot.api.setMyCommands([
      { command: 'start', description: 'Открыть магазин' },
      { command: 'delivery', description: 'Доставка и сроки' },
      { command: 'orders', description: 'Мои заказы' },
      { command: 'help', description: 'Помощь и контакты' },
      { command: 'myid', description: 'Мой Telegram ID' },
    ]);
    // Кнопка «Магазин» слева от поля ввода во всех чатах с ботом
    await bot.api.setChatMenuButton({
      menu_button: { type: 'web_app', text: 'Магазин', web_app: { url: appUrl('/') } },
    });
  } catch (err) {
    logger.warn({ err }, 'Не удалось настроить меню бота');
  }
}

let handlersRegistered = false;
function ensureHandlers(): void {
  if (handlersRegistered) return;
  registerHandlers();
  handlersRegistered = true;
}

/** Маршрут webhook. Регистрируется синхронно при создании приложения (до обработчика 404). */
export function mountWebhook(app: Express): void {
  if (config.BOT_MODE !== 'webhook') return;
  ensureHandlers();
  app.post(config.webhookPath, webhookCallback(bot, 'express', { secretToken: config.WEBHOOK_SECRET }));
}

/**
 * Запуск бота в выбранном режиме.
 * webhook — Telegram сам присылает обновления на https://<домен>/bot/webhook (продакшен);
 * polling — сервер опрашивает Telegram (удобно локально, не нужен публичный адрес для бота).
 */
export async function startBot(): Promise<void> {
  ensureHandlers();

  if (config.BOT_MODE === 'off') {
    logger.info('Бот не принимает обновления (BOT_MODE=off), уведомления отправляются');
    return;
  }

  await bot.init();
  logger.info(`Бот @${bot.botInfo.username} инициализирован`);
  await configureBot();

  if (config.BOT_MODE === 'webhook') {
    // Маршрут для webhook подключён в mountWebhook() при создании приложения
    const url = `${config.WEBAPP_URL}${config.webhookPath}`;
    await bot.api.setWebhook(url, {
      secret_token: config.WEBHOOK_SECRET,
      allowed_updates: ['message', 'callback_query'],
    });
    logger.info(`Webhook установлен: ${url}`);
  } else {
    // bot.start() сам удаляет webhook и начинает long polling; не ждём — он работает бесконечно.
    // Ошибку (например, 409 — бот уже запущен в другом месте) логируем, магазин продолжает работать.
    bot
      .start({
        allowed_updates: ['message', 'callback_query'],
        onStart: () => logger.info('Бот запущен в режиме long polling'),
      })
      .catch((err) => logger.error({ err }, 'Long polling остановлен с ошибкой (бот запущен где-то ещё?)'));
  }
}

export async function stopBot(): Promise<void> {
  if (config.BOT_MODE === 'polling' && bot.isRunning()) await bot.stop();
}
