/**
 * Список заказов: фильтр по статусу и дате, поиск, постраничный вывод.
 */
import { ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from '@shop/shared';
import { ChevronRight, Paperclip, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAdminOrders } from '../../api/admin';
import { Chip, EmptyState, ErrorState, FullScreenLoader, StatusBadge } from '../../components/ui';
import { formatDate, useMoney } from '../../lib/format';

export function AdminOrdersPage() {
  const money = useMoney();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as OrderStatus | null) ?? undefined;
  const from = params.get('from') ?? undefined;
  const to = params.get('to') ?? undefined;
  const page = Number(params.get('page')) || 1;
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(search);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isPending, error, refetch, isPlaceholderData } = useAdminOrders({
    status,
    from,
    to,
    search: debounced || undefined,
    page,
  });

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  return (
    <div className="pb-8">
      <div className="space-y-3 px-4 pt-2">
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-hint" />
          <input
            type="search"
            className="field bg-card! pl-10"
            placeholder="№ заказа, имя, телефон, @username"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-hint">
            С даты
            <input type="date" className="field mt-1 bg-card!" value={from ?? ''} onChange={(e) => update({ from: e.target.value || undefined })} />
          </label>
          <label className="flex-1 text-xs text-hint">
            По дату
            <input type="date" className="field mt-1 bg-card!" value={to ?? ''} onChange={(e) => update({ to: e.target.value || undefined })} />
          </label>
        </div>
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
        <Chip active={!status} onClick={() => update({ status: undefined })}>
          Все
        </Chip>
        {ORDER_STATUSES.map((s) => (
          <Chip key={s} active={status === s} onClick={() => update({ status: s })}>
            {ORDER_STATUS_LABELS[s]}
            {data?.counts[s] ? <span className="opacity-70">{data.counts[s]}</span> : null}
          </Chip>
        ))}
      </div>

      {isPending ? (
        <FullScreenLoader />
      ) : error || !data ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState title="Заказов не найдено" />
      ) : (
        <>
          <div className={`card mx-4 divide-y divide-line ${isPlaceholderData ? 'opacity-60' : ''}`}>
            {data.items.map((o) => (
              <Link key={o.id} to={`/admin/orders/${o.id}`} className="flex items-center gap-3 p-3 active:bg-page">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">№{o.id}</span>
                    <StatusBadge status={o.status} />
                    {o.hasReceipt && <Paperclip size={14} className="text-hint" aria-label="Есть чек" />}
                  </div>
                  <p className="mt-0.5 truncate text-sm">
                    {o.customerName} <span className="text-hint">· {o.phone}</span>
                  </p>
                  <p className="text-xs text-hint">{formatDate(o.createdAt)}</p>
                </div>
                <span className="font-semibold">{money(o.total)}</span>
                <ChevronRight size={18} className="text-hint" />
              </Link>
            ))}
          </div>
          {data.pages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
                Назад
              </button>
              <span className="text-sm text-hint">
                {page} из {data.pages}
              </span>
              <button type="button" className="btn btn-secondary" disabled={page >= data.pages} onClick={() => update({ page: String(page + 1) })}>
                Вперёд
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
