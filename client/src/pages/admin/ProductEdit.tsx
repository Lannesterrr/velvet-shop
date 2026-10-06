/**
 * Создание и редактирование товара: поля, варианты (размер × цвет × остаток), фото.
 */
import {
  PRODUCT_STATUSES,
  PRODUCT_STATUS_LABELS,
  fromMinorUnits,
  productInputSchema,
  toMinorUnits,
  type ProductDTO,
  type ProductStatus,
} from '@shop/shared';
import { Plus, Trash2, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useAdminCategories, useAdminProduct, useProductMutations } from '../../api/admin';
import { ApiError, errorMessage } from '../../api/client';
import { Chip, ErrorState, Field, FullScreenLoader, PageHeader } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { MainButton } from '../../telegram/MainButton';
import { confirmDialog, haptic } from '../../telegram/webapp';
import { ImageManager, usePendingImages, type ImageItem } from './ImageManager';

interface VariantRow {
  key: string;
  id?: number;
  size: string;
  color: string;
  colorHex: string;
  /** Своя цена варианта (пусто — цена товара) */
  price: string;
  stock: string;
}

interface FormState {
  title: string;
  description: string;
  categoryId: string;
  price: string;
  oldPrice: string;
  sku: string;
  brand: string;
  material: string;
  status: ProductStatus;
  variants: VariantRow[];
}

let rowSeq = 0;
const newRow = (v: Partial<VariantRow> = {}): VariantRow => ({
  key: `r${++rowSeq}`,
  size: '',
  color: '',
  colorHex: '',
  price: '',
  stock: '0',
  ...v,
});

const emptyForm = (): FormState => ({
  title: '',
  description: '',
  categoryId: '',
  price: '',
  oldPrice: '',
  sku: '',
  brand: '',
  material: '',
  status: 'ACTIVE',
  variants: [newRow()],
});

function formFromProduct(p: ProductDTO): FormState {
  return {
    title: p.title,
    description: p.description,
    categoryId: String(p.categoryId),
    price: fromMinorUnits(p.price),
    oldPrice: p.oldPrice ? fromMinorUnits(p.oldPrice) : '',
    sku: p.sku,
    brand: p.brand ?? '',
    material: p.material ?? '',
    status: p.status,
    variants: p.variants.length
      ? p.variants.map((v) => newRow({ id: v.id, size: v.size, color: v.color, colorHex: v.colorHex ?? '', price: v.hasOwnPrice ? fromMinorUnits(v.price) : '', stock: String(v.stock) }))
      : [newRow()],
  };
}

