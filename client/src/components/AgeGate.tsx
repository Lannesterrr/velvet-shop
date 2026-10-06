/**
 * Подтверждение возраста 18+ при первом входе.
 * Ответ запоминается на устройстве; при отказе приложение закрывается.
 */
import { ShieldCheck } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { BRAND } from '../brand';
import { haptic, isTelegram, tg } from '../telegram/webapp';

const STORAGE_KEY = 'age_confirmed_v1';

function readConfirmed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveConfirmed(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // хранилище недоступно — спросим снова при следующем запуске
  }
}

export function AgeGate({ children }: { children: ReactNode }) {
  const [confirmed, setConfirmed] = useState(readConfirmed);
  const [declined, setDeclined] = useState(false);

  if (confirmed) return <>{children}</>;

  const accept = () => {
    haptic.success();
    saveConfirmed();
    setConfirmed(true);
  };

  const decline = () => {
    haptic.warning();
    if (isTelegram && tg) tg.close();
    else setDeclined(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center text-white" style={{ background: BRAND.heroGradient }}>
      <div className="absolute -top-24 -right-20 h-72 w-72 rounded-full bg-white/5" aria-hidden />
      <div className="absolute -bottom-28 -left-16 h-80 w-80 rounded-full bg-white/5" aria-hidden />

      <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-white/30 text-4xl font-bold">
        18+
      </div>
      <h1 className="relative mt-6 text-2xl font-bold">Только для взрослых</h1>
      <p className="relative mt-3 max-w-xs text-[15px] leading-relaxed text-white/80">
        {declined
          ? 'Извините, магазин доступен только совершеннолетним.'
          : 'В магазине представлены товары для взрослых. Подтвердите, что вам исполнилось 18 лет.'}
      </p>

      {!declined && (
        <div className="relative mt-8 w-full max-w-xs space-y-3">
          <button type="button" className="btn w-full bg-white py-3.5 text-base text-[#6e1a36]" onClick={accept}>
            Мне есть 18 лет
          </button>
          <button type="button" className="btn w-full bg-white/10 py-3 text-white" onClick={decline}>
            Мне нет 18
          </button>
        </div>
      )}

      <p className="relative mt-8 flex items-center gap-1.5 text-xs text-white/60">
        <ShieldCheck size={14} /> Анонимно: мы не передаём ваши данные третьим лицам
      </p>
    </div>
  );
}
