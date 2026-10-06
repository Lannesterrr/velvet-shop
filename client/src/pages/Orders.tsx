/**
 * История заказов покупателя.
 */
import { ChevronRight, ImageOff, Package } from 'lucide-react';
import { Link } from 'react-router';
import { useOrders } from '../api/queries';
import { EmptyState, ErrorState, FullScreenLoader, PageHeader, StatusBadge } from '../components/ui';
import { formatDate, itemsWord, useMoney } from '../lib/format';

export function OrdersPage() {
  const money = useMoney();
  const { data: orders, isPending, error, refetch } = useOrders();

  if (isPending) return <FullScreenLoader />;
  if (error || !orders) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div className="pb-6">
      <PageHeader title="Мои заказы" />
      {orders.length === 0 ? (
        <EmptyState
          icon={<Package size={48} />}
          title="Заказов пока нет"
          action={
            <Link to="/" className="btn btn-primary">
              Перейти в каталог
            </Link>
          }
        />
      ) : (
        <div className="card mx-4 divide-y divide-line">
          {orders.map((o) => (
            <Link key={o.id} to={`/orders/${o.id}`} className="flex items-center gap-3 p-3 active:bg-page">
              <div className="h-14 w-12 shrink-0 overflow-hidden rounded-lg bg-page">
                {o.previewImage ? (
                  <img src={o.previewImage} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-hint">
                    <ImageOff size={18} />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">№{o.id}</span>
                  <StatusBadge status={o.status} />
                </div>
                <p className="mt-0.5 text-sm text-hint">
                  {formatDate(o.createdAt)} · {itemsWord(o.itemsCount)}
                </p>
              </div>
              <span className="font-semibold">{money(o.total)}</span>
              <ChevronRight size={18} className="text-hint" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
