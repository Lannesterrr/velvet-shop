/**
 * Публичное API магазина (/api/...). Все маршруты требуют авторизации через Telegram initData.
 */
import { Router } from 'express';
import {
  cartAddSchema,
  cartUpdateSchema,
  checkoutSchema,
  productListQuerySchema,
  selectPaymentMethodSchema,
  writeAccessSchema,
  type MeDTO,
  type PublicSettingsDTO,
} from '@shop/shared';
import { prisma } from '../../db';
import { badRequest, notFound } from '../../lib/errors';
import { receiptUpload } from '../../lib/files';
import { parse, parseId } from '../../lib/validate';
import { currentUser, forgetUserCache, requireAuth } from '../../middleware/auth';
import { orderLimiter, uploadLimiter } from '../../middleware/rateLimit';
import * as cart from '../../services/cart.service';
import * as catalog from '../../services/catalog.service';
import { deliveryDTO } from '../../services/mappers';
import * as orders from '../../services/order.service';
import * as share from '../../services/share.service';
import { getSettings } from '../../services/settings.service';

export const publicRouter = Router();
publicRouter.use(requireAuth);

// ───────── Профиль ─────────

publicRouter.get('/me', async (req, res) => {
  const auth = currentUser(req);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.id } });
  const me: MeDTO = {
    id: user.id,
    telegramId: user.telegramId.toString(),
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    photoUrl: user.photoUrl,
    phone: user.phone,
    canWrite: user.canWrite,
    isAdmin: auth.isAdmin,
    isSuperAdmin: auth.isSuperAdmin,
  };
  res.json(me);
});

/** Результат WebApp.requestWriteAccess() — разрешил ли пользователь боту писать */
publicRouter.post('/me/write-access', async (req, res) => {
  const { granted } = parse(writeAccessSchema, req.body);
  const auth = currentUser(req);
  if (granted) {
    await prisma.user.update({ where: { id: auth.id }, data: { canWrite: true } });
    forgetUserCache(auth.telegramId);
  }
  res.json({ ok: true });
});

// ───────── Настройки и каталог ─────────

publicRouter.get('/settings', async (_req, res) => {
  const [settings, delivery] = await Promise.all([
    getSettings(),
    prisma.deliveryMethod.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
  ]);
  const dto: PublicSettingsDTO = { ...settings, deliveryMethods: delivery.map(deliveryDTO) };
  res.json(dto);
});

publicRouter.get('/categories', async (_req, res) => {
  res.json(await catalog.listCategories());
});

publicRouter.get('/products', async (req, res) => {
  res.json(await catalog.listProducts(parse(productListQuerySchema, req.query)));
});

publicRouter.get('/products/filters', async (req, res) => {
  const categoryId = req.query.categoryId ? parseId(req.query.categoryId) : undefined;
  res.json(await catalog.getFilters(categoryId));
});

publicRouter.get('/products/:id', async (req, res) => {
  res.json(await catalog.getPublicProduct(parseId(req.params.id)));
});

// ───────── Корзина ─────────

publicRouter.get('/cart', async (req, res) => {
  res.json(await cart.getCart(currentUser(req).id));
});

publicRouter.post('/cart', async (req, res) => {
  const { variantId, quantity } = parse(cartAddSchema, req.body);
  res.json(await cart.addToCart(currentUser(req).id, variantId, quantity));
});

publicRouter.patch('/cart/:id', async (req, res) => {
  const { quantity } = parse(cartUpdateSchema, req.body);
  res.json(await cart.updateCartItem(currentUser(req).id, parseId(req.params.id), quantity));
});

publicRouter.delete('/cart/:id', async (req, res) => {
  res.json(await cart.removeCartItem(currentUser(req).id, parseId(req.params.id)));
});

publicRouter.delete('/cart', async (req, res) => {
  res.json(await cart.clearCart(currentUser(req).id));
});

// ───────── Поделиться корзиной ─────────

publicRouter.post('/cart/share', async (req, res) => {
  res.status(201).json(await share.shareCart(currentUser(req).id));
});

publicRouter.get('/cart/shared/:token', async (req, res) => {
  res.json(await share.getSharedCart(String(req.params.token), currentUser(req).id));
});

publicRouter.post('/cart/shared/:token/import', async (req, res) => {
  res.json(await share.importSharedCart(currentUser(req).id, String(req.params.token)));
});

// ───────── Оплата и заказы ─────────

publicRouter.get('/payment-methods', async (_req, res) => {
  res.json(await orders.listActivePaymentMethods());
});

publicRouter.get('/orders', async (req, res) => {
  res.json(await orders.listUserOrders(currentUser(req).id));
});

publicRouter.post('/orders', orderLimiter, async (req, res) => {
  const input = parse(checkoutSchema, req.body);
  res.status(201).json(await orders.createOrder(currentUser(req).id, input));
});

publicRouter.get('/orders/:id', async (req, res) => {
  res.json(await orders.getUserOrder(currentUser(req).id, parseId(req.params.id)));
});

publicRouter.post('/orders/:id/payment-method', async (req, res) => {
  const { paymentMethodId } = parse(selectPaymentMethodSchema, req.body);
  res.json(await orders.selectPaymentMethod(currentUser(req).id, parseId(req.params.id), paymentMethodId));
});

publicRouter.post('/orders/:id/receipt', uploadLimiter, receiptUpload, async (req, res) => {
  if (!req.file) throw badRequest('Прикрепите файл чека');
  res.json(await orders.uploadReceipt(currentUser(req).id, parseId(req.params.id), req.file));
});

publicRouter.post('/orders/:id/cancel', async (req, res) => {
  res.json(await orders.cancelByUser(currentUser(req).id, parseId(req.params.id)));
});

// Неизвестный маршрут внутри /api
publicRouter.use((_req, _res, next) => next(notFound('Маршрут не найден')));
