/**
 * zod-схемы входных данных. Используются:
 *  - на сервере — для валидации body/query каждого запроса;
 *  - на клиенте — для проверки форм до отправки.
 */
import { z } from 'zod';
// Русские сообщения об ошибках по умолчанию (подключается побочным эффектом)
import './zodRu';
import {
  ORDER_STATUSES,
  PAYMENT_METHOD_TYPES,
  PRODUCT_SORTS,
  PRODUCT_STATUSES,
} from './enums';

// ───────── Базовые примитивы ─────────

const id = z.coerce.number().int().positive();
/** Сумма в копейках: до 100 млн в основной валюте */
const money = z.coerce.number().int().min(0).max(10_000_000_000);
const trimmed = (max: number) => z.string().trim().max(max);
const requiredText = (max: number, message = 'Заполните поле') =>
  z.string().trim().min(1, message).max(max);
/** Пустая строка → null (для необязательных текстовых полей из форм) */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[\d\s\-()]{7,20}$/, 'Введите корректный номер телефона');

export const idParamSchema = z.object({ id });

// ───────── Публичная часть ─────────

export const productListQuerySchema = z.object({
  search: trimmed(100).optional(),
  categoryId: id.optional(),
  /** Список через запятую: "S,M,L" */
  sizes: trimmed(200).optional(),
  colors: trimmed(300).optional(),
  minPrice: money.optional(),
  maxPrice: money.optional(),
  sort: z.enum(PRODUCT_SORTS).default('new'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const cartAddSchema = z.object({
  variantId: id,
  quantity: z.coerce.number().int().min(1).max(99).default(1),
});

export const cartUpdateSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(99),
});

export const checkoutSchema = z.object({
  customerName: z.string().trim().min(2, 'Укажите имя').max(100),
  phone: phoneSchema,
  deliveryMethodId: z.coerce.number({ invalid_type_error: 'Выберите способ доставки' }).int().positive('Выберите способ доставки'),
  /** Обязательность зависит от способа доставки — проверяется на сервере */
  address: optionalText(500),
  comment: optionalText(1000),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const selectPaymentMethodSchema = z.object({
  paymentMethodId: id,
});

export const writeAccessSchema = z.object({
  granted: z.boolean(),
});

// ───────── Админка: каталог ─────────

export const categoryInputSchema = z.object({
  name: requiredText(100, 'Введите название'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{1,100}$/, 'Только латиница, цифры и дефис'),
  isActive: z.boolean().default(true),
});

export const reorderSchema = z.object({
  /** id в нужном порядке */
  ids: z.array(id).min(1).max(500),
});

export const variantInputSchema = z.object({
  /** Есть у существующих вариантов, отсутствует у новых */
  id: id.optional(),
  size: requiredText(32, 'Укажите размер'),
  color: requiredText(40, 'Укажите цвет'),
  // Пустая строка из формы → null
  colorHex: z
    .preprocess(
      (v) => (v === '' ? null : v),
      z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Цвет в формате #RRGGBB').nullish(),
    )
    .transform((v) => v ?? null),
  /** Своя цена варианта; пусто — цена товара */
  price: z.preprocess((v) => (v === '' ? null : v), money.nullish()).transform((v) => v ?? null),
  stock: z.coerce.number().int().min(0).max(1_000_000),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

export const productInputSchema = z
  .object({
    title: requiredText(200, 'Введите название'),
    description: trimmed(5000).default(''),
    categoryId: id,
    price: money,
    oldPrice: money.nullish().transform((v) => v ?? null),
    sku: z
      .string()
      .trim()
      .min(1, 'Введите артикул')
      .max(64)
      .regex(/^[\w\-./]+$/u, 'Артикул: буквы, цифры, - _ . /'),
    brand: optionalText(100),
    material: optionalText(200),
    status: z.enum(PRODUCT_STATUSES).default('ACTIVE'),
    variants: z.array(variantInputSchema).min(1, 'Добавьте хотя бы один вариант (размер/цвет)').max(300),
  })
  .superRefine((data, ctx) => {
    // Старая цена имеет смысл только если она выше текущей
    if (data.oldPrice !== null && data.oldPrice <= data.price) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['oldPrice'],
        message: 'Старая цена должна быть больше текущей',
      });
    }
    // Комбинация размер+цвет должна быть уникальной
    const seen = new Set<string>();
    data.variants.forEach((v, i) => {
      const key = `${v.size.toLowerCase()}|${v.color.toLowerCase()}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['variants', i, 'size'],
          message: `Вариант «${v.size} / ${v.color}» повторяется`,
        });
      }
      seen.add(key);
    });
  });
export type ProductInput = z.infer<typeof productInputSchema>;

export const productStatusSchema = z.object({
  status: z.enum(PRODUCT_STATUSES),
});

export const adminProductListQuerySchema = z.object({
  search: trimmed(100).optional(),
  categoryId: id.optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

// ───────── Админка: оплата, доставка, настройки ─────────

export const paymentMethodInputSchema = z.object({
  type: z.enum(PAYMENT_METHOD_TYPES),
  title: requiredText(100, 'Введите название'),
  recipient: requiredText(200, 'Укажите получателя'),
  details: requiredText(200, 'Укажите номер / реквизиты'),
  bank: optionalText(100),
  instructions: optionalText(2000),
  isActive: z.boolean().default(true),
});
export type PaymentMethodInput = z.infer<typeof paymentMethodInputSchema>;

export const deliveryMethodInputSchema = z.object({
  name: requiredText(100, 'Введите название'),
  description: optionalText(500),
  price: money,
  freeFrom: money.nullish().transform((v) => v ?? null),
  requiresAddress: z.boolean().default(true),
  isActive: z.boolean().default(true),
});
export type DeliveryMethodInput = z.infer<typeof deliveryMethodInputSchema>;

export const shopSettingsInputSchema = z.object({
  shopName: requiredText(100, 'Введите название магазина'),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Код валюты из 3 букв, например RUB'),
  supportUsername: optionalText(64).transform((v) => (v ? v.replace(/^@/, '') : null)),
  supportPhone: optionalText(30),
  supportText: optionalText(1000),
  aboutText: optionalText(2000),
  deliveryText: optionalText(2000),
});
export type ShopSettingsInput = z.infer<typeof shopSettingsInputSchema>;

export const adminInputSchema = z.object({
  telegramId: z
    .string()
    .trim()
    .regex(/^\d{3,20}$/, 'Telegram ID — только цифры'),
  name: optionalText(100),
});

// ───────── Админка: заказы ─────────

export const adminOrderListQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  /** ISO-дата "2026-10-01" (включительно) */
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  /** Номер заказа, имя, телефон или @username */
  search: trimmed(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const orderStatusUpdateSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  comment: optionalText(500),
  trackingNumber: optionalText(100),
});

export const rejectPaymentSchema = z.object({
  reason: requiredText(500, 'Укажите причину'),
});

export const orderNoteSchema = z.object({
  adminNote: optionalText(2000),
  trackingNumber: optionalText(100),
});
