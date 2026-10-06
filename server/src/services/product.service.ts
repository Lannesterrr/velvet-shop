/**
 * Управление товарами в админке: CRUD, варианты, фото, категории.
 */
import type { Prisma } from '@prisma/client';
import type {
  AdminProductListItemDTO,
  CategoryDTO,
  Paginated,
  ProductDTO,
  ProductInput,
  ProductStatus,
} from '@shop/shared';
import type { z } from 'zod';
import type { adminProductListQuerySchema, categoryInputSchema } from '@shop/shared';
import { prisma } from '../db';
import { badRequest, conflict, notFound } from '../lib/errors';
import { removeProductImageFiles, saveProductImage } from '../lib/files';
import { categoryDTO, mainImage, productDTO } from './mappers';

const MAX_IMAGES_PER_PRODUCT = 15;
const productInclude = { images: true, variants: true, category: true } as const;

// ───────── Товары ─────────

type AdminProductQuery = z.output<typeof adminProductListQuerySchema>;

export async function listAdminProducts(q: AdminProductQuery): Promise<Paginated<AdminProductListItemDTO>> {
  const and: Prisma.ProductWhereInput[] = [];
  if (q.status) and.push({ status: q.status });
  if (q.categoryId) and.push({ categoryId: q.categoryId });
  if (q.search) {
    and.push({
      OR: [
        { title: { contains: q.search, mode: 'insensitive' } },
        { sku: { contains: q.search, mode: 'insensitive' } },
        { brand: { contains: q.search, mode: 'insensitive' } },
      ],
    });
  }
  const where: Prisma.ProductWhereInput = { AND: and };

  const [total, rows] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      include: productInclude,
    }),
  ]);

  return {
    items: rows.map((p) => ({
      id: p.id,
      title: p.title,
      sku: p.sku,
      price: p.price,
      oldPrice: p.oldPrice,
      status: p.status,
      categoryId: p.categoryId,
      categoryName: p.category.name,
      image: mainImage(p.images),
      totalStock: p.variants.reduce((s, v) => s + v.stock, 0),
      variantsCount: p.variants.length,
      updatedAt: p.updatedAt.toISOString(),
    })),
    total,
    page: q.page,
    pages: Math.max(1, Math.ceil(total / q.limit)),
  };
}

export async function getAdminProduct(id: number): Promise<ProductDTO> {
  const p = await prisma.product.findUnique({ where: { id }, include: productInclude });
  if (!p) throw notFound('Товар не найден');
  return productDTO(p);
}

async function assertCategory(categoryId: number): Promise<void> {
  const exists = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
  if (!exists) throw badRequest('Категория не найдена', { categoryId: 'Выберите категорию' });
}

function productData(input: ProductInput) {
  return {
    title: input.title,
    description: input.description,
    categoryId: input.categoryId,
    price: input.price,
    oldPrice: input.oldPrice,
    sku: input.sku,
    brand: input.brand,
    material: input.material,
    status: input.status,
  };
}

export async function createProduct(input: ProductInput): Promise<ProductDTO> {
  await assertCategory(input.categoryId);
  const p = await prisma.product.create({
    data: {
      ...productData(input),
      variants: {
        create: input.variants.map((v) => ({ size: v.size, color: v.color, colorHex: v.colorHex, price: v.price, stock: v.stock })),
      },
    },
    include: productInclude,
  });
  return productDTO(p);
}

/**
 * Обновление товара с синхронизацией вариантов:
 * варианты с id — обновляются, без id — создаются, отсутствующие в запросе — удаляются
 * (в старых заказах остаётся снимок, ссылка на вариант обнуляется).
 */
export async function updateProduct(id: number, input: ProductInput): Promise<ProductDTO> {
  await assertCategory(input.categoryId);

  const p = await prisma.$transaction(async (tx) => {
    const existing = await tx.product.findUnique({ where: { id }, include: { variants: true } });
    if (!existing) throw notFound('Товар не найден');

    const existingIds = new Set(existing.variants.map((v) => v.id));
    const keepIds = new Set(input.variants.filter((v) => v.id && existingIds.has(v.id)).map((v) => v.id!));

    // 1) Удаляем варианты, которых больше нет
    await tx.productVariant.deleteMany({ where: { productId: id, id: { notIn: [...keepIds] } } });

    // 2) Обновляем существующие. Чтобы не упереться в уникальность (size, color) при
    //    перестановке значений, сначала временно переименовываем их.
    for (const vid of keepIds) {
      await tx.productVariant.update({ where: { id: vid }, data: { size: `__tmp_${vid}`, color: `__tmp_${vid}` } });
    }
    for (const v of input.variants) {
      if (v.id && keepIds.has(v.id)) {
        await tx.productVariant.update({
          where: { id: v.id },
          data: { size: v.size, color: v.color, colorHex: v.colorHex, price: v.price, stock: v.stock },
        });
      }
    }

    // 3) Создаём новые
    const toCreate = input.variants.filter((v) => !v.id || !keepIds.has(v.id));
    if (toCreate.length) {
      await tx.productVariant.createMany({
        data: toCreate.map((v) => ({ productId: id, size: v.size, color: v.color, colorHex: v.colorHex, price: v.price, stock: v.stock })),
      });
    }

    await tx.product.update({ where: { id }, data: productData(input) });
    return tx.product.findUniqueOrThrow({ where: { id }, include: productInclude });
  });

  return productDTO(p);
}

