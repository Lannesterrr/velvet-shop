/**
 * Проверка подписи Telegram Mini App initData.
 * Документация: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Алгоритм:
 *  1. Из строки initData убираем параметр hash.
 *  2. Остальные пары key=value сортируем по ключу и склеиваем через "\n" → data_check_string.
 *  3. secret_key = HMAC_SHA256(key = "WebAppData", message = bot_token).
 *  4. Ожидаемый hash = hex(HMAC_SHA256(key = secret_key, message = data_check_string)).
 *  5. Сравниваем с присланным за константное время и проверяем свежесть auth_date.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TelegramInitUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
}

export interface ValidatedInitData {
  user: TelegramInitUser;
  authDate: Date;
  queryId?: string;
  startParam?: string;
}

export class InitDataError extends Error {}

export function validateInitData(
  raw: string,
  botToken: string,
  maxAgeSeconds: number,
  now: Date = new Date(),
): ValidatedInitData {
  if (!raw || raw.length > 8192) throw new InitDataError('initData отсутствует или слишком длинная');

  const params = new URLSearchParams(raw);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) throw new InitDataError('Нет корректного hash');
  params.delete('hash');

  // Поле signature (Ed25519 для сторонней проверки) участвует в расчёте hash как обычное поле
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secretKey).update(dataCheckString).digest();
  const received = Buffer.from(hash, 'hex');

  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new InitDataError('Подпись initData не совпадает');
  }

  const authDateSec = Number(params.get('auth_date'));
  if (!Number.isFinite(authDateSec) || authDateSec <= 0) throw new InitDataError('Нет auth_date');
  const ageSec = now.getTime() / 1000 - authDateSec;
  if (ageSec > maxAgeSeconds) throw new InitDataError('initData устарела, перезапустите приложение');
  if (ageSec < -300) throw new InitDataError('auth_date из будущего');

  const userRaw = params.get('user');
  if (!userRaw) throw new InitDataError('В initData нет пользователя');
  let user: TelegramInitUser;
  try {
    user = JSON.parse(userRaw) as TelegramInitUser;
  } catch {
    throw new InitDataError('Поле user — некорректный JSON');
  }
  if (!Number.isSafeInteger(user.id) || user.id <= 0) throw new InitDataError('Некорректный user.id');

  return {
    user,
    authDate: new Date(authDateSec * 1000),
    queryId: params.get('query_id') ?? undefined,
    startParam: params.get('start_param') ?? undefined,
  };
}

/**
 * Генерация подписанной initData — используется в тестах
 * (и может пригодиться для e2e-проверок).
 */
export function signInitData(fields: Record<string, string>, botToken: string): string {
  const params = new URLSearchParams(fields);
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));
  return params.toString();
}
