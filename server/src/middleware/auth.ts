/**
 * Авторизация через Telegram initData.
 *
 * Клиент присылает заголовок:  Authorization: tma <initData>
 * Сервер проверяет подпись (lib/initData.ts), создаёт/обновляет пользователя
 * и кладёт его в req.user. Никаким данным о пользователе из тела запроса не доверяем.
 */
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { prisma } from '../db';
import { forbidden, unauthorized } from '../lib/errors';
import { InitDataError, validateInitData, type TelegramInitUser } from '../lib/initData';
import { logger } from '../logger';
import { isAdmin, isSuperAdmin } from '../services/admin.service';

export interface AuthUser {
  id: number;
  telegramId: bigint;
  username: string | null;
  firstName: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Небольшой кэш, чтобы не писать в БД на каждый запрос:
 * профиль пользователя обновляем не чаще раза в 10 минут.
 */
const UPSERT_INTERVAL_MS = 10 * 60 * 1000;
const recentUpserts = new Map<string, { userId: number; at: number }>();

async function upsertUser(tgUser: TelegramInitUser): Promise<number> {
  const key = String(tgUser.id);
  const cached = recentUpserts.get(key);
  if (cached && Date.now() - cached.at < UPSERT_INTERVAL_MS) return cached.userId;

  const profile = {
    username: tgUser.username ?? null,
    firstName: tgUser.first_name ?? null,
    lastName: tgUser.last_name ?? null,
    languageCode: tgUser.language_code ?? null,
    photoUrl: tgUser.photo_url ?? null,
  };
  const user = await prisma.user.upsert({
    where: { telegramId: BigInt(tgUser.id) },
    create: {
      telegramId: BigInt(tgUser.id),
      ...profile,
      // Если пользователь уже разрешил боту писать — запоминаем
      canWrite: tgUser.allows_write_to_pm === true,
    },
    update: {
      ...profile,
      lastSeenAt: new Date(),
      ...(tgUser.allows_write_to_pm === true ? { canWrite: true } : {}),
    },
    select: { id: true },
  });

  if (recentUpserts.size > 10_000) recentUpserts.clear();
  recentUpserts.set(key, { userId: user.id, at: Date.now() });
  return user.id;
}

/** Сбрасывает кэш (например, после /start, чтобы canWrite обновился сразу) */
export function forgetUserCache(telegramId: bigint | number): void {
  recentUpserts.delete(String(telegramId));
}

async function resolveTelegramUser(req: Request): Promise<TelegramInitUser> {
  const header = req.get('authorization') ?? '';
  const [scheme, ...rest] = header.split(' ');
  const raw = rest.join(' ');

  if (scheme?.toLowerCase() === 'tma' && raw) {
    try {
      return validateInitData(raw, config.BOT_TOKEN, config.INIT_DATA_TTL).user;
    } catch (err) {
      if (err instanceof InitDataError) throw unauthorized(err.message);
      throw err;
    }
  }

  // Режим разработки: открытие в обычном браузере без Telegram
  if (config.devTelegramId) {
    return { id: Number(config.devTelegramId), first_name: 'Dev', username: 'dev_user' };
  }

  throw unauthorized('Откройте магазин через Telegram');
}

/** Требует валидную авторизацию Telegram */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const tgUser = await resolveTelegramUser(req);
    const userId = await upsertUser(tgUser);
    const telegramId = BigInt(tgUser.id);
    req.user = {
      id: userId,
      telegramId,
      username: tgUser.username ?? null,
      firstName: tgUser.first_name ?? null,
      isAdmin: await isAdmin(telegramId),
      isSuperAdmin: isSuperAdmin(telegramId),
    };
    next();
  } catch (err) {
    if (!(err instanceof Error && 'status' in err)) logger.error({ err }, 'Ошибка авторизации');
    next(err);
  }
}

/** Требует права администратора. Ставится ПОСЛЕ requireAuth */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(unauthorized());
  if (!req.user.isAdmin) return next(forbidden('Доступ только для администраторов'));
  next();
}

/** Требует права суперадмина (ADMIN_IDS) */
export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user?.isSuperAdmin) return next(forbidden('Доступно только владельцу магазина (ADMIN_IDS)'));
  next();
}

/** Достаёт пользователя в обработчике (после requireAuth он гарантированно есть) */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
