/**
 * Главная кнопка внизу экрана.
 * В Telegram управляет нативной MainButton, в браузере рисует её аналог.
 *
 * Использование: <MainButton text="Оформить заказ" onClick={...} disabled={...} loading={...} />
 * Кнопка видна, пока компонент смонтирован.
 */
import { useEffect, useRef } from 'react';
import { BRAND } from '../brand';
import { haptic, isTelegram, tg } from './webapp';

interface Props {
  text: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export function MainButton({ text, onClick, disabled = false, loading = false }: Props) {
  // Храним актуальный обработчик в ref, чтобы не переподписываться на каждый рендер
  const handlerRef = useRef(onClick);
  handlerRef.current = onClick;

  // Подписка на клик — один раз за время жизни компонента
  useEffect(() => {
    if (!isTelegram || !tg) return;
    const button = tg.MainButton;
    const handler = () => {
      haptic.impact('medium');
      handlerRef.current();
    };
    button.onClick(handler);
    return () => {
      button.offClick(handler);
      button.hideProgress();
      button.hide();
    };
  }, []);

  // Текст и состояние
  useEffect(() => {
    if (!isTelegram || !tg) return;
    tg.MainButton.setParams({
      text,
      is_visible: true,
      is_active: !disabled && !loading,
      color: BRAND.accent,
      text_color: BRAND.accentText,
    });
    if (loading) tg.MainButton.showProgress(false);
    else tg.MainButton.hideProgress();
  }, [text, disabled, loading]);

  if (isTelegram) return null;

  // Браузерный аналог: фиксированная кнопка внизу + отступ, чтобы она не перекрывала контент
  return (
    <>
      <div className="h-20" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-30 bg-page/90 px-4 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur">
        <button
          type="button"
          className="btn btn-primary w-full py-3.5 text-base"
          disabled={disabled || loading}
          onClick={() => handlerRef.current()}
        >
          {loading ? 'Подождите…' : text}
        </button>
      </div>
    </>
  );
}