export async function setProductStatus(id: number, status: ProductStatus): Promise<ProductDTO> {
  const p = await prisma.product.update({ where: { id }, data: { status }, include: productInclude });
  return productDTO(p);
}

/** Полное удаление товара вместе с фото. Заказы сохраняют свои снимки. */
export async function deleteProduct(id: number): Promise<void> {
  const p = await prisma.product.findUnique({ where: { id }, include: { images: true } });
  if (!p) throw notFound('Товар не найден');
  await prisma.product.delete({ where: { id } });
  await removeProductImageFiles(...p.images.flatMap((i) => [i.url, i.thumbUrl]));
}

// ───────── Фото ─────────

export async function addProductImages(productId: number, files: Express.Multer.File[]): Promise<ProductDTO> {
  if (!files.length) throw badRequest('Выберите файлы');
  const product = await prisma.product.findUnique({ where: { id: productId }, include: { images: true } });
  if (!product) throw notFound('Товар не найден');
  if (product.images.length + files.length > MAX_IMAGES_PER_PRODUCT) {
    throw badRequest(`Максимум ${MAX_IMAGES_PER_PRODUCT} фото на товар (сейчас ${product.images.length})`);
  }

  // Обрабатываем последовательно, чтобы не перегружать CPU/память
  const saved: { url: string; thumbUrl: string }[] = [];
  try {
    for (const file of files) saved.push(await saveProductImage(file.buffer));
  } catch (err) {
    await removeProductImageFiles(...saved.flatMap((s) => [s.url, s.thumbUrl]));
    throw err;
  }

  const startOrder = product.images.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1;
  const hasMain = product.images.some((i) => i.isMain);
  await prisma.productImage.createMany({
    data: saved.map((s, i) => ({
      productId,
      url: s.url,
      thumbUrl: s.thumbUrl,
      sortOrder: startOrder + i,
      isMain: !hasMain && i === 0,
    })),
  });
  return getAdminProduct(productId);
}

export async function reorderProductImages(productId: number, ids: number[]): Promise<ProductDTO> {
  const images = await prisma.productImage.findMany({ where: { productId }, select: { id: true } });
  const own = new Set(images.map((i) => i.id));
  if (ids.length !== own.size || ids.some((id) => !own.has(id))) {
    throw badRequest('Список фото не совпадает с фото товара');
  }
  await prisma.$transaction(ids.map((id, index) => prisma.productImage.update({ where: { id }, data: { sortOrder: index } })));
  return getAdminProduct(productId);
}

export async function setMainImage(productId: number, imageId: number): Promise<ProductDTO> {
  const image = await prisma.productImage.findFirst({ where: { id: imageId, productId } });
  if (!image) throw notFound('Фото не найдено');
  await prisma.$transaction([
    prisma.productImage.updateMany({ where: { productId }, data: { isMain: false } }),
    prisma.productImage.update({ where: { id: imageId }, data: { isMain: true } }),
  ]);
  return getAdminProduct(productId);
}

export async function deleteProductImage(productId: number, imageId: number): Promise<ProductDTO> {
  const image = await prisma.productImage.findFirst({ where: { id: imageId, productId } });
  if (!image) throw notFound('Фото не найдено');
  await prisma.productImage.delete({ where: { id: imageId } });
  await removeProductImageFiles(image.url, image.thumbUrl);

  // Если удалили главное — главным становится первое оставшееся
  if (image.isMain) {
    const first = await prisma.productImage.findFirst({ where: { productId }, orderBy: { sortOrder: 'asc' } });
    if (first) await prisma.productImage.update({ where: { id: first.id }, data: { isMain: true } });
  }
  return getAdminProduct(productId);
}

// ───────── Категории ─────────

type CategoryInput = z.output<typeof categoryInputSchema>;

export async function listAdminCategories(): Promise<CategoryDTO[]> {
  const rows = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: { _count: { select: { products: true } } },
  });
  return rows.map(categoryDTO);
}

export async function createCategory(input: CategoryInput): Promise<CategoryDTO> {
  const max = await prisma.category.aggregate({ _max: { sortOrder: true } });
  const c = await prisma.category.create({
    data: { ...input, sortOrder: (max._max.sortOrder ?? -1) + 1 },
    include: { _count: { select: { products: true } } },
  });
  return categoryDTO(c);
}

export async function updateCategory(id: number, input: CategoryInput): Promise<CategoryDTO> {
  const c = await prisma.category.update({
    where: { id },
    data: input,
    include: { _count: { select: { products: true } } },
  });
  return categoryDTO(c);
}

export async function deleteCategory(id: number): Promise<void> {
  const count = await prisma.product.count({ where: { categoryId: id } });
  if (count > 0) {
    throw conflict(`В категории ${count} товар(ов). Перенесите их в другую категорию или скройте категорию.`);
  }
  await prisma.category.delete({ where: { id } });
}

export async function reorderCategories(ids: number[]): Promise<CategoryDTO[]> {
  await prisma.$transaction(ids.map((id, index) => prisma.category.update({ where: { id }, data: { sortOrder: index } })));
  return listAdminCategories();
}
