/**
 * Простая статистика для главной страницы админки.
 * Периоды считаются по часовому поясу сервера (переменная TZ, например TZ=Europe/Moscow).
 */
import { REVENUE_STATUSES, type StatsDTO, type StatsPeriodDTO } from '@shop/shared';
import { prisma } from '../db';
import { orderStatusCounts } from './order.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const LOW_STOCK_THRESHOLD = 2;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Ключ дня в локальном времени сервера: "2026-10-04" */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function periodStats(since: Date): Promise<StatsPeriodDTO> {
  const [orders, paid] = await Promise.all([
    // Все оформленные заказы, кроме отменённых
    prisma.order.count({ where: { createdAt: { gte: since }, status: { not: 'CANCELLED' } } }),
    // Выручка — по дате подтверждения оплаты
    prisma.order.aggregate({
      where: { paidAt: { gte: since }, status: { in: REVENUE_STATUSES } },
      _sum: { total: true },
      _count: { _all: true },
    }),
  ]);
  const revenue = paid._sum.total ?? 0;
  const paidOrders = paid._count._all;
  return { orders, paidOrders, revenue, averageCheck: paidOrders ? Math.round(revenue / paidOrders) : 0 };
}

export async function getStats(): Promise<StatsDTO> {
  const now = new Date();
  const today = startOfDay(now);
  const weekAgo = startOfDay(new Date(now.getTime() - 6 * DAY_MS)); // 7 дней, включая сегодня
  const monthAgo = startOfDay(new Date(now.getTime() - 29 * DAY_MS)); // 30 дней
  const twoWeeksAgo = startOfDay(new Date(now.getTime() - 13 * DAY_MS));

  const [todayStats, week, month, statusCounts, recentOrders, recentPaid, lowStock] = await Promise.all([
    periodStats(today),
    periodStats(weekAgo),
    periodStats(monthAgo),
    orderStatusCounts(),
    prisma.order.findMany({
      where: { createdAt: { gte: twoWeeksAgo }, status: { not: 'CANCELLED' } },
      select: { createdAt: true },
    }),
    prisma.order.findMany({
      where: { paidAt: { gte: twoWeeksAgo }, status: { in: REVENUE_STATUSES } },
      select: { paidAt: true, total: true },
    }),
    prisma.productVariant.findMany({
      where: { stock: { lte: LOW_STOCK_THRESHOLD }, product: { status: 'ACTIVE' } },
      include: { product: { select: { id: true, title: true } } },
      orderBy: { stock: 'asc' },
      take: 10,
    }),
  ]);

  // График по дням за 14 дней
  const daily = new Map<string, { revenue: number; orders: number }>();
  for (let i = 0; i < 14; i++) {
    daily.set(dayKey(new Date(twoWeeksAgo.getTime() + i * DAY_MS + DAY_MS / 2)), { revenue: 0, orders: 0 });
  }
  for (const o of recentOrders) {
    const bucket = daily.get(dayKey(o.createdAt));
    if (bucket) bucket.orders += 1;
  }
  for (const o of recentPaid) {
    const bucket = o.paidAt && daily.get(dayKey(o.paidAt));
    if (bucket) bucket.revenue += o.total;
  }

  return {
    today: todayStats,
    week,
    month,
    statusCounts,
    daily: [...daily].map(([date, v]) => ({ date, ...v })),
    lowStock: lowStock.map((v) => ({
      productId: v.product.id,
      title: v.product.title,
      size: v.size,
      color: v.color,
      stock: v.stock,
    })),
  };
}
