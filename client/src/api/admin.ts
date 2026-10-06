/**
 * Хуки для админ-панели (/api/admin/...). Права проверяет сервер на каждом запросе.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type {
  AdminDTO,
  AdminOrderDTO,
  AdminOrderListDTO,
  AdminProductListItemDTO,
  CategoryDTO,
  DeliveryMethodDTO,
  OrderStatus,
  Paginated,
  PaymentMethodDTO,
  ProductDTO,
  ShopSettingsDTO,
  StatsDTO,
} from '@shop/shared';
import { api } from './client';

export const adminKeys = {
  stats: ['admin', 'stats'] as const,
  orders: (q: object) => ['admin', 'orders', q] as const,
  order: (id: number) => ['admin', 'order', id] as const,
  products: (q: object) => ['admin', 'products', q] as const,
  product: (id: number) => ['admin', 'product', id] as const,
  categories: ['admin', 'categories'] as const,
  paymentMethods: ['admin', 'payment-methods'] as const,
  delivery: ['admin', 'delivery'] as const,
  settings: ['admin', 'settings'] as const,
  admins: ['admin', 'admins'] as const,
};

/** Мутация, которая после успеха обновляет указанные запросы */
function useAdminMutation<V, R>(fn: (vars: V) => Promise<R>, invalidate: QueryKey[], onData?: (data: R) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      onData?.(data);
      for (const key of invalidate) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

// ───────── Статистика ─────────

export const useStats = () => useQuery({ queryKey: adminKeys.stats, queryFn: () => api<StatsDTO>('/admin/stats') });

// ───────── Заказы ─────────

export interface AdminOrdersQuery {
  status?: OrderStatus;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
}

export const useAdminOrders = (q: AdminOrdersQuery) =>
  useQuery({
    queryKey: adminKeys.orders(q),
    queryFn: () => api<AdminOrderListDTO>('/admin/orders', { query: { ...q } }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000, // новые заказы появляются без перезагрузки
  });

export const useAdminOrder = (id: number) =>
  useQuery({ queryKey: adminKeys.order(id), queryFn: () => api<AdminOrderDTO>(`/admin/orders/${id}`) });

export function useOrderAction(id: number) {
  const qc = useQueryClient();
  const onData = (o: AdminOrderDTO) => qc.setQueryData(adminKeys.order(id), o);
  const invalidate: QueryKey[] = [['admin', 'orders'], adminKeys.stats];
  return {
    confirm: useAdminMutation(() => api<AdminOrderDTO>(`/admin/orders/${id}/confirm-payment`, { method: 'POST' }), invalidate, onData),
    reject: useAdminMutation(
      (reason: string) => api<AdminOrderDTO>(`/admin/orders/${id}/reject-payment`, { method: 'POST', body: { reason } }),
      invalidate,
      onData,
    ),
    status: useAdminMutation(
      (body: { status: OrderStatus; comment?: string; trackingNumber?: string }) =>
        api<AdminOrderDTO>(`/admin/orders/${id}/status`, { method: 'PATCH', body }),
      invalidate,
      onData,
    ),
    note: useAdminMutation(
      (body: { adminNote: string; trackingNumber: string }) =>
        api<AdminOrderDTO>(`/admin/orders/${id}/note`, { method: 'PATCH', body }),
      [],
      onData,
    ),
  };
}

// ───────── Товары ─────────

export interface AdminProductsQuery {
  search?: string;
  categoryId?: number;
  status?: string;
  page?: number;
}

export const useAdminProducts = (q: AdminProductsQuery) =>
  useQuery({
    queryKey: adminKeys.products(q),
    queryFn: () => api<Paginated<AdminProductListItemDTO>>('/admin/products', { query: { ...q } }),
    placeholderData: keepPreviousData,
  });

export const useAdminProduct = (id: number) =>
  useQuery({ queryKey: adminKeys.product(id), queryFn: () => api<ProductDTO>(`/admin/products/${id}`), enabled: id > 0 });

/** Все операции с товаром возвращают свежий ProductDTO — кладём его в кэш */
export function useProductMutations(id: number) {
  const qc = useQueryClient();
  const onData = (p: ProductDTO) => qc.setQueryData(adminKeys.product(p.id), p);
  const invalidate: QueryKey[] = [['admin', 'products'], ['products'], ['product']];
  return {
    save: useAdminMutation(
      (body: unknown) =>
        id > 0
          ? api<ProductDTO>(`/admin/products/${id}`, { method: 'PUT', body })
          : api<ProductDTO>('/admin/products', { method: 'POST', body }),
      invalidate,
      onData,
    ),
    remove: useAdminMutation(() => api<void>(`/admin/products/${id}`, { method: 'DELETE' }), invalidate),
    uploadImages: useAdminMutation(
      (vars: { productId: number; files: File[] }) => {
        const fd = new FormData();
        vars.files.forEach((f) => fd.append('images', f));
        return api<ProductDTO>(`/admin/products/${vars.productId}/images`, { method: 'POST', formData: fd });
      },
      invalidate,
      onData,
    ),
    reorderImages: useAdminMutation(
      (ids: number[]) => api<ProductDTO>(`/admin/products/${id}/images/order`, { method: 'PUT', body: { ids } }),
      invalidate,
      onData,
    ),
    setMainImage: useAdminMutation(
      (imageId: number) => api<ProductDTO>(`/admin/products/${id}/images/${imageId}/main`, { method: 'PATCH' }),
      invalidate,
      onData,
    ),
    deleteImage: useAdminMutation(
      (imageId: number) => api<ProductDTO>(`/admin/products/${id}/images/${imageId}`, { method: 'DELETE' }),
      invalidate,
      onData,
    ),
  };
}

// ───────── Категории ─────────

export const useAdminCategories = () =>
  useQuery({ queryKey: adminKeys.categories, queryFn: () => api<CategoryDTO[]>('/admin/categories') });

const categoryInvalidate: QueryKey[] = [adminKeys.categories, ['categories']];

export const useCategoryMutations = () => ({
  create: useAdminMutation(
    (body: { name: string; slug: string; isActive: boolean }) => api<CategoryDTO>('/admin/categories', { method: 'POST', body }),
    categoryInvalidate,
  ),
  update: useAdminMutation(
    (v: { id: number; name: string; slug: string; isActive: boolean }) =>
      api<CategoryDTO>(`/admin/categories/${v.id}`, { method: 'PUT', body: { name: v.name, slug: v.slug, isActive: v.isActive } }),
    categoryInvalidate,
  ),
  remove: useAdminMutation((id: number) => api<void>(`/admin/categories/${id}`, { method: 'DELETE' }), categoryInvalidate),
  reorder: useAdminMutation(
    (ids: number[]) => api<CategoryDTO[]>('/admin/categories/order', { method: 'PUT', body: { ids } }),
    categoryInvalidate,
  ),
});

// ───────── Реквизиты ─────────

export const useAdminPaymentMethods = () =>
  useQuery({ queryKey: adminKeys.paymentMethods, queryFn: () => api<PaymentMethodDTO[]>('/admin/payment-methods') });

const pmInvalidate: QueryKey[] = [adminKeys.paymentMethods, ['payment-methods']];

export const usePaymentMethodMutations = () => ({
  save: useAdminMutation(
    (v: { id?: number; body: unknown }) =>
      v.id
        ? api<PaymentMethodDTO>(`/admin/payment-methods/${v.id}`, { method: 'PUT', body: v.body })
        : api<PaymentMethodDTO>('/admin/payment-methods', { method: 'POST', body: v.body }),
    pmInvalidate,
  ),
  remove: useAdminMutation((id: number) => api<void>(`/admin/payment-methods/${id}`, { method: 'DELETE' }), pmInvalidate),
  reorder: useAdminMutation(
    (ids: number[]) => api<PaymentMethodDTO[]>('/admin/payment-methods/order', { method: 'PUT', body: { ids } }),
    pmInvalidate,
  ),
});

// ───────── Доставка, настройки, админы ─────────

export const useAdminDelivery = () =>
  useQuery({ queryKey: adminKeys.delivery, queryFn: () => api<DeliveryMethodDTO[]>('/admin/delivery-methods') });

const deliveryInvalidate: QueryKey[] = [adminKeys.delivery, ['settings']];

export const useDeliveryMutations = () => ({
  save: useAdminMutation(
    (v: { id?: number; body: unknown }) =>
      v.id
        ? api<DeliveryMethodDTO>(`/admin/delivery-methods/${v.id}`, { method: 'PUT', body: v.body })
        : api<DeliveryMethodDTO>('/admin/delivery-methods', { method: 'POST', body: v.body }),
    deliveryInvalidate,
  ),
  remove: useAdminMutation((id: number) => api<void>(`/admin/delivery-methods/${id}`, { method: 'DELETE' }), deliveryInvalidate),
});

export const useAdminSettings = () =>
  useQuery({ queryKey: adminKeys.settings, queryFn: () => api<ShopSettingsDTO>('/admin/settings') });

export const useSaveSettings = () =>
  useAdminMutation((body: unknown) => api<ShopSettingsDTO>('/admin/settings', { method: 'PUT', body }), [adminKeys.settings, ['settings']]);

export const useAdmins = () => useQuery({ queryKey: adminKeys.admins, queryFn: () => api<AdminDTO[]>('/admin/admins') });

export const useAdminsMutations = () => ({
  add: useAdminMutation(
    (body: { telegramId: string; name: string }) => api<AdminDTO[]>('/admin/admins', { method: 'POST', body }),
    [adminKeys.admins],
  ),
  remove: useAdminMutation((id: number) => api<AdminDTO[]>(`/admin/admins/${id}`, { method: 'DELETE' }), [adminKeys.admins]),
});
