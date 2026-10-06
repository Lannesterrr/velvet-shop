/**
 * Заказы: оформление из корзины, оплата, чеки, смена статусов.
 *
 * Жизненный цикл:
 *   NEW ──(клиент выбрал способ оплаты)──▶ AWAITING_PAYMENT ──(загрузил чек)──▶ PAYMENT_REVIEW
 *   PAYMENT_REVIEW ──(админ подтвердил)──▶ PAID ──▶ SHIPPED ──▶ DELIVERED
 *   PAYMENT_REVIEW ──(админ отклонил)──▶ AWAITING_PAYMENT (с причиной)
 *   любой незавершённый ──▶ CANCELLED (остатки возвращаются на склад)
 */
import type { Prisma } from '@prisma/client';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TRANSITIONS,
  PAYABLE_STATUSES,
  USER_CANCELLABLE_STATUSES,
  type AdminOrderDTO,
  type CheckoutInput,
  type OrderDTO,
  type OrderListItemDTO,
  type OrderStatus,
  type Paginated,
  type PaymentMethodDTO,
} from '@shop/shared';
import type { z } from 'zod';
import type { adminOrderListQuerySchema } from '@shop/shared';
import { prisma } from '../db';
import { badRequest, conflict, notFound } from '../lib/errors';
import { removeReceipt, saveReceipt } from '../lib/files';
import { logger } from '../logger';
import { notifyAdminsNewOrder, notifyAdminsReceipt, notifyUserStatus } from '../bot/notify';
import { mainImage, orderDTO, paymentMethodDTO, paymentSnapshot, variantPrice, type FullOrder } from './mappers';

const fullOrderInclude = { items: true, history: true } as const;

/** Кто меняет статус: telegramId админа или null (клиент / система) */
export interface Actor {
  telegramId: bigint | null;
}

// ───────── Публичные способы оплаты ─────────

export async function listActivePaymentMethods(): Promise<PaymentMethodDTO[]> {
  const rows = await prisma.paymentMethod.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  return rows.map(paymentMethodDTO);
}

// ───────── Оформление ─────────

export async function createOrder(userId: number, input: CheckoutInput): Promise<OrderDTO> {
  const delivery = await prisma.deliveryMethod.findFirst({
    where: { id: input.deliveryMethodId, isActive: true },
  });
  if (!delivery) throw badRequest('Выбранный способ доставки недоступен', { deliveryMethodId: 'Выберите способ доставки' });
  if (delivery.requiresAddress && !input.address) {
    throw badRequest('Укажите адрес или пункт выдачи', { address: 'Укажите адрес или пункт выдачи' });
  }

  const cart = await prisma.cartItem.findMany({
    where: { userId },
    include: { variant: { include: { product: { include: { images: true, category: true } } } } },
    orderBy: { createdAt: 'asc' },
  });
  if (!cart.length) throw badRequest('Корзина пуста');

  // Предварительная проверка — чтобы сразу вернуть понятное сообщение
  for (const row of cart) {
    const { product } = row.variant;
    if (product.status !== 'ACTIVE' || !product.category.isActive) {
      throw conflict(`«${product.title}» больше не продаётся — удалите его из корзины`);
    }
    if (row.variant.stock < row.quantity) {
      throw conflict(
        `«${product.title}» (${row.variant.size}, ${row.variant.color}): в наличии только ${row.variant.stock} шт.`,
      );
    }
  }

  const itemsTotal = cart.reduce((sum, r) => sum + variantPrice(r.variant, r.variant.product.price) * r.quantity, 0);
  const deliveryPrice = delivery.freeFrom !== null && itemsTotal >= delivery.freeFrom ? 0 : delivery.price;

  const order = await prisma.$transaction(async (tx) => {
    // Атомарно списываем остатки: условие stock >= quantity защищает от гонки двух покупателей
    for (const row of cart) {
      const res = await tx.productVariant.updateMany({
        where: { id: row.variantId, stock: { gte: row.quantity } },
        data: { stock: { decrement: row.quantity } },
      });
      if (res.count !== 1) {
        throw conflict(`«${row.variant.product.title}» (${row.variant.size}) только что закончился. Обновите корзину.`);
      }
    }

    const created = await tx.order.create({
      data: {
        userId,
        status: 'NEW',
        customerName: input.customerName,
        phone: input.phone,
        address: delivery.requiresAddress ? input.address : null,
        comment: input.comment,
        deliveryMethodId: delivery.id,
        deliveryName: delivery.name,
        deliveryPrice,
        itemsTotal,
        total: itemsTotal + deliveryPrice,
        items: {
          create: cart.map((r) => ({
            variantId: r.variantId,
            productId: r.variant.productId,
            title: r.variant.product.title,
            sku: r.variant.product.sku,
            size: r.variant.size,
            color: r.variant.color,
            imageUrl: mainImage(r.variant.product.images)?.thumbUrl ?? null,
            price: variantPrice(r.variant, r.variant.product.price),
            quantity: r.quantity,
          })),
        },
        history: { create: { fromStatus: null, toStatus: 'NEW', comment: 'Заказ оформлен' } },
      },
      include: fullOrderInclude,
    });

    await tx.cartItem.deleteMany({ where: { userId } });
    // Запоминаем телефон для автозаполнения в следующий раз
    await tx.user.update({ where: { id: userId }, data: { phone: input.phone } });
    return created;
  });

  // Уведомление не должно ломать оформление заказа
  notifyAdminsNewOrder(order.id).catch((err) => logger.error({ err }, 'Не удалось уведомить админов о заказе'));
  return orderDTO(order);
}

