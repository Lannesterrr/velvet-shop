/**
 * Реквизиты для оплаты. Изменения сразу видны покупателям на экране оплаты.
 * Здесь хранятся только реквизиты МАГАЗИНА для показа клиентам —
 * данные карт покупателей приложение не собирает.
 */
import {
  PAYMENT_DETAILS_LABELS,
  PAYMENT_METHOD_TYPES,
  PAYMENT_METHOD_TYPE_LABELS,
  paymentMethodInputSchema,
  type PaymentMethodDTO,
  type PaymentMethodType,
} from '@shop/shared';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useAdminPaymentMethods, usePaymentMethodMutations } from '../../api/admin';
import { errorMessage } from '../../api/client';
import { ErrorState, Field, FullScreenLoader, Sheet, Toggle } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { formatCardNumber } from '../../lib/format';
import { confirmDialog, haptic } from '../../telegram/webapp';

interface Draft {
  id?: number;
  type: PaymentMethodType;
  title: string;
  recipient: string;
  details: string;
  bank: string;
  instructions: string;
  isActive: boolean;
}

const PLACEHOLDERS: Record<PaymentMethodType, { title: string; details: string }> = {
  CARD: { title: 'Карта Сбербанка', details: '2202 2000 0000 0000' },
  SBP: { title: 'СБП', details: '+7 900 000-00-00' },
  BANK_ACCOUNT: { title: 'Перевод на расчётный счёт', details: '40702810000000000000' },
  CRYPTO: { title: 'USDT (TRC-20)', details: 'T...' },
  OTHER: { title: 'Другой способ', details: '' },
};

