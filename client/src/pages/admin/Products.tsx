/**
 * Список товаров в админке: поиск, фильтр по категории и статусу.
 */
import { PRODUCT_STATUSES, PRODUCT_STATUS_LABELS, type ProductStatus } from '@shop/shared';
import { ImageOff, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAdminCategories, useAdminProducts } from '../../api/admin';
import { Chip, EmptyState, ErrorState, FullScreenLoader } from '../../components/ui';
import { useMoney } from '../../lib/format';

const STATUS_STYLE: Record<ProductStatus, string> = {
  ACTIVE: 'text-success',
  HIDDEN: 'text-warning',
  ARCHIVED: 'text-hint',
};

export function AdminProductsPage() {
  const money = useMoney();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(search);
  const categoryId = Number(params.get('cat')) || undefined;
  const status = (params.get('status') as ProductStatus | null) ?? undefined;
  const page = Number(params.get('page')) || 1;
  const { data: categories } = useAdminCategories();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isPending, error, refetch } = useAdminProducts({
    search: debounced || undefined,
    categoryId,
    status,
    page,
  });

  const update = (key: string, value?: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  return (
    <div className="pb-8">
      <div className="flex gap-2 px-4 pt-2">
        <div className="relative flex-1">
          <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-hint" />
          <input
            type="search"
            className="field bg-card! pl-10"
            placeholder="Название, артикул, бренд"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Link to="/admin/products/new" className="btn btn-primary px-3" aria-label="Добавить товар">
          <Plus size={20} />
        </Link>
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pt-3">
        <Chip active={!status} onClick={() => update('status')}>
          Все статусы
        </Chip>
        {PRODUCT_STATUSES.map((s) => (
          <Chip key={s} active={status === s} onClick={() => update('status', s)}>
            {PRODUCT_STATUS_LABELS[s]}
          </Chip>
        ))}
      </div>
      {categories && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
          <Chip active={!categoryId} onClick={() => update('cat')}>
            Все категории
          </Chip>
          {categories.map((c) => (
            <Chip key={c.id} active={categoryId === c.id} onClick={() => update('cat', String(c.id))}>
              {c.name}
            </Chip>
          ))}
        </div>
      )}

      {isPending ? (
        <FullScreenLoader />
      ) : error || !data ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState
          title="Товаров не найдено"
          action={
            <Link to="/admin/products/new" className="btn btn-primary">
              <Plus size={18} /> Добавить товар
            </Link>
          }
        />
      ) : (
        <>
          <p className="px-4 pb-2 text-sm text-hint">Всего: {data.total}</p>
          <div className="card mx-4 divide-y divide-line">
            {data.items.map((p) => (
              <Link key={p.id} to={`/admin/products/${p.id}`} className="flex items-center gap-3 p-3 active:bg-page">
                <div className="h-16 w-13 shrink-0 overflow-hidden rounded-lg bg-page">
                  {p.image ? (
                    <img src={p.image.thumbUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-hint">
                      <ImageOff size={18} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.title}</p>
                  <p className="truncate text-xs text-hint">
                    {p.sku} · {p.categoryName}
                  </p>
                  <p className="text-xs">
                    <span className={STATUS_STYLE[p.status]}>{PRODUCT_STATUS_LABELS[p.status]}</span>
                    <span className={p.totalStock === 0 ? 'text-danger' : 'text-hint'}> · остаток {p.totalStock} шт.</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{money(p.price)}</p>
                  {p.oldPrice && <p className="text-xs text-hint line-through">{money(p.oldPrice)}</p>}
                </div>
              </Link>
            ))}
          </div>
          {data.pages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => update('page', String(page - 1))}>
                Назад
              </button>
              <span className="text-sm text-hint">
                {page} из {data.pages}
              </span>
              <button type="button" className="btn btn-secondary" disabled={page >= data.pages} onClick={() => update('page', String(page + 1))}>
                Вперёд
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