// ───────── Заказы покупателя ─────────

async function findUserOrder(userId: number, orderId: number): Promise<FullOrder> {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId }, include: fullOrderInclude });
  if (!order) throw notFound('Заказ не найден');
  return order;
}

export async function getUserOrder(userId: number, orderId: number): Promise<OrderDTO> {
  return orderDTO(await findUserOrder(userId, orderId));
}

function listItem(
  o: Prisma.OrderGetPayload<{ include: { items: true } }>,
): OrderListItemDTO {
  return {
    id: o.id,
    status: o.status,
    total: o.total,
    itemsCount: o.items.reduce((s, i) => s + i.quantity, 0),
    customerName: o.customerName,
    phone: o.phone,
    createdAt: o.createdAt.toISOString(),
    previewImage: o.items.find((i) => i.imageUrl)?.imageUrl ?? null,
    hasReceipt: Boolean(o.receiptPath),
  };
}

export async function listUserOrders(userId: number): Promise<OrderListItemDTO[]> {
  const rows = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { items: true },
  });
  return rows.map(listItem);
}

/** Клиент выбирает способ оплаты на экране оплаты */
export async function selectPaymentMethod(userId: number, orderId: number, paymentMethodId: number): Promise<OrderDTO> {
  const order = await findUserOrder(userId, orderId);
  if (!PAYABLE_STATUSES.includes(order.status)) throw badRequest('Этот заказ уже не требует оплаты');

  const method = await prisma.paymentMethod.findFirst({ where: { id: paymentMethodId, isActive: true } });
  if (!method) throw badRequest('Способ оплаты недоступен, выберите другой');

  const nextStatus: OrderStatus = order.status === 'NEW' ? 'AWAITING_PAYMENT' : order.status;
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      paymentMethodId: method.id,
      paymentSnapshot: paymentSnapshot(method) as unknown as Prisma.InputJsonValue,
      status: nextStatus,
      ...(nextStatus !== order.status
        ? { history: { create: { fromStatus: order.status, toStatus: nextStatus, comment: `Способ оплаты: ${method.title}` } } }
        : {}),
    },
    include: fullOrderInclude,
  });
  return orderDTO(updated);
}

