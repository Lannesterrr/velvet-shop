/**
 * Публичный каталог: список товаров с поиском/фильтрами, фильтры, карточка товара.
 * Покупателю видны только активные товары из активных категорий.
 */
import type { Prisma } from '@prisma/client';
import type {
  CatalogFiltersDTO,
  CategoryDTO,
  Paginated,
  ProductDTO,
  ProductListItemDTO,
  ProductListQuery,
} from '@shop/shared';
import { prisma } from '../db';
import { notFound } from '../lib/errors';
import { categoryDTO, compareSizes, mainImage, productDTO, variantPrice } from './mappers';

/** Базовое условие «товар виден покупателю» */
const visibleProduct: Prisma.ProductWhereInput = {
  status: 'ACTIVE',
  category: { isActive: true },
};

const splitList = (s?: string) =>
  s
    ?.split(',')
    .map((x) => x.trim())
    .filter(Boolean) ?? [];

export async function listCategories(): Promise<CategoryDTO[]> {
  const rows = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: { _count: { select: { products: { where: { status: 'ACTIVE' } } } } },
  });
  return rows.map(categoryDTO);
}

export async function listProducts(q: ProductListQuery): Promise<Paginated<ProductListItemDTO>> {
  const sizes = splitList(q.sizes);
  const colors = splitList(q.colors);
  const and: Prisma.ProductWhereInput[] = [visibleProduct];

  if (q.categoryId) and.push({ categoryId: q.categoryId });
  if (q.search) {
    and.push({
      OR: [
        { title: { contains: q.search, mode: 'insensitive' } },
        { brand: { contains: q.search, mode: 'insensitive' } },
        { sku: { contains: q.search, mode: 'insensitive' } },
      ],
    });
  }
  if (q.minPrice !== undefined) and.push({ price: { gte: q.minPrice } });
  if (q.maxPrice !== undefined) and.push({ price: { lte: q.maxPrice } });
  if (sizes.length || colors.length) {
    // Нужен хотя бы один вариант в наличии, подходящий одновременно по размеру и цвету
    and.push({
      variants: {
        some: {
          stock: { gt: 0 },
          ...(sizes.length ? { size: { in: sizes } } : {}),
          ...(colors.length ? { color: { in: colors } } : {}),
        },
      },
    });
  }

  const where: Prisma.ProductWhereInput = { AND: and };
  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    q.sort === 'price_asc'
      ? [{ price: 'asc' }, { id: 'desc' }]
      : q.sort === 'price_desc'
        ? [{ price: 'desc' }, { id: 'desc' }]
        : [{ createdAt: 'desc' }, { id: 'desc' }];

  const [total, rows] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      include: { images: true, variants: true },
    }),
  ]);

  const items: ProductListItemDTO[] = rows.map((p) => {
    // Уникальные цвета товара для кружков на карточке
    const colorMap = new Map<string, string | null>();
    for (const v of p.variants) if (!colorMap.has(v.color)) colorMap.set(v.color, v.colorHex);
    // Минимальная цена среди вариантов (у вариантов может быть своя цена, например за объём памяти)
    const prices = p.variants.map((v) => variantPrice(v, p.price));
    const minPrice = prices.length ? Math.min(...prices) : p.price;
    return {
      id: p.id,
      title: p.title,
      price: minPrice,
      priceFrom: new Set(prices).size > 1,
      oldPrice: p.oldPrice,
      brand: p.brand,
      categoryId: p.categoryId,
      image: mainImage(p.images),
      inStock: p.variants.some((v) => v.stock > 0),
      colors: [...colorMap].map(([name, hex]) => ({ name, hex })),
    };
  });

  return { items, total, page: q.page, pages: Math.max(1, Math.ceil(total / q.limit)) };
}

/** Доступные значения фильтров (по товарам в наличии) */
export async function getFilters(categoryId?: number): Promise<CatalogFiltersDTO> {
  const productWhere: Prisma.ProductWhereInput = { ...visibleProduct, ...(categoryId ? { categoryId } : {}) };

  const [variants, prices] = await Promise.all([
    prisma.productVariant.findMany({
      where: { stock: { gt: 0 }, product: productWhere },
      select: { size: true, color: true, colorHex: true },
      distinct: ['size', 'color'],
    }),
    prisma.product.aggregate({ where: productWhere, _min: { price: true }, _max: { price: true } }),
  ]);

  const sizes = [...new Set(variants.map((v) => v.size))].sort(compareSizes);
  const colorMap = new Map<string, string | null>();
  for (const v of variants) if (!colorMap.has(v.color) || (!colorMap.get(v.color) && v.colorHex)) colorMap.set(v.color, v.colorHex);

  return {
    sizes,
    colors: [...colorMap]
      .map(([name, hex]) => ({ name, hex }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    minPrice: prices._min.price ?? 0,
    maxPrice: prices._max.price ?? 0,
  };
}

export async function getPublicProduct(id: number): Promise<ProductDTO> {
  const p = await prisma.product.findFirst({
    where: { id, ...visibleProduct },
    include: { images: true, variants: true, category: true },
  });
  if (!p) throw notFound('Товар не найден или снят с продажи');
  return productDTO(p);
}
