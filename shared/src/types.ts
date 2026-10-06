/**
 * Формы ответов API (DTO). Сервер возвращает ровно эти структуры,
 * клиент типизирует ими запросы. Даты — ISO-строки, telegramId — строка
 * (BigInt не сериализуется в JSON).
 */
import type { OrderStatus, PaymentMethodType, ProductStatus } from './enums';

export interface ApiError {
  error: string;
  /** Ошибки валидации по полям: { "phone": "Введите корректный номер" } */
  fields?: Record<string, string>;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

// ───────── Пользователь и настройки ─────────

export interface MeDTO {
  id: number;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  phone: string | null;
  canWrite: boolean;
  isAdmin: boolean;
  /** Суперадмин (из ADMIN_IDS) — может управлять списком админов */
  isSuperAdmin: boolean;
}

export interface DeliveryMethodDTO {
  id: number;
  name: string;
  description: string | null;
  price: number;
  freeFrom: number | null;
  requiresAddress: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface ShopSettingsDTO {
  shopName: string;
  currency: string;
  supportUsername: string | null;
  supportPhone: string | null;
  supportText: string | null;
  aboutText: string | null;
  /** Условия доставки (сроки, география) */
  deliveryText: string | null;
}

export interface PublicSettingsDTO extends ShopSettingsDTO {
  deliveryMethods: DeliveryMethodDTO[];
}

// ───────── Каталог ─────────

export interface CategoryDTO {
  id: number;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
}

export interface ProductImageDTO {
  id: number;
  url: string;
  thumbUrl: string;
  sortOrder: number;
  isMain: boolean;
}

export interface ProductVariantDTO {
  id: number;
  /** Вариант: память, размер корпуса и т.п. */
  size: string;
  color: string;
  colorHex: string | null;
  /** Цена варианта (уже с учётом цены товара по умолчанию) */
  price: number;
  /** Задана ли у варианта своя цена */
  hasOwnPrice: boolean;
  stock: number;
}

/** Карточка в сетке каталога */
export interface ProductListItemDTO {
  id: number;
  title: string;
  price: number;
  oldPrice: number | null;
  brand: string | null;
  categoryId: number;
  image: ProductImageDTO | null;
  inStock: boolean;
  /** Цены вариантов различаются — показываем «от …» */
  priceFrom: boolean;
  colors: { name: string; hex: string | null }[];
}

export interface ProductDTO {
  id: number;
  title: string;
  description: string;
  categoryId: number;
  categoryName: string;
  price: number;
  oldPrice: number | null;
  sku: string;
  brand: string | null;
  material: string | null;
  status: ProductStatus;
  images: ProductImageDTO[];
  variants: ProductVariantDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface CatalogFiltersDTO {
  sizes: string[];
  colors: { name: string; hex: string | null }[];
  minPrice: number;
  maxPrice: number;
}

// ───────── Корзина ─────────

export interface CartItemDTO {
  id: number;
  quantity: number;
  /** Цена за единицу (цена варианта) */
  price: number;
  variant: ProductVariantDTO;
  product: {
    id: number;
    title: string;
    price: number;
    oldPrice: number | null;
    image: ProductImageDTO | null;
  };
  /** false — товар скрыт/удалён или нет на складе в нужном количестве */
  available: boolean;
  /** Сколько можно заказать сейчас */
  maxQuantity: number;
}

export interface CartDTO {
  items: CartItemDTO[];
  /** Количество единиц товара (сумма quantity доступных позиций) */
  count: number;
  /** Сумма доступных позиций, копейки */
  total: number;
}

// ───────── Поделиться корзиной ─────────

export interface ShareCartResultDTO {
  token: string;
  /** Ссылка, которую можно отправить другу */
  url: string;
  /** Готовый текст сообщения */
  text: string;
  expiresAt: string;
}

export interface SharedCartItemDTO {
  variantId: number;
  quantity: number;
  price: number;
  available: boolean;
  product: { id: number; title: string; image: ProductImageDTO | null };
  variant: { size: string; color: string; colorHex: string | null };
}

export interface SharedCartDTO {
  token: string;
  /** Имя того, кто поделился (без фамилии и username) */
  ownerName: string;
  isOwn: boolean;
  createdAt: string;
  expiresAt: string;
  items: SharedCartItemDTO[];
  /** Сумма доступных позиций */
  total: number;
  count: number;
}

export interface ImportSharedCartResultDTO {
  cart: CartDTO;
  added: number;
  skipped: number;
}

// ───────── Оплата ─────────

export interface PaymentMethodDTO {
  id: number;
  type: PaymentMethodType;
  title: string;
  recipient: string;
  details: string;
  bank: string | null;
  instructions: string | null;
  isActive: boolean;
  sortOrder: number;
}

// ───────── Заказы ─────────

export interface OrderItemDTO {
  id: number;
  productId: number | null;
  title: string;
  sku: string;
  size: string;
  color: string;
  imageUrl: string | null;
  price: number;
  quantity: number;
}

export interface OrderHistoryDTO {
  id: number;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  comment: string | null;
  /** Только в админке: telegramId того, кто изменил */
  changedBy?: string | null;
  createdAt: string;
}

export interface OrderListItemDTO {
  id: number;
  status: OrderStatus;
  total: number;
  itemsCount: number;
  customerName: string;
  phone: string;
  createdAt: string;
  previewImage: string | null;
  hasReceipt: boolean;
}

export interface PaymentSnapshot {
  id: number;
  type: PaymentMethodType;
  title: string;
  recipient: string;
  details: string;
  bank: string | null;
}

export interface OrderDTO {
  id: number;
  status: OrderStatus;
  customerName: string;
  phone: string;
  address: string | null;
  comment: string | null;
  deliveryMethodId: number | null;
  deliveryName: string;
  deliveryPrice: number;
  itemsTotal: number;
  total: number;
  paymentMethodId: number | null;
  paymentSnapshot: PaymentSnapshot | null;
  /** Подписанная временная ссылка на чек (или null) */
  receiptUrl: string | null;
  receiptIsPdf: boolean;
  receiptUploadedAt: string | null;
  rejectReason: string | null;
  paidAt: string | null;
  trackingNumber: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItemDTO[];
  history: OrderHistoryDTO[];
}

export interface AdminOrderListDTO extends Paginated<OrderListItemDTO> {
  counts: Record<OrderStatus, number>;
}

export interface AdminOrderDTO extends OrderDTO {
  adminNote: string | null;
  user: {
    id: number;
    telegramId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
  };
}

// ───────── Админка ─────────

export interface AdminProductListItemDTO {
  id: number;
  title: string;
  sku: string;
  price: number;
  oldPrice: number | null;
  status: ProductStatus;
  categoryId: number;
  categoryName: string;
  image: ProductImageDTO | null;
  totalStock: number;
  variantsCount: number;
  updatedAt: string;
}

export interface AdminDTO {
  /** null — админ из ADMIN_IDS (.env), его нельзя удалить из интерфейса */
  id: number | null;
  telegramId: string;
  name: string | null;
  fromEnv: boolean;
  createdAt: string | null;
}

export interface StatsPeriodDTO {
  orders: number;
  paidOrders: number;
  revenue: number;
  averageCheck: number;
}

export interface StatsDTO {
  today: StatsPeriodDTO;
  week: StatsPeriodDTO;
  month: StatsPeriodDTO;
  statusCounts: Record<OrderStatus, number>;
  /** Выручка по дням за последние 14 дней (от старых к новым) */
  daily: { date: string; revenue: number; orders: number }[];
  lowStock: { productId: number; title: string; size: string; color: string; stock: number }[];
}
