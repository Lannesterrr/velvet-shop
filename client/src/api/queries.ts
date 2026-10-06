/**
 * Хуки TanStack Query для публичной части магазина.
 */
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CartDTO,
  CatalogFiltersDTO,
  CategoryDTO,
  CheckoutInput,
  ImportSharedCartResultDTO,
  MeDTO,
  OrderDTO,
  OrderListItemDTO,
  Paginated,
  PaymentMethodDTO,
  ProductDTO,
  ProductListItemDTO,
  PublicSettingsDTO,
  ShareCartResultDTO,
  SharedCartDTO,
} from '@shop/shared';
import { api } from './client';

export const keys = {
  me: ['me'] as const,
  settings: ['settings'] as const,
  categories: ['categories'] as const,
  products: (params: object) => ['products', params] as const,
  filters: (categoryId?: number) => ['filters', categoryId ?? null] as const,
  product: (id: number) => ['product', id] as const,
  cart: ['cart'] as const,
  orders: ['orders'] as const,
  order: (id: number) => ['order', id] as const,
  paymentMethods: ['payment-methods'] as const,
  sharedCart: (token: string) => ['shared-cart', token] as const,
};

// ───────── Профиль и настройки ─────────

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api<MeDTO>('/me'), staleTime: 5 * 60_000 });

export const useSettings = () =>
  useQuery({ queryKey: keys.settings, queryFn: () => api<PublicSettingsDTO>('/settings'), staleTime: 5 * 60_000 });

// ───────── Каталог ─────────

export const useCategories = () =>
  useQuery({ queryKey: keys.categories, queryFn: () => api<CategoryDTO[]>('/categories'), staleTime: 5 * 60_000 });

export interface CatalogParams {
  search?: string;
  categoryId?: number;
  sizes?: string;
  colors?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: string;
}

export const useProducts = (params: CatalogParams) =>
  useInfiniteQuery({
    queryKey: keys.products(params),
    queryFn: ({ pageParam, signal }) =>
      api<Paginated<ProductListItemDTO>>('/products', {
        query: { ...params, page: pageParam, limit: 20 },
        signal,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });

export const useFilters = (categoryId?: number) =>
  useQuery({
    queryKey: keys.filters(categoryId),
    queryFn: () => api<CatalogFiltersDTO>('/products/filters', { query: { categoryId } }),
    staleTime: 60_000,
  });

export const useProduct = (id: number) =>
  useQuery({ queryKey: keys.product(id), queryFn: () => api<ProductDTO>(`/products/${id}`), enabled: id > 0 });

// ───────── Корзина ─────────

export const useCart = () => useQuery({ queryKey: keys.cart, queryFn: () => api<CartDTO>('/cart') });

/** Все мутации корзины возвращают обновлённую корзину — кладём её прямо в кэш */
function useCartMutation<V>(fn: (vars: V) => Promise<CartDTO>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (cart) => qc.setQueryData(keys.cart, cart),
  });
}

export const useAddToCart = () =>
  useCartMutation((v: { variantId: number; quantity?: number }) =>
    api<CartDTO>('/cart', { method: 'POST', body: { variantId: v.variantId, quantity: v.quantity ?? 1 } }),
  );

export const useUpdateCartItem = () =>
  useCartMutation((v: { id: number; quantity: number }) =>
    api<CartDTO>(`/cart/${v.id}`, { method: 'PATCH', body: { quantity: v.quantity } }),
  );

export const useRemoveCartItem = () =>
  useCartMutation((id: number) => api<CartDTO>(`/cart/${id}`, { method: 'DELETE' }));

// ───────── Поделиться корзиной ─────────

export const useShareCart = () =>
  useMutation({ mutationFn: () => api<ShareCartResultDTO>('/cart/share', { method: 'POST' }) });

export const useSharedCart = (token: string) =>
  useQuery({ queryKey: keys.sharedCart(token), queryFn: () => api<SharedCartDTO>(`/cart/shared/${token}`), enabled: !!token });

export function useImportSharedCart(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<ImportSharedCartResultDTO>(`/cart/shared/${token}/import`, { method: 'POST' }),
    onSuccess: (res) => qc.setQueryData(keys.cart, res.cart),
  });
}

// ───────── Заказы и оплата ─────────

export const usePaymentMethods = () =>
  // Реквизиты всегда запрашиваем заново — админ мог их только что изменить
  useQuery({ queryKey: keys.paymentMethods, queryFn: () => api<PaymentMethodDTO[]>('/payment-methods'), staleTime: 0 });

export const useOrders = () => useQuery({ queryKey: keys.orders, queryFn: () => api<OrderListItemDTO[]>('/orders') });

export const useOrder = (id: number) =>
  useQuery({ queryKey: keys.order(id), queryFn: () => api<OrderDTO>(`/orders/${id}`), enabled: id > 0 });

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CheckoutInput) => api<OrderDTO>('/orders', { method: 'POST', body: input }),
    onSuccess: (order) => {
      qc.setQueryData(keys.order(order.id), order);
      void qc.invalidateQueries({ queryKey: keys.cart });
      void qc.invalidateQueries({ queryKey: keys.orders });
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

/** Общая обработка мутаций заказа: обновляем кэш заказа и списка */
function useOrderMutation<V>(fn: (vars: V) => Promise<OrderDTO>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (order) => {
      qc.setQueryData(keys.order(order.id), order);
      void qc.invalidateQueries({ queryKey: keys.orders });
    },
  });
}

export const useSelectPaymentMethod = (orderId: number) =>
  useOrderMutation((paymentMethodId: number) =>
    api<OrderDTO>(`/orders/${orderId}/payment-method`, { method: 'POST', body: { paymentMethodId } }),
  );

export const useUploadReceipt = (orderId: number) =>
  useOrderMutation((file: File) => {
    const fd = new FormData();
    fd.append('receipt', file);
    return api<OrderDTO>(`/orders/${orderId}/receipt`, { method: 'POST', formData: fd });
  });

export const useCancelOrder = (orderId: number) =>
  useOrderMutation(() => api<OrderDTO>(`/orders/${orderId}/cancel`, { method: 'POST' }));

export const reportWriteAccess = (granted: boolean) =>
  api<{ ok: true }>('/me/write-access', { method: 'POST', body: { granted } });
