/**
 * Администраторы: суперадмины из ADMIN_IDS (.env) + дополнительные из таблицы admins.
 */
import type { AdminDTO } from '@shop/shared';
import { config } from '../config';
import { prisma } from '../db';
import { badRequest, conflict, notFound } from '../lib/errors';

/** Кэш списка админов из БД (обновляется раз в 30 секунд и при изменениях) */
let dbAdminsCache: { ids: Set<string>; at: number } | null = null;
const CACHE_MS = 30_000;

async function dbAdminIds(): Promise<Set<string>> {
  if (dbAdminsCache && Date.now() - dbAdminsCache.at < CACHE_MS) return dbAdminsCache.ids;
  const rows = await prisma.admin.findMany({ select: { telegramId: true } });
  dbAdminsCache = { ids: new Set(rows.map((r) => r.telegramId.toString())), at: Date.now() };
  return dbAdminsCache.ids;
}

export function isSuperAdmin(telegramId: bigint | number | string): boolean {
  return config.adminIds.has(String(telegramId));
}

export async function isAdmin(telegramId: bigint | number | string): Promise<boolean> {
  const id = String(telegramId);
  return config.adminIds.has(id) || (await dbAdminIds()).has(id);
}

/** Все Telegram ID админов — для рассылки уведомлений */
export async function allAdminTelegramIds(): Promise<string[]> {
  return [...new Set([...config.adminIds, ...(await dbAdminIds())])];
}

export async function listAdmins(): Promise<AdminDTO[]> {
  const rows = await prisma.admin.findMany({ orderBy: { createdAt: 'asc' } });
  const fromEnv: AdminDTO[] = [...config.adminIds].map((telegramId) => ({
    id: null,
    telegramId,
    name: 'Владелец (ADMIN_IDS)',
    fromEnv: true,
    createdAt: null,
  }));
  const fromDb: AdminDTO[] = rows
    .filter((r) => !config.adminIds.has(r.telegramId.toString()))
    .map((r) => ({
      id: r.id,
      telegramId: r.telegramId.toString(),
      name: r.name,
      fromEnv: false,
      createdAt: r.createdAt.toISOString(),
    }));
  return [...fromEnv, ...fromDb];
}

export async function addAdmin(telegramId: string, name: string | null, addedBy: bigint): Promise<void> {
  if (config.adminIds.has(telegramId)) throw conflict('Этот пользователь уже владелец магазина (ADMIN_IDS)');
  const exists = await prisma.admin.findUnique({ where: { telegramId: BigInt(telegramId) } });
  if (exists) throw conflict('Администратор с таким Telegram ID уже добавлен');
  await prisma.admin.create({ data: { telegramId: BigInt(telegramId), name, addedBy } });
  dbAdminsCache = null;
}

export async function removeAdmin(id: number, actorTelegramId: bigint): Promise<void> {
  const admin = await prisma.admin.findUnique({ where: { id } });
  if (!admin) throw notFound('Администратор не найден');
  if (admin.telegramId === actorTelegramId) throw badRequest('Нельзя удалить самого себя');
  await prisma.admin.delete({ where: { id } });
  dbAdminsCache = null;
}
