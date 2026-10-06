/**
 * Карточка товара: галерея, выбор цвета (кружки) и варианта (память / размер),
 * цена выбранного варианта, наличие, «В корзину».
 */
import { DELIVERY_SHORT, type ProductVariantDTO } from '@shop/shared';
import { Check, Truck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { errorMessage } from '../api/client';
import { useAddToCart, useCart, useProduct } from '../api/queries';
import { Gallery } from '../components/Gallery';
import { ErrorState, FullScreenLoader, PageHeader } from '../components/ui';
import { useToast } from '../components/Toast';
import { useMoney } from '../lib/format';
import { MainButton } from '../telegram/MainButton';
import { haptic } from '../telegram/webapp';

/** Подпись для блока вариантов по их виду: «Память», «Размер корпуса» или «Вариант» */
function optionLabel(variants: ProductVariantDTO[]): string {
  const all = (re: RegExp) => variants.length > 0 && variants.every((v) => re.test(v.size));
  if (all(/(мл|ml|\d\s?г)$/i)) return 'Объём';
  if (all(/шт/i)) return 'Количество';
  if (all(/^(XXS|XS|S|M|L|XL|XXL|S-M|M-L|L-XL)$/i)) return 'Размер';
  if (all(/₽/)) return 'Номинал';
  if (variants.length && variants.every((v) => /(гб|тб|gb|tb)/i.test(v.size))) return 'Память';
  if (variants.length && variants.every((v) => /мм|mm/i.test(v.size))) return 'Размер корпуса';
  return 'Вариант';
}

/** Светлый ли цвет (для галочки на кружке) */
function isLight(hex: string | null): boolean {
  if (!hex) return true;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return r * 0.299 + g * 0.587 + b * 0.114 > 160;
}

export function ProductPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const money = useMoney();
  const toast = useToast();
  const { data: product, isPending, error, refetch } = useProduct(id);
  const { data: cart } = useCart();
  const addToCart = useAddToCart();

  const [color, setColor] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);

  // Цвета в порядке появления
  const colors = useMemo(() => {
    const map = new Map<string, { hex: string | null; inStock: boolean }>();
    for (const v of product?.variants ?? []) {
      const prev = map.get(v.color);
      map.set(v.color, { hex: prev?.hex ?? v.colorHex, inStock: (prev?.inStock ?? false) || v.stock > 0 });
    }
    return [...map].map(([name, info]) => ({ name, ...info }));
  }, [product]);

  // По умолчанию — первый цвет в наличии
  useEffect(() => {
    if (!product || color) return;
    setColor((colors.find((c) => c.inStock) ?? colors[0])?.name ?? null);
  }, [product, colors, color]);

  const optionsForColor: ProductVariantDTO[] = useMemo(
    () => product?.variants.filter((v) => v.color === color) ?? [],
    [product, color],
  );

  // При смене цвета выбираем первый доступный вариант (или сохраняем прежний, если он есть в наличии)
  useEffect(() => {
    if (!optionsForColor.length) return;
    const same = optionsForColor.find((v) => v.size === size && v.stock > 0);
    if (same) return;
    setSize((optionsForColor.find((v) => v.stock > 0) ?? optionsForColor[0]).size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsForColor]);

  // Галерея: фото с выбранным цветом показываем первыми (если порядок фото совпадает с порядком цветов)
  const colorIndex = colors.findIndex((c) => c.name === color);

  const variant = optionsForColor.find((v) => v.size === size) ?? null;
  const inCart = variant ? cart?.items.find((i) => i.variant.id === variant.id) : undefined;
  const anyInStock = product?.variants.some((v) => v.stock > 0) ?? false;

  if (isPending) return <FullScreenLoader />;
  if (error || !product) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const price = variant?.price ?? Math.min(...product.variants.map((v) => v.price), product.price);
  const discount = product.oldPrice && product.oldPrice > price ? Math.round((1 - price / product.oldPrice) * 100) : 0;
  const images =
    colorIndex > 0 && product.images.length === colors.length
      ? [product.images[colorIndex], ...product.images.filter((_, i) => i !== colorIndex)]
      : product.images;
  const showOptions = optionsForColor.length > 1 || (optionsForColor[0] && !/^(стандарт|standard|one size)$/i.test(optionsForColor[0].size));

  const handleMainButton = () => {
    if (inCart) {
      navigate('/cart');
      return;
    }
    if (!variant || variant.stock <= 0) {
      haptic.warning();
      toast.info(variant ? 'Этот вариант закончился — выберите другой' : 'Выберите вариант');
      return;
    }
    addToCart.mutate(
      { variantId: variant.id },
      {
        onSuccess: () => {
          haptic.success();
          toast.success('Добавлено в корзину');
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  const mainText = !anyInStock
    ? 'Нет в наличии'
    : inCart
      ? `В корзине (${inCart.quantity}) · Перейти`
      : variant && variant.stock <= 0
        ? 'Нет в наличии'
        : `В корзину · ${money(price)}`;

  return (
    <div className="pb-6">
      <div className="absolute z-10">
        <PageHeader title="" />
      </div>
      <Gallery key={color ?? ''} images={images} alt={product.title} brand={product.brand} />

      <div className="card relative -mt-4 rounded-b-none px-4 pt-5 pb-4">
        {product.brand && <p className="text-xs font-semibold tracking-wide text-hint uppercase">{product.brand}</p>}
        <h1 className="mt-0.5 text-xl leading-snug font-bold">{product.title}</h1>

        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold">{money(price)}</span>
          {discount > 0 && product.oldPrice && (
            <>
              <span className="text-hint line-through">{money(product.oldPrice)}</span>
              <span className="rounded-md bg-danger px-1.5 py-0.5 text-xs font-bold text-white">−{discount}%</span>
            </>
          )}
        </div>

        {/* Цвет — кружки */}
        {colors.length > 0 && !(colors.length === 1 && /^стандарт$/i.test(colors[0].name)) && (
          <section className="mt-5">
            <h2 className="mb-2.5 text-sm">
              <span className="text-hint">Цвет: </span>
              <span className="font-medium">{color}</span>
            </h2>
            <div className="flex flex-wrap gap-3">
              {colors.map((c) => {
                const active = color === c.name;
                return (
                  <button
                    key={c.name}
                    type="button"
                    aria-label={c.name}
                    title={c.name}
                    onClick={() => {
                      haptic.selection();
                      setColor(c.name);
                    }}
                    className={`relative flex h-11 w-11 items-center justify-center rounded-full p-0.5 transition-all ${
                      active ? 'ring-2 ring-accent ring-offset-2 ring-offset-card' : ''
                    } ${c.inStock ? '' : 'opacity-40'}`}
                  >
                    <span
                      className="flex h-full w-full items-center justify-center rounded-full border border-black/10"
                      style={{ background: c.hex ?? 'linear-gradient(135deg,#ddd,#999)' }}
                    >
                      {active && <Check size={18} className={isLight(c.hex) ? 'text-black/70' : 'text-white'} strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Вариант: память / размер — с ценой */}
        {showOptions && (
          <section className="mt-5">
            <h2 className="mb-2.5 text-sm text-hint">{optionLabel(optionsForColor)}</h2>
            <div className="grid grid-cols-3 gap-2">
              {optionsForColor.map((v) => {
                const active = size === v.size;
                const out = v.stock <= 0;
                return (
                  <button
                    key={v.id}
                    type="button"
                    disabled={out}
                    onClick={() => {
                      haptic.selection();
                      setSize(v.size);
                    }}
                    className={`rounded-xl border-[1.5px] px-2 py-2.5 text-center transition-colors ${
                      active ? 'border-accent bg-accent/10' : 'border-line'
                    } ${out ? 'opacity-40' : ''}`}
                  >
                    <span className="block text-[15px] font-semibold">{v.size}</span>
                    <span className="block text-xs text-hint">{out ? 'нет в наличии' : money(v.price)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <p className="mt-3 text-sm">
          {variant ? (
            variant.stock > 5 ? (
              <span className="text-success">● В наличии</span>
            ) : variant.stock > 0 ? (
              <span className="text-warning">● Осталось {variant.stock} шт.</span>
            ) : (
              <span className="text-danger">● Нет в наличии</span>
            )
          ) : null}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-hint">
          <Truck size={16} /> {DELIVERY_SHORT}
        </p>

        {/* Описание и характеристики */}
        {product.description && (
          <section className="mt-5">
            <h2 className="mb-1 font-semibold">Описание</h2>
            <p className="text-[15px] leading-relaxed whitespace-pre-line">{product.description}</p>
          </section>
        )}
        <section className="mt-5 divide-y divide-line rounded-xl bg-page text-sm">
          {product.brand && <Spec label="Бренд" value={product.brand} />}
          {product.material && <Spec label="Материалы" value={product.material} />}
          <Spec label="Категория" value={product.categoryName} />
          <Spec label="Артикул" value={product.sku} />
        </section>
      </div>

      <MainButton
        text={mainText}
        onClick={handleMainButton}
        disabled={!anyInStock || (!inCart && !!variant && variant.stock <= 0)}
        loading={addToCart.isPending}
      />
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-3.5 py-2.5">
      <span className="text-hint">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
