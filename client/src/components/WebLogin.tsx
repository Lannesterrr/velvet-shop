/**
 * Экран входа для тех, кто открыл магазин в обычном браузере.
 * Вход — через Telegram (без паролей): после него магазин работает так же, как внутри Telegram.
 */
import { useQueryClient } from '@tanstack/react-query';
import { Send, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { BRAND } from '../brand';
import { setSessionToken, takeLoginResultFromUrl, telegramLoginUrl } from '../lib/webAuth';
import { Spinner } from './ui';

interface AuthConfig {
  botId: string;
  botUsername: string | null;
}

export function WebLogin() {
  const qc = useQueryClient();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Вернулись со страницы Telegram — обмениваем данные входа на сессию
    const loginData = takeLoginResultFromUrl();
    if (loginData) {
      setBusy(true);
      api<{ token: string }>('/auth/telegram', { method: 'POST', body: loginData })
        .then(({ token }) => {
          setSessionToken(token);
          return qc.invalidateQueries();
        })
        .catch((err) => setError(errorMessage(err)))
        .finally(() => setBusy(false));
    }
    api<AuthConfig>('/auth/config')
      .then(setConfig)
      .catch((err) => setError(errorMessage(err)));
  }, [qc]);

  const login = () => {
    if (!config) return;
    setBusy(true);
    window.location.href = telegramLoginUrl(config.botId);
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-card shadow-sm">
        <div className="relative flex h-44 items-center justify-center overflow-hidden text-white" style={{ background: BRAND.heroGradient }}>
          <span
            className="pointer-events-none absolute text-[11rem] font-bold text-white/10 select-none"
            style={{ fontFamily: 'Georgia, "DejaVu Serif", serif' }}
            aria-hidden
          >
            V
          </span>
          <div className="relative text-center">
            <p className="text-3xl tracking-[0.3em] uppercase" style={{ fontFamily: 'Georgia, "DejaVu Serif", serif', color: '#f3d9a8' }}>
              {document.title || 'Магазин'}
            </p>
            <p className="mt-1 text-xs tracking-widest text-white/60 uppercase">18+ · только для взрослых</p>
          </div>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <p className="text-lg font-semibold">Вход в магазин</p>
            <p className="mt-1 text-sm text-hint">
              Войдите через Telegram — без паролей и регистрации. Заказы, корзина и уведомления будут те же, что и в
              приложении.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-primary w-full py-3.5 text-base"
            disabled={!config || busy}
            onClick={login}
          >
            {busy ? <Spinner /> : <Send size={18} />} Войти через Telegram
          </button>

          {config?.botUsername && (
            <a href={`https://t.me/${config.botUsername}`} className="btn btn-secondary w-full" target="_blank" rel="noopener noreferrer">
              Открыть в приложении Telegram
            </a>
          )}

          {error && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}

          <p className="flex items-start gap-2 text-xs text-hint">
            <ShieldCheck size={16} className="shrink-0" />
            Мы получаем только ваше имя и Telegram ID. Номер телефона Telegram не передаёт.
          </p>
        </div>
      </div>
    </div>
  );
}
