/**
 * Запуск «одним файлом» для хостингов, которые умеют только `node <файл>`
 * (bothost и похожие): сам ставит зависимости, собирает проект,
 * применяет миграции базы и запускает сервер.
 *
 * Повторная сборка пропускается, если всё уже собрано.
 * Принудительно пересобрать: переменная окружения FORCE_BUILD=1.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(root, 'server');

function run(cmd, cwd = root, { optional = false } = {}) {
  console.log(`\n▶ ${cmd}`);
  const res = spawnSync(cmd, { cwd, stdio: 'inherit', shell: true, env: process.env });
  if (res.status !== 0 && !optional) {
    console.error(`✖ Команда завершилась с ошибкой (код ${res.status}): ${cmd}`);
    process.exit(res.status ?? 1);
  }
  return res.status === 0;
}

const built =
  existsSync(path.join(serverDir, 'dist', 'index.js')) &&
  existsSync(path.join(root, 'client', 'dist', 'index.html')) &&
  existsSync(path.join(root, 'node_modules', '.prisma', 'client'));

if (!built || process.env.FORCE_BUILD === '1') {
  // Alpine-образы: Prisma нужен OpenSSL (если уже есть — команда просто ничего не сделает)
  if (existsSync('/etc/alpine-release')) run('apk add --no-cache openssl', root, { optional: true });

  // Ставим ВСЕ зависимости, включая dev: они нужны для сборки (vite, tsup, prisma)
  run('npm install --include=dev --no-audit --no-fund');
  run('npm run build');
} else {
  console.log('✔ Проект уже собран — пропускаю сборку');
}

// Создаём/обновляем таблицы в базе
run('npx prisma migrate deploy', serverDir);

// Запускаем сам сервер (бот + магазин)
process.env.NODE_ENV ||= 'production';
await import(pathToFileURL(path.join(serverDir, 'dist', 'index.js')).href);
