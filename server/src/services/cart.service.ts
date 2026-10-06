/**
 * Корзина хранится на сервере — она общая для всех устройств пользователя
 * и проверяется по актуальным остаткам и ценам при каждом запросе.
 */
import type { CartDTO, CartItemDTO } from '@shop/shared';
import { prisma } from '../db';
import { badRequest, notFound } from '../lib/errors';
import { mainImage, variantDTO, variantPrice } from './mappers';

const MAX_QTY_PER_ITEM = 99;

const cartInclude = {
  variant: { include: { product: { include: { images: true, category: true } } } },
} as const;

export async function getCart(userId: number): Promise<CartDTO> {
  const rows = await prisma.cartItem.findMany({
    where: { userId },
    include: cartInclude,
    orderBy: { createdAt: 'asc' },
  });

  const items: CartItemDTO[] = rows.map((row) => {
    const { variant } = row;
    const { product } = variant;
    const visible = product.status === 'ACTIVE' && product.category.isActive;
    const maxQuantity = visible ? Math.min(variant.stock, MAX_QTY_PER_ITEM) : 0;
    return {
      id: row.id,
      quantity: row.quantity,
      price: variantPrice(variant, product.price),
      variant: variantDTO(variant, product.price),
      product: {
        id: product.id,
        title: product.title,
        price: product.price,
        oldPrice: product.oldPrice,
        image: mainImage(product.images),
      },
      available: visible && variant.stock >= row.quantity && row.quantity > 0,
      maxQuantity,
    };
  });

  const available = items.filter((i) => i.available);
  return {
    items,
    count: available.reduce((s, i) => s + i.quantity, 0),
    total: available.reduce((s, i) => s + i.quantity * i.price, 0),
  };
}

/** Проверяет, что вариант продаётся, и возвращает его остаток */
async function sellableStock(variantId: number): Promise<number> {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: { product: { include: { category: true } } },
  });
  if (!variant || variant.product.status !== 'ACTIVE' || !variant.product.category.isActive) {
    throw notFound('Товар не найден или снят с продажи');
  }
  return variant.stock;
}

export async function addToCart(userId: number, variantId: number, quantity: number): Promise<CartDTO> {
  const stock = await sellableStock(variantId);
  const existing = await prisma.cartItem.findUnique({ where: { userId_variantId: { userId, variantId } } });
  const wanted = (existing?.quantity ?? 0) + quantity;
  const limit = Math.min(stock, MAX_QTY_PER_ITEM);

  if (stock <= 0) throw badRequest('Этого размера нет в наличии');
  if (wanted > limit) {
    throw badRequest(existing ? `В корзине уже максимум доступного: ${limit} шт.` : `Доступно только ${limit} шт.`);
  }

  await prisma.cartItem.upsert({
    where: { userId_variantId: { userId, variantId } },
    create: { userId, variantId, quantity },
    update: { quantity: wanted },
  });
  return getCart(userId);
}

export async function updateCartItem(userId: number, itemId: number, quantity: number): Promise<CartDTO> {
  const item = await prisma.cartItem.findFirst({ where: { id: itemId, userId } });
  if (!item) throw notFound('Позиция не найдена в корзине');
  const stock = await sellableStock(item.variantId);
  const limit = Math.min(stock, MAX_QTY_PER_ITEM);
  if (quantity > limit) throw badRequest(limit > 0 ? `Доступно только ${limit} шт.` : 'Товар закончился');
  await prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
  return getCart(userId);
}

export async function removeCartItem(userId: number, itemId: number): Promise<CartDTO> {
  await prisma.cartItem.deleteMany({ where: { id: itemId, userId } });
  return getCart(userId);
}

export async function clearCart(userId: number): Promise<CartDTO> {
  await prisma.cartItem.deleteMany({ where: { userId } });
  return getCart(userId);
}
