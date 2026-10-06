/**
 * Админка: реквизиты, доставка, настройки магазина, администраторы, статистика.
 */
import { Router } from 'express';
import {
  adminInputSchema,
  deliveryMethodInputSchema,
  paymentMethodInputSchema,
  reorderSchema,
  shopSettingsInputSchema,
} from '@shop/shared';
import { prisma } from '../../db';
import { parse, parseId } from '../../lib/validate';
import { currentUser, requireSuperAdmin } from '../../middleware/auth';
import * as admins from '../../services/admin.service';
import { deliveryDTO, paymentMethodDTO } from '../../services/mappers';
import { getSettings, updateSettings } from '../../services/settings.service';
import { getStats } from '../../services/stats.service';

export const adminShopRouter = Router();

// ───────── Статистика ─────────

adminShopRouter.get('/stats', async (_req, res) => {
  res.json(await getStats());
});

// ───────── Реквизиты для оплаты ─────────
// Изменения применяются сразу: клиент запрашивает реквизиты при каждом открытии экрана оплаты.

const listPaymentMethods = async () =>
  (await prisma.paymentMethod.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })).map(paymentMethodDTO);

adminShopRouter.get('/payment-methods', async (_req, res) => {
  res.json(await listPaymentMethods());
});

adminShopRouter.post('/payment-methods', async (req, res) => {
  const input = parse(paymentMethodInputSchema, req.body);
  const max = await prisma.paymentMethod.aggregate({ _max: { sortOrder: true } });
  const created = await prisma.paymentMethod.create({ data: { ...input, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
  res.status(201).json(paymentMethodDTO(created));
});

adminShopRouter.put('/payment-methods/order', async (req, res) => {
  const { ids } = parse(reorderSchema, req.body);
  await prisma.$transaction(ids.map((id, i) => prisma.paymentMethod.update({ where: { id }, data: { sortOrder: i } })));
  res.json(await listPaymentMethods());
});

adminShopRouter.put('/payment-methods/:id', async (req, res) => {
  const input = parse(paymentMethodInputSchema, req.body);
  const updated = await prisma.paymentMethod.update({ where: { id: parseId(req.params.id) }, data: input });
  res.json(paymentMethodDTO(updated));
});

adminShopRouter.delete('/payment-methods/:id', async (req, res) => {
  // В заказах остаётся снимок реквизитов, ссылка обнуляется (onDelete: SetNull)
  await prisma.paymentMethod.delete({ where: { id: parseId(req.params.id) } });
  res.status(204).end();
});

// ───────── Способы доставки ─────────

const listDelivery = async () =>
  (await prisma.deliveryMethod.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })).map(deliveryDTO);

adminShopRouter.get('/delivery-methods', async (_req, res) => {
  res.json(await listDelivery());
});

adminShopRouter.post('/delivery-methods', async (req, res) => {
  const input = parse(deliveryMethodInputSchema, req.body);
  const max = await prisma.deliveryMethod.aggregate({ _max: { sortOrder: true } });
  const created = await prisma.deliveryMethod.create({ data: { ...input, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
  res.status(201).json(deliveryDTO(created));
});

adminShopRouter.put('/delivery-methods/order', async (req, res) => {
  const { ids } = parse(reorderSchema, req.body);
  await prisma.$transaction(ids.map((id, i) => prisma.deliveryMethod.update({ where: { id }, data: { sortOrder: i } })));
  res.json(await listDelivery());
});

adminShopRouter.put('/delivery-methods/:id', async (req, res) => {
  const input = parse(deliveryMethodInputSchema, req.body);
  const updated = await prisma.deliveryMethod.update({ where: { id: parseId(req.params.id) }, data: input });
  res.json(deliveryDTO(updated));
});

adminShopRouter.delete('/delivery-methods/:id', async (req, res) => {
  await prisma.deliveryMethod.delete({ where: { id: parseId(req.params.id) } });
  res.status(204).end();
});

// ───────── Настройки магазина ─────────

adminShopRouter.get('/settings', async (_req, res) => {
  res.json(await getSettings());
});

adminShopRouter.put('/settings', async (req, res) => {
  res.json(await updateSettings(parse(shopSettingsInputSchema, req.body)));
});

// ───────── Администраторы (управляет только владелец из ADMIN_IDS) ─────────

adminShopRouter.get('/admins', async (_req, res) => {
  res.json(await admins.listAdmins());
});

adminShopRouter.post('/admins', requireSuperAdmin, async (req, res) => {
  const { telegramId, name } = parse(adminInputSchema, req.body);
  await admins.addAdmin(telegramId, name, currentUser(req).telegramId);
  res.status(201).json(await admins.listAdmins());
});

adminShopRouter.delete('/admins/:id', requireSuperAdmin, async (req, res) => {
  await admins.removeAdmin(parseId(req.params.id), currentUser(req).telegramId);
  res.json(await admins.listAdmins());
});
