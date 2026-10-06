/**
 * Корзина, которой поделились: открывается по ссылке от друга.
 * Показывает товары с актуальными ценами и наличием,
 * кнопка внизу добавляет их в свою корзину.
 */
import { Gift, ImageOff } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { errorMessage } from '../api/client';
import { useImportSharedCart, useSharedCart } from '../api/queries';
import { ColorDot, EmptyState, FullScreenLoader, Row } from '../components/ui';
import { useToast } from '../components/Toast';
import { formatDate, itemsWord, useMoney, variantLabel } from '../lib/format';
import { MainButton } from '../telegram/MainButton';
import { BRAND } from '../brand';
import { haptic } from '../telegram/webapp';

export function SharedCartPage() {
  const token = useParams().token ?? '';
  const navigate = useNavigate();
  const money = useMoney();
  const toast = useToast();
  const { data, isPending, error } = useSharedCart(token);
  const importCart = useImportSharedCart(token);

  if (isPending) return <FullScreenLoader />;
  if (error || !data) {
    return (
      <EmptyState
        icon={<Gift size={48} />}
        title="Ссылка не открывается"
        text={errorMessage(error)}
        action={
          <Link to="/" className="btn btn-primary">
            В каталог
          </Link>
        }
      />
    );
  }

  const unavailable = data.items.filter((i) => !i.available).length;

  const onImport = () => {
    importCart.mutate(undefined, {
      onSuccess: (res) => {
        haptic.success();
        toast.success(res.skipped ? `Добавлено позиций: ${res.added}, недоступно: ${res.skipped}` : 'Товары добавлены в вашу корзину');
        navigate('/cart', { replace: true });
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  return (
    <div className="pb-6">
      {/* Шапка-открытка */}
      <div className="px-4 pt-4">
        <div
          className="relative overflow-hidden rounded-2xl p-5 text-white"
          style={{ background: BRAND.softGradient }}
        >
          <div className="absolute -top-8 -right-6 h-32 w-32 rounded-full bg-white/15" aria-hidden />
          <div className="absolute right-10 -bottom-10 h-24 w-24 rounded-full bg-white/10" aria-hidden />
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
            <Gift size={26} />
          </div>
          <p className="mt-3 text-sm text-white/80">{data.isOwn ? 'Ваша ссылка на корзину' : 'С вами поделились корзиной'}</p>
          <h1 className="text-2xl leading-tight font-bold">
            {data.isOwn ? 'Так её увидит получатель' : `Подборка от ${data.ownerName}`}
          </h1>
          <p className="mt-2 text-sm text-white/80">
            {itemsWord(data.count)} · {money(data.total)}
          </p>
        </div>
      </div>

      {/* Товары */}
      <div className="card mx-4 mt-4 divide-y divide-line">
        {data.items.map((item) => (
          <Link
            key={item.variantId}
            to={`/product/${item.product.id}`}
            className={`flex items-center gap-3 p-3 ${item.available ? '' : 'opacity-50'}`}
          >
            <div className="h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-page">
              {item.product.image ? (
                <img src={item.product.image.thumbUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-hint">
                  <ImageOff size={18} />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[15px] leading-snug font-medium">{item.product.title}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-hint">
                {item.variant.colorHex && <ColorDot hex={item.variant.colorHex} size={12} />}
                {variantLabel(item.variant.size, item.variant.color)}
              </p>
              <p className="text-sm">
                {item.available ? (
                  <span className="text-hint">{item.quantity} шт.</span>
                ) : (
                  <span className="text-danger">Нет в наличии</span>
                )}
              </p>
            </div>
            <span className="font-semibold">{money(item.price * item.quantity)}</span>
          </Link>
        ))}
      </div>

      {unavailable > 0 && (
        <p className="mx-4 mt-3 text-sm text-hint">Недоступные товары ({unavailable}) не будут добавлены в корзину.</p>
      )}

      <div className="card mx-4 mt-4 p-4">
        <Row label={itemsWord(data.count)} value={money(data.total)} />
        <div className="my-2 border-t border-line" />
        <Row label="Итого" value={money(data.total)} bold />
        <p className="mt-2 text-xs text-hint">
          Цены и наличие актуальны на сейчас. Ссылка действует до {formatDate(data.expiresAt, false)}.
        </p>
      </div>

      {data.count > 0 && (
        <MainButton text={`Добавить в мою корзину · ${money(data.total)}`} onClick={onImport} loading={importCart.isPending} />
      )}
    </div>
  );
}
