import type { ZodError, ZodTypeAny, z } from 'zod';
import { badRequest } from './errors';

/** Превращает ошибки zod в { "variants.0.size": "Укажите размер" } */
export function zodFields(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/**
 * Проверяет данные схемой и возвращает типизированный результат,
 * либо бросает 400 со списком ошибок по полям.
 */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields = zodFields(result.error);
    throw badRequest(Object.values(fields)[0] ?? 'Некорректные данные', fields);
  }
  return result.data;
}

/** id из параметров маршрута (/:id) */
export function parseId(value: unknown): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw badRequest('Некорректный идентификатор');
  return n;
}
