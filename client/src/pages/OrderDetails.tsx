/**
 * Детали заказа покупателя: статус и история, состав, доставка, оплата.
 */
import { ORDER_STATUS_LABELS, PAYABLE_STATUSES, USER_CANCELLABLE_STATUSES } from '@shop/shared';
import { AlertTriangle, ImageOff, MessageCircle } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { errorMessage } from '../api/client';
import { useCancelOrder, useOrder, useSettings } from '../api/queries';
import { ErrorState, FullScreenLoader, PageHeader, Row, StatusBadge } from '../components/ui';
import { useToast } from '../components/Toast';
import { formatDate, useMoney, variantLabel } from '../lib/format';
import { MainButton } from '../telegram/MainButton';
import { confirmDialog, haptic, openTelegramLink } from '../telegram/webapp';

export function OrderDetailsPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const money = useMoney();
  const toast = useToast();
  const { data: settings } = useSettings();
  const { data: order, isPending, error, refetch } = useOrder(id);
  const cancel = useCancelOrder(id);

  if (isPending) return <FullScreenLoader />;
  if (error || !order) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const payable = PAYABLE_STATUSES.includes(order.status);
  const cancellable = USER_CANCELLABLE_STATUSES.includes(order.status);

  const onCancel = async () => {
    if (!(await confirmDialog(`Отменить заказ №${order.id}?`))) return;
    cancel.mutate(undefined, {
      onSuccess: () => {
        haptic.success();
        toast.success('Заказ отменён');
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  return (
    <div className="pb-6">
      <PageHeader title={`Заказ №${order.id}`} right={<StatusBadge status={order.status} />} />
      <p className="-mt-1 px-4 text-sm text-hint">от {formatDate(order.createdAt)}</p>

      {order.rejectReason && order.status === 'AWAITING_PAYMENT' && (
        <div className="mx-4 mt-3 flex gap-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">
          <AlertTriangle size={20} className="shrink-0" />
          <p>
            <b>Оплата не подтверждена:</b> {order.rejectReason}
          </p>
        </div>
      )}
      {order.trackingNumber && (
        <div className="card mx-4 mt-3 p-4 text-sm">
          Трек-номер: <b className="select-all">{order.trackingNumber}</b>
        </div>
      )}

      {/* Состав */}
      <p className="section-title mt-5">Состав</p>
      <div className="card mx-4 divide-y divide-line">
        {order.items.map((item) => {
          const content = (
            <>
              <div className="h-16 w-14 shrink-0 overflow-hidden rounded-lg bg-page">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-hint">
                    <ImageOff size={18} />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[15px] font-medium">{item.title}</p>
                <p className="text-sm text-hint">
                  {[variantLabel(item.size, item.color), `${item.quantity} шт.`].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span className="font-semibold">{money(item.price * item.quantity)}</span>
            </>
          );
          return item.productId ? (
            <Link key={item.id} to={`/product/${item.productId}`} className="flex items-center gap-3 p-3">
              {content}
            </Link>
          ) : (
            <div key={item.id} className="flex items-center gap-3 p-3">
              {content}
            </div>
          );
        })}
        <div className="p-4">
          <Row label="Товары" value={money(order.itemsTotal)} />
          <Row label={order.deliveryName} value={order.deliveryPrice ? money(order.deliveryPrice) : 'бесплатно'} />
          <Row label="Итого" value={money(order.total)} bold />
        </div>
      </div>

      {/* Доставка */}
      <p className="section-title mt-5">Получатель</p>
      <div className="card mx-4 space-y-1 p-4 text-[15px]">
        <p>{order.customerName}</p>
        <p className="text-hint">{order.phone}</p>
        {order.address && <p>{order.address}</p>}
        {order.comment && <p className="text-hint italic">«{order.comment}»</p>}
      </div>

      {/* История */}
      <p className="section-title mt-5">История</p>
      <div className="card mx-4 p-4">
        <ol className="relative space-y-4 border-l-2 border-line pl-5">
          {order.history.map((h) => (
            <li key={h.id} className="relative">
              <span className="absolute top-1.5 -left-[27px] h-3 w-3 rounded-full border-2 border-card bg-accent" />
              <p className="font-medium">{ORDER_STATUS_LABELS[h.toStatus]}</p>
              {h.comment && <p className="text-sm text-hint">{h.comment}</p>}
              <p className="text-xs text-hint">{formatDate(h.createdAt)}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* Действия */}
      <div className="mx-4 mt-5 space-y-2">
        {settings?.supportUsername && (
          <button
            type="button"
            className="btn btn-secondary w-full"
            onClick={() => openTelegramLink(`https://t.me/${settings.supportUsername}`)}
          >
            <MessageCircle size={18} /> Написать в поддержку
          </button>
        )}
        {cancellable && (
          <button type="button" className="btn btn-danger w-full" disabled={cancel.isPending} onClick={() => void onCancel()}>
            Отменить заказ
          </button>
        )}
      </div>

      {payable && (
        <MainButton
          text={order.status === 'PAYMENT_REVIEW' ? 'Реквизиты и чек' : `Оплатить ${money(order.total)}`}
          onClick={() => navigate(`/orders/${order.id}/pay`)}
        />
      )}
    </div>
  );
}
