/**
 * Конфигурация из переменных окружения.
 * Всё валидируется при старте: если чего-то не хватает — сервер не запустится
 * и подробно напишет, какой переменной нет.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** Папка server/ (и для src/*.ts в разработке, и для dist/index.js в продакшене) */
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// .env лежит в папке server/ — там же его ищет Prisma CLI
dotenv.config({ path: path.join(serverRoot, '.env') });

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().default(3000),
    /** Адрес, на котором слушает сервер. За nginx — 127.0.0.1 */
    HOST: z.string().default('0.0.0.0'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL обязателен'),

    BOT_TOKEN: z
      .string()
      .regex(/^\d+:[\w-]{30,}$/, 'BOT_TOKEN должен выглядеть как 123456:ABC... (выдаёт @BotFather)'),
    /** Telegram ID суперадминов через запятую */
    ADMIN_IDS: z
      .string()
      .default('')
      .transform((s) =>
        s
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.string().regex(/^\d+$/, 'ADMIN_IDS — числа через запятую'))),

    /** Публичный HTTPS-адрес Mini App, например https://shop.example.com */
    WEBAPP_URL: z
      .string()
      .url()
      .refine((u) => u.startsWith('https://'), 'WEBAPP_URL должен начинаться с https://')
      .transform((u) => u.replace(/\/+$/, '')),

    /**
     * Короткое имя Mini App из BotFather (/newapp), например "shop".
     * Если задано, ссылки «Поделиться корзиной» открывают приложение сразу:
     * t.me/<бот>/<имя>?startapp=cart_xxx. Иначе — через бота: t.me/<бот>?start=cart_xxx
     */
    WEBAPP_SHORT_NAME: z.string().regex(/^[\w-]{3,64}$/).optional(),

    /** polling — для разработки, webhook — для продакшена */
    BOT_MODE: z.enum(['polling', 'webhook', 'off']).default('polling'),
    /** Секрет для проверки, что webhook вызывает именно Telegram */
    WEBHOOK_SECRET: z.string().regex(/^[\w-]{16,256}$/).optional(),

    /** Сколько секунд initData считается действительной */
    INIT_DATA_TTL: z.coerce.number().int().positive().default(86400),

    UPLOAD_DIR: z.string().default('uploads'),
    /** Путь к собранному клиенту (client/dist). Если пусто — статика не раздаётся */
    CLIENT_DIST: z.string().default('../client/dist'),
    /** Разрешённые CORS-источники через запятую. По умолчанию — только WEBAPP_URL */
    CORS_ORIGINS: z.string().default(''),

    /**
     * ТОЛЬКО ДЛЯ РАЗРАБОТКИ: Telegram ID, от имени которого выполняются запросы
     * без initData (чтобы открыть приложение в обычном браузере).
     * Игнорируется при NODE_ENV=production.
     */
    DEV_TELEGRAM_ID: z.string().regex(/^\d+$/).optional(),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  })
  .superRefine((env, ctx) => {
    if (env.BOT_MODE === 'webhook' && !env.WEBHOOK_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['WEBHOOK_SECRET'],
        message: 'Для BOT_MODE=webhook задайте WEBHOOK_SECRET (16+ символов: буквы, цифры, _ и -)',
      });
    }
  });

// Пустые значения (KEY=) считаем незаданными — так работают значения по умолчанию
const rawEnv = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v.trim() !== ''));
const parsed = envSchema.safeParse(rawEnv);
if (!parsed.success) {
  console.error('❌ Ошибка в переменных окружения (.env):');
  for (const issue of parsed.error.issues) {
    console.error(`   ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const env = parsed.data;
const isProd = env.NODE_ENV === 'production';

export const config = {
  ...env,
  isProd,
  adminIds: new Set(env.ADMIN_IDS),
  uploadDir: path.resolve(serverRoot, env.UPLOAD_DIR),
  clientDist: env.CLIENT_DIST ? path.resolve(serverRoot, env.CLIENT_DIST) : null,
  corsOrigins: [
    env.WEBAPP_URL,
    ...env.CORS_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ],
  devTelegramId: isProd ? undefined : env.DEV_TELEGRAM_ID,
  webhookPath: '/bot/webhook',
};

export type Config = typeof config;
