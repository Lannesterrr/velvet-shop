import { formatMoney } from '@shop/shared';
import { useCallback } from 'react';
import { useSettings } from '../api/queries';

/** Форматирование сумм в валюте магазина */
export function useMoney(): (value: number) => string {
  const { data } = useSettings();
  const currency = data?.currency ?? 'RUB';
  return useCallback((value: number) => formatMoney(value, currency), [currency]);
}

export function formatDate(iso: string, withTime = true): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

/** "4111111111111111" → "4111 1111 1111 1111" (только для номеров карт) */
export function formatCardNumber(value: string): string {
  const digits = value.replace(/\s/g, '');
  return /^\d{13,19}$/.test(digits) ? digits.replace(/(\d{4})(?=\d)/g, '$1 ') : value;
}

/** Сумма для копирования в банковское приложение: 199050 → "1990.50", 199000 → "1990" */
export function plainAmount(minor: number): string {
  const major = minor / 100;
  return Number.isInteger(major) ? String(major) : major.toFixed(2);
}

export function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/** «256 ГБ · Чёрный», без служебного значения «Стандарт» */
export function variantLabel(size: string, color: string): string {
  return [size, color].filter((x) => x && !/^стандарт$/i.test(x.trim())).join(' · ');
}

export const itemsWord = (n: number) => `${n} ${pluralize(n, 'товар', 'товара', 'товаров')}`;
