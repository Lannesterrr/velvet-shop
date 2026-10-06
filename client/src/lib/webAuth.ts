/**
 * Вход в магазин из обычного браузера (вне Telegram).
 *
 * Кнопка «Войти через Telegram» уводит на oauth.telegram.org, там покупатель
 * подтверждает вход, и Telegram возвращает его обратно с #tgAuthResult=<данные>.
 * Мы отправляем эти данные на сервер, он проверяет подпись и выдаёт токен сессии,
 * который хранится в localStorage этого браузера.
 *
 * Важно: адрес магазина должен быть указан у @BotFather → /setdomain.
 */

const TOKEN_KEY = 'web_session_v1';

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // приватный режим браузера — придётся входить заново при каждом открытии
  }
}

export function clearSessionToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ничего страшного
  }
}

/** Ссылка на страницу входа Telegram, после которой он вернёт покупателя сюда же */
export function telegramLoginUrl(botId: string): string {
  const origin = window.location.origin;
  const params = new URLSearchParams({
    bot_id: botId,
    origin,
    // Разрешение боту писать — чтобы приходили уведомления о заказах
    request_access: 'write',
    return_to: `${origin}${window.location.pathname}`,
  });
  return `https://oauth.telegram.org/auth?${params.toString()}`;
}

/**
 * Достаёт данные входа, которые Telegram вернул в адресе страницы, и убирает их из адреса.
 * Telegram присылает #tgAuthResult=<base64(JSON)>.
 */
export function takeLoginResultFromUrl(): Record<string, unknown> | null {
  const match = /[#&]tgAuthResult=([^&]+)/.exec(window.location.hash);
  if (!match) return null;
  // Чистим адрес, чтобы данные не остались в истории и не отправились повторно
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  try {
    let b64 = decodeURIComponent(match[1]!).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    const data = JSON.parse(json) as unknown;
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
