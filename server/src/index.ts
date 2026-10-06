/**
 * Точка входа: HTTP-сервер + Telegram-бот в одном процессе.
 */
import { createApp } from './app';
import { startBot, stopBot } from './bot';
import { config } from './config';
import { prisma } from './db';
import { ensureUploadDirs } from './lib/files';
import { logger } from './logger';

async function main(): Promise<void> {
  await prisma.$connect();
  await ensureUploadDirs();

  const app = createApp();
  const server = app.listen(config.PORT, config.HOST, () => {
    logger.info(`API запущен: http://${config.HOST}:${config.PORT}  (Mini App: ${config.WEBAPP_URL})`);
    if (config.devTelegramId) {
      logger.warn(`⚠️  DEV_TELEGRAM_ID=${config.devTelegramId}: запросы без initData выполняются от этого пользователя`);
    }
    if (!config.adminIds.size) logger.warn('⚠️  ADMIN_IDS пуст — админ-панель никому не доступна');
  });

  // Бот не должен мешать работе магазина: при ошибке запуска API продолжает работать
  startBot().catch((err) => logger.error({ err }, 'Не удалось запустить бота — проверьте BOT_TOKEN и доступ к api.telegram.org'));

  // Корректное завершение (systemd / Docker / Ctrl+C)
  const shutdown = async (signal: string) => {
    logger.info(`${signal}: останавливаемся…`);
    server.close();
    await stopBot().catch(() => undefined);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch(async (err) => {
  logger.fatal({ err }, 'Сервер не запустился');
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