/** Клиент прикрепляет чек/скриншот оплаты */
export async function uploadReceipt(userId: number, orderId: number, file: Express.Multer.File): Promise<OrderDTO> {
  const order = await findUserOrder(userId, orderId);
  if (!PAYABLE_STATUSES.includes(order.status)) throw badRequest('Чек можно прикрепить только к неоплаченному заказу');
  if (!order.paymentMethodId) throw badRequest('Сначала выберите способ оплаты');

  const relativePath = await saveReceipt(file, orderId);
  const method = await prisma.paymentMethod.findUnique({ where: { id: order.paymentMethodId } });

  let updated: FullOrder;
  try {
    // Условие по статусу защищает от гонки с админом, который одновременно меняет статус
    const res = await prisma.order.updateMany({
      where: { id: orderId, status: { in: PAYABLE_STATUSES } },
      data: {
        receiptPath: relativePath,
        receiptUploadedAt: new Date(),
        rejectReason: null,
        status: 'PAYMENT_REVIEW',
        ...(method ? { paymentSnapshot: paymentSnapshot(method) as unknown as Prisma.InputJsonValue } : {}),
      },
    });
    if (res.count !== 1) throw conflict('Статус заказа изменился, обновите страницу');
    await prisma.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: 'PAYMENT_REVIEW',
        comment: order.receiptPath ? 'Загружен новый чек' : 'Загружен чек об оплате',
      },
    });
    updated = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: fullOrderInclude });
  } catch (err) {
    await removeReceipt(relativePath);
    throw err;
  }

  // Старый чек больше не нужен
  if (order.receiptPath) await removeReceipt(order.receiptPath);

  notifyAdminsReceipt(orderId).catch((err) => logger.error({ err }, 'Не удалось отправить чек админам'));
  return orderDTO(updated);
}

export async function cancelByUser(userId: number, orderId: number): Promise<OrderDTO> {
  const order = await findUserOrder(userId, orderId);
  if (!USER_CANCELLABLE_STATUSES.includes(order.status)) {
    throw badRequest('Этот заказ уже нельзя отменить самостоятельно — напишите в поддержку');
  }
  await changeStatus(orderId, 'CANCELLED', { telegramId: null }, { comment: 'Отменён покупателем', notifyUser: false });
  return getUserOrder(userId, orderId);
}

// ───────── Смена статуса (общая для админки и бота) ─────────

interface ChangeStatusOptions {
  comment?: string | null;
  trackingNumber?: string | null;
  rejectReason?: string | null;
  notifyUser?: boolean;
}

export async function changeStatus(
  orderId: number,
  to: OrderStatus,
  actor: Actor,
  opts: ChangeStatusOptions = {},
): Promise<FullOrder> {
  const updated = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw notFound('Заказ не найден');
    const from = order.status;

    if (from === to) throw badRequest(`Заказ уже в статусе «${ORDER_STATUS_LABELS[to]}»`);
    if (!ORDER_STATUS_TRANSITIONS[from].includes(to)) {
      throw badRequest(`Нельзя перевести заказ из «${ORDER_STATUS_LABELS[from]}» в «${ORDER_STATUS_LABELS[to]}»`);
    }

    // Оптимистичная блокировка: если статус уже кто-то поменял — откатываемся
    const res = await tx.order.updateMany({
      where: { id: orderId, status: from },
      data: {
        status: to,
        ...(to === 'PAID' && !order.paidAt ? { paidAt: new Date() } : {}),
        ...(to === 'PAID' ? { rejectReason: null } : {}),
        ...(opts.rejectReason !== undefined ? { rejectReason: opts.rejectReason } : {}),
        ...(opts.trackingNumber ? { trackingNumber: opts.trackingNumber } : {}),
      },
    });
    if (res.count !== 1) throw conflict('Статус заказа только что изменился, обновите страницу');

    // Отмена — возвращаем товар на склад
    if (to === 'CANCELLED') {
      for (const item of order.items) {
        if (item.variantId) {
          await tx.productVariant.updateMany({
            where: { id: item.variantId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }
    }

    await tx.orderStatusHistory.create({
      data: { orderId, fromStatus: from, toStatus: to, changedBy: actor.telegramId, comment: opts.comment ?? null },
    });

    return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: fullOrderInclude });
  });

  if (opts.notifyUser !== false) {
    notifyUserStatus(orderId).catch((err) => logger.error({ err, orderId }, 'Не удалось уведомить покупателя'));
  }
  return updated;
}

