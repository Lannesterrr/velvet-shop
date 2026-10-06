/**
 * Перечисления, общие для сервера и клиента.
 * Значения совпадают с enum-ами в prisma/schema.prisma.
 */

// ───────── Статусы заказа ─────────

export const ORDER_STATUSES = [
  'NEW',
  'AWAITING_PAYMENT',
  'PAYMENT_REVIEW',
  'PAID',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'Новый',
  AWAITING_PAYMENT: 'Ожидает оплаты',
  PAYMENT_REVIEW: 'Оплата на проверке',
  PAID: 'Оплачен',
  SHIPPED: 'Отправлен',
  DELIVERED: 'Доставлен',
  CANCELLED: 'Отменён',
};

/** Эмодзи для сообщений бота */
export const ORDER_STATUS_EMOJI: Record<OrderStatus, string> = {
  NEW: '🆕',
  AWAITING_PAYMENT: '💳',
  PAYMENT_REVIEW: '🔎',
  PAID: '✅',
  SHIPPED: '🚚',
  DELIVERED: '📦',
  CANCELLED: '❌',
};

/**
 * Допустимые переходы между статусами.
 * Сервер отклоняет любые другие переходы; админка показывает только эти варианты.
 * Из DELIVERED и CANCELLED выйти нельзя (отмена вернула остатки на склад).
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ['AWAITING_PAYMENT', 'PAYMENT_REVIEW', 'PAID', 'CANCELLED'],
  AWAITING_PAYMENT: ['PAYMENT_REVIEW', 'PAID', 'CANCELLED'],
  PAYMENT_REVIEW: ['PAID', 'AWAITING_PAYMENT', 'CANCELLED'],
  PAID: ['SHIPPED', 'DELIVERED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

/** Статусы, в которых клиент ещё может оплатить / прикрепить чек */
export const PAYABLE_STATUSES: OrderStatus[] = ['NEW', 'AWAITING_PAYMENT', 'PAYMENT_REVIEW'];

/** Статусы, в которых клиент может сам отменить заказ */
export const USER_CANCELLABLE_STATUSES: OrderStatus[] = ['NEW', 'AWAITING_PAYMENT'];

/** Статусы, которые учитываются в выручке */
export const REVENUE_STATUSES: OrderStatus[] = ['PAID', 'SHIPPED', 'DELIVERED'];

// ───────── Способы оплаты ─────────

export const PAYMENT_METHOD_TYPES = ['CARD', 'SBP', 'BANK_ACCOUNT', 'CRYPTO', 'OTHER'] as const;
export type PaymentMethodType = (typeof PAYMENT_METHOD_TYPES)[number];

export const PAYMENT_METHOD_TYPE_LABELS: Record<PaymentMethodType, string> = {
  CARD: 'Банковская карта',
  SBP: 'СБП по номеру телефона',
  BANK_ACCOUNT: 'Расчётный счёт',
  CRYPTO: 'Криптовалюта',
  OTHER: 'Другое',
};

/** Как подписать поле «details» для каждого типа */
export const PAYMENT_DETAILS_LABELS: Record<PaymentMethodType, string> = {
  CARD: 'Номер карты',
  SBP: 'Номер телефона',
  BANK_ACCOUNT: 'Номер счёта',
  CRYPTO: 'Адрес кошелька',
  OTHER: 'Реквизиты',
};

// ───────── Товары ─────────

export const PRODUCT_STATUSES = ['ACTIVE', 'HIDDEN', 'ARCHIVED'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  ACTIVE: 'Активен',
  HIDDEN: 'Скрыт',
  ARCHIVED: 'В архиве',
};

export const PRODUCT_SORTS = ['new', 'price_asc', 'price_desc'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const PRODUCT_SORT_LABELS: Record<ProductSort, string> = {
  new: 'Сначала новинки',
  price_asc: 'Сначала дешевле',
  price_desc: 'Сначала дороже',
};
