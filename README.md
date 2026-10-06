# Telegram Mini App — магазин техники с админ-панелью

Интернет-магазин, который открывается прямо внутри Telegram. Покупатель выбирает товары, оформляет заказ, переводит деньги по реквизитам и прикрепляет чек. Админ подтверждает оплату в админ-панели или одной кнопкой в чате с ботом.

**Стек:** React 19 + Vite + TypeScript + Tailwind CSS 4 · Node.js + Express 5 + TypeScript · PostgreSQL + Prisma · grammY (бот) · zod · sharp.

---

## Содержание

1. [Возможности](#возможности)
2. [Структура проекта](#структура-проекта)
3. [Шаг 1. Создание бота в BotFather](#шаг-1-создание-бота-в-botfather)
4. [Шаг 2. Локальный запуск](#шаг-2-локальный-запуск)
5. [Шаг 3. Деплой на VPS (nginx + Let's Encrypt)](#шаг-3-деплой-на-vps-nginx--lets-encrypt)
6. [Альтернатива: Railway / Docker](#альтернатива-railway--docker)
7. [Как пользоваться админкой](#как-пользоваться-админкой)
8. [Безопасность](#безопасность)
9. [API](#api)
10. [Частые проблемы](#частые-проблемы)

---

## Возможности

**Покупатель**

- Каталог с баннером, категориями с иконками, поиском, фильтрами (память/вариант, цвет, цена) и сортировкой; бесконечная прокрутка.
- Карточка товара: галерея со свайпом, выбор цвета (кружки) и варианта — память, размер корпуса и т.п. — со своей ценой, наличие на складе.
- Корзина на сервере (одинакова на всех устройствах), проверка остатков.
- Оформление: имя, телефон, способ доставки, адрес / пункт выдачи, комментарий. Бесплатная доставка от суммы.
- Экран оплаты: актуальные реквизиты из админки, кнопка «Копировать» у каждого поля, загрузка скриншота или PDF-чека.
- История заказов со статусами и хронологией; отмена неоплаченного заказа.
- Нативные элементы Telegram: MainButton, BackButton, haptic feedback, подстройка под светлую/тёмную тему.
- Уведомления от бота о каждой смене статуса.

**Админ**

- Сводка: заказы и выручка за сегодня / 7 / 30 дней, средний чек, график за 14 дней, заканчивающиеся товары.
- Товары: создание, редактирование, скрытие, архив, удаление; варианты «память × цвет» со своей ценой, остатками и генератором комбинаций; фото с drag-and-drop, сортировкой и выбором главного (сервер сжимает в WebP).
- Категории, реквизиты для оплаты (карта, СБП, счёт, крипта…), способы доставки, настройки магазина.
- Заказы: фильтры по статусу и датам, поиск, просмотр чека, «Подтвердить оплату» / «Отклонить» с причиной, смена статуса, трек-номер, заметки, журнал изменений.
- Уведомления админам о новых заказах и чеках; подтверждение оплаты прямо из чата кнопками под чеком.
- Управление администраторами (владелец из `ADMIN_IDS` добавляет других по Telegram ID).

---

## Структура проекта

```
tg-shop/
├── shared/              Общие zod-схемы, enum-ы статусов, типы ответов API
├── server/              Express API + Telegram-бот (один процесс)
│   ├── prisma/          schema.prisma, seed.ts (демо-данные)
│   └── src/
│       ├── config.ts    Чтение и проверка .env
│       ├── app.ts       Express: helmet, CORS, rate limit, маршруты, раздача фронтенда
│       ├── middleware/  Проверка initData, права админа, ошибки, лимиты
│       ├── lib/         HMAC initData, загрузка/сжатие файлов, подписанные ссылки
│       ├── services/    Бизнес-логика: каталог, корзина, заказы, товары, статистика
│       ├── routes/      public (/api/...), admin (/api/admin/...), files
│       └── bot/         Команды, уведомления, кнопки модерации оплат
├── client/              React-приложение (магазин + админка в /admin)
│   └── src/
│       ├── telegram/    Обёртка WebApp SDK, MainButton, BackButton
│       ├── api/         HTTP-клиент и хуки TanStack Query
│       ├── components/  UI-компоненты
│       └── pages/       Экраны магазина и admin/*
├── deploy/              nginx.conf, systemd-сервис
├── docker-compose.yml   PostgreSQL для разработки
└── Dockerfile           Образ для продакшена
```

---

## Шаг 1. Создание бота в BotFather

1. Откройте [@BotFather](https://t.me/BotFather) → `/newbot` → задайте имя и username (должен заканчиваться на `bot`).
2. Скопируйте **токен** — он пойдёт в `BOT_TOKEN`. Никому его не показывайте.
3. Узнайте свой **Telegram ID** через [@userinfobot](https://t.me/userinfobot) (или позже командой `/myid` у вашего бота) — он пойдёт в `ADMIN_IDS`.
4. Кнопку «Магазин» слева от поля ввода сервер настраивает **сам** при каждом запуске (по `WEBAPP_URL`). При желании можно сделать это вручную: BotFather → `/mybots` → ваш бот → *Bot Settings* → *Menu Button*.
5. *(Необязательно)* Чтобы магазин открывался по ссылке `t.me/ваш_бот/shop` и в полноэкранном режиме: BotFather → `/newapp` → выберите бота → укажите название, описание, картинку 640×360 и URL (`WEBAPP_URL`), short name — например `shop`. Поддерживаются ссылки `t.me/ваш_бот/shop?startapp=product_12` (товар) и `?startapp=order_5` (заказ).

> URL в BotFather должен быть **HTTPS**. Для локальной разработки это адрес туннеля (см. ниже); после деплоя поменяйте на домен.

---

## Шаг 2. Локальный запуск

### Что нужно установить

- **Node.js 20+** (рекомендуется 22) — <https://nodejs.org>
- **Docker Desktop** — для PostgreSQL. Без Docker можно установить PostgreSQL 14+ обычным установщиком или взять бесплатную облачную базу ([Neon](https://neon.tech), [Supabase](https://supabase.com)) — тогда просто впишите её адрес в `DATABASE_URL`.
- **cloudflared** (проще, без регистрации) или **ngrok** — чтобы получить временный HTTPS-адрес.

### Запуск

```bash
# 1. Зависимости (в корне проекта)
npm install

# 2. База данных
docker compose up -d

# 3. Настройки
cp server/.env.example server/.env        # Windows: copy server\.env.example server\.env
```

Откройте `server/.env` и заполните `BOT_TOKEN`, `ADMIN_IDS`. `WEBAPP_URL` заполним на шаге 5.

```bash
# 4. Таблицы и демо-данные
npm run db:migrate      # при первом запуске спросит имя миграции — введите init
npm run db:seed         # категории, доставка и ~20 популярных устройств с картинками
```

```bash
# 5. HTTPS-туннель на порт фронтенда (5173) — в отдельном окне терминала
cloudflared tunnel --url http://localhost:5173
#   или: ngrok http 5173
```

Скопируйте выданный адрес (`https://xxxx.trycloudflare.com`) в `WEBAPP_URL` в `server/.env`.

```bash
# 6. Запуск сервера, бота и фронтенда одной командой
npm run dev
```

Откройте бота в Telegram → `/start` → «Открыть магазин». Админ-панель — кнопка ⚙️ в шапке магазина или команда `/admin`.

> **Как это работает локально.** Telegram открывает адрес туннеля → Vite (порт 5173) отдаёт фронтенд и проксирует `/api` и `/uploads` на сервер (порт 3000). Бот работает в режиме long polling — ему публичный адрес не нужен.
>
> Адрес бесплатного туннеля меняется при каждом перезапуске cloudflared — обновляйте `WEBAPP_URL` и перезапускайте `npm run dev`.

### Разработка в обычном браузере

Чтобы не открывать Telegram на каждое изменение, впишите в `server/.env` свой ID: `DEV_TELEGRAM_ID=123456789` и откройте <http://localhost:5173>. Запросы без подписи Telegram будут выполняться от этого пользователя, вместо нативных кнопок появятся обычные. В продакшене (`NODE_ENV=production`) настройка игнорируется.

### Полезные команды

| Команда | Что делает |
|---|---|
| `npm run dev` | Сервер + бот + фронтенд с автоперезагрузкой |
| `npm run build` | Сборка сервера (`server/dist`) и фронтенда (`client/dist`) |
| `npm run typecheck` | Проверка типов во всех пакетах |
| `npm test -w server` | Тесты проверки подписи initData |
| `npm run db:migrate` | Создать/применить миграции (разработка) |
| `npm run db:deploy` | Применить миграции (продакшен) |
| `npm run db:reset` | Очистить базу и заново заполнить демо-каталогом |
| `npm run db:studio` | Веб-интерфейс для просмотра базы |

> После первого `db:migrate` появится папка `server/prisma/migrations` — **закоммитьте её**, на сервере миграции применяются из неё командой `db:deploy`.

---

## Шаг 3. Деплой на VPS (nginx + Let's Encrypt)

Пример для Ubuntu 22.04/24.04 и домена `shop.example.com` (A-запись домена должна указывать на IP сервера).

### 3.1. Подготовка сервера

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx postgresql certbot python3-certbot-nginx git

# Пользователь для приложения
sudo adduser --disabled-password --gecos "" shop

# База данных (придумайте свой пароль)
sudo -u postgres psql -c "CREATE USER shop WITH PASSWORD 'StrongPassword123';"
sudo -u postgres psql -c "CREATE DATABASE shop OWNER shop;"
```

### 3.2. Код и настройки

```bash
sudo -iu shop
git clone <ваш-репозиторий> tg-shop && cd tg-shop
npm ci
cp server/.env.example server/.env && nano server/.env
```

Продакшен-значения в `server/.env`:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
TZ=Europe/Moscow
DATABASE_URL=postgresql://shop:StrongPassword123@localhost:5432/shop?schema=public
BOT_TOKEN=...
ADMIN_IDS=ваш_id
WEBAPP_URL=https://shop.example.com
BOT_MODE=webhook
WEBHOOK_SECRET=сгенерируйте_случайную_строку
DEV_TELEGRAM_ID=
```

Секрет для webhook: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`.

```bash
npm run build
npm run db:deploy
npm run db:seed          # необязательно: демо-товары можно удалить из админки
exit
```

### 3.3. Автозапуск (systemd)

```bash
sudo cp /home/shop/tg-shop/deploy/tg-shop.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tg-shop
sudo systemctl status tg-shop          # должно быть active (running)
journalctl -u tg-shop -f               # логи
```

### 3.4. nginx и HTTPS

```bash
sudo cp /home/shop/tg-shop/deploy/nginx.conf /etc/nginx/sites-available/tg-shop
sudo nano /etc/nginx/sites-available/tg-shop        # замените shop.example.com
sudo ln -s /etc/nginx/sites-available/tg-shop /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d shop.example.com            # бесплатный сертификат Let's Encrypt, продлевается сам
```

Проверка: `https://shop.example.com/health` → `{"ok":true,...}`. После этого перезапустите приложение (`sudo systemctl restart tg-shop`) — оно зарегистрирует webhook и кнопку меню с новым адресом. В BotFather поменяйте URL Mini App (если создавали через `/newapp`).

### 3.5. Обновление и бэкапы

```bash
sudo -iu shop && cd tg-shop
git pull && npm ci && npm run build && npm run db:deploy
exit && sudo systemctl restart tg-shop
```

Бэкапить нужно две вещи: базу (`pg_dump -U shop shop > backup.sql`) и папку `server/uploads` (фото товаров и чеки).

---

## Альтернатива: Railway / Docker

В корне есть `Dockerfile`: он собирает проект, при старте применяет миграции и запускает сервер.

**Railway:**

1. Залейте проект в GitHub (вместе с `server/prisma/migrations`).
2. Railway → *New Project* → *Deploy from GitHub repo*. Добавьте сервис *PostgreSQL*.
3. В переменных сервиса приложения задайте всё из `.env.example`: `DATABASE_URL` (ссылка `${{Postgres.DATABASE_URL}}`), `BOT_TOKEN`, `ADMIN_IDS`, `NODE_ENV=production`, `BOT_MODE=webhook`, `WEBHOOK_SECRET`, `WEBAPP_URL` (домен из *Settings → Networking → Generate Domain*, он уже с HTTPS).
4. **Обязательно** подключите Volume с путём `/app/server/uploads` — иначе фото и чеки пропадут при передеплое.

**Свой сервер с Docker:**

```bash
docker build -t tg-shop .
docker run -d --name tg-shop --env-file server/.env -p 127.0.0.1:3000:3000 \
  -v shop_uploads:/app/server/uploads --restart unless-stopped tg-shop
```

Перед контейнером так же нужен nginx + certbot (раздел 3.4). В `.env` для Docker `HOST=0.0.0.0`.

---

## Как пользоваться админкой

1. **Реквизиты** — добавьте хотя бы один способ оплаты, иначе покупатель увидит просьбу написать в поддержку. Изменения видны клиентам сразу.
2. **Настройки** — название магазина, валюта, контакты поддержки (`@username` используется в кнопке «Написать в поддержку»), способы доставки и их стоимость.
3. **Категории → Товары** — создайте категории, затем товары. Варианты удобно создавать генератором: «128 ГБ, 256 ГБ, 512 ГБ» × «Чёрный, Белый» → 6 вариантов; останется проставить остатки и цены для старших версий.
4. **Заказы** — когда клиент прикрепит чек, бот пришлёт его всем админам с кнопками «Подтвердить / Отклонить». То же самое доступно в карточке заказа.

**Важно:** каждый админ должен хотя бы раз нажать `/start` у бота — иначе Telegram не разрешит боту присылать ему уведомления.

### Жизненный цикл заказа

```
Новый ──(клиент выбрал способ оплаты)──▶ Ожидает оплаты ──(загрузил чек)──▶ Оплата на проверке
Оплата на проверке ──(подтвердили)──▶ Оплачен ──▶ Отправлен ──▶ Доставлен
Оплата на проверке ──(отклонили с причиной)──▶ Ожидает оплаты
Любой незавершённый ──▶ Отменён   (товар автоматически возвращается на склад)
```

Остатки списываются в момент оформления (атомарно, без гонок между покупателями) и возвращаются при отмене.

---

## Безопасность

- **initData проверяется на сервере** при каждом запросе: HMAC-SHA256 с ключом из `BOT_TOKEN` и проверка срока `auth_date` (`INIT_DATA_TTL`). Пользователь определяется только по подписанным данным; данные из тела запроса о «текущем пользователе» не принимаются. Тесты: `server/src/lib/initData.test.ts`.
- **Права админа** проверяются на сервере для каждого запроса к `/api/admin/*` (`ADMIN_IDS` + таблица `Admin`). Управлять списком админов может только владелец из `ADMIN_IDS`.
- **Валидация** всех входных данных — zod (общие схемы для клиента и сервера). SQL-инъекции исключены: доступ к базе только через Prisma.
- **helmet** (CSP, разрешено встраивание только в Telegram Web), **CORS** только для `WEBAPP_URL`, **rate limiting** (общий, на загрузку файлов и на создание заказов).
- **Файлы:** проверка типа и размера (до 10 МБ); изображения перекодируются sharp, поэтому подделать «картинку» не получится, а EXIF и геометки удаляются. Чеки лежат в закрытой папке и отдаются только по временной подписанной ссылке (1 час) владельцу заказа и админам.
- **Платёжные данные:** приложение хранит только реквизиты магазина в том виде, в каком их ввёл админ. Данные карт покупателей не запрашиваются и не хранятся.
- Все секреты в `server/.env`, который исключён из git.

---

## API

Все запросы — с заголовком `Authorization: tma <initData>`.

**Публичные** (`/api`):

| Метод | Путь | Описание |
|---|---|---|
| GET | `/me` | Профиль, `isAdmin` |
| POST | `/me/write-access` | Результат `requestWriteAccess` |
| GET | `/settings` | Настройки магазина и способы доставки |
| GET | `/categories` | Категории |
| GET | `/products?search&categoryId&sizes&colors&minPrice&maxPrice&sort&page` | Каталог |
| GET | `/products/filters?categoryId` | Доступные размеры, цвета, диапазон цен |
| GET | `/products/:id` | Товар |
| GET/POST/DELETE | `/cart` | Корзина / добавить / очистить |
| PATCH/DELETE | `/cart/:id` | Изменить количество / удалить |
| GET | `/payment-methods` | Активные реквизиты |
| GET/POST | `/orders` | Мои заказы / оформить |
| GET | `/orders/:id` | Заказ |
| POST | `/orders/:id/payment-method` | Выбрать способ оплаты |
| POST | `/orders/:id/receipt` | Загрузить чек (multipart, поле `receipt`) |
| POST | `/orders/:id/cancel` | Отменить |

**Админские** (`/api/admin`): `stats`, `products` (CRUD, `/:id/status`, `/:id/images`, `/:id/images/order`, `/:id/images/:imageId/main`), `categories` (CRUD, `/order`), `orders` (список с `counts`, `/:id`, `/:id/confirm-payment`, `/:id/reject-payment`, `/:id/status`, `/:id/note`), `payment-methods` (CRUD, `/order`), `delivery-methods` (CRUD, `/order`), `settings`, `admins`.

---

## Частые проблемы

| Симптом | Что проверить |
|---|---|
| «Откройте магазин в Telegram» в браузере | Задайте `DEV_TELEGRAM_ID` в `server/.env` (только для разработки). |
| «Подпись initData не совпадает» | `BOT_TOKEN` в `.env` от того же бота, через которого открыт магазин. |
| «initData устарела» | Mini App был открыт больше суток назад — закройте и откройте заново. |
| Белый экран в Telegram | `WEBAPP_URL` и URL в BotFather совпадают и начинаются с `https://`; туннель запущен. |
| Vite пишет «Blocked request. This host is not allowed» | Уже разрешено (`allowedHosts: true`); перезапустите `npm run dev`. |
| Бот не отвечает, в логах 409 Conflict | Бот запущен в двух местах (например, локально и на сервере) или остался webhook. Остановите лишний экземпляр. |
| Админ не получает уведомления | Админ должен нажать `/start` у бота. |
| Не видно админ-панели | Ваш ID в `ADMIN_IDS` (узнать: `/myid`), сервер перезапущен после правки `.env`. |
| `P1001: Can't reach database server` | Запущена ли база: `docker compose ps`; верен ли `DATABASE_URL`. |
| Ошибка при установке `sharp` | Обновите Node.js до 20+; на Linux без интернета для npm установите `libvips`. |

## Вход из обычного браузера

Магазин работает не только внутри Telegram, но и по прямой ссылке в браузере:
покупатель нажимает «Войти через Telegram», подтверждает вход — и дальше всё как в приложении
(корзина, заказы, админка). Паролей нет, сессия хранится 30 дней.

Чтобы вход работал, один раз укажите адрес магазина у @BotFather:
`/setdomain` → выберите бота → отправьте домен без https, например `velvet-shop.bothost.tech`.
