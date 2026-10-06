/**
 * Экран оплаты: актуальные реквизиты из админки, копирование полей,
 * прикрепление скриншота/чека.
 */
import { PAYABLE_STATUSES, PAYMENT_DETAILS_LABELS, type PaymentMethodDTO } from '@shop/shared';
import { AlertTriangle, CheckCircle2, FileText, Paperclip, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { errorMessage } from '../api/client';
import { useOrder, usePaymentMethods, useSelectPaymentMethod, useSettings, useUploadReceipt } from '../api/queries';
import { CopyField, EmptyState, ErrorState, FullScreenLoader, PageHeader } from '../components/ui';
import { useToast } from '../components/Toast';
import { formatCardNumber, plainAmount, useMoney } from '../lib/format';
import { MainButton } from '../telegram/MainButton';
import { haptic, openTelegramLink } from '../telegram/webapp';

const MAX_SIZE = 10 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export function PaymentPage() {
  const orderId = Number(useParams().id);
  const navigate = useNavigate();
  const money = useMoney();
  const toast = useToast();
  const { data: settings } = useSettings();
  const order = useOrder(orderId);
  const methods = usePaymentMethods();
  const selectMethod = useSelectPaymentMethod(orderId);
  const upload = useUploadReceipt(orderId);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Превью выбранного изображения
  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Если способ ещё не выбран, а он единственный — выбираем автоматически
  const data = order.data;
  const active = methods.data ?? [];
  useEffect(() => {
    if (data && !data.paymentMethodId && active.length === 1 && !selectMethod.isPending) {
      selectMethod.mutate(active[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.paymentMethodId, active.length]);

  if (order.isPending || methods.isPending) return <FullScreenLoader />;
  if (order.error || !data) return <ErrorState error={order.error} onRetry={() => void order.refetch()} />;
  if (!PAYABLE_STATUSES.includes(data.status)) return <Navigate to={`/orders/${orderId}`} replace />;

  // Показываем АКТУАЛЬНЫЕ реквизиты выбранного способа (админ мог их изменить)
  const selected: PaymentMethodDTO | undefined = active.find((m) => m.id === data.paymentMethodId);

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    if (!ACCEPTED.includes(f.type)) {
      toast.error('Нужен скриншот (JPG, PNG, WEBP) или PDF');
      return;
    }
    if (f.size > MAX_SIZE) {
      toast.error('Файл больше 10 МБ');
      return;
    }
    haptic.selection();
    setFile(f);
  };

  const sendReceipt = () => {
    if (!file) return;
    upload.mutate(file, {
      onSuccess: () => {
        haptic.success();
        toast.success('Чек отправлен! Мы проверим оплату и пришлём уведомление.');
        navigate(`/orders/${orderId}`, { replace: true });
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  const support = settings?.supportUsername;

  return (
    <div className="pb-6">
      <PageHeader title={`Оплата заказа №${data.id}`} />

      <div className="card mx-4 p-4 text-center">
        <p className="text-sm text-hint">Сумма к оплате</p>
        <p className="mt-1 text-3xl font-bold">{money(data.total)}</p>
      </div>

      {data.rejectReason && (
        <div className="mx-4 mt-3 flex gap-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">
          <AlertTriangle size={20} className="shrink-0" />
          <div>
            <p className="font-semibold">Оплата не подтверждена</p>
            <p>{data.rejectReason}</p>
          </div>
        </div>
      )}

      {data.status === 'PAYMENT_REVIEW' && !file && (
        <div className="mx-4 mt-3 flex gap-3 rounded-xl bg-success/10 p-3 text-sm text-success">
          <CheckCircle2 size={20} className="shrink-0" />
          <p>Чек получен, оплата на проверке. Если отправили не тот файл — прикрепите новый ниже.</p>
        </div>
      )}

      {active.length === 0 ? (
        <EmptyState
          title="Реквизиты временно недоступны"
          text="Свяжитесь с поддержкой — мы подскажем, как оплатить заказ."
          action={
            support && (
              <button type="button" className="btn btn-primary" onClick={() => openTelegramLink(`https://t.me/${support}`)}>
                Написать @{support}
              </button>
            )
          }
        />
      ) : (
        <>
          {/* 1. Способ оплаты */}
          <p className="section-title mt-5">1. Выберите способ оплаты</p>
          <div className="card mx-4 divide-y divide-line">
            {active.map((m) => (
              <label key={m.id} className="flex cursor-pointer items-center gap-3 p-4">
                <input
                  type="radio"
                  name="payment"
                  className="h-5 w-5 accent-[var(--color-accent)]"
                  checked={data.paymentMethodId === m.id}
                  disabled={selectMethod.isPending}
                  onChange={() => {
                    haptic.selection();
                    selectMethod.mutate(m.id, { onError: (err) => toast.error(errorMessage(err)) });
                  }}
                />
                <span className="flex-1 font-medium">{m.title}</span>
              </label>
            ))}
          </div>

          {/* 2. Реквизиты */}
          {selected && (
            <>
              <p className="section-title mt-5">2. Переведите {money(data.total)} по реквизитам</p>
              <div className="card mx-4 divide-y divide-line overflow-hidden">
                <CopyField
                  label={PAYMENT_DETAILS_LABELS[selected.type]}
                  value={selected.type === 'CARD' ? selected.details.replace(/\s/g, '') : selected.details}
                  display={selected.type === 'CARD' ? formatCardNumber(selected.details) : selected.details}
                />
                <CopyField label="Получатель" value={selected.recipient} />
                {selected.bank && <CopyField label="Банк" value={selected.bank} />}
                <CopyField label="Сумма" value={plainAmount(data.total)} display={money(data.total)} />
                <CopyField label="Комментарий к платежу" value={`Заказ №${data.id}`} />
              </div>
              {selected.instructions && (
                <p className="mx-4 mt-2 rounded-xl bg-card p-3 text-sm whitespace-pre-line text-hint">{selected.instructions}</p>
              )}

              {/* 3. Чек */}
              <p className="section-title mt-5">3. Прикрепите скриншот или чек</p>
              <div className="card mx-4 p-4">
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    pickFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                {file ? (
                  <div className="flex items-center gap-3">
                    {preview ? (
                      <img src={preview} alt="Чек" className="h-20 w-16 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-20 w-16 items-center justify-center rounded-lg bg-page text-hint">
                        <FileText size={28} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{file.name}</p>
                      <p className="text-sm text-hint">{(file.size / 1024 / 1024).toFixed(1)} МБ</p>
                    </div>
                    <button type="button" className="p-2 text-hint" onClick={() => setFile(null)} aria-label="Убрать файл">
                      <X size={20} />
                    </button>
                  </div>
                ) : (
                  <button type="button" className="btn btn-secondary w-full" onClick={() => inputRef.current?.click()}>
                    <Paperclip size={18} />
                    {data.status === 'PAYMENT_REVIEW' ? 'Заменить чек' : 'Выбрать файл'}
                  </button>
                )}
                <p className="mt-2 text-xs text-hint">JPG, PNG, WEBP или PDF до 10 МБ. Данные вашей карты мы не запрашиваем.</p>
              </div>
            </>
          )}
        </>
      )}

      {file ? (
        <MainButton text="Отправить чек" onClick={sendReceipt} loading={upload.isPending} />
      ) : (
        data.status === 'PAYMENT_REVIEW' && <MainButton text="К заказу" onClick={() => navigate(`/orders/${orderId}`, { replace: true })} />
      )}
    </div>
  );
}
