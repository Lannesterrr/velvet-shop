import { Bot } from 'grammy';
import { config } from '../config';

/** Единственный экземпляр бота — используется и для команд, и для уведомлений */
export const bot = new Bot(config.BOT_TOKEN);

/** Экранирование для parse_mode: 'HTML' */
export function esc(text: string | null | undefined): string {
  return (text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Ссылка для пересылки другу, открывающая нужный экран магазина.
 * payload — параметр запуска, например "cart_AbC123".
 *  - есть WEBAPP_SHORT_NAME → t.me/<бот>/<имя>?startapp=<payload> (открывает Mini App сразу)
 *  - бот запущен → t.me/<бот>?start=<payload> (бот пришлёт кнопку)
 *  - иначе → прямая ссылка на сайт
 */
export function telegramShareLink(payload: string, fallbackPath: string): string {
  let username: string | undefined;
  try {
    username = bot.botInfo.username;
  } catch {
    // бот ещё не инициализирован (BOT_MODE=off или нет связи с Telegram)
  }
  if (username && config.WEBAPP_SHORT_NAME) return `https://t.me/${username}/${config.WEBAPP_SHORT_NAME}?startapp=${payload}`;
  if (username) return `https://t.me/${username}?start=${payload}`;
  return appUrl(fallbackPath);
}

/** Абсолютная ссылка внутрь Mini App */
export function appUrl(path = '/'): string {
  return `${config.WEBAPP_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