export function PaymentMethodsPage() {
  const toast = useToast();
  const { data: methods, isPending, error, refetch } = useAdminPaymentMethods();
  const m = usePaymentMethodMutations();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (isPending) return <FullScreenLoader />;
  if (error || !methods) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const onError = (err: unknown) => toast.error(errorMessage(err));

  const open = (pm?: PaymentMethodDTO) => {
    setErrors({});
    setDraft(
      pm
        ? { id: pm.id, type: pm.type, title: pm.title, recipient: pm.recipient, details: pm.details, bank: pm.bank ?? '', instructions: pm.instructions ?? '', isActive: pm.isActive }
        : { type: 'CARD', title: '', recipient: '', details: '', bank: '', instructions: '', isActive: true },
    );
  };

  const save = () => {
    if (!draft) return;
    const parsed = paymentMethodInputSchema.safeParse(draft);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      haptic.error();
      return;
    }
    m.save.mutate(
      { id: draft.id, body: parsed.data },
      {
        onSuccess: () => {
          haptic.success();
          toast.success('Реквизиты сохранены — клиенты уже видят изменения');
          setDraft(null);
        },
        onError,
      },
    );
  };

  const move = (index: number, dir: -1 | 1) => {
    const ids = methods.map((x) => x.id);
    const t = index + dir;
    if (t < 0 || t >= ids.length) return;
    [ids[index], ids[t]] = [ids[t], ids[index]];
    m.reorder.mutate(ids, { onError });
  };

  const toggleActive = (pm: PaymentMethodDTO) => {
    const body = {
      type: pm.type,
      title: pm.title,
      recipient: pm.recipient,
      details: pm.details,
      bank: pm.bank,
      instructions: pm.instructions,
      isActive: !pm.isActive,
    };
    m.save.mutate(
      { id: pm.id, body },
      { onSuccess: () => toast.success(pm.isActive ? 'Способ скрыт' : 'Способ включён'), onError },
    );
  };

  const remove = async (pm: PaymentMethodDTO) => {
    if (!(await confirmDialog(`Удалить «${pm.title}»? В старых заказах реквизиты сохранятся.`))) return;
    m.remove.mutate(pm.id, { onSuccess: () => toast.success('Удалено'), onError });
  };

  return (
    <div className="px-4 pt-2 pb-8">
      <button type="button" className="btn btn-primary mb-3 w-full" onClick={() => open()}>
        <Plus size={18} /> Добавить способ оплаты
      </button>

      {methods.length === 0 && (
        <p className="card p-4 text-sm text-hint">
          Способов оплаты пока нет — покупатели увидят просьбу связаться с поддержкой. Добавьте хотя бы один.
        </p>
      )}

      <div className="space-y-3">
        {methods.map((pm, i) => (
          <div key={pm.id} className={`card p-4 ${pm.isActive ? '' : 'opacity-60'}`}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{pm.title}</p>
                <p className="text-xs text-hint">{PAYMENT_METHOD_TYPE_LABELS[pm.type]}</p>
              </div>
              <button type="button" className="p-1.5 text-hint disabled:opacity-20" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Выше">
                <ArrowUp size={18} />
              </button>
              <button
                type="button"
                className="p-1.5 text-hint disabled:opacity-20"
                disabled={i === methods.length - 1}
                onClick={() => move(i, 1)}
                aria-label="Ниже"
              >
                <ArrowDown size={18} />
              </button>
            </div>
            <div className="mt-2 space-y-0.5 text-sm">
              <p>
                <span className="text-hint">{PAYMENT_DETAILS_LABELS[pm.type]}: </span>
                <span className="break-all">{pm.type === 'CARD' ? formatCardNumber(pm.details) : pm.details}</span>
              </p>
              <p>
                <span className="text-hint">Получатель: </span>
                {pm.recipient}
              </p>
              {pm.bank && (
                <p>
                  <span className="text-hint">Банк: </span>
                  {pm.bank}
                </p>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn btn-secondary flex-1 py-2 text-sm" onClick={() => open(pm)}>
                <Pencil size={16} /> Изменить
              </button>
              <button type="button" className="btn btn-secondary flex-1 py-2 text-sm" onClick={() => toggleActive(pm)}>
                {pm.isActive ? 'Скрыть' : 'Включить'}
              </button>
              <button type="button" className="btn btn-danger py-2" onClick={() => void remove(pm)} aria-label="Удалить">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Sheet open={draft !== null} onClose={() => setDraft(null)} title={draft?.id ? 'Изменить реквизиты' : 'Новый способ оплаты'}>
        {draft && (
          <div className="space-y-4 pb-4">
            <Field label="Тип">
              <select className="field" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as PaymentMethodType })}>
                {PAYMENT_METHOD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {PAYMENT_METHOD_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Название для клиента" error={errors.title}>
              <input className="field" placeholder={PLACEHOLDERS[draft.type].title} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </Field>
            <Field label={PAYMENT_DETAILS_LABELS[draft.type]} error={errors.details}>
              <input className="field" placeholder={PLACEHOLDERS[draft.type].details} value={draft.details} onChange={(e) => setDraft({ ...draft, details: e.target.value })} />
            </Field>
            <Field label="Получатель" error={errors.recipient} hint="Как отображается в банке: Иван И.">
              <input className="field" value={draft.recipient} onChange={(e) => setDraft({ ...draft, recipient: e.target.value })} />
            </Field>
            <Field label="Банк" error={errors.bank}>
              <input className="field" placeholder="Необязательно" value={draft.bank} onChange={(e) => setDraft({ ...draft, bank: e.target.value })} />
            </Field>
            <Field label="Инструкция для клиента" error={errors.instructions}>
              <textarea
                className="field min-h-20 resize-none"
                placeholder="Например: в комментарии к переводу укажите номер заказа"
                value={draft.instructions}
                onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
              />
            </Field>
            <Toggle label="Показывать клиентам" checked={draft.isActive} onChange={(v) => setDraft({ ...draft, isActive: v })} />
            <button type="button" className="btn btn-primary w-full" disabled={m.save.isPending} onClick={save}>
              Сохранить
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
