/**
 * Нативная кнопка «Назад» Telegram: видна на всех экранах, кроме корневых.
 * Если истории нет (приложение открыто по прямой ссылке из уведомления бота) —
 * переходим к родительскому разделу, а не «в никуда».
 */
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { supports, tg } from './webapp';

const ROOTS = ['/', '/admin'];

/** Родительский путь: /admin/orders/5 → /admin/orders, /orders/5/pay → /orders/5 */
function parentPath(pathname: string): string {
  if (pathname.startsWith('/admin/')) {
    const parts = pathname.split('/').filter(Boolean);
    return parts.length > 2 ? `/${parts.slice(0, 2).join('/')}` : '/admin';
  }
  if (/^\/orders\/\d+\/pay$/.test(pathname)) return pathname.replace(/\/pay$/, '');
  if (/^\/orders\/\d+$/.test(pathname)) return '/orders';
  if (pathname === '/checkout') return '/cart';
  return '/';
}

export function useBackButton(): void {
  const location = useLocation();
  const navigate = useNavigate();
  const isRoot = ROOTS.includes(location.pathname);

  useEffect(() => {
    if (!supports('6.1')) return;
    const back = tg!.BackButton;
    if (isRoot) {
      back.hide();
      return;
    }
    const onBack = () => {
      // react-router хранит индекс в history.state.idx
      const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
      if (idx > 0) navigate(-1);
      else navigate(parentPath(location.pathname), { replace: true });
    };
    back.show();
    back.onClick(onBack);
    return () => back.offClick(onBack);
  }, [isRoot, location.pathname, navigate]);
}