export function ProductEditPage() {
  const params = useParams();
  const productId = Number(params.id) || 0;
  const isNew = productId === 0;
  const navigate = useNavigate();
  const toast = useToast();
  const { data: categories } = useAdminCategories();
  const productQuery = useAdminProduct(productId);
  const product = productQuery.data;
  const m = useProductMutations(productId);
  const pending = usePendingImages();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadedId, setLoadedId] = useState<number | null>(null);
  const [genSizes, setGenSizes] = useState('');
  const [genColors, setGenColors] = useState('');

  // Заполняем форму, когда товар загрузился (один раз на товар)
  useEffect(() => {
    if (product && loadedId !== product.id) {
      setForm(formFromProduct(product));
      setLoadedId(product.id);
    }
  }, [product, loadedId]);

  // Категория по умолчанию для нового товара
  useEffect(() => {
    if (isNew && !form.categoryId && categories?.length) setForm((f) => ({ ...f, categoryId: String(categories[0].id) }));
  }, [isNew, categories, form.categoryId]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  };

  const setVariant = (key: string, patch: Partial<VariantRow>) =>
    setForm((f) => ({ ...f, variants: f.variants.map((v) => (v.key === key ? { ...v, ...patch } : v)) }));

  /** Генератор вариантов: все комбинации введённых размеров и цветов */
  const generate = () => {
    const sizes = genSizes.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    const colors = genColors.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    if (!sizes.length) return toast.error('Введите варианты через запятую (например, 128 ГБ, 256 ГБ)');
    const colorList = colors.length ? colors : ['Основной'];
    setForm((f) => {
      const existing = f.variants.filter((v) => v.size || v.color);
      const has = (s: string, c: string) => existing.some((v) => v.size.toLowerCase() === s.toLowerCase() && v.color.toLowerCase() === c.toLowerCase());
      const added = colorList.flatMap((c) => sizes.filter((s) => !has(s, c)).map((s) => newRow({ size: s, color: c })));
      return { ...f, variants: [...existing, ...added] };
    });
    haptic.success();
  };

  const totalStock = useMemo(() => form.variants.reduce((s, v) => s + (Number(v.stock) || 0), 0), [form.variants]);

  if (!isNew && productQuery.isPending) return <FullScreenLoader />;
  if (!isNew && (productQuery.error || !product)) return <ErrorState error={productQuery.error} onRetry={() => void productQuery.refetch()} />;

  // ───────── Сохранение ─────────

  const save = async () => {
    const price = toMinorUnits(form.price);
    const oldPrice = form.oldPrice.trim() ? toMinorUnits(form.oldPrice) : null;
    const body = {
      title: form.title,
      description: form.description,
      categoryId: Number(form.categoryId),
      price: price ?? -1,
      oldPrice: oldPrice === null && form.oldPrice.trim() ? -1 : oldPrice,
      sku: form.sku,
      brand: form.brand,
      material: form.material,
      status: form.status,
      variants: form.variants.map((v) => ({
        ...(v.id ? { id: v.id } : {}),
        size: v.size,
        color: v.color,
        colorHex: v.colorHex,
        price: v.price.trim() ? (toMinorUnits(v.price) ?? -1) : null,
        stock: Number(v.stock),
      })),
    };

    const parsed = productInputSchema.safeParse(body);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[issue.path.join('.')] ??= issue.message;
      if (price === null) errs.price = 'Введите цену числом';
      if (form.oldPrice.trim() && oldPrice === null) errs.oldPrice = 'Введите цену числом';
      setErrors(errs);
      haptic.error();
      toast.error(Object.values(errs)[0] ?? 'Проверьте поля');
      return;
    }

    try {
      const saved = await m.save.mutateAsync(parsed.data);
      setErrors({});
      if (isNew) {
        // Загружаем фото, выбранные до первого сохранения
        if (pending.count) await m.uploadImages.mutateAsync({ productId: saved.id, files: pending.filesForUpload() });
        haptic.success();
        toast.success('Товар создан');
        navigate(`/admin/products/${saved.id}`, { replace: true });
      } else {
        setForm(formFromProduct(saved));
        haptic.success();
        toast.success('Сохранено');
      }
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast.error(errorMessage(err));
    }
  };

  const onDelete = async () => {
    if (!(await confirmDialog('Удалить товар безвозвратно? В старых заказах он останется. Если нужно просто убрать с витрины — выберите статус «Скрыт» или «В архиве».'))) return;
    m.remove.mutate(undefined, {
      onSuccess: () => {
        toast.success('Товар удалён');
        navigate('/admin/products', { replace: true });
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  // ───────── Фото ─────────

  const savedImages: ImageItem[] = product
    ? [...product.images].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id).map((i) => ({ key: `s-${i.id}`, src: i.thumbUrl, isMain: i.isMain }))
    : [];
  const imageId = (key: string) => Number(key.slice(2));
  const imgError = (err: unknown) => toast.error(errorMessage(err));

  const imageProps = isNew
    ? {
        items: pending.items,
        onAdd: pending.add,
        onReorder: pending.reorder,
        onSetMain: pending.setMain,
        onDelete: pending.remove,
      }
    : {
        items: savedImages,
        uploading: m.uploadImages.isPending,
        onAdd: (files: File[]) => m.uploadImages.mutate({ productId, files }, { onError: imgError }),
        onReorder: (keys: string[]) => m.reorderImages.mutate(keys.map(imageId), { onError: imgError }),
        onSetMain: (key: string) => m.setMainImage.mutate(imageId(key), { onError: imgError }),
        onDelete: async (key: string) => {
          if (await confirmDialog('Удалить фото?')) m.deleteImage.mutate(imageId(key), { onError: imgError });
        },
      };

  const err = (key: string) => errors[key];

  return (
    <div className="pb-8">
      <PageHeader title={isNew ? 'Новый товар' : 'Редактирование'} />

      <p className="section-title mt-2">Фото</p>
      <div className="card mx-4 p-4">
        <ImageManager {...imageProps} />
      </div>

      <p className="section-title mt-5">Основное</p>
      <div className="card mx-4 space-y-4 p-4">
        <Field label="Название" error={err('title')}>
          <input className="field" value={form.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Категория" error={err('categoryId')}>
          <select className="field" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
            {!categories?.length && <option value="">Сначала создайте категорию</option>}
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.isActive ? '' : ' (скрыта)'}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex gap-3">
          <Field label="Цена" error={err('price')} hint="базовая">
            <input className="field" inputMode="decimal" placeholder="1990" value={form.price} onChange={(e) => set('price', e.target.value)} />
          </Field>
          <Field label="Старая цена" error={err('oldPrice')} hint="для скидки">
            <input className="field" inputMode="decimal" placeholder="—" value={form.oldPrice} onChange={(e) => set('oldPrice', e.target.value)} />
          </Field>
        </div>
        <Field label="Описание" error={err('description')}>
          <textarea className="field min-h-28 resize-y" value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
      </div>

      <p className="section-title mt-5">Характеристики</p>
      <div className="card mx-4 space-y-4 p-4">
        <Field label="Артикул" error={err('sku')}>
          <input className="field" value={form.sku} onChange={(e) => set('sku', e.target.value)} placeholder="GS-001" />
        </Field>
        <Field label="Бренд" error={err('brand')}>
          <input className="field" value={form.brand} onChange={(e) => set('brand', e.target.value)} />
        </Field>
        <Field label="Материалы" error={err('material')}>
          <input className="field" value={form.material} onChange={(e) => set('material', e.target.value)} placeholder="Алюминий, стекло" />
        </Field>
        <div>
          <span className="mb-1.5 block text-sm font-medium">Статус</span>
          <div className="flex flex-wrap gap-2">
            {PRODUCT_STATUSES.map((s) => (
              <Chip key={s} active={form.status === s} onClick={() => set('status', s)}>
                {PRODUCT_STATUS_LABELS[s]}
              </Chip>
            ))}
          </div>
          <p className="mt-1 text-xs text-hint">Скрытые и архивные товары не видны покупателям.</p>
        </div>
      </div>

      <p className="section-title mt-5">Варианты · всего {totalStock} шт.</p>
      <div className="card mx-4 p-4">
        <div className="mb-4 rounded-xl bg-page p-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <Wand2 size={16} /> Быстрое создание
          </p>
          <div className="space-y-2">
            <input className="field bg-card!" placeholder="Варианты: 128 ГБ, 256 ГБ, 512 ГБ" value={genSizes} onChange={(e) => setGenSizes(e.target.value)} />
            <input className="field bg-card!" placeholder="Цвета: Чёрный, Белый, Синий" value={genColors} onChange={(e) => setGenColors(e.target.value)} />
            <button type="button" className="btn btn-secondary w-full" onClick={generate}>
              Добавить все комбинации
            </button>
          </div>
        </div>

        <p className="mb-3 text-xs text-hint">
          У каждого варианта может быть своя цена — например, 512 ГБ дороже 256 ГБ. Если поле цены пустое, используется базовая цена товара.
        </p>
        {err('variants') && <p className="mb-2 text-sm text-danger">{err('variants')}</p>}
        <div className="space-y-3">
          {form.variants.map((v, i) => (
            <div key={v.key} className="rounded-xl border border-line p-3">
              <div className="grid grid-cols-2 gap-2">
                <Field error={err(`variants.${i}.size`)}>
                  <input className="field" placeholder="Вариант: 256 ГБ" value={v.size} onChange={(e) => setVariant(v.key, { size: e.target.value })} />
                </Field>
                <Field error={err(`variants.${i}.stock`)}>
                  <input
                    className="field"
                    inputMode="numeric"
                    placeholder="Остаток"
                    value={v.stock}
                    onChange={(e) => setVariant(v.key, { stock: e.target.value.replace(/\D/g, '') })}
                  />
                </Field>
                <Field error={err(`variants.${i}.color`)}>
                  <input className="field" placeholder="Цвет" value={v.color} onChange={(e) => setVariant(v.key, { color: e.target.value })} />
                </Field>
                <Field error={err(`variants.${i}.price`)}>
                  <input
                    className="field"
                    inputMode="decimal"
                    placeholder={form.price ? `Цена: ${form.price}` : 'Своя цена'}
                    value={v.price}
                    onChange={(e) => setVariant(v.key, { price: e.target.value })}
                  />
                </Field>
                <div className="col-span-2 flex items-center gap-2">
                  <input
                    type="color"
                    className="h-11 w-11 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent"
                    value={v.colorHex || '#cccccc'}
                    onChange={(e) => setVariant(v.key, { colorHex: e.target.value })}
                    aria-label="Цвет для кружка"
                  />
                  <button
                    type="button"
                    className="ml-auto rounded-lg p-2.5 text-danger"
                    aria-label="Удалить вариант"
                    onClick={() => setForm((f) => ({ ...f, variants: f.variants.filter((x) => x.key !== v.key) }))}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-secondary mt-3 w-full"
          onClick={() => setForm((f) => ({ ...f, variants: [...f.variants, newRow({ color: f.variants.at(-1)?.color ?? '', colorHex: f.variants.at(-1)?.colorHex ?? '' })] }))}
        >
          <Plus size={18} /> Добавить вариант
        </button>
      </div>

      {!isNew && (
        <div className="mx-4 mt-6">
          <button type="button" className="btn btn-danger w-full" onClick={() => void onDelete()}>
            <Trash2 size={18} /> Удалить товар
          </button>
        </div>
      )}

      <MainButton
        text={isNew ? 'Создать товар' : 'Сохранить изменения'}
        onClick={() => void save()}
        loading={m.save.isPending || m.uploadImages.isPending}
      />
    </div>
  );
}
