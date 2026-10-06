/**
 * Категории: создание, редактирование, скрытие, порядок, удаление.
 */
import { categoryInputSchema, type CategoryDTO } from '@shop/shared';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useAdminCategories, useCategoryMutations } from '../../api/admin';
import { errorMessage } from '../../api/client';
import { ErrorState, Field, FullScreenLoader, Sheet, Toggle } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { confirmDialog, haptic } from '../../telegram/webapp';

/** Транслитерация для slug: "Верхняя одежда" → "verhnyaya-odezhda" */
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

interface Draft {
  id?: number;
  name: string;
  slug: string;
  isActive: boolean;
  slugTouched: boolean;
}

export function CategoriesPage() {
  const toast = useToast();
  const { data: categories, isPending, error, refetch } = useAdminCategories();
  const m = useCategoryMutations();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (isPending) return <FullScreenLoader />;
  if (error || !categories) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const onError = (err: unknown) => toast.error(errorMessage(err));

  const open = (c?: CategoryDTO) => {
    setErrors({});
    setDraft(c ? { id: c.id, name: c.name, slug: c.slug, isActive: c.isActive, slugTouched: true } : { name: '', slug: '', isActive: true, slugTouched: false });
  };

  const save = () => {
    if (!draft) return;
    const parsed = categoryInputSchema.safeParse(draft);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      return;
    }
    const opts = {
      onSuccess: () => {
        haptic.success();
        toast.success('Сохранено');
        setDraft(null);
      },
      onError,
    };
    if (draft.id) m.update.mutate({ id: draft.id, ...parsed.data }, opts);
    else m.create.mutate(parsed.data, opts);
  };

  const move = (index: number, dir: -1 | 1) => {
    const ids = categories.map((c) => c.id);
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    haptic.selection();
    m.reorder.mutate(ids, { onError });
  };

  const remove = async (c: CategoryDTO) => {
    if (!(await confirmDialog(`Удалить категорию «${c.name}»?`))) return;
    m.remove.mutate(c.id, { onSuccess: () => toast.success('Категория удалена'), onError });
  };

  return (
    <div className="px-4 pt-2 pb-8">
      <button type="button" className="btn btn-primary mb-3 w-full" onClick={() => open()}>
        <Plus size={18} /> Новая категория
      </button>

      <div className="card divide-y divide-line">
        {categories.length === 0 && <p className="p-4 text-sm text-hint">Категорий пока нет.</p>}
        {categories.map((c, i) => (
          <div key={c.id} className="flex items-center gap-2 p-3">
            <div className="flex flex-col">
              <button type="button" className="p-1 text-hint disabled:opacity-20" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Выше">
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                className="p-1 text-hint disabled:opacity-20"
                disabled={i === categories.length - 1}
                onClick={() => move(i, 1)}
                aria-label="Ниже"
              >
                <ArrowDown size={16} />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <p className={`font-medium ${c.isActive ? '' : 'text-hint line-through'}`}>{c.name}</p>
              <p className="text-xs text-hint">
                /{c.slug} · товаров: {c.productCount}
                {!c.isActive && ' · скрыта'}
              </p>
            </div>
            <button type="button" className="p-2 text-link" onClick={() => open(c)} aria-label="Изменить">
              <Pencil size={18} />
            </button>
            <button type="button" className="p-2 text-danger" onClick={() => void remove(c)} aria-label="Удалить">
              <Trash2 size={18} />
            </button>
          </div>
        ))}
      </div>

      <Sheet open={draft !== null} onClose={() => setDraft(null)} title={draft?.id ? 'Категория' : 'Новая категория'}>
        {draft && (
          <div className="space-y-4 pb-4">
            <Field label="Название" error={errors.name}>
              <input
                className="field"
                value={draft.name}
                onChange={(e) =>
                  setDraft({ ...draft, name: e.target.value, slug: draft.slugTouched ? draft.slug : slugify(e.target.value) })
                }
              />
            </Field>
            <Field label="Адрес (slug)" error={errors.slug} hint="Латиница, цифры и дефис">
              <input className="field" value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value, slugTouched: true })} />
            </Field>
            <Toggle label="Показывать в магазине" checked={draft.isActive} onChange={(v) => setDraft({ ...draft, isActive: v })} />
            <button type="button" className="btn btn-primary w-full" disabled={m.create.isPending || m.update.isPending} onClick={save}>
              Сохранить
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
