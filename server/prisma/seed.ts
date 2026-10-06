/**
 * Начальные данные магазина «Velvet» (товары для взрослых 18+):
 * настройки, категории, доставка в анонимной упаковке и каталог из prisma/data/catalog.json.
 *
 * Запуск: npm run db:seed
 * Полный сброс базы с повторным заполнением: npm run db:reset
 *
 * В catalog.json — названия, разделы, бренды, материалы и цены (без фото).
 * Фото добавляйте в админ-панели → Товары → товар → «Фото».
 * Остатки проставляются условно — уточните их в админке.
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Рубли → копейки */
const rub = (v: number) => Math.round(v * 100);

// ───────── Справочники ─────────

const DELIVERY_TEXT =
  'Доставляем по всей России в анонимной упаковке.\n' +
  'Непрозрачная коробка или пакет без логотипов, в накладной — нейтральное описание, например «Товары для дома».\n' +
  'Срок доставки — до 7 дней, в редких случаях до 14 дней. Трек-номер пришлём в бот.';

const deliveryMethods = [
  { name: 'Курьером до двери', description: 'Анонимная упаковка, по всей России до 7 дней (редко до 14)', price: rub(490), freeFrom: rub(7000), requiresAddress: true },
  { name: 'Пункт выдачи СДЭК / Boxberry', description: 'Анонимная упаковка, по всей России до 7 дней (редко до 14). Укажите адрес пункта', price: rub(350), freeFrom: rub(5000), requiresAddress: true },
  { name: 'Почта России', description: 'Анонимная упаковка, в любой населённый пункт до 14 дней', price: rub(390), freeFrom: rub(6000), requiresAddress: true },
];

// ───────── Каталог ─────────

interface CatalogFile {
  categories: { slug: string; name: string }[];
  products: {
    title: string;
    category: string;
    subcategory: string | null;
    brand: string | null;
    material: string | null;
    price: number;
    oldPrice: number | null;
  }[];
}

/** Нейтральное описание из характеристик товара */
function describe(p: CatalogFile['products'][number]): string {
  const intro = p.brand
    ? `Оригинальная продукция бренда ${p.brand}. Отправляем в анонимной упаковке без логотипов и названий.`
    : 'Отправляем в анонимной упаковке без логотипов и названий.';
  const specs = [
    p.subcategory && `Тип: ${p.subcategory}`,
    p.brand && `Бренд: ${p.brand}`,
    p.material && `Материал / основа: ${p.material}`,
  ].filter(Boolean);
  return specs.length ? `${intro}\n\n${specs.map((x) => `• ${x}`).join('\n')}` : intro;
}

// ───────── Заполнение ─────────

async function main(): Promise<void> {
  const catalog = JSON.parse(await fs.readFile(path.join(serverRoot, 'prisma', 'data', 'catalog.json'), 'utf8')) as CatalogFile;

  await prisma.shopSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      shopName: 'Velvet',
      currency: 'RUB',
      aboutText: 'Деликатный магазин для двоих',
      supportText: 'Поможем с выбором деликатно и анонимно — отвечаем ежедневно с 10:00 до 22:00',
      deliveryText: DELIVERY_TEXT,
    },
    update: {},
  });

  for (const [i, c] of catalog.categories.entries()) {
    await prisma.category.upsert({ where: { slug: c.slug }, create: { ...c, sortOrder: i }, update: {} });
  }

  if ((await prisma.deliveryMethod.count()) === 0) {
    await prisma.deliveryMethod.createMany({ data: deliveryMethods.map((d, i) => ({ ...d, sortOrder: i })) });
  }

  if ((await prisma.product.count()) > 0) {
    console.log('Товары уже есть — каталог не загружается. Для полного сброса: npm run db:reset');
    return;
  }

  const cats = new Map((await prisma.category.findMany()).map((c) => [c.slug, c.id]));
  const sku = (i: number) => `VL-${String(i + 1).padStart(4, '0')}`;

  // Пакетная вставка — 3 запроса вместо тысячи (быстро даже с удалённой базой)
  await prisma.product.createMany({
    data: catalog.products.map((p, i) => ({
      title: p.title,
      description: describe(p),
      categoryId: cats.get(p.category)!,
      price: rub(p.price),
      oldPrice: p.oldPrice ? rub(p.oldPrice) : null,
      sku: sku(i),
      brand: p.brand,
      material: p.material,
    })),
  });
  const created = await prisma.product.findMany({ select: { id: true, sku: true } });
  const idBySku = new Map(created.map((p) => [p.sku, p.id]));
  await prisma.productVariant.createMany({
    data: catalog.products.map((_, i) => ({
      productId: idBySku.get(sku(i))!,
      size: 'Стандарт',
      color: 'Стандарт',
      // Условный остаток — уточните в админке
      stock: 3 + ((i * 7) % 13),
    })),
  });

  console.log(`Готово: ${catalog.products.length} товаров в ${catalog.categories.length} категориях.`);
  console.log('Фото добавьте в админ-панели, реквизиты для оплаты — в разделе «Реквизиты».');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
