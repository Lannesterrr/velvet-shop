/**
 * Вход в магазин из обычного браузера (вне Telegram).
 *
 * 1. Покупатель нажимает «Войти через Telegram» → oauth.telegram.org подтверждает,
 *    что это он, и возвращает подписанные данные (как Telegram Login Widget).
 * 2. Сервер проверяет подпись (validateLoginData) и выдаёт свой токен сессии.
 * 3. Дальше браузер шлёт заголовок  Authorization: web <token>.
 *
 * Документация: https://core.telegram.org/widgets/login#checking-authorization
 *   secret_key = SHA256(bot_token)
 *   hash = hex(HMAC_SHA256(secret_key, data_check_string))
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export class WebAuthError extends Error {}

export interface LoginData {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

const LOGIN_FIELDS = ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date'] as const;

/** Проверка данных, которые вернул Telegram после входа */
export function validateLoginData(
  raw: Record<string, unknown>,
  botToken: string,
  maxAgeSeconds: number,
  now: Date = new Date(),
): LoginData {
  const hash = typeof raw.hash === 'string' ? raw.hash : '';
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new WebAuthError('Нет корректной подписи');

  // В расчёте участвуют только присланные поля, отсортированные по имени
  const dataCheckString = LOGIN_FIELDS.filter((k) => raw[k] !== undefined && raw[k] !== null && raw[k] !== '')
    .map((k) => `${k}=${String(raw[k])}`)
    .sort()
    .join('\n');

  const secretKey = createHash('sha256').update(botToken).digest();
  const expected = createHmac('sha256', secretKey).update(dataCheckString).digest();
  const received = Buffer.from(hash, 'hex');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new WebAuthError('Подпись Telegram не совпадает');
  }

  const id = Number(raw.id);
  const authDate = Number(raw.auth_date);
  if (!Number.isSafeInteger(id) || id <= 0) throw new WebAuthError('Некорректный id');
  if (!Number.isFinite(authDate)) throw new WebAuthError('Нет auth_date');
  const ageSec = now.getTime() / 1000 - authDate;
  if (ageSec > maxAgeSeconds) throw new WebAuthError('Данные входа устарели — войдите ещё раз');
  if (ageSec < -300) throw new WebAuthError('auth_date из будущего');

  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  return {
    id,
    first_name: str(raw.first_name),
    last_name: str(raw.last_name),
    username: str(raw.username),
    photo_url: str(raw.photo_url),
    auth_date: authDate,
    hash,
  };
}

// ───────── Токен сессии ─────────
// Формат: base64url("<telegramId>.<expiresAtSec>") + "." + base64url(HMAC)
// Ключ выводится из BOT_TOKEN: сменили токен бота — все веб-сессии сбрасываются.

const sessionKey = (botToken: string) => createHmac('sha256', 'WebSession').update(botToken).digest();

export function createSessionToken(telegramId: bigint | number, botToken: string, ttlSeconds: number): {
  token: string;
  expiresAt: Date;
} {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = Buffer.from(`${telegramId}.${exp}`).toString('base64url');
  const sig = createHmac('sha256', sessionKey(botToken)).update(payload).digest('base64url');
  return { token: `${payload}.${sig}`, expiresAt: new Date(exp * 1000) };
}

/** Возвращает Telegram ID владельца токена или бросает WebAuthError */
export function verifySessionToken(token: string, botToken: string): bigint {
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra !== undefined || token.length > 200) throw new WebAuthError('Некорректный токен');

  const expected = createHmac('sha256', sessionKey(botToken)).update(payload).digest();
  const received = Buffer.from(sig, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new WebAuthError('Сессия недействительна — войдите ещё раз');
  }

  const [idStr, expStr] = Buffer.from(payload, 'base64url').toString().split('.');
  if (!/^\d+$/.test(idStr ?? '') || !/^\d+$/.test(expStr ?? '')) throw new WebAuthError('Некорректный токен');
  if (Number(expStr) < Date.now() / 1000) throw new WebAuthError('Сессия истекла — войдите ещё раз');
  return BigInt(idStr!);
}
