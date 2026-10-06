/**
 * Главная: поиск, категории, фильтры и сетка товаров с подгрузкой при прокрутке.
 * Состояние фильтров хранится в URL — оно сохраняется при возврате «Назад».
 */
import { PRODUCT_SORT_LABELS, PRODUCT_SORTS, toMinorUnits, type ProductSort } from '@shop/shared';
import {
  Droplet,
  Flame,
  Gift,
  Heart,
  Package as PackageIcon,
  Shield,
  Shirt,
  Sparkles,
  Cable,
  CircleDot,
  Droplets,
  HandHeart,
  Lock,
  Gamepad2,
  Headphones,
  Laptop,
  LayoutGrid,
  Package,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Speaker,
  Tablet,
  Tag,
  Truck,
  Watch,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useCart, useCategories, useFilters, useMe, useProducts, useSettings, type CatalogParams } from '../api/queries';
import { ProductCard, ProductCardSkeleton } from '../components/ProductCard';
import { Chip, ColorDot, EmptyState, ErrorState, Field, Sheet, Spinner } from '../components/ui';
import { itemsWord, useMoney } from '../lib/format';
import { BRAND } from '../brand';
import { MainButton } from '../telegram/MainButton';

const csv = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

/** Иконка категории по её адресу (slug); для своих категорий — значок-ярлык */
const CATEGORY_ICONS: Record<string, typeof Tag> = {
  smartphones: Smartphone,
  tablets: Tablet,
  laptops: Laptop,
  headphones: Headphones,
  watches: Watch,
  consoles: Gamepad2,
  speakers: Speaker,
  accessories: Cable,
  couples: Heart,
  condoms: Shield,
  toys: Sparkles,
  gifts: Gift,
  lingerie: Shirt,
  'for-her': Sparkles,
  'for-him': Flame,
  anal: CircleDot,
  fetish: Lock,
  lubricants: Droplet,
  cosmetics: Droplets,
  massage: HandHeart,
};

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const money = useMoney();
  const { data: settings } = useSettings();
  const { data: me } = useMe();
  const { data: categories } = useCategories();
  const { data: cart } = useCart();
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Поле поиска обновляет URL с задержкой (debounce), чтобы не слать запрос на каждую букву
  const [searchInput, setSearchInput] = useState(params.get('q') ?? '');
  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (searchInput.trim()) next.set('q', searchInput.trim());
      else next.delete('q');
      if (next.toString() !== params.toString()) setParams(next, { replace: true });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const categoryId = Number(params.get('cat')) || undefined;
  const query: CatalogParams = useMemo(
    () => ({
      search: params.get('q') ?? undefined,
      categoryId,
      sizes: params.get('sizes') ?? undefined,
      colors: params.get('colors') ?? undefined,
      minPrice: params.get('min') ? Number(params.get('min')) : undefined,
      maxPrice: params.get('max') ? Number(params.get('max')) : undefined,
      sort: params.get('sort') ?? 'new',
    }),
    [params, categoryId],
  );

  const products = useProducts(query);
  const items = products.data?.pages.flatMap((p) => p.items) ?? [];
  const total = products.data?.pages[0]?.total ?? 0;
  const activeFilters =
    csv(params.get('sizes')).length + csv(params.get('colors')).length + (params.get('min') || params.get('max') ? 1 : 0) + (params.get('sort') && params.get('sort') !== 'new' ? 1 : 0);

  // Бесконечная прокрутка: следующая страница, когда «датчик» внизу попадает в экран
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = products;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '400px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const setCategory = (id?: number) => {
    const next = new URLSearchParams(params);
    if (id) next.set('cat', String(id));
    else next.delete('cat');
    // Размеры/цвета зависят от категории — сбрасываем
    next.delete('sizes');
    next.delete('colors');
    setParams(next, { replace: true });
  };

  return (
    <div className="pb-6">
      {/* Шапка */}
      <header className="sticky top-0 z-20 bg-page/95 px-4 pt-3 pb-2 backdrop-blur">
        <div className="mb-3 flex items-center gap-2">
          <h1 className="min-w-0 flex-1 truncate text-2xl font-bold">{settings?.shopName ?? 'Магазин'}</h1>
          <Link to="/orders" className="rounded-full bg-card p-2.5 text-ink" aria-label="Мои заказы">
            <Package size={20} />
          </Link>
          {me?.isAdmin && (
            <Link to="/admin" className="rounded-full bg-card p-2.5 text-ink" aria-label="Админ-панель">
              <Settings size={20} />
            </Link>
          )}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-hint" />
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Поиск товаров"
              className="field bg-card! pl-10"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-hint"
                aria-label="Очистить"
              >
                <X size={18} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="relative rounded-xl bg-card px-3 text-ink"
            aria-label="Фильтры"
          >
            <SlidersHorizontal size={20} />
            {activeFilters > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-accent-ink">
                {activeFilters}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Баннер — только на «чистой» главной, без поиска и фильтров */}
      {!params.toString() && (
        <div className="px-4 pt-1 pb-2">
          <div
            className="relative overflow-hidden rounded-2xl p-5 text-white"
            style={{ background: BRAND.heroGradient }}
          >
            <div className="absolute -top-10 -right-8 h-40 w-40 rounded-full bg-white/10" aria-hidden />
            <div className="absolute -right-2 -bottom-14 h-32 w-32 rounded-full bg-white/5" aria-hidden />
            <p className="text-xs font-semibold tracking-wider text-white/60 uppercase">18+ · только для взрослых</p>
            <p className="mt-1 max-w-[80%] text-xl leading-tight font-bold">{settings?.aboutText || 'Деликатный магазин для двоих'}</p>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-white/80">
              <span className="flex items-center gap-1">
                <PackageIcon size={14} /> Анонимная упаковка
              </span>
              <span className="flex items-center gap-1">
                <ShieldCheck size={14} /> Конфиденциально
              </span>
              <span className="flex items-center gap-1">
                <Truck size={14} /> Доставка по всей России
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Категории с иконками */}
      {categories && categories.length > 0 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-2">
          <Chip active={!categoryId} onClick={() => setCategory(undefined)}>
            <LayoutGrid size={15} /> Все
          </Chip>
          {categories
            .filter((c) => c.productCount > 0)
            .map((c) => {
              const Icon = CATEGORY_ICONS[c.slug] ?? Tag;
              return (
                <Chip key={c.id} active={categoryId === c.id} onClick={() => setCategory(c.id)}>
                  <Icon size={15} /> {c.name}
                </Chip>
              );
            })}
        </div>
      )}

      {/* Сетка товаров */}
      <div className="px-4 pt-2">
        {products.isError ? (
          <ErrorState error={products.error} onRetry={() => void products.refetch()} />
        ) : products.isPending ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }, (_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Search size={44} />}
            title="Ничего не найдено"
            text="Попробуйте изменить запрос или сбросить фильтры"
            action={
              <button type="button" className="btn btn-secondary" onClick={() => { setSearchInput(''); setParams({}, { replace: true }); }}>
                Сбросить всё
              </button>
            }
          />
        ) : (
          <>
            <p className="mb-2 text-sm text-hint">Найдено: {itemsWord(total)}</p>
            <div className={`grid grid-cols-2 gap-3 transition-opacity ${products.isPlaceholderData ? 'opacity-60' : ''}`}>
              {items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </>
        )}
        <div ref={sentinel} className="flex justify-center py-6">
          {products.isFetchingNextPage && <Spinner />}
        </div>
      </div>

      <FiltersSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} categoryId={categoryId} />

      {!filtersOpen && cart && cart.count > 0 && (
        <MainButton text={`Корзина · ${itemsWord(cart.count)} · ${money(cart.total)}`} onClick={() => navigate('/cart')} />
      )}
    </div>
  );
}

