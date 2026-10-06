/**
 * Небольшие переиспользуемые UI-компоненты.
 */
import { ORDER_STATUS_LABELS, type OrderStatus } from '@shop/shared';
import { ChevronLeft, Copy, Loader2, Minus, Plus } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { copyText } from '../lib/clipboard';
import { haptic, isTelegram } from '../telegram/webapp';
import { useToast } from './Toast';

// ───────── Заголовок страницы ─────────

/** В Telegram «назад» — нативная кнопка; в браузере показываем свою стрелку */
export function PageHeader({ title, right, back = true }: { title: ReactNode; right?: ReactNode; back?: boolean }) {
  const navigate = useNavigate();
  return (
    <header className="flex min-h-12 items-center gap-2 px-4 pt-3 pb-2">
      {back && !isTelegram && (
        <button type="button" onClick={() => navigate(-1)} className="-ml-2 p-1 text-link" aria-label="Назад">
          <ChevronLeft size={26} />
        </button>
      )}
      <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{title}</h1>
      {right}
    </header>
  );
}

// ───────── Состояния загрузки ─────────

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`animate-spin text-hint ${className}`} size={22} />;
}

export function FullScreenLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-8 py-16 text-center">
      {icon && <div className="mb-4 text-hint">{icon}</div>}
      <p className="text-lg font-semibold">{title}</p>
      {text && <p className="mt-1 text-sm text-hint">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Не удалось загрузить данные';
  return (
    <EmptyState
      title="Ошибка"
      text={message}
      action={
        onRetry && (
          <button type="button" className="btn btn-secondary" onClick={onRetry}>
            Повторить
          </button>
        )
      }
    />
  );
}

// ───────── Статус заказа ─────────

const STATUS_COLORS: Record<OrderStatus, string> = {
  NEW: '#3e88f7',
  AWAITING_PAYMENT: '#e8a20c',
  PAYMENT_REVIEW: '#8e5cf7',
  PAID: '#2fa84f',
  SHIPPED: '#0ea5b7',
  DELIVERED: '#5f6b7a',
  CANCELLED: '#e5484d',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const color = STATUS_COLORS[status];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}

// ───────── Формы ─────────

export function Field({ label, error, hint, children }: { label?: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-sm font-medium">{label}</span>}
      {children}
      {error ? (
        <span className="mt-1 block text-sm text-danger">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-hint">{hint}</span>
      )}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => {
        haptic.selection();
        onChange(!checked);
      }}
      className="flex w-full items-center justify-between gap-3 py-1 text-left"
    >
      <span className="text-[15px]">{label}</span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-hint/40'}`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
}

/** Кнопка-«чип» для фильтров и выбора размера */
export function Chip({
  active,
  disabled,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        haptic.selection();
        onClick?.();
      }}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-35 ${
        active ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-card text-ink'
      } ${disabled ? 'line-through' : ''}`}
    >
      {children}
    </button>
  );
}

export function ColorDot({ hex, size = 14 }: { hex: string | null; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full border border-black/10"
      style={{ width: size, height: size, background: hex ?? 'linear-gradient(135deg,#ddd,#999)' }}
    />
  );
}

export function QuantityStepper({
  value,
  min = 1,
  max,
  onChange,
  disabled,
}: {
  value: number;
  min?: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const btn = 'flex h-8 w-8 items-center justify-center rounded-full bg-page text-ink disabled:opacity-30';
  return (
    <div className="inline-flex items-center gap-2">
      <button type="button" className={btn} disabled={disabled || value <= min} onClick={() => onChange(value - 1)} aria-label="Меньше">
        <Minus size={16} />
      </button>
      <span className="w-6 text-center font-semibold tabular-nums">{value}</span>
      <button type="button" className={btn} disabled={disabled || value >= max} onClick={() => onChange(value + 1)} aria-label="Больше">
        <Plus size={16} />
      </button>
    </div>
  );
}

// ───────── Копирование реквизитов ─────────

export function CopyField({ label, value, display }: { label: string; value: string; display?: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-page"
      onClick={async () => {
        if (await copyText(value)) {
          haptic.success();
          toast.success(`${label}: скопировано`);
        } else {
          toast.error('Не удалось скопировать — выделите текст вручную');
        }
      }}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-hint">{label}</span>
        <span className="block font-medium break-all select-text">{display ?? value}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-link">
        <Copy size={16} /> Копировать
      </span>
    </button>
  );
}

// ───────── Нижняя «шторка» ─────────

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  // Блокируем прокрутку страницы под шторкой
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        className="relative max-h-[88vh] overflow-y-auto rounded-t-2xl bg-card pb-[max(16px,env(safe-area-inset-bottom))]"
        style={{ animation: 'sheet-in 0.22s ease-out' }}
        role="dialog"
        aria-label={title}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between bg-card px-4 pt-4 pb-2">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" className="text-link" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <div className="px-4">{children}</div>
      </div>
    </div>
  );
}

/** Строка «ключ — значение» */
export function Row({ label, value, bold }: { label: ReactNode; value: ReactNode; bold?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1 ${bold ? 'text-lg font-bold' : ''}`}>
      <span className={bold ? '' : 'text-hint'}>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
