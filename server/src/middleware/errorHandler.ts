import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { HttpError } from '../lib/errors';
import { zodFields } from '../lib/validate';
import { logger } from '../logger';

/** Единый формат ошибок API: { error: string, fields?: {...} } */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, fields: err.fields });
    return;
  }

  if (err instanceof ZodError) {
    const fields = zodFields(err);
    res.status(400).json({ error: Object.values(fields)[0] ?? 'Некорректные данные', fields });
    return;
  }

  if (err instanceof multer.MulterError) {
    const messages: Record<string, string> = {
      LIMIT_FILE_SIZE: 'Файл слишком большой (максимум 10 МБ)',
      LIMIT_FILE_COUNT: 'Слишком много файлов за раз (максимум 10)',
      LIMIT_UNEXPECTED_FILE: 'Неожиданное поле файла',
    };
    res.status(400).json({ error: messages[err.code] ?? 'Ошибка загрузки файла' });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002 — нарушение уникальности, P2025 — запись не найдена, P2003 — внешний ключ
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'поле';
      res.status(409).json({ error: `Значение уже используется (${target})` });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Запись не найдена' });
      return;
    }
    if (err.code === 'P2003') {
      res.status(409).json({ error: 'Запись связана с другими данными и не может быть изменена' });
      return;
    }
  }

  // Некорректный JSON в теле запроса
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'Некорректный JSON' });
    return;
  }

  // Ошибки middleware Express со статусом 4xx (нет файла в static, слишком большое тело и т.п.)
  const status = (err as { status?: unknown; statusCode?: unknown })?.status ?? (err as { statusCode?: unknown })?.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    const messages: Record<number, string> = { 404: 'Не найдено', 413: 'Слишком большой запрос' };
    res.status(status).json({ error: messages[status] ?? 'Некорректный запрос' });
    return;
  }

  logger.error({ err, url: req.originalUrl, method: req.method }, 'Необработанная ошибка');
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Маршрут не найден' });
}
