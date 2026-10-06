/**
 * Вход из обычного браузера (/api/auth/...). Эти маршруты НЕ требуют авторизации.
 *
 *  GET  /api/auth/config    — данные для кнопки «Войти через Telegram» (ID и имя бота)
 *  POST /api/auth/telegram  — проверка данных от Telegram и выдача токена сессии
 */
import { Router } from 'express';
import { bot } from '../bot/instance';
import { config } from '../config';
import { badRequest, unauthorized } from '../lib/errors';
import { createSessionToken, validateLoginData, WebAuthError } from '../lib/webSession';
import { forgetUserCache, upsertUser } from '../middleware/auth';
import { loginLimiter } from '../middleware/rateLimit';

/** Сессия в браузере живёт 30 дней */
const SESSION_TTL_SECONDS = 30 * 24 * 3600;
/** Данные от Telegram должны быть свежими: вход занимает секунды */
const LOGIN_MAX_AGE_SECONDS = 24 * 3600;

export const authRouter = Router();

authRouter.get('/config', (_req, res) => {
  let botUsername: string | null = null;
  try {
    botUsername = bot.botInfo.username;
  } catch {
    // бот ещё не подключился к Telegram
  }
  // ID бота — первая часть токена до двоеточия, он не секретный (виден в любой ссылке входа)
  res.json({ botId: config.BOT_TOKEN.split(':')[0], botUsername });
});

authRouter.post('/telegram', loginLimiter, async (req, res) => {
  if (!req.body || typeof req.body !== 'object') throw badRequest('Нет данных входа');
  let login;
  try {
    login = validateLoginData(req.body as Record<string, unknown>, config.BOT_TOKEN, LOGIN_MAX_AGE_SECONDS);
  } catch (err) {
    if (err instanceof WebAuthError) throw unauthorized(err.message);
    throw err;
  }

  forgetUserCache(login.id);
  await upsertUser({
    id: login.id,
    first_name: login.first_name,
    last_name: login.last_name,
    username: login.username,
    photo_url: login.photo_url,
  });

  const session = createSessionToken(login.id, config.BOT_TOKEN, SESSION_TTL_SECONDS);
  res.json({ token: session.token, expiresAt: session.expiresAt.toISOString() });
});
