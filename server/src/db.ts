import { PrismaClient } from '@prisma/client';
import { config } from './config';

/**
 * BigInt (telegramId) не сериализуется в JSON по умолчанию.
 * Отдаём его строкой: Telegram ID может превышать Number.MAX_SAFE_INTEGER в будущем.
 */
declare global {
  interface BigInt {
    toJSON(): string;
  }
}
BigInt.prototype.toJSON = function toJSON() {
  return this.toString();
};

export const prisma = new PrismaClient({
  log: config.isProd ? ['error'] : ['warn', 'error'],
});
