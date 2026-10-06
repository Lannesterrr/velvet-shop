# Образ для продакшена (Railway, Render, любой VPS с Docker).
# Сборка:  docker build -t tg-shop .
# Запуск:  docker run --env-file server/.env -p 3000:3000 -v shop_uploads:/app/server/uploads tg-shop

# ───────── Сборка ─────────
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
COPY server/prisma server/prisma
RUN npm ci || npm install

COPY . .
RUN npm run build

# ───────── Запуск ─────────
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY --from=build /app /app
# Применяем миграции и стартуем
WORKDIR /app/server
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
