/**
 * Оформление заказа: контакты, доставка, комментарий.
 * После создания заказа — переход на экран оплаты.
 */
import { DEFAULT_DELIVERY_TEXT, checkoutSchema } from '@shop/shared';
import { Truck } from 'lucide-react';
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { ApiError, errorMessage } from '../api/client';
import { reportWriteAccess, useCart, useCreateOrder, useMe, useSettings } from '../api/queries';
import { Field, FullScreenLoader, PageHeader, Row } from '../components/ui';
import { useToast } from '../components/Toast';
import { itemsWord, useMoney } from '../lib/format';
import { MainButton } from '../telegram/MainButton';
import { haptic, requestWriteAccess } from '../telegram/webapp';

export function CheckoutPage() {
  const navigate = useNavigate();
  const money = useMoney();
  const toast = useToast();
  const { data: me } = useMe();
  const { data: cart, isPending: cartLoading } = useCart();
  const { data: settings } = useSettings();
  const createOrder = useCreateOrder();

  const [form, setForm] = useState({ customerName: '', phone: '', address: '', comment: '' });
  const [deliveryId, setDeliveryId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Подставляем данные из профиля Telegram и прошлого заказа
  useEffect(() => {
    if (!me) return;
    setForm((f) => ({
      ...f,
      customerName: f.customerName || [me.firstName, me.lastName].filter(Boolean).join(' '),
      phone: f.phone || me.phone || '',
    }));
  }, [me]);

  const methods = useMemo(() => settings?.deliveryMethods ?? [], [settings]);
  useEffect(() => {
    if (deliveryId === null && methods.length) setDeliveryId(methods[0].id);
  }, [methods, deliveryId]);

  const delivery = methods.find((m) => m.id === deliveryId) ?? null;
  const itemsTotal = cart?.total ?? 0;
  const deliveryPrice = delivery
    ? delivery.freeFrom !== null && itemsTotal >= delivery.freeFrom
      ? 0
      : delivery.price
    : 0;
  const total = itemsTotal + deliveryPrice;

  if (cartLoading) return <FullScreenLoader />;
  if (!cart || cart.count === 0) return <Navigate to="/cart" replace />;

  const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors((er) => ({ ...er, [key]: '' }));
  };

  const submit = async () => {
    const input = { ...form, deliveryMethodId: deliveryId ?? 0 };
    const parsed = checkoutSchema.safeParse(input);
    const fieldErrors: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    }
    if (delivery?.requiresAddress && !form.address.trim()) fieldErrors.address = 'Укажите адрес или пункт выдачи';
    if (Object.keys(fieldErrors).length || !parsed.success) {
      setErrors(fieldErrors);
      haptic.error();
      return;
    }

    // Просим разрешение на уведомления от бота (один раз)
    if (me && !me.canWrite) {
      const granted = await requestWriteAccess();
      if (granted) await reportWriteAccess(true).catch(() => undefined);
    }

    createOrder.mutate(parsed.data, {
      onSuccess: (order) => {
        haptic.success();
        navigate(`/orders/${order.id}/pay`, { replace: true });
      },
      onError: (err) => {
        if (err instanceof ApiError && err.fields) setErrors(err.fields);
        toast.error(errorMessage(err));
      },
    });
  };

  return (
    <div className="pb-6">
      <PageHeader title="Оформление заказа" />

      <p className="section-title mt-2">Получатель</p>
      <div className="card mx-4 space-y-4 p-4">
        <Field label="Имя и фамилия" error={errors.customerName}>
          <input className="field" autoComplete="name" value={form.customerName} onChange={set('customerName')} />
        </Field>
        <Field label="Телефон" error={errors.phone}>
          <input
            className="field"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+7 900 000-00-00"
            value={form.phone}
            onChange={set('phone')}
          />
        </Field>
      </div>

      <p className="section-title mt-5">Доставка</p>
      <div className="mx-4 mb-3 flex gap-3 rounded-xl bg-accent/10 p-3 text-sm">
        <Truck size={20} className="shrink-0 text-accent" />
        <p className="whitespace-pre-line">{settings?.deliveryText || DEFAULT_DELIVERY_TEXT}</p>
      </div>
      <div className="card mx-4 divide-y divide-line">
        {methods.length === 0 && <p className="p-4 text-sm text-hint">Способы доставки не настроены.</p>}
        {methods.map((m) => {
          const free = m.freeFrom !== null && itemsTotal >= m.freeFrom;
          return (
            <label key={m.id} className="flex cursor-pointer items-start gap-3 p-4">
              <input
                type="radio"
                name="delivery"
                className="mt-1 h-5 w-5 accent-[var(--color-accent)]"
                checked={deliveryId === m.id}
                onChange={() => {
                  haptic.selection();
                  setDeliveryId(m.id);
                }}
              />
              <span className="flex-1">
                <span className="flex justify-between gap-2 font-medium">
                  {m.name}
                  <span>{free || m.price === 0 ? 'бесплатно' : money(m.price)}</span>
                </span>
                {m.description && <span className="block text-sm text-hint">{m.description}</span>}
                {m.freeFrom !== null && !free && m.price > 0 && (
                  <span className="block text-xs text-hint">Бесплатно от {money(m.freeFrom)}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      {errors.deliveryMethodId && <p className="mx-4 mt-1 text-sm text-danger">{errors.deliveryMethodId}</p>}

      {delivery?.requiresAddress && (
        <div className="card mx-4 mt-3 p-4">
          <Field label="Адрес или пункт выдачи" error={errors.address}>
            <textarea
              className="field min-h-20 resize-none"
              autoComplete="street-address"
              placeholder="Город, улица, дом, квартира"
              value={form.address}
              onChange={set('address')}
            />
          </Field>
        </div>
      )}

      <p className="section-title mt-5">Комментарий</p>
      <div className="card mx-4 p-4">
        <Field error={errors.comment}>
          <textarea
            className="field min-h-16 resize-none"
            placeholder="Пожелания к заказу (необязательно)"
            value={form.comment}
            onChange={set('comment')}
          />
        </Field>
      </div>

      <div className="card mx-4 mt-5 p-4">
        <Row label={itemsWord(cart.count)} value={money(itemsTotal)} />
        <Row label="Доставка" value={deliveryPrice ? money(deliveryPrice) : 'бесплатно'} />
        <div className="my-2 border-t border-line" />
        <Row label="К оплате" value={money(total)} bold />
      </div>

      <MainButton
        text={`Подтвердить заказ · ${money(total)}`}
        onClick={() => void submit()}
        loading={createOrder.isPending}
        disabled={!methods.length}
      />
    </div>
  );
}
