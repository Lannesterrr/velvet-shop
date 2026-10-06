/**
 * Админка: товары, фото, категории.
 */
import { Router } from 'express';
import {
  adminProductListQuerySchema,
  categoryInputSchema,
  productInputSchema,
  productStatusSchema,
  reorderSchema,
} from '@shop/shared';
import { badRequest } from '../../lib/errors';
import { productImagesUpload } from '../../lib/files';
import { parse, parseId } from '../../lib/validate';
import { uploadLimiter } from '../../middleware/rateLimit';
import * as products from '../../services/product.service';

export const adminCatalogRouter = Router();

// ───────── Товары ─────────

adminCatalogRouter.get('/products', async (req, res) => {
  res.json(await products.listAdminProducts(parse(adminProductListQuerySchema, req.query)));
});

adminCatalogRouter.get('/products/:id', async (req, res) => {
  res.json(await products.getAdminProduct(parseId(req.params.id)));
});

adminCatalogRouter.post('/products', async (req, res) => {
  res.status(201).json(await products.createProduct(parse(productInputSchema, req.body)));
});

adminCatalogRouter.put('/products/:id', async (req, res) => {
  res.json(await products.updateProduct(parseId(req.params.id), parse(productInputSchema, req.body)));
});

adminCatalogRouter.patch('/products/:id/status', async (req, res) => {
  const { status } = parse(productStatusSchema, req.body);
  res.json(await products.setProductStatus(parseId(req.params.id), status));
});

adminCatalogRouter.delete('/products/:id', async (req, res) => {
  await products.deleteProduct(parseId(req.params.id));
  res.status(204).end();
});

// ───────── Фото товара ─────────

adminCatalogRouter.post('/products/:id/images', uploadLimiter, productImagesUpload, async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw badRequest('Выберите хотя бы одно фото');
  res.json(await products.addProductImages(parseId(req.params.id), files));
});

adminCatalogRouter.put('/products/:id/images/order', async (req, res) => {
  const { ids } = parse(reorderSchema, req.body);
  res.json(await products.reorderProductImages(parseId(req.params.id), ids));
});

adminCatalogRouter.patch('/products/:id/images/:imageId/main', async (req, res) => {
  res.json(await products.setMainImage(parseId(req.params.id), parseId(req.params.imageId)));
});

adminCatalogRouter.delete('/products/:id/images/:imageId', async (req, res) => {
  res.json(await products.deleteProductImage(parseId(req.params.id), parseId(req.params.imageId)));
});

// ───────── Категории ─────────

adminCatalogRouter.get('/categories', async (_req, res) => {
  res.json(await products.listAdminCategories());
});

adminCatalogRouter.post('/categories', async (req, res) => {
  res.status(201).json(await products.createCategory(parse(categoryInputSchema, req.body)));
});

adminCatalogRouter.put('/categories/order', async (req, res) => {
  const { ids } = parse(reorderSchema, req.body);
  res.json(await products.reorderCategories(ids));
});

adminCatalogRouter.put('/categories/:id', async (req, res) => {
  res.json(await products.updateCategory(parseId(req.params.id), parse(categoryInputSchema, req.body)));
});

adminCatalogRouter.delete('/categories/:id', async (req, res) => {
  await products.deleteCategory(parseId(req.params.id));
  res.status(204).end();
});
