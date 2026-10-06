/**
 * Админское API (/api/admin/...). Каждый запрос проходит проверку initData
 * и проверку прав администратора на сервере.
 */
import { Router } from 'express';
import { notFound } from '../../lib/errors';
import { requireAdmin, requireAuth } from '../../middleware/auth';
import { adminCatalogRouter } from './catalog';
import { adminOrdersRouter } from './orders';
import { adminShopRouter } from './shop';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);
adminRouter.use(adminCatalogRouter);
adminRouter.use(adminOrdersRouter);
adminRouter.use(adminShopRouter);
adminRouter.use((_req, _res, next) => next(notFound('Маршрут не найден')));
