import pino from 'pino';
import { config } from './config';

/** В разработке — цветной читаемый вывод, в продакшене — JSON для сборщиков логов */
export const logger = pino({
  level: config.LOG_LEVEL,
  transport: config.isProd
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
  redact: ['req.headers.authorization'],
});
