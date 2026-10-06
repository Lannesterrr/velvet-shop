/**
 * Запуск «одним файлом» для хостингов, которые умеют только `node <файл>`
 * (bothost и похожие): сам ставит зависимости, собирает проект,
 * применяет миграции базы и запускает сервер.
 *
 * Повторная сборка пропускается, если код не менялся с прошлой сборки.
 * Принудительно пересобрать: переменная окружения FORCE_BUILD=1.
 */
import { spawnSync } from 'node:child_process';
import dns from 'node:dns';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// В контейнерах без IPv6 запросы к Telegram могут «висеть» — сначала пробуем IPv4
dns.setDefaultResultOrder('ipv4first');

const root = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(root, 'server');

function run(cmd, cwd = root, { optional = false } = {}) {
  console.log(`\n▶ ${cmd}`);
  const res = spawnSync(cmd, { cwd, stdio: 'inherit', shell: true, env: process.env });
  if (res.status !== 0 && !optional) {
    if (res.status === null) {
      console.error(`✖ Процесс «${cmd}» убит системой (${res.signal ?? 'сигнал'}) — чаще всего не хватило памяти. Попробуйте тариф с большим объёмом RAM или BUILD_MEMORY_MB=300.`);
    }
    console.error(`✖ Команда завершилась с ошибкой (код ${res.status}): ${cmd}`);
    process.exit(res.status ?? 1);
  }
  return res.status === 0;
}

/** Отпечаток исходников: если код обновили (новая версия с GitHub) — собираем заново */
function sourceHash() {
  const hash = createHash('sha1');
  const walk = (p) => {
    if (!existsSync(p)) return;
    if (statSync(p).isDirectory()) {
      for (const name of readdirSync(p).sort()) if (name !== 'node_modules' && name !== 'dist') walk(path.join(p, name));
    } else {
      hash.update(p).update(readFileSync(p));
    }
  };
  for (const p of ['package.json', 'package-lock.json', 'shared', 'client/src', 'client/index.html', 'client/package.json', 'client/vite.config.ts', 'server/src', 'server/prisma/schema.prisma', 'server/package.json', 'server/tsup.config.ts']) {
    walk(path.join(root, p));
  }
  return hash.digest('hex');
}

const hashFile = path.join(root, '.build-hash');
const currentHash = sourceHash();
const built =
  existsSync(path.join(serverDir, 'dist', 'index.js')) &&
  existsSync(path.join(root, 'client', 'dist', 'index.html')) &&
  existsSync(path.join(root, 'node_modules', '.prisma', 'client')) &&
  existsSync(hashFile) &&
  readFileSync(hashFile, 'utf8') === currentHash;

if (!built || process.env.FORCE_BUILD === '1') {
  // Alpine-образы: Prisma нужен OpenSSL (если уже есть — команда просто ничего не сделает)
  if (existsSync('/etc/alpine-release')) run('apk add --no-cache openssl', root, { optional: true });

  // Ставим ВСЕ зависимости, включая dev: они нужны для сборки (vite, tsup, prisma)
  run('npm install --include=dev --no-audit --no-fund');
  // Собираем по частям и без лишней проверки типов: на хостингах с малым объёмом памяти
  // полная сборка может не поместиться и процесс убивается (ошибка «код null»).
  // Лимит памяти Node берём поменьше, чтобы сборщик чаще освобождал память.
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=${process.env.BUILD_MEMORY_MB ?? 384}`.trim();
  run('npm run build -w server');
  run('npx vite build', path.join(root, 'client'));
  process.env.NODE_OPTIONS = process.env.NODE_OPTIONS.replace(/--max-old-space-size=\d+/, '').trim();
  writeFileSync(hashFile, currentHash);
} else {
  console.log('✔ Проект уже собран — пропускаю сборку');
}

// Создаём/обновляем таблицы в базе
run('npx prisma migrate deploy', serverDir);

// Запускаем сам сервер (бот + магазин)
process.env.NODE_ENV ||= 'production';
await import(pathToFileURL(path.join(serverDir, 'dist', 'index.js')).href);
