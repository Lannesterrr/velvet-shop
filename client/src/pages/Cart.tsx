/**
 * Корзина: количество, удаление, итог. Кнопка оформления — нативная MainButton.
 */
import type { ShareCartResultDTO } from '@shop/shared';
import { ChevronRight, Copy, Gift, ImageOff, Send, ShoppingBag, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { errorMessage } from '../api/client';
import { useCart, useRemoveCartItem, useShareCart, useUpdateCartItem } from '../api/queries';
import { EmptyState, ErrorState, FullScreenLoader, PageHeader, QuantityStepper, Row, Sheet } from '../components/ui';
import { useToast } from '../components/Toast';
import { itemsWord, useMoney, variantLabel } from '../lib/format';
import { MainButton } from '../telegram/MainButton';
import { copyText } from '../lib/clipboard';
import { BRAND } from '../brand';
import { haptic, openTelegramLink } from '../telegram/webapp';

export function CartPage() {
  const navigate = useNavigate();
  const money = useMoney();
  const toast = useToast();
  const { data: cart, isPending, error, refetch } = useCart();
  const update = useUpdateCartItem();
  const remove = useRemoveCartItem();
  const share = useShareCart();
  const [shared, setShared] = useState<ShareCartResultDTO | null>(null);

  if (isPending) return <FullScreenLoader />;
  if (error || !cart) return <ErrorState error={error} onRetry={() => void refetch()} />;

  if (!cart.items.length) {
    return (
      <>
        <PageHeader title="Корзина" />
        <EmptyState
          icon={<ShoppingBag size={48} />}
          title="Корзина пуста"
          text="Добавьте товары из каталога"
          action={
            <Link to="/" className="btn btn-primary">
              Перейти в каталог
            </Link>
          }
        />
      </>
    );
  }

  const hasUnavailable = cart.items.some((i) => !i.available);
  const onError = (err: unknown) => toast.error(errorMessage(err));

  const onShare = () => {
    haptic.impact('light');
    share.mutate(undefined, { onSuccess: (res) => setShared(res), onError });
  };

  /** Окно выбора чата Telegram с готовым текстом и ссылкой */
  const sendToTelegram = () => {
    if (!shared) return;
    openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(shared.url)}&text=${encodeURIComponent(shared.text)}`);
  };

  const copyLink = async () => {
    if (!shared) return;
    if (await copyText(shared.url)) {
      haptic.success();
      toast.success('Ссылка скопирована');
    } else toast.error('Не удалось скопировать');
  };

  return (
    <div className="pb-6">
      <PageHeader title="Корзина" />

      <div className="card mx-4 divide-y divide-line">
        {cart.items.map((item) => (
          <div key={item.id} className={`flex gap-3 p-3 ${item.available ? '' : 'opacity-60'}`}>
            <Link to={`/product/${item.product.id}`} className="h-24 w-20 shrink-0 overflow-hidden rounded-lg bg-page">
              {item.product.image ? (
                <img src={item.product.image.thumbUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-hint">
                  <ImageOff size={20} />
                </div>
              )}
            </Link>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-start gap-2">
                <p className="line-clamp-2 flex-1 text-[15px] leading-snug font-medium">{item.product.title}</p>
                <button
                  type="button"
                  className="p-1 text-hint"
                  aria-label="Удалить"
                  onClick={() => {
                    haptic.impact('light');
                    remove.mutate(item.id, { onError });
                  }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
              <p className="text-sm text-hint">
                {variantLabel(item.variant.size, item.variant.color)}
              </p>
              <div className="mt-auto flex items-end justify-between pt-2">
                {item.available ? (
                  <QuantityStepper
                    value={item.quantity}
                    max={item.maxQuantity}
                    disabled={update.isPending}
                    onChange={(quantity) => {
                      haptic.selection();
                      update.mutate({ id: item.id, quantity }, { onError });
                    }}
                  />
                ) : (
                  <span className="text-sm font-medium text-danger">
                    {item.maxQuantity > 0 ? `Доступно только ${item.maxQuantity} шт.` : 'Нет в наличии'}
                  </span>
                )}
                <span className="font-bold">{money(item.price * item.quantity)}</span>
              </div>
              {!item.available && item.maxQuantity > 0 && (
                <button
                  type="button"
                  className="mt-1 self-start text-sm text-link"
                  onClick={() => update.mutate({ id: item.id, quantity: item.maxQuantity }, { onError })}
                >
                  Изменить на {item.maxQuantity} шт.
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {hasUnavailable && (
        <p className="mx-4 mt-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">
          Некоторые товары закончились или их меньше, чем в корзине. Удалите их или измените количество, чтобы оформить заказ.
        </p>
      )}

      <div className="card mx-4 mt-4 p-4">
        <Row label={itemsWord(cart.count)} value={money(cart.total)} />
        <Row label="Доставка" value="рассчитается при оформлении" />
        <div className="my-2 border-t border-line" />
        <Row label="Итого" value={money(cart.total)} bold />
      </div>

      {/* Поделиться корзиной */}
      <button
        type="button"
        onClick={onShare}
        disabled={share.isPending || cart.count === 0}
        className="mx-4 mt-4 flex w-[calc(100%-2rem)] items-center gap-3 overflow-hidden rounded-2xl p-4 text-left text-white transition-transform active:scale-[0.99] disabled:opacity-60"
        style={{ background: BRAND.softGradient }}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
          <Gift size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{share.isPending ? 'Готовим ссылку…' : 'Поделиться корзиной'}</span>
          <span className="block text-sm text-white/80">Отправьте подборку другу — он добавит её к себе в одно касание</span>
        </span>
        <ChevronRight size={20} className="shrink-0 text-white/80" />
      </button>

      <Sheet open={shared !== null} onClose={() => setShared(null)} title="Поделиться корзиной">
        {shared && (
          <div className="space-y-3 pb-4">
            <div className="flex items-center gap-3 rounded-2xl bg-page p-3">
              <div className="flex -space-x-3">
                {cart.items
                  .filter((i) => i.available && i.product.image)
                  .slice(0, 3)
                  .map((i) => (
                    <img key={i.id} src={i.product.image!.thumbUrl} alt="" className="h-12 w-12 rounded-xl border-2 border-card object-cover" />
                  ))}
              </div>
              <div className="min-w-0">
                <p className="font-semibold">
                  {itemsWord(cart.count)} · {money(cart.total)}
                </p>
                <p className="text-xs text-hint">Получатель увидит актуальные цены и наличие</p>
              </div>
            </div>
            <button type="button" className="btn btn-primary w-full py-3.5" onClick={sendToTelegram}>
              <Send size={18} /> Отправить в Telegram
            </button>
            <button type="button" className="btn btn-secondary w-full" onClick={() => void copyLink()}>
              <Copy size={18} /> Скопировать ссылку
            </button>
            <p className="text-center text-xs text-hint">Ссылка действует 30 дней. Ваши фамилия и username не передаются.</p>
          </div>
        )}
      </Sheet>

      {!shared && (
      <MainButton
        text={hasUnavailable ? 'Исправьте корзину' : `Оформить заказ · ${money(cart.total)}`}
        disabled={hasUnavailable || cart.count === 0}
        onClick={() => navigate('/checkout')}
      />
      )}
    </div>
  );
}
