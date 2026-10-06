/**
 * Преобразование записей Prisma в DTO для API (см. shared/src/types.ts).
 */
import type {
  CategoryDTO,
  DeliveryMethodDTO,
  OrderDTO,
  OrderStatus,
  PaymentMethodDTO,
  PaymentSnapshot,
  ProductDTO,
  ProductImageDTO,
  ProductVariantDTO,
} from '@shop/shared';
import type {
  Category,
  DeliveryMethod,
  Order,
  OrderItem,
  OrderStatusHistory,
  PaymentMethod,
  Product,
  ProductImage,
  ProductVariant,
} from '@prisma/client';
import { receiptUrl } from '../lib/signedUrl';

export const imageDTO = (i: ProductImage): ProductImageDTO => ({
  id: i.id,
  url: i.url,
  thumbUrl: i.thumbUrl,
  sortOrder: i.sortOrder,
  isMain: i.isMain,
});

/** Главное фото: отмеченное isMain, иначе первое по порядку */
export function mainImage(images: ProductImage[]): ProductImageDTO | null {
  if (!images.length) return null;
  const main = images.find((i) => i.isMain) ?? [...images].sort((a, b) => a.sortOrder - b.sortOrder)[0];
  return imageDTO(main);
}

/** Цена варианта: своя или цена товара */
export const variantPrice = (v: ProductVariant, productPrice: number): number => v.price ?? productPrice;

export const variantDTO = (v: ProductVariant, productPrice: number): ProductVariantDTO => ({
  id: v.id,
  size: v.size,
  color: v.color,
  colorHex: v.colorHex,
  price: variantPrice(v, productPrice),
  hasOwnPrice: v.price !== null,
  stock: v.stock,
});

/** Порядок фото: главное первым, затем по sortOrder */
export function sortImages(images: ProductImage[]): ProductImage[] {
  return [...images].sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.sortOrder - b.sortOrder || a.id - b.id);
}

export function productDTO(
  p: Product & { images: ProductImage[]; variants: ProductVariant[]; category: Category },
): ProductDTO {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    categoryId: p.categoryId,
    categoryName: p.category.name,
    price: p.price,
    oldPrice: p.oldPrice,
    sku: p.sku,
    brand: p.brand,
    material: p.material,
    status: p.status,
    images: sortImages(p.images).map(imageDTO),
    variants: sortVariants(p.variants).map((v) => variantDTO(v, p.price)),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** Порядок вариантов: XS…XXXL по росту; объём памяти (ГБ/ТБ) и числа — по значению; остальное — по алфавиту */
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL'];

/** "256 ГБ" → 256, "1 ТБ" → 1024, "42 мм" → 42, "Стандарт" → NaN */
function numericValue(s: string): number {
  const n = parseFloat(s.replace(',', '.'));
  if (Number.isNaN(n)) return NaN;
  return /(тб|tb)/i.test(s) ? n * 1024 : n;
}

export function compareSizes(a: string, b: string): number {
  const ia = SIZE_ORDER.indexOf(a.toUpperCase());
  const ib = SIZE_ORDER.indexOf(b.toUpperCase());
  if (ia !== -1 && ib !== -1) return ia - ib;
  const na = numericValue(a);
  const nb = numericValue(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;
  return a.localeCompare(b, 'ru');
}

export function sortVariants(variants: ProductVariant[]): ProductVariant[] {
  return [...variants].sort((a, b) => a.color.localeCompare(b.color, 'ru') || compareSizes(a.size, b.size));
}

export const categoryDTO = (c: Category & { _count?: { products: number } }): CategoryDTO => ({
  id: c.id,
  name: c.name,
  slug: c.slug,
  sortOrder: c.sortOrder,
  isActive: c.isActive,
  productCount: c._count?.products ?? 0,
});

export const deliveryDTO = (d: DeliveryMethod): DeliveryMethodDTO => ({
  id: d.id,
  name: d.name,
  description: d.description,
  price: d.price,
  freeFrom: d.freeFrom,
  requiresAddress: d.requiresAddress,
  isActive: d.isActive,
  sortOrder: d.sortOrder,
});

export const paymentMethodDTO = (m: PaymentMethod): PaymentMethodDTO => ({
  id: m.id,
  type: m.type,
  title: m.title,
  recipient: m.recipient,
  details: m.details,
  bank: m.bank,
  instructions: m.instructions,
  isActive: m.isActive,
  sortOrder: m.sortOrder,
});

export const paymentSnapshot = (m: PaymentMethod): PaymentSnapshot => ({
  id: m.id,
  type: m.type,
  title: m.title,
  recipient: m.recipient,
  details: m.details,
  bank: m.bank,
});

export type FullOrder = Order & { items: OrderItem[]; history: OrderStatusHistory[] };

export function orderDTO(o: FullOrder, opts: { includeActor?: boolean } = {}): OrderDTO {
  return {
    id: o.id,
    status: o.status,
    customerName: o.customerName,
    phone: o.phone,
    address: o.address,
    comment: o.comment,
    deliveryMethodId: o.deliveryMethodId,
    deliveryName: o.deliveryName,
    deliveryPrice: o.deliveryPrice,
    itemsTotal: o.itemsTotal,
    total: o.total,
    paymentMethodId: o.paymentMethodId,
    paymentSnapshot: (o.paymentSnapshot as PaymentSnapshot | null) ?? null,
    receiptUrl: o.receiptPath ? receiptUrl(o.id) : null,
    receiptIsPdf: o.receiptPath?.endsWith('.pdf') ?? false,
    receiptUploadedAt: o.receiptUploadedAt?.toISOString() ?? null,
    rejectReason: o.rejectReason,
    paidAt: o.paidAt?.toISOString() ?? null,
    trackingNumber: o.trackingNumber,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    items: o.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      title: i.title,
      sku: i.sku,
      size: i.size,
      color: i.color,
      imageUrl: i.imageUrl,
      price: i.price,
      quantity: i.quantity,
    })),
    history: [...o.history]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id)
      .map((h) => ({
        id: h.id,
        fromStatus: h.fromStatus as OrderStatus | null,
        toStatus: h.toStatus as OrderStatus,
        comment: h.comment,
        ...(opts.includeActor ? { changedBy: h.changedBy?.toString() ?? null } : {}),
        createdAt: h.createdAt.toISOString(),
      })),
  };
}
