/**
 * Управление фото товара: загрузка (drag-and-drop или выбор файлов), предпросмотр,
 * перетаскивание для изменения порядка, выбор главного фото, удаление.
 *
 * Работает в двух режимах:
 *  - товар уже сохранён → изменения сразу отправляются на сервер;
 *  - новый товар → фото копятся локально и загружаются после первого сохранения.
 */
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ImagePlus, Loader2, Star, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useToast } from '../../components/Toast';
import { haptic } from '../../telegram/webapp';

export const MAX_IMAGES = 15;
const MAX_SIZE = 10 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

export interface ImageItem {
  /** Строковый id для dnd-kit: "s-12" (сохранённое) или "p-<uuid>" (ожидает загрузки) */
  key: string;
  src: string;
  isMain: boolean;
}

interface Props {
  items: ImageItem[];
  uploading?: boolean;
  onAdd: (files: File[]) => void;
  onReorder: (keys: string[]) => void;
  onSetMain: (key: string) => void;
  onDelete: (key: string) => void;
}

/** Проверка файлов на клиенте (сервер всё равно проверит повторно) */
export function useFileValidation() {
  const toast = useToast();
  return (files: File[], currentCount: number): File[] => {
    const ok = files.filter((f) => {
      if (!ACCEPTED.includes(f.type)) {
        toast.error(`${f.name}: нужен JPG, PNG или WEBP`);
        return false;
      }
      if (f.size > MAX_SIZE) {
        toast.error(`${f.name}: больше 10 МБ`);
        return false;
      }
      return true;
    });
    const room = MAX_IMAGES - currentCount;
    if (ok.length > room) toast.error(`Максимум ${MAX_IMAGES} фото на товар`);
    return ok.slice(0, Math.max(0, room));
  };
}

export function ImageManager({ items, uploading, onAdd, onReorder, onSetMain, onDelete }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const validate = useFileValidation();

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // На телефоне перетаскивание начинается после короткого удержания — чтобы не мешать прокрутке
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const files = validate([...list], items.length);
    if (files.length) onAdd(files);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.key === active.id);
    const newIndex = items.findIndex((i) => i.key === over.id);
    haptic.impact('light');
    onReorder(arrayMove(items, oldIndex, newIndex).map((i) => i.key));
  };

  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.key)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-3 gap-2">
            {items.map((item) => (
              <SortableImage key={item.key} item={item} onSetMain={onSetMain} onDelete={onDelete} />
            ))}
            {items.length < MAX_IMAGES && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={`flex aspect-[4/5] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-sm transition-colors ${
                  dragOver ? 'border-accent bg-accent/10 text-accent' : 'border-line text-hint'
                }`}
              >
                {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus size={26} />}
                <span>{uploading ? 'Загрузка…' : 'Добавить'}</span>
              </button>
            )}
          </div>
        </SortableContext>
      </DndContext>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <p className="mt-2 text-xs text-hint">
        Перетащите фото, чтобы изменить порядок (на телефоне — удерживайте). ★ — главное фото. До {MAX_IMAGES} фото, JPG/PNG/WEBP до 10 МБ;
        сервер сожмёт их автоматически.
      </p>
    </div>
  );
}

function SortableImage({
  item,
  onSetMain,
  onDelete,
}: {
  item: ImageItem;
  onSetMain: (key: string) => void;
  onDelete: (key: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }}
      className={`relative aspect-[4/5] touch-manipulation overflow-hidden rounded-xl bg-page ${isDragging ? 'opacity-80 shadow-xl' : ''} ${
        item.isMain ? 'ring-2 ring-accent' : ''
      }`}
      {...attributes}
      {...listeners}
    >
      <img src={item.src} alt="" className="h-full w-full object-cover" draggable={false} />
      <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/60 to-transparent p-1.5">
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={() => onSetMain(item.key)}
          className={`rounded-full p-1.5 ${item.isMain ? 'bg-accent text-accent-ink' : 'bg-black/40 text-white'}`}
          aria-label="Сделать главным"
        >
          <Star size={14} fill={item.isMain ? 'currentColor' : 'none'} />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={() => onDelete(item.key)}
          className="rounded-full bg-black/40 p-1.5 text-white"
          aria-label="Удалить фото"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

/** Локальные превью для ещё не загруженных файлов */
export function usePendingImages() {
  const [pending, setPending] = useState<{ key: string; file: File; src: string }[]>([]);
  const [mainKey, setMainKey] = useState<string | null>(null);

  // Освобождаем object URL при размонтировании
  const ref = useRef(pending);
  ref.current = pending;
  useEffect(() => () => ref.current.forEach((p) => URL.revokeObjectURL(p.src)), []);

  const add = (files: File[]) =>
    setPending((prev) => [
      ...prev,
      ...files.map((file) => ({ key: `p-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`, file, src: URL.createObjectURL(file) })),
    ]);
  const reorder = (keys: string[]) => setPending((prev) => keys.map((k) => prev.find((p) => p.key === k)!).filter(Boolean));
  const remove = (key: string) =>
    setPending((prev) => {
      const item = prev.find((p) => p.key === key);
      if (item) URL.revokeObjectURL(item.src);
      return prev.filter((p) => p.key !== key);
    });

  const effectiveMain = mainKey && pending.some((p) => p.key === mainKey) ? mainKey : pending[0]?.key ?? null;
  const items: ImageItem[] = pending.map((p) => ({ key: p.key, src: p.src, isMain: p.key === effectiveMain }));
  /** Файлы в порядке загрузки: главное — первым (сервер делает первое загруженное главным) */
  const filesForUpload = () => {
    const main = pending.find((p) => p.key === effectiveMain);
    return [...(main ? [main] : []), ...pending.filter((p) => p.key !== effectiveMain)].map((p) => p.file);
  };

  return { items, add, reorder, remove, setMain: setMainKey, filesForUpload, count: pending.length };
}
