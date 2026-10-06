/**
 * Деньги храним целыми числами в минимальных единицах (копейках / центах),
 * чтобы избежать ошибок округления с плавающей точкой.
 */

/** "1 990,50" | "1990.5" | 1990.5 → 199050. Возвращает null для некорректного ввода. */
export function toMinorUnits(value: string | number): number | null {
  const normalized =
    typeof value === 'number' ? value : Number(value.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(normalized) || normalized < 0) return null;
  return Math.round(normalized * 100);
}

/** 199050 → "1990.5" (для подстановки в поле ввода) */
export function fromMinorUnits(value: number): string {
  const major = value / 100;
  return Number.isInteger(major) ? String(major) : major.toFixed(2);
}

/** 199050 → "1 990,50 ₽" (без копеек, если сумма целая) */
export function formatMoney(value: number, currency = 'RUB', locale = 'ru-RU'): string {
  const major = value / 100;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: Number.isInteger(major) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    // Неизвестный код валюты — показываем число и код как есть
    return `${major.toLocaleString(locale)} ${currency}`;
  }
}
