/**
 * Галерея фото со свайпом на CSS scroll-snap (плавно и без библиотек)
 * и индикатором текущего слайда.
 */
import type { ProductImageDTO } from '@shop/shared';
import { useRef, useState } from 'react';
import { ProductPlaceholder } from './ProductPlaceholder';

export function Gallery({ images, alt, brand }: { images: ProductImageDTO[]; alt: string; brand?: string | null }) {
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  if (!images.length) {
    return (
      <div className="aspect-[4/5]">
        <ProductPlaceholder brand={brand} title={alt} large />
      </div>
    );
  }

  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) setIndex(i);
  };

  const goTo = (i: number) => {
    trackRef.current?.scrollTo({ left: i * trackRef.current.clientWidth, behavior: 'smooth' });
  };

  return (
    <div className="relative bg-card">
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="no-scrollbar flex aspect-[4/5] snap-x snap-mandatory overflow-x-auto"
      >
        {images.map((img, i) => (
          <img
            key={img.id}
            src={img.url}
            alt={`${alt} — фото ${i + 1}`}
            loading={i === 0 ? 'eager' : 'lazy'}
            decoding="async"
            className="h-full w-full shrink-0 snap-center object-cover"
            draggable={false}
          />
        ))}
      </div>
      {images.length > 1 && (
        <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              aria-label={`Фото ${i + 1}`}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/60'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
