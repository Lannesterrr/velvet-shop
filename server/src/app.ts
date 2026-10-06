/**
 * Сборка Express-приложения: безопасность, API, статика, SPA.
 */
import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { mountWebhook } from './bot';
import { config } from './config';
import { PRODUCTS_DIR } from './lib/files';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimit';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { filesRouter } from './routes/files';
import { publicRouter } from './routes/public';

export function createApp(): Express {
  const app = express();

  // За nginx / Railway: доверяем первому прокси, чтобы rate limit видел реальный IP
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // Mini App открывается внутри Telegram Web (web.telegram.org) во фрейме —
      // стандартный X-Frame-Options: SAMEORIGIN сломал бы приложение
      frameguard: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'script-src': ["'self'", 'https://telegram.org'],
          'img-src': ["'self'", 'data:', 'blob:', 'https://t.me', 'https://*.telegram.org', 'https://*.t.me'],
          'connect-src': ["'self'"],
          // Вход из браузера через oauth.telegram.org (переход на страницу Telegram и обратно)
          'form-action': ["'self'", 'https://oauth.telegram.org'],
          'frame-ancestors': ["'self'", 'https://web.telegram.org', 'https://*.telegram.org', 'https://t.me'],
          'upgrade-insecure-requests': config.isProd ? [] : null,
        },
      },
    }),
  );

  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin) || !config.isProd),
      allowedHeaders: ['Authorization', 'Content-Type'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      maxAge: 86400,
    }),
  );

  app.use(express.json({ limit: '1mb' }));

  // Webhook бота (только в режиме BOT_MODE=webhook)
  mountWebhook(app);

  app.get('/health', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  // Публичные фото товаров. Чеки (uploads/receipts) сюда НЕ попадают.
  app.use(
    '/uploads/products',
    express.static(PRODUCTS_DIR, { maxAge: '30d', immutable: true, index: false, fallthrough: false }),
  );

  // API: порядок важен — сначала более специфичные префиксы
  app.use('/api', apiLimiter);
  app.use('/api/auth', authRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', publicRouter);

  // Собранный клиент (в продакшене сервер сам раздаёт фронтенд)
  const dist = config.clientDist;
  if (dist && fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(
      express.static(dist, {
        index: false,
        setHeaders: (res, filePath) => {
          // Файлы с хешем в имени кэшируем навсегда, index.html — никогда
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    // SPA: любые GET-запросы, кроме API, отдают index.html (маршрутизация на клиенте)
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