// ───────── Шторка фильтров ─────────

function FiltersSheet({ open, onClose, categoryId }: { open: boolean; onClose: () => void; categoryId?: number }) {
  const [params, setParams] = useSearchParams();
  const { data: filters } = useFilters(categoryId);
  const money = useMoney();

  // Черновик фильтров — применяется кнопкой «Показать»
  const [sizes, setSizes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [sort, setSort] = useState<ProductSort>('new');

  useEffect(() => {
    if (!open) return;
    setSizes(csv(params.get('sizes')));
    setColors(csv(params.get('colors')));
    setMin(params.get('min') ? String(Number(params.get('min')) / 100) : '');
    setMax(params.get('max') ? String(Number(params.get('max')) / 100) : '');
    setSort((params.get('sort') as ProductSort) || 'new');
  }, [open, params]);

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const apply = () => {
    const next = new URLSearchParams(params);
    const set = (key: string, value: string | null) => (value ? next.set(key, value) : next.delete(key));
    set('sizes', sizes.join(','));
    set('colors', colors.join(','));
    const minMinor = min ? toMinorUnits(min) : null;
    const maxMinor = max ? toMinorUnits(max) : null;
    set('min', minMinor !== null ? String(minMinor) : null);
    set('max', maxMinor !== null ? String(maxMinor) : null);
    set('sort', sort !== 'new' ? sort : null);
    setParams(next, { replace: true });
    onClose();
  };

  const reset = () => {
    setSizes([]);
    setColors([]);
    setMin('');
    setMax('');
    setSort('new');
  };

  return (
    <Sheet open={open} onClose={onClose} title="Фильтры">
      <div className="space-y-6 pb-4">
        <section>
          <h3 className="mb-2 font-semibold">Сортировка</h3>
          <div className="flex flex-wrap gap-2">
            {PRODUCT_SORTS.map((s) => (
              <Chip key={s} active={sort === s} onClick={() => setSort(s)}>
                {PRODUCT_SORT_LABELS[s]}
              </Chip>
            ))}
          </div>
        </section>

        {filters && filters.sizes.filter((x) => !/^стандарт$/i.test(x)).length > 0 && (
          <section>
            <h3 className="mb-2 font-semibold">Память / вариант</h3>
            <div className="flex flex-wrap gap-2">
              {filters.sizes.filter((x) => !/^стандарт$/i.test(x)).map((s) => (
                <Chip key={s} active={sizes.includes(s)} onClick={() => setSizes(toggle(sizes, s))}>
                  {s}
                </Chip>
              ))}
            </div>
          </section>
        )}

        {filters && filters.colors.filter((c) => !/^стандарт$/i.test(c.name)).length > 0 && (
          <section>
            <h3 className="mb-2 font-semibold">Цвет</h3>
            <div className="flex flex-wrap gap-2">
              {filters.colors.filter((c) => !/^стандарт$/i.test(c.name)).map((c) => (
                <Chip key={c.name} active={colors.includes(c.name)} onClick={() => setColors(toggle(colors, c.name))}>
                  <ColorDot hex={c.hex} />
                  {c.name}
                </Chip>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-2 font-semibold">Цена</h3>
          <div className="flex gap-3">
            <Field hint={filters ? `от ${money(filters.minPrice)}` : undefined}>
              <input className="field" inputMode="decimal" placeholder="От" value={min} onChange={(e) => setMin(e.target.value)} />
            </Field>
            <Field hint={filters ? `до ${money(filters.maxPrice)}` : undefined}>
              <input className="field" inputMode="decimal" placeholder="До" value={max} onChange={(e) => setMax(e.target.value)} />
            </Field>
          </div>
        </section>

        <div className="flex gap-3 pt-2">
          <button type="button" className="btn btn-secondary flex-1" onClick={reset}>
            Сбросить
          </button>
          <button type="button" className="btn btn-primary flex-[2]" onClick={apply}>
            Показать
          </button>
        </div>
      </div>
    </Sheet>
  );
}
