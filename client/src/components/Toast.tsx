/**
 * Всплывающие уведомления: toast.success('Скопировано'), toast.error('...').
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { haptic } from '../telegram/webapp';

type Kind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: Kind;
  text: string;
}

interface ToastApi {
  success(text: string): void;
  error(text: string): void;
  info(text: string): void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((kind: Kind, text: string) => {
    const id = nextId.current++;
    if (kind === 'error') haptic.error();
    // Показываем максимум 3 уведомления одновременно
    setItems((prev) => [...prev.slice(-2), { id, kind, text }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), kind === 'error' ? 4000 : 2200);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (t) => push('success', t),
      error: (t) => push('error', t),
      info: (t) => push('info', t),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 pt-[max(12px,env(safe-area-inset-top))]">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto max-w-[90vw] rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg"
            style={{
              animation: 'toast-in 0.2s ease-out',
              background: t.kind === 'error' ? '#e5484d' : t.kind === 'success' ? '#2fa84f' : 'rgba(30,30,30,0.92)',
            }}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast вне ToastProvider');
  return ctx;
}
