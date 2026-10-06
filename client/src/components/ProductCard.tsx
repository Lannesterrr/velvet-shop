import type { ProductListItemDTO } from '@shop/shared';
import { Link } from 'react-router';
import { useMoney } from '../lib/format';
import { ProductPlaceholder } from './ProductPlaceholder';
import { ColorDot } from './ui';

export function ProductCard({ product }: { product: ProductListItemDTO }) {
  const money = useMoney();
  const discount =
    product.oldPrice && product.oldPrice > product.price
      ? Math.round((1 - product.price / product.oldPrice) * 100)
      : 0;

  return (
    <Link to={`/product/${product.id}`} className="card block overflow-hidden active:opacity-80">
      <div className="relative aspect-[4/5] bg-page">
        {product.image ? (
          <img
            src={product.image.thumbUrl}
            alt={product.title}
            loading="lazy"
            decoding="async"
            className={`h-full w-full object-cover ${product.inStock ? '' : 'opacity-50'}`}
          />
        ) : (
          <ProductPlaceholder brand={product.brand} title={product.title} />
        )}
        {discount > 0 && (
          <span className="absolute top-2 left-2 rounded-md bg-danger px-1.5 py-0.5 text-xs font-bold text-white">
            −{discount}%
          </span>
        )}
        {!product.inStock && (
          <span className="absolute inset-x-2 bottom-2 rounded-md bg-black/60 py-1 text-center text-xs font-medium text-white">
            Нет в наличии
          </span>
        )}
      </div>
      <div className="p-2.5">
        <div className="flex items-baseline gap-1.5">
          <span className="font-bold">
            {product.priceFrom && <span className="font-normal text-hint">от </span>}
            {money(product.price)}
          </span>
          {product.oldPrice && <span className="text-xs text-hint line-through">{money(product.oldPrice)}</span>}
        </div>
        <p className="mt-0.5 line-clamp-2 text-sm leading-snug">{product.title}</p>
        {product.colors.length > 1 && (
          <div className="mt-1.5 flex gap-1">
            {product.colors.slice(0, 5).map((c) => (
              <ColorDot key={c.name} hex={c.hex} size={12} />
            ))}
            {product.colors.length > 5 && <span className="text-xs text-hint">+{product.colors.length - 5}</span>}
          </div>
        )}
      </div>
    </Link>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="skeleton aspect-[4/5]" />
      <div className="space-y-2 p-2.5">
        <div className="skeleton h-4 w-1/2 rounded" />
        <div className="skeleton h-3 w-4/5 rounded" />
      </div>
    </div>
  );
}
