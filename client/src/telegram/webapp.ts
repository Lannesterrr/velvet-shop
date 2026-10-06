/**
 * Тонкая типизированная обёртка над window.Telegram.WebApp
 * (скрипт https://telegram.org/js/telegram-web-app.js подключён в index.html).
 *
 * Все вызовы безопасны вне Telegram и в старых клиентах: методы проверяются
 * по версии API (isVersionAtLeast), а при открытии в браузере просто ничего не делают.
 */

type HapticImpact = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type HapticNotification = 'error' | 'success' | 'warning';

interface BottomButton {
  text: string;
  isVisible: boolean;
  isActive: boolean;
  isProgressVisible: boolean;
  setParams(params: {
    text?: string;
    color?: string;
    text_color?: string;
    is_active?: boolean;
    is_visible?: boolean;
    has_shine_effect?: boolean;
  }): BottomButton;
  show(): BottomButton;
  hide(): BottomButton;
  showProgress(leaveActive?: boolean): BottomButton;
  hideProgress(): BottomButton;
  onClick(cb: () => void): BottomButton;
  offClick(cb: () => void): BottomButton;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: { id: number; first_name?: string; last_name?: string; username?: string };
    start_param?: string;
  };
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string | undefined>;
  isExpanded: boolean;
  ready(): void;
  expand(): void;
  close(): void;
  isVersionAtLeast(version: string): boolean;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  setBottomBarColor?(color: string): void;
  onEvent(event: string, cb: (...args: unknown[]) => void): void;
  offEvent(event: string, cb: (...args: unknown[]) => void): void;
  MainButton: BottomButton;
  BackButton: {
    isVisible: boolean;
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  HapticFeedback: {
    impactOccurred(style: HapticImpact): void;
    notificationOccurred(type: HapticNotification): void;
    selectionChanged(): void;
  };
  showConfirm(message: string, cb: (ok: boolean) => void): void;
  showAlert(message: string, cb?: () => void): void;
  openLink(url: string): void;
  openTelegramLink(url: string): void;
  requestWriteAccess(cb: (granted: boolean) => void): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  disableVerticalSwipes?(): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export const tg: TelegramWebApp | undefined = window.Telegram?.WebApp;

/** Открыто ли приложение внутри Telegram (в браузере initData пустая) */
export const isTelegram = Boolean(tg?.initData);

/** Сырая строка initData — отправляется на сервер для проверки подписи */
export const initDataRaw = tg?.initData ?? '';

export function supports(version: string): boolean {
  return Boolean(isTelegram && tg?.isVersionAtLeast(version));
}

/** Инициализация при старте приложения */
export function initTelegram(): void {
  if (!tg || !isTelegram) return;
  tg.ready();
  tg.expand();
  if (supports('6.1')) {
    tg.setHeaderColor('secondary_bg_color');
    tg.setBackgroundColor('secondary_bg_color');
  }
  if (supports('7.10')) tg.setBottomBarColor?.('secondary_bg_color');
  // Чтобы прокрутка длинных списков не сворачивала приложение свайпом вниз
  if (supports('7.7')) tg.disableVerticalSwipes?.();
}

// ───────── Тактильная отдача ─────────

export const haptic = {
  impact(style: HapticImpact = 'light') {
    if (supports('6.1')) tg!.HapticFeedback.impactOccurred(style);
  },
  success() {
    if (supports('6.1')) tg!.HapticFeedback.notificationOccurred('success');
  },
  error() {
    if (supports('6.1')) tg!.HapticFeedback.notificationOccurred('error');
  },
  warning() {
    if (supports('6.1')) tg!.HapticFeedback.notificationOccurred('warning');
  },
  selection() {
    if (supports('6.1')) tg!.HapticFeedback.selectionChanged();
  },
};

// ───────── Диалоги ─────────

/** Нативное подтверждение Telegram (или window.confirm в браузере) */
export function confirmDialog(message: string): Promise<boolean> {
  if (supports('6.2')) {
    return new Promise((resolve) => tg!.showConfirm(message, (ok) => resolve(ok)));
  }
  return Promise.resolve(window.confirm(message));
}

/**
 * Просим разрешение на сообщения от бота — без него бот не сможет
 * присылать уведомления о статусе заказа. Возвращает null, если API недоступно.
 */
export function requestWriteAccess(): Promise<boolean | null> {
  if (!supports('6.9')) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      tg!.requestWriteAccess((granted) => resolve(granted));
    } catch {
      resolve(null);
    }
  });
}

/** Открыть ссылку t.me внутри Telegram (или в новой вкладке) */
export function openTelegramLink(url: string): void {
  if (isTelegram && supports('6.1')) tg!.openTelegramLink(url);
  else window.open(url, '_blank', 'noopener');
}

export function openExternalLink(url: string): void {
  if (isTelegram) tg!.openLink(url);
  else window.open(url, '_blank', 'noopener');
}
