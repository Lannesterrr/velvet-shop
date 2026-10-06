import rateLimit from 'express-rate-limit';

/**
 * Ограничения частоты запросов (по IP; за nginx включён trust proxy).
 * Значения рассчитаны на живого пользователя с запасом.
 */
const common = {
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов, попробуйте через минуту' },
};

/** Все запросы к API */
export const apiLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 300 });

/** Загрузка файлов */
export const uploadLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 30 });

/** Создание заказов — защита от спама */
export const orderLimiter = rateLimit({ ...common, windowMs: 10 * 60_000, limit: 10 });
