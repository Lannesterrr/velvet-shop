/**
 * Настройки магазина: название и контакты, способы доставки, администраторы.
 */
import { DEFAULT_DELIVERY_TEXT, deliveryMethodInputSchema, fromMinorUnits, shopSettingsInputSchema, toMinorUnits, type DeliveryMethodDTO } from '@shop/shared';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  useAdminDelivery,
  useAdmins,
  useAdminSettings,
  useAdminsMutations,
  useDeliveryMutations,
  useSaveSettings,
} from '../../api/admin';
import { errorMessage } from '../../api/client';
import { useMe } from '../../api/queries';
import { Field, FullScreenLoader, Sheet, Toggle } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useMoney } from '../../lib/format';
import { confirmDialog, haptic } from '../../telegram/webapp';

const collectErrors = (issues: { path: (string | number)[]; message: string }[]) => {
  const errs: Record<string, string> = {};
  for (const i of issues) errs[String(i.path[0])] ??= i.message;
  return errs;
};

export function SettingsPage() {
  return (
    <div className="pb-8">
      <ShopSection />
      <DeliverySection />
      <AdminsSection />
    </div>
  );
}

// ───────── Магазин ─────────

function ShopSection() {
  const toast = useToast();
  const { data } = useAdminSettings();
  const save = useSaveSettings();
  const [form, setForm] = useState({ shopName: '', currency: 'RUB', supportUsername: '', supportPhone: '', supportText: '', aboutText: '', deliveryText: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data) {
      setForm({
        shopName: data.shopName,
        currency: data.currency,
        supportUsername: data.supportUsername ?? '',
        supportPhone: data.supportPhone ?? '',
        supportText: data.supportText ?? '',
        aboutText: data.aboutText ?? '',
        deliveryText: data.deliveryText ?? '',
      });
    }
  }, [data]);

  if (!data) return <FullScreenLoader />;

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = () => {
    const parsed = shopSettingsInputSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(collectErrors(parsed.error.issues));
      haptic.error();
      return;
    }
    setErrors({});
    save.mutate(parsed.data, {
      onSuccess: () => {
        haptic.success();
        toast.success('Настройки сохранены');
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  return (
    <>
      <p className="section-title mt-3">Магазин</p>
      <div className="card mx-4 space-y-4 p-4">
        <Field label="Название магазина" error={errors.shopName}>
          <input className="field" value={form.shopName} onChange={set('shopName')} />
        </Field>
        <Field label="Валюта" error={errors.currency} hint="Код ISO 4217: RUB, USD, EUR, KZT, BYN…">
          <input className="field uppercase" maxLength={3} value={form.currency} onChange={set('currency')} />
        </Field>
        <Field label="Telegram поддержки" error={errors.supportUsername} hint="Без @, например shop_support">
          <input className="field" value={form.supportUsername} onChange={set('supportUsername')} />
        </Field>
        <Field label="Телефон поддержки" error={errors.supportPhone}>
          <input className="field" type="tel" value={form.supportPhone} onChange={set('supportPhone')} />
        </Field>
        <Field label="Текст о поддержке" error={errors.supportText} hint="Показывается в /help у бота">
          <textarea className="field min-h-16 resize-none" value={form.supportText} onChange={set('supportText')} />
        </Field>
        <Field label="О магазине" error={errors.aboutText} hint="Показывается на баннере на главной">
          <textarea className="field min-h-16 resize-none" value={form.aboutText} onChange={set('aboutText')} />
        </Field>
        <Field label="Условия доставки" error={errors.deliveryText} hint="Показываются при оформлении заказа и в боте по команде /delivery">
          <textarea
            className="field min-h-24 resize-y"
            placeholder={DEFAULT_DELIVERY_TEXT}
            value={form.deliveryText}
            onChange={set('deliveryText')}
          />
        </Field>
        <button type="button" className="btn btn-primary w-full" disabled={save.isPending} onClick={submit}>
          Сохранить
        </button>
      </div>
    </>
  );
}

// ───────── Доставка ─────────

interface DeliveryDraft {
  id?: number;
  name: string;
  description: string;
  price: string;
  freeFrom: string;
  requiresAddress: boolean;
  isActive: boolean;
}

function DeliverySection() {
  const toast = useToast();
  const money = useMoney();
  const { data: methods } = useAdminDelivery();
  const m = useDeliveryMutations();
  const [draft, setDraft] = useState<DeliveryDraft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const open = (d?: DeliveryMethodDTO) => {
    setErrors({});
    setDraft(
      d
        ? {
            id: d.id,
            name: d.name,
            description: d.description ?? '',
            price: fromMinorUnits(d.price),
            freeFrom: d.freeFrom !== null ? fromMinorUnits(d.freeFrom) : '',
            requiresAddress: d.requiresAddress,
            isActive: d.isActive,
          }
        : { name: '', description: '', price: '0', freeFrom: '', requiresAddress: true, isActive: true },
    );
  };

  const save = () => {
    if (!draft) return;
    const price = toMinorUnits(draft.price || '0');
    const freeFrom = draft.freeFrom.trim() ? toMinorUnits(draft.freeFrom) : null;
    const parsed = deliveryMethodInputSchema.safeParse({ ...draft, price: price ?? -1, freeFrom: freeFrom ?? null });
    if (!parsed.success || price === null || (draft.freeFrom.trim() && freeFrom === null)) {
      const errs = parsed.success ? {} : collectErrors(parsed.error.issues);
      if (price === null) errs.price = 'Введите число';
      if (draft.freeFrom.trim() && freeFrom === null) errs.freeFrom = 'Введите число';
      setErrors(errs);
      return;
    }
    m.save.mutate(
      { id: draft.id, body: parsed.data },
      {
        onSuccess: () => {
          haptic.success();
          toast.success('Сохранено');
          setDraft(null);
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  const remove = async (d: DeliveryMethodDTO) => {
    if (!(await confirmDialog(`Удалить «${d.name}»?`))) return;
    m.remove.mutate(d.id, { onError: (err) => toast.error(errorMessage(err)) });
  };

  return (
    <>
      <p className="section-title mt-6">Способы доставки</p>
      <div className="card mx-4 divide-y divide-line">
        {methods?.map((d) => (
          <div key={d.id} className={`flex items-center gap-2 p-3 ${d.isActive ? '' : 'opacity-50'}`}>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{d.name}</p>
              <p className="text-xs text-hint">
                {d.price ? money(d.price) : 'бесплатно'}
                {d.freeFrom !== null && ` · бесплатно от ${money(d.freeFrom)}`}
                {!d.requiresAddress && ' · без адреса'}
                {!d.isActive && ' · выключен'}
              </p>
            </div>
            <button type="button" className="p-2 text-link" onClick={() => open(d)} aria-label="Изменить">
              <Pencil size={18} />
            </button>
            <button type="button" className="p-2 text-danger" onClick={() => void remove(d)} aria-label="Удалить">
              <Trash2 size={18} />
            </button>
          </div>
        ))}
        <button type="button" className="flex w-full items-center gap-2 p-3 font-medium text-link" onClick={() => open()}>
          <Plus size={18} /> Добавить способ доставки
        </button>
      </div>

      <Sheet open={draft !== null} onClose={() => setDraft(null)} title={draft?.id ? 'Доставка' : 'Новый способ доставки'}>
        {draft && (
          <div className="space-y-4 pb-4">
            <Field label="Название" error={errors.name}>
              <input className="field" placeholder="Курьер, СДЭК, Почта…" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Описание" error={errors.description}>
              <input className="field" placeholder="Срок, условия" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </Field>
            <div className="flex gap-3">
              <Field label="Стоимость" error={errors.price}>
                <input className="field" inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
              </Field>
              <Field label="Бесплатно от" error={errors.freeFrom}>
                <input className="field" inputMode="decimal" placeholder="—" value={draft.freeFrom} onChange={(e) => setDraft({ ...draft, freeFrom: e.target.value })} />
              </Field>
            </div>
            <Toggle label="Нужен адрес / пункт выдачи" checked={draft.requiresAddress} onChange={(v) => setDraft({ ...draft, requiresAddress: v })} />
            <Toggle label="Доступен покупателям" checked={draft.isActive} onChange={(v) => setDraft({ ...draft, isActive: v })} />
            <button type="button" className="btn btn-primary w-full" disabled={m.save.isPending} onClick={save}>
              Сохранить
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}

// ───────── Администраторы ─────────

function AdminsSection() {
  const toast = useToast();
  const { data: me } = useMe();
  const { data: admins } = useAdmins();
  const m = useAdminsMutations();
  const [telegramId, setTelegramId] = useState('');
  const [name, setName] = useState('');

  const add = () => {
    if (!/^\d{3,20}$/.test(telegramId.trim())) {
      toast.error('Telegram ID — только цифры. Его можно узнать командой /myid у бота');
      return;
    }
    m.add.mutate(
      { telegramId: telegramId.trim(), name: name.trim() },
      {
        onSuccess: () => {
          haptic.success();
          toast.success('Администратор добавлен');
          setTelegramId('');
          setName('');
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  const remove = async (id: number) => {
    if (!(await confirmDialog('Удалить администратора?'))) return;
    m.remove.mutate(id, { onError: (err) => toast.error(errorMessage(err)) });
  };

  return (
    <>
      <p className="section-title mt-6">Администраторы</p>
      <div className="card mx-4 divide-y divide-line">
        {admins?.map((a) => (
          <div key={`${a.telegramId}-${a.id}`} className="flex items-center gap-2 p-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{a.name || 'Без имени'}</p>
              <p className="text-xs text-hint">
                ID {a.telegramId}
                {a.telegramId === me?.telegramId && ' · это вы'}
              </p>
            </div>
            {!a.fromEnv && a.id !== null && me?.isSuperAdmin && (
              <button type="button" className="p-2 text-danger" onClick={() => void remove(a.id!)} aria-label="Удалить">
                <Trash2 size={18} />
              </button>
            )}
          </div>
        ))}
      </div>
      {me?.isSuperAdmin ? (
        <div className="card mx-4 mt-3 space-y-3 p-4">
          <p className="text-sm text-hint">
            Новый админ должен запустить бота (/start), чтобы получать уведомления. Свой ID он может узнать командой /myid.
          </p>
          <input className="field" inputMode="numeric" placeholder="Telegram ID" value={telegramId} onChange={(e) => setTelegramId(e.target.value)} />
          <input className="field" placeholder="Имя (для себя)" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="button" className="btn btn-primary w-full" disabled={m.add.isPending || !telegramId} onClick={add}>
            Добавить администратора
          </button>
        </div>
      ) : (
        <p className="mx-4 mt-2 text-xs text-hint">Добавлять и удалять администраторов может только владелец (ADMIN_IDS).</p>
      )}
    </>
  );
}
