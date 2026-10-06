/**
 * «Поделиться корзиной»: пользователь создаёт ссылку на снимок своей корзины,
 * друг открывает её, видит товары с актуальными ценами и наличием
 * и одним нажатием добавляет их в свою корзину.
 */
import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { ImportSharedCartResultDTO, ShareCartResultDTO, SharedCartDTO, SharedCartItemDTO } from '@shop/shared';
import { formatMoney } from '@shop/shared';
import { telegramShareLink } from '../bot/instance';
import { prisma } from '../db';
import { badRequest, notFound } from '../lib/errors';
import { getCart } from './cart.service';
import { mainImage, variantPrice } from './mappers';
import { getSettings } from './settings.service';

/** Сколько живёт ссылка */
const SHARE_TTL_DAYS = 30;
const MAX_QTY_PER_ITEM = 99;

type SnapshotItem = { variantId: number; quantity: number };

function parseItems(json: Prisma.JsonValue): SnapshotItem[] {
  if (!Array.isArray(json)) return [];
  return json
    .map((x) => x as Partial<SnapshotItem>)
    .filter((x): x is SnapshotItem => Number.isInteger(x.variantId) && Number.isInteger(x.quantity) && (x.quantity ?? 0) > 0);
}

/** Создаёт ссылку на текущую корзину пользователя */
export async function shareCart(userId: number): Promise<ShareCartResultDTO> {
  const cart = await getCart(userId);
  const items = cart.items.filter((i) => i.available).map((i) => ({ variantId: i.variant.id, quantity: i.quantity }));
  if (!items.length) throw badRequest('В корзине нет доступных товаров, чтобы поделиться');

  // 9 случайных байт → 12 символов base64url: угадать невозможно, в параметр запуска Telegram помещается
  const token = randomBytes(9).toString('base64url');
  const expiresAt = new Date(Date.now() + SHARE_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.sharedCart.create({
    data: { token, userId, items: items as unknown as Prisma.InputJsonValue, expiresAt },
  });

  const { shopName, currency } = await getSettings();
  const count = items.reduce((s, i) => s + i.quantity, 0);
  return {
    token,
    url: telegramShareLink(`cart_${token}`, `/cart/shared/${token}`),
    text: `🛍 Собрал(а) для тебя корзину в «${shopName}»: ${count} шт. на ${formatMoney(cart.total, currency)}. Открой и оформи в пару нажатий!`,
    expiresAt: expiresAt.toISOString(),
  };
}

async function findShared(token: string) {
  if (!/^[\w-]{8,32}$/.test(token)) throw notFound('Ссылка недействительна');
  const shared = await prisma.sharedCart.findUnique({ where: { token }, include: { user: true } });
  if (!shared) throw notFound('Ссылка недействительна');
  if (shared.expiresAt < new Date()) throw notFound('Срок действия ссылки истёк — попросите прислать новую');
  return shared;
}

/** Просмотр корзины по ссылке (актуальные цены и наличие) */
export async function getSharedCart(token: string, viewerId: number): Promise<SharedCartDTO> {
  const shared = await findShared(token);
  const snapshot = parseItems(shared.items);
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: snapshot.map((i) => i.variantId) } },
    include: { product: { include: { images: true, category: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  const items: SharedCartItemDTO[] = [];
  for (const s of snapshot) {
    const v = byId.get(s.variantId);
    if (!v) continue; // товар удалён — просто не показываем
    const visible = v.product.status === 'ACTIVE' && v.product.category.isActive;
    items.push({
      variantId: v.id,
      quantity: s.quantity,
      price: variantPrice(v, v.product.price),
      available: visible && v.stock > 0,
      product: { id: v.product.id, title: v.product.title, image: mainImage(v.product.images) },
      variant: { size: v.size, color: v.color, colorHex: v.colorHex },
    });
  }

  const available = items.filter((i) => i.available);
  return {
    token,
    // Только имя — фамилию и username другому человеку не показываем
    ownerName: shared.user.firstName || 'Друг',
    isOwn: shared.userId === viewerId,
    createdAt: shared.createdAt.toISOString(),
    expiresAt: shared.expiresAt.toISOString(),
    items,
    total: available.reduce((s, i) => s + i.price * i.quantity, 0),
    count: available.reduce((s, i) => s + i.quantity, 0),
  };
}

/** Добавляет товары из чужой корзины в свою (с учётом остатков) */
export async function importSharedCart(userId: number, token: string): Promise<ImportSharedCartResultDTO> {
  const shared = await findShared(token);
  const snapshot = parseItems(shared.items);
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: snapshot.map((i) => i.variantId) } },
    include: { product: { include: { category: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  const existing = await prisma.cartItem.findMany({ where: { userId } });
  const inCart = new Map(existing.map((c) => [c.variantId, c.quantity]));

  let added = 0;
  let skipped = 0;
  for (const s of snapshot) {
    const v = byId.get(s.variantId);
    const visible = v && v.product.status === 'ACTIVE' && v.product.category.isActive;
    if (!v || !visible || v.stock <= 0) {
      skipped++;
      continue;
    }
    const current = inCart.get(v.id) ?? 0;
    const target = Math.min(current + s.quantity, v.stock, MAX_QTY_PER_ITEM);
    if (target <= current) {
      skipped++;
      continue;
    }
    await prisma.cartItem.upsert({
      where: { userId_variantId: { userId, variantId: v.id } },
      create: { userId, variantId: v.id, quantity: target },
      update: { quantity: target },
    });
    added++;
  }

  if (!added) throw badRequest('Эти товары сейчас недоступны или уже есть в вашей корзине');
  return { cart: await getCart(userId), added, skipped };
}
