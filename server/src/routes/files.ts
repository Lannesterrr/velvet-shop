/**
 * Отдача приватных файлов (чеков) по временной подписанной ссылке.
 * Ссылку выдаёт только API заказа владельцу заказа или админу (см. lib/signedUrl.ts).
 */
import fs from 'node:fs';
import { Router } from 'express';
import { prisma } from '../db';
import { forbidden, notFound } from '../lib/errors';
import { resolveReceiptPath } from '../lib/files';
import { verifyReceiptSignature } from '../lib/signedUrl';
import { parseId } from '../lib/validate';

export const filesRouter = Router();

filesRouter.get('/receipts/:orderId', async (req, res) => {
  const orderId = parseId(req.params.orderId);
  const exp = Number(req.query.exp);
  const sig = typeof req.query.sig === 'string' ? req.query.sig : '';
  if (!verifyReceiptSignature(orderId, exp, sig)) throw forbidden('Ссылка устарела — обновите страницу заказа');

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { receiptPath: true } });
  if (!order?.receiptPath) throw notFound('Чек не найден');
  const file = resolveReceiptPath(order.receiptPath);
  if (!fs.existsSync(file)) throw notFound('Файл чека не найден');

  const isPdf = file.endsWith('.pdf');
  res.setHeader('Cache-Control', 'private, max-age=600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `inline; filename="receipt-${orderId}.${isPdf ? 'pdf' : 'jpg'}"`);
  res.type(isPdf ? 'application/pdf' : 'image/jpeg');
  res.sendFile(file);
});
