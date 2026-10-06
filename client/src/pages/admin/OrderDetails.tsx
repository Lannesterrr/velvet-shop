/**
 * Заказ в админке: клиент, состав, чек, подтверждение/отклонение оплаты,
 * смена статуса, трек-номер и заметка.
 */
import { ORDER_STATUS_LABELS, ORDER_STATUS_TRANSITIONS, PAYMENT_DETAILS_LABELS, type OrderStatus } from '@shop/shared';
import { Check, ExternalLink, FileText, Phone, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useOrderAction, useAdminOrder } from '../../api/admin';
import { errorMessage } from '../../api/client';
import { ErrorState, Field, FullScreenLoader, PageHeader, Row, Sheet, StatusBadge } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { formatDate, useMoney, variantLabel } from '../../lib/format';
import { confirmDialog, haptic, openExternalLink, openTelegramLink } from '../../telegram/webapp';

export function AdminOrderPage() {
  const id = Number(useParams().id);
  const money = useMoney();
  const toast = useToast();
  const { data: order, isPending, error, refetch } = useAdminOrder(id);
  const actions = useOrderAction(id);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [statusOpen, setStatusOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<OrderStatus | null>(null);
  const [statusComment, setStatusComment] = useState('');
  const [note, setNote] = useState('');
  const [tracking, setTracking] = useState('');

  useEffect(() => {
    if (!order) return;
    setNote(order.adminNote ?? '');
    setTracking(order.trackingNumber ?? '');
  }, [order]);

  if (isPending) return <FullScreenLoader />;
  if (error || !order) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const onError = (err: unknown) => toast.error(errorMessage(err));
  const done = (text: string) => () => {
    haptic.success();
    toast.success(text);
  };
  const transitions = ORDER_STATUS_TRANSITIONS[order.status];
  const canConfirm = transitions.includes('PAID');
  const user = order.user;
  const userName = [user.firstName, user.lastName].filter(Boolean).join(' ');

  const confirmPayment = async () => {
    if (!(await confirmDialog(`Подтвердить оплату заказа №${order.id} на ${money(order.total)}?`))) return;
    actions.confirm.mutate(undefined, { onSuccess: done('Оплата подтверждена, клиент уведомлён'), onError });
  };

  return (
    <div className="pb-10">
      <PageHeader title={`Заказ №${order.id}`} right={<StatusBadge status={order.status} />} />
      <p className="-mt-1 px-4 text-sm text-hint">{formatDate(order.createdAt)}</p>

      {/* Оплата на проверке — главное действие */}
      {order.status === 'PAYMENT_REVIEW' && (
        <div className="mx-4 mt-3 flex gap-2">
          <button type="button" className="btn btn-primary flex-1" disabled={actions.confirm.isPending} onClick={() => void confirmPayment()}>
            <Check size={18} /> Подтвердить оплату
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setRejectOpen(true)}>
            <X size={18} /> Отклонить
          </button>
        </div>
      )}

      {/* Чек */}
      <p className="section-title mt-5">Оплата</p>
      <div className="card mx-4 p-4">
        {order.paymentSnapshot ? (
          <div className="mb-3 text-sm">
            <Row label="Способ" value={order.paymentSnapshot.title} />
            <Row label={PAYMENT_DETAILS_LABELS[order.paymentSnapshot.type]} value={order.paymentSnapshot.details} />
            <Row label="Получатель" value={order.paymentSnapshot.recipient} />
          </div>
        ) : (
          <p className="mb-3 text-sm text-hint">Клиент ещё не выбрал способ оплаты</p>
        )}
        {order.receiptUrl ? (
          order.receiptIsPdf ? (
            <button
              type="button"
              className="btn btn-secondary w-full"
              onClick={() => openExternalLink(new URL(order.receiptUrl!, window.location.origin).toString())}
            >
              <FileText size={18} /> Открыть чек (PDF)
            </button>
          ) : (
            <a href={order.receiptUrl} target="_blank" rel="noreferrer" className="block">
              <img src={order.receiptUrl} alt="Чек об оплате" className="max-h-[480px] w-full rounded-xl bg-page object-contain" />
            </a>
          )
        ) : (
          <p className="text-sm text-hint">Чек не прикреплён</p>
        )}
        {order.receiptUploadedAt && <p className="mt-2 text-xs text-hint">Загружен {formatDate(order.receiptUploadedAt)}</p>}
        {order.paidAt && <p className="mt-1 text-sm text-success">Оплачен {formatDate(order.paidAt)}</p>}
        {order.rejectReason && <p className="mt-1 text-sm text-danger">Отклонено: {order.rejectReason}</p>}
        {canConfirm && order.status !== 'PAYMENT_REVIEW' && (
          <button type="button" className="btn btn-secondary mt-3 w-full" onClick={() => void confirmPayment()}>
            Отметить как оплаченный
          </button>
        )}
      </div>

      {/* Клиент */}
      <p className="section-title mt-5">Клиент</p>
      <div className="card mx-4 space-y-2 p-4 text-[15px]">
        <p className="font-medium">{order.customerName}</p>
        <div className="flex flex-wrap gap-2">
          <a href={`tel:${order.phone.replace(/[^\d+]/g, '')}`} className="btn btn-secondary py-2 text-sm">
            <Phone size={16} /> {order.phone}
          </a>
          {user.username && (
            <button type="button" className="btn btn-secondary py-2 text-sm" onClick={() => openTelegramLink(`https://t.me/${user.username}`)}>
              <ExternalLink size={16} /> @{user.username}
            </button>
          )}
        </div>
        <p className="text-sm text-hint">
          Telegram: {userName || '—'} · ID <span className="select-all">{user.telegramId}</span>
        </p>
        <div className="border-t border-line pt-2">
          <Row label="Доставка" value={order.deliveryName} />
          {order.address && <p className="mt-1">{order.address}</p>}
          {order.comment && <p className="mt-1 text-hint italic">«{order.comment}»</p>}
        </div>
      </div>

      {/* Состав */}
      <p className="section-title mt-5">Состав</p>
      <div className="card mx-4 divide-y divide-line">
        {order.items.map((i) => (
          <div key={i.id} className="flex items-center gap-3 p-3">
            {i.imageUrl ? (
              <img src={i.imageUrl} alt="" className="h-14 w-12 rounded-lg object-cover" />
            ) : (
              <div className="h-14 w-12 rounded-lg bg-page" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{i.title}</p>
              <p className="text-sm text-hint">
                {[i.sku, variantLabel(i.size, i.color), `${i.quantity} × ${money(i.price)}`].filter(Boolean).join(' · ')}
              </p>
            </div>
            <span className="font-semibold">{money(i.price * i.quantity)}</span>
          </div>
        ))}
        <div className="p-4">
          <Row label="Товары" value={money(order.itemsTotal)} />
          <Row label="Доставка" value={money(order.deliveryPrice)} />
          <Row label="Итого" value={money(order.total)} bold />
        </div>
      </div>

      {/* Статус, трек, заметка */}
      <p className="section-title mt-5">Управление</p>
      <div className="card mx-4 space-y-4 p-4">
        {transitions.length > 0 ? (
          <button type="button" className="btn btn-secondary w-full" onClick={() => setStatusOpen(true)}>
            Сменить статус
          </button>
        ) : (
          <p className="text-sm text-hint">Заказ завершён — статус больше не меняется.</p>
        )}
        <Field label="Трек-номер">
          <input className="field" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Например, 1234567890" />
        </Field>
        <Field label="Заметка (видна только админам)">
          <textarea className="field min-h-20 resize-none" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={actions.note.isPending || (note === (order.adminNote ?? '') && tracking === (order.trackingNumber ?? ''))}
          onClick={() => actions.note.mutate({ adminNote: note, trackingNumber: tracking }, { onSuccess: done('Сохранено'), onError })}
        >
          Сохранить
        </button>
      </div>

      {/* История */}
      <p className="section-title mt-5">История</p>
      <div className="card mx-4 divide-y divide-line">
        {order.history.map((h) => (
          <div key={h.id} className="p-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="font-medium">
                {h.fromStatus ? `${ORDER_STATUS_LABELS[h.fromStatus]} → ` : ''}
                {ORDER_STATUS_LABELS[h.toStatus]}
              </span>
              <span className="shrink-0 text-xs text-hint">{formatDate(h.createdAt)}</span>
            </div>
            {h.comment && <p className="text-hint">{h.comment}</p>}
            <p className="text-xs text-hint">{h.changedBy ? `Админ ID ${h.changedBy}` : 'Клиент / система'}</p>
          </div>
        ))}
      </div>

      {/* Шторка: отклонение оплаты */}
      <Sheet open={rejectOpen} onClose={() => setRejectOpen(false)} title="Отклонить оплату">
        <div className="space-y-3 pb-4">
          <p className="text-sm text-hint">Клиент получит сообщение с причиной и сможет прикрепить чек повторно.</p>
          <div className="flex flex-wrap gap-2">
            {['Платёж не поступил', 'Сумма не совпадает', 'Чек нечитаемый'].map((r) => (
              <button key={r} type="button" className="rounded-full bg-page px-3 py-1.5 text-sm" onClick={() => setRejectReason(r)}>
                {r}
              </button>
            ))}
          </div>
          <textarea
            className="field min-h-20 resize-none"
            placeholder="Причина"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-danger w-full"
            disabled={!rejectReason.trim() || actions.reject.isPending}
            onClick={() =>
              actions.reject.mutate(rejectReason.trim(), {
                onSuccess: () => {
                  setRejectOpen(false);
                  setRejectReason('');
                  done('Оплата отклонена, клиент уведомлён')();
                },
                onError,
              })
            }
          >
            Отклонить оплату
          </button>
        </div>
      </Sheet>

      {/* Шторка: смена статуса */}
      <Sheet open={statusOpen} onClose={() => setStatusOpen(false)} title="Новый статус">
        <div className="space-y-3 pb-4">
          <div className="flex flex-col gap-2">
            {transitions.map((s) => (
              <label key={s} className="flex items-center gap-3 rounded-xl bg-page p-3">
                <input
                  type="radio"
                  name="status"
                  className="h-5 w-5 accent-[var(--color-accent)]"
                  checked={newStatus === s}
                  onChange={() => setNewStatus(s)}
                />
                <StatusBadge status={s} />
                {s === 'CANCELLED' && <span className="text-xs text-hint">товар вернётся на склад</span>}
              </label>
            ))}
          </div>
          {newStatus === 'SHIPPED' && (
            <input className="field" placeholder="Трек-номер (необязательно)" value={tracking} onChange={(e) => setTracking(e.target.value)} />
          )}
          <input
            className="field"
            placeholder="Комментарий (необязательно)"
            value={statusComment}
            onChange={(e) => setStatusComment(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={!newStatus || actions.status.isPending}
            onClick={() =>
              newStatus &&
              actions.status.mutate(
                { status: newStatus, comment: statusComment || undefined, trackingNumber: tracking || undefined },
                {
                  onSuccess: () => {
                    setStatusOpen(false);
                    setNewStatus(null);
                    setStatusComment('');
                    done('Статус изменён, клиент уведомлён')();
                  },
                  onError,
                },
              )
            }
          >
            Применить
          </button>
        </div>
      </Sheet>
    </div>
  );
}
