/**
 * Ошибка с HTTP-статусом. Бросается из сервисов и маршрутов,
 * перехватывается errorHandler и превращается в JSON { error, fields? }.
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new HttpError(400, message, fields);
export const unauthorized = (message = 'Требуется авторизация через Telegram') => new HttpError(401, message);
export const forbidden = (message = 'Недостаточно прав') => new HttpError(403, message);
export const notFound = (message = 'Не найдено') => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);
