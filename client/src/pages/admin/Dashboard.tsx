/**
 * Сводка: заказы и выручка за сегодня / 7 дней / 30 дней, график, низкие остатки.
 */
import { ORDER_STATUSES, ORDER_STATUS_LABELS, type StatsPeriodDTO } from '@shop/shared';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useStats } from '../../api/admin';
import { ErrorState, FullScreenLoader, StatusBadge } from '../../components/ui';
import { useMoney } from '../../lib/format';

const PERIODS = [
  { key: 'today', label: 'Сегодня' },
  { key: 'week', label: '7 дней' },
  { key: 'month', label: '30 дней' },
] as const;

export function DashboardPage() {
  const money = useMoney();
  const { data: stats, isPending, error, refetch } = useStats();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['key']>('today');

  if (isPending) return <FullScreenLoader />;
  if (error || !stats) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const p: StatsPeriodDTO = stats[period];
  const maxRevenue = Math.max(1, ...stats.daily.map((d) => d.revenue));
  const review = stats.statusCounts.PAYMENT_REVIEW;

  return (
    <div className="space-y-4 px-4 pt-2 pb-8">
      {review > 0 && (
        <Link to="/admin/orders?status=PAYMENT_REVIEW" className="flex items-center gap-3 rounded-xl bg-[#8e5cf7]/12 p-3 text-[#8e5cf7]">
          <AlertTriangle size={20} />
          <span className="flex-1 font-medium">Оплата на проверке: {review}</span>
          <ChevronRight size={18} />
        </Link>
      )}

      <div className="flex gap-1 rounded-xl bg-card p-1">
        {PERIODS.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => setPeriod(x.key)}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium ${period === x.key ? 'bg-accent text-accent-ink' : ''}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Tile label="Выручка" value={money(p.revenue)} />
        <Tile label="Оплачено заказов" value={String(p.paidOrders)} />
        <Tile label="Оформлено заказов" value={String(p.orders)} />
        <Tile label="Средний чек" value={money(p.averageCheck)} />
      </div>

      <div className="card p-4">
        <p className="mb-3 font-semibold">Выручка за 14 дней</p>
        <div className="flex h-32 items-end gap-1">
          {stats.daily.map((d) => (
            <div key={d.date} className="group flex flex-1 flex-col items-center gap-1" title={`${d.date}: ${money(d.revenue)}, заказов: ${d.orders}`}>
              <div
                className="w-full rounded-t bg-accent transition-all"
                style={{ height: `${Math.max(2, (d.revenue / maxRevenue) * 100)}%`, opacity: d.revenue ? 1 : 0.25 }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-xs text-hint">
          <span>{stats.daily[0]?.date.slice(5).split('-').reverse().join('.')}</span>
          <span>сегодня</span>
        </div>
      </div>

      <div className="card divide-y divide-line">
        <p className="p-4 pb-2 font-semibold">Заказы по статусам</p>
        {ORDER_STATUSES.map((s) => (
          <Link key={s} to={`/admin/orders?status=${s}`} className="flex items-center justify-between px-4 py-2.5">
            <StatusBadge status={s} />
            <span className="flex items-center gap-1 font-semibold" aria-label={ORDER_STATUS_LABELS[s]}>
              {stats.statusCounts[s]} <ChevronRight size={16} className="text-hint" />
            </span>
          </Link>
        ))}
      </div>

      {stats.lowStock.length > 0 && (
        <div className="card divide-y divide-line">
          <p className="p-4 pb-2 font-semibold">Заканчиваются</p>
          {stats.lowStock.map((v) => (
            <Link key={`${v.productId}-${v.size}-${v.color}`} to={`/admin/products/${v.productId}`} className="flex items-center gap-2 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {v.title} <span className="text-hint">· {v.size} · {v.color}</span>
              </span>
              <span className={`font-semibold ${v.stock === 0 ? 'text-danger' : 'text-warning'}`}>{v.stock} шт.</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3.5">
      <p className="text-xs text-hint">{label}</p>
      <p className="mt-1 truncate text-xl font-bold">{value}</p>
    </div>
  );
}
