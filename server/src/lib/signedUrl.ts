/**
 * Временные подписанные ссылки на приватные файлы (чеки об оплате).
 *
 * Зачем: <img src> и открытие PDF не умеют передавать заголовок Authorization,
 * а отдавать чеки публично нельзя. Поэтому сервер выдаёт ссылку вида
 *   /api/files/receipts/123?exp=1730000000&sig=...
 * которая действует ограниченное время и подписана HMAC-ключом,
 * производным от BOT_TOKEN (отдельный секрет хранить не нужно).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config';

const key = createHmac('sha256', 'receipt-links').update(config.BOT_TOKEN).digest();
const TTL_SECONDS = 60 * 60; // 1 час

function sign(orderId: number, exp: number): string {
  return createHmac('sha256', key).update(`${orderId}:${exp}`).digest('base64url');
}

export function receiptUrl(orderId: number): string {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  return `/api/files/receipts/${orderId}?exp=${exp}&sig=${sign(orderId, exp)}`;
}

export function verifyReceiptSignature(orderId: number, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  const expected = Buffer.from(sign(orderId, exp));
  const received = Buffer.from(sig);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
