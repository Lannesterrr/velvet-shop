/**
 * Фирменная заглушка для товара без фото: градиент, монограмма и бренд.
 * Выглядит аккуратно, пока вы не загрузили настоящие фотографии.
 */
import { BRAND } from '../brand';

export function ProductPlaceholder({ brand, title, large = false }: { brand?: string | null; title: string; large?: boolean }) {
  const label = brand || title.split(/\s+/).slice(0, 2).join(' ');
  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden text-white"
      style={{ background: BRAND.heroGradient }}
      aria-label={title}
    >
      <span
        className={`pointer-events-none absolute font-serif font-bold text-white/10 select-none ${large ? 'text-[16rem]' : 'text-[7rem]'}`}
        style={{ fontFamily: 'Georgia, "DejaVu Serif", serif' }}
        aria-hidden
      >
        V
      </span>
      <span
        className={`relative px-3 text-center leading-tight tracking-widest uppercase ${large ? 'text-2xl' : 'text-xs'}`}
        style={{ fontFamily: 'Georgia, "DejaVu Serif", serif', color: '#f3d9a8' }}
      >
        {label}
      </span>
      <span className={`relative mt-1 text-white/50 ${large ? 'text-sm' : 'text-[10px]'}`}>фото скоро</span>
    </div>
  );
}