export function confirmPayment(orderId: number, actor: Actor): Promise<FullOrder> {
  return changeStatus(orderId, 'PAID', actor, { comment: 'Оплата подтверждена' });
}

export async function rejectPayment(orderId: number, actor: Actor, reason: string): Promise<FullOrder> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!order) throw notFound('Заказ не найден');
  if (order.status !== 'PAYMENT_REVIEW') throw badRequest('Отклонить можно только оплату на проверке');
  return changeStatus(orderId, 'AWAITING_PAYMENT', actor, {
    comment: `Оплата отклонена: ${reason}`,
    rejectReason: reason,
  });
}

// ───────── Админка ─────────

type AdminOrderQuery = z.output<typeof adminOrderListQuerySchema>;

export async function listAdminOrders(q: AdminOrderQuery): Promise<Paginated<OrderListItemDTO>> {
  const and: Prisma.OrderWhereInput[] = [];
  if (q.status) and.push({ status: q.status });
  if (q.from) and.push({ createdAt: { gte: new Date(`${q.from}T00:00:00`) } });
  if (q.to) and.push({ createdAt: { lte: new Date(`${q.to}T23:59:59.999`) } });
  if (q.search) {
    const s = q.search.replace(/^[#№@]/, '');
    const or: Prisma.OrderWhereInput[] = [
      { customerName: { contains: s, mode: 'insensitive' } },
      { phone: { contains: s } },
      { user: { username: { contains: s, mode: 'insensitive' } } },
    ];
    if (/^\d{1,9}$/.test(s)) or.push({ id: Number(s) });
    and.push({ OR: or });
  }
  const where: Prisma.OrderWhereInput = { AND: and };

  const [total, rows] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      include: { items: true },
    }),
  ]);
  return { items: rows.map(listItem), total, page: q.page, pages: Math.max(1, Math.ceil(total / q.limit)) };
}

/** Количество заказов по статусам — для фильтров в админке */
export async function orderStatusCounts(): Promise<Record<OrderStatus, number>> {
  const groups = await prisma.order.groupBy({ by: ['status'], _count: { _all: true } });
  const counts = {
    NEW: 0,
    AWAITING_PAYMENT: 0,
    PAYMENT_REVIEW: 0,
    PAID: 0,
    SHIPPED: 0,
    DELIVERED: 0,
    CANCELLED: 0,
  } satisfies Record<OrderStatus, number>;
  for (const g of groups) counts[g.status] = g._count._all;
  return counts;
}

export async function getAdminOrder(orderId: number): Promise<AdminOrderDTO> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { ...fullOrderInclude, user: true },
  });
  if (!order) throw notFound('Заказ не найден');
  return {
    ...orderDTO(order, { includeActor: true }),
    adminNote: order.adminNote,
    user: {
      id: order.user.id,
      telegramId: order.user.telegramId.toString(),
      username: order.user.username,
      firstName: order.user.firstName,
      lastName: order.user.lastName,
    },
  };
}

export async function updateOrderNote(
  orderId: number,
  data: { adminNote: string | null; trackingNumber: string | null },
): Promise<AdminOrderDTO> {
  await prisma.order.update({ where: { id: orderId }, data });
  return getAdminOrder(orderId);
}
