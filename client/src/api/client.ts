/**
 * HTTP-клиент API. К каждому запросу добавляется заголовок
 *   Authorization: tma <initData>      — внутри Telegram
 *   Authorization: web <token>         — в обычном браузере после входа через Telegram
 * Сервер проверяет подпись и по нему определяет пользователя.
 */
import type { ApiError as ApiErrorBody } from '@shop/shared';
import { clearSessionToken, getSessionToken } from '../lib/webAuth';
import { initDataRaw } from '../telegram/webapp';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  /** Для загрузки файлов */
  formData?: FormData;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Query): string {
  const url = `/api${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const webToken = initDataRaw ? null : getSessionToken();
  if (initDataRaw) headers.Authorization = `tma ${initDataRaw}`;
  else if (webToken) headers.Authorization = `web ${webToken}`;

  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData; // Content-Type с boundary браузер выставит сам
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body,
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'Нет соединения с сервером. Проверьте интернет.');
  }

  if (res.status === 204) return undefined as T;

  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    // Сессия браузера истекла или недействительна — забываем её, покажется экран входа
    if (res.status === 401 && webToken) clearSessionToken();
    const err = (data ?? {}) as Partial<ApiErrorBody>;
    throw new ApiError(res.status, err.error ?? `Ошибка ${res.status}`, err.fields);
  }
  return data as T;
}

/** Текст ошибки для показа пользователю */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Что-то пошло не так';
}
