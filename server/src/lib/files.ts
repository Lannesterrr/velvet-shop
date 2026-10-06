/**
 * Работа с загружаемыми файлами: приём (multer), сжатие изображений (sharp),
 * сохранение на диск и удаление.
 *
 * Структура UPLOAD_DIR:
 *   products/  — фото товаров, раздаются публично по /uploads/products/...
 *   receipts/  — чеки об оплате, ПРИВАТНЫЕ, отдаются только по подписанной ссылке
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import sharp from 'sharp';
import { config } from '../config';
import { logger } from '../logger';
import { badRequest } from './errors';

export const PRODUCTS_DIR = path.join(config.uploadDir, 'products');
export const RECEIPTS_DIR = path.join(config.uploadDir, 'receipts');

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 МБ
export const MAX_FILES_PER_REQUEST = 10;

// HEIC не поддерживается сборкой sharp по умолчанию; Telegram на iOS сам конвертирует фото в JPEG
const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const RECEIPT_MIME = new Set([...IMAGE_MIME, 'application/pdf']);

/** Создаёт папки при старте сервера */
export async function ensureUploadDirs(): Promise<void> {
  await fs.mkdir(PRODUCTS_DIR, { recursive: true });
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
}

/** Файлы держим в памяти: всё равно перекодируем через sharp перед записью */
function makeUploader(allowed: Set<string>) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES_PER_REQUEST },
    fileFilter: (_req, file, cb) => {
      if (allowed.has(file.mimetype)) cb(null, true);
      else cb(badRequest(`Недопустимый тип файла: ${file.mimetype}. Разрешены JPG, PNG, WEBP${allowed.has('application/pdf') ? ', PDF' : ''}`));
    },
  });
}

export const productImagesUpload = makeUploader(IMAGE_MIME).array('images', MAX_FILES_PER_REQUEST);
export const receiptUpload = makeUploader(RECEIPT_MIME).single('receipt');

/**
 * Сжимает фото товара: исправляет ориентацию по EXIF, убирает метаданные,
 * сохраняет в WebP (до 1600px) и миниатюру (до 600px).
 * sharp сам проверяет, что это действительно изображение — подделка mime-типа не пройдёт.
 */
export async function saveProductImage(buffer: Buffer): Promise<{ url: string; thumbUrl: string }> {
  const name = randomUUID();
  try {
    const base = sharp(buffer, { failOn: 'error' }).rotate();
    await Promise.all([
      base
        .clone()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(path.join(PRODUCTS_DIR, `${name}.webp`)),
      base
        .clone()
        .resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78 })
        .toFile(path.join(PRODUCTS_DIR, `${name}_thumb.webp`)),
    ]);
  } catch (err) {
    logger.warn({ err }, 'Не удалось обработать изображение');
    await removeProductImageFiles(`/uploads/products/${name}.webp`, `/uploads/products/${name}_thumb.webp`);
    throw badRequest('Файл повреждён или не является изображением');
  }
  return {
    url: `/uploads/products/${name}.webp`,
    thumbUrl: `/uploads/products/${name}_thumb.webp`,
  };
}

/** Удаляет файлы фото по их публичным URL (ошибки «нет файла» игнорируются) */
export async function removeProductImageFiles(...urls: string[]): Promise<void> {
  await Promise.all(
    urls.map(async (url) => {
      const file = path.join(PRODUCTS_DIR, path.basename(url));
      await fs.rm(file, { force: true }).catch((err) => logger.warn({ err, file }, 'Не удалось удалить файл'));
    }),
  );
}

/**
 * Сохраняет чек. Изображения перекодируются в JPEG (удаляются метаданные,
 * отсекаются «не картинки»), PDF проверяется по сигнатуре и сохраняется как есть.
 * Возвращает путь относительно UPLOAD_DIR.
 */
export async function saveReceipt(file: Express.Multer.File, orderId: number): Promise<string> {
  const base = `order-${orderId}-${randomUUID()}`;

  if (file.mimetype === 'application/pdf') {
    if (file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw badRequest('Файл не похож на PDF');
    }
    const name = `${base}.pdf`;
    await fs.writeFile(path.join(RECEIPTS_DIR, name), file.buffer);
    return `receipts/${name}`;
  }

  const name = `${base}.jpg`;
  try {
    await sharp(file.buffer, { failOn: 'error' })
      .rotate()
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(path.join(RECEIPTS_DIR, name));
  } catch {
    throw badRequest('Файл повреждён или не является изображением');
  }
  return `receipts/${name}`;
}

/** Абсолютный путь к чеку с защитой от выхода за пределы папки */
export function resolveReceiptPath(relative: string): string {
  const abs = path.resolve(config.uploadDir, relative);
  if (!abs.startsWith(RECEIPTS_DIR + path.sep)) throw badRequest('Некорректный путь к файлу');
  return abs;
}

export async function removeReceipt(relative: string | null | undefined): Promise<void> {
  if (!relative) return;
  await fs.rm(resolveReceiptPath(relative), { force: true }).catch(() => undefined);
}
