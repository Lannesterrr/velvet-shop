/**
 * Админка: заказы и модерация оплат.
 */
import { Router } from 'express';
import {
  adminOrderListQuerySchema,
  orderNoteSchema,
  orderStatusUpdateSchema,
  rejectPaymentSchema,
} from '@shop/shared';
import { parse, parseId } from '../../lib/validate';
import { currentUser } from '../../middleware/auth';
import * as orders from '../../services/order.service';

export const adminOrdersRouter = Router();

adminOrdersRouter.get('/orders', async (req, res) => {
  const query = parse(adminOrderListQuerySchema, req.query);
  const [list, counts] = await Promise.all([orders.listAdminOrders(query), orders.orderStatusCounts()]);
  res.json({ ...list, counts });
});

adminOrdersRouter.get('/orders/:id', async (req, res) => {
  res.json(await orders.getAdminOrder(parseId(req.params.id)));
});

adminOrdersRouter.post('/orders/:id/confirm-payment', async (req, res) => {
  const id = parseId(req.params.id);
  await orders.confirmPayment(id, { telegramId: currentUser(req).telegramId });
  res.json(await orders.getAdminOrder(id));
});

adminOrdersRouter.post('/orders/:id/reject-payment', async (req, res) => {
  const id = parseId(req.params.id);
  const { reason } = parse(rejectPaymentSchema, req.body);
  await orders.rejectPayment(id, { telegramId: currentUser(req).telegramId }, reason);
  res.json(await orders.getAdminOrder(id));
});

adminOrdersRouter.patch('/orders/:id/status', async (req, res) => {
  const id = parseId(req.params.id);
  const { status, comment, trackingNumber } = parse(orderStatusUpdateSchema, req.body);
  await orders.changeStatus(id, status, { telegramId: currentUser(req).telegramId }, { comment, trackingNumber });
  res.json(await orders.getAdminOrder(id));
});

adminOrdersRouter.patch('/orders/:id/note', async (req, res) => {
  const data = parse(orderNoteSchema, req.body);
  res.json(await orders.updateOrderNote(parseId(req.params.id), data));
});
