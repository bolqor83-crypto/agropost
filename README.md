# АгроПост

PWA «тихий помощник» для white-label посредника по торговле семенами трав
и грецким орехом. Один пользователь, без ролей. Главное действие — «Разместить».

- Полное ТЗ: [BRIEF.md](./BRIEF.md) — источник правды для всех этапов.
- Отчёт по этапу 1: [STAGE_1_REPORT.md](./STAGE_1_REPORT.md).
- Дизайн-система: «Warm Utility» (см. раздел 8 BRIEF.md).

## Статус: этап 1 из 6 — готов

| Этап | Что внутри | Статус |
|---|---|---|
| 0. Фундамент + визуал | Каркас PWA, дизайн-система, 4 экрана, демо-данные | **готов** |
| 1. Поставщики и позиции | Справочник, шаблоны культур, JSONB-атрибуты, медиа | **готов** |
| 2. Каналы | Полный каталог, мультиаккаунты | — |
| 2.5. Парсер | Агросервер + Telegram, обезличенно | — |
| 3. ИИ + размещение | OpenRouter, grammY-бот, deep links | — |
| 4. Сделки и документы | Калькулятор доставки, маржа, PDF | — |
| 5. ИИ-ассистент | «Что сделать сейчас?», аналитика | — |

В этапе 1 реализовано:

- **База (Neon + Prisma)**: Supplier, CultureTemplate (атрибутная схема в JSONB),
  SupplierPosition (плоский JSONB-атрибуты, Decimal-цены, вычисляемый salePrice),
  Media, Certificate, User. Миграция + демо-сид: 3 поставщика, 5 культур, 7 позиций.
- **API (Fastify, :3001)**: CRUD `/api/suppliers`, `/api/cultures`, `/api/positions`
  с фильтрами (тип, культура, поставщик, статус) и поиском `?q=` (культура или сорт);
  presigned-загрузка медиа и сертификатов в R2 (15 минут); zod-валидация;
  единый формат ошибок `{ error: { code, message } }`.
- **Экраны (apps/web)**: «Поставщики» (список → карточка → форма из 5 полей),
  «Позиции и остатки» (фильтр Семена/Орехи + поиск; карточка с сеткой атрибутов
  по шаблону культуры, медиа-галереей, сертификатами и экономикой с маржой
  после налога), мастер создания позиции в 4 шага, inline-редактирование остатка.
- **Общая математика**: `shared/pricing.ts` — цена продажи и маржа считаются
  одинаково на сервере, в вебе и в превью.
- Пульт, «Разместить» и «Сделки» переведены с моков на API.

## Структура монорепо

```
agropost/
├── apps/
│   ├── web/                  # React 19 + Vite + TS strict + Tailwind v4 + PWA
│   │   └── src/
│   │       ├── app/          # App, router, globals.css
│   │       ├── routes/       # Pult, Publish, Deals, More, Suppliers, Positions
│   │       ├── components/   # ui.tsx, layout/, SupplierSheet, PositionDetailSheet,
│   │       │                 # PositionWizard (4 шага)
│   │       ├── features/     # channels, deals (моки этапов 0/2/4), listings
│   │       ├── stores/       # zustand: catalog (API), publish-поток, тосты
│   │       ├── lib/          # format.ts
│   │       └── api/          # client.ts (типизированный клиент), types.ts
│   └── server/               # Node + Fastify + Prisma
│       ├── prisma/seed.ts    # демо-данные из shared/seed-data.ts
│       ├── prisma.config.ts
│       └── src/
│           ├── prisma/schema.prisma
│           └── routes/       # health, meta, suppliers, cultures, positions,
│                           #   media (R2 presigned), user
├── shared/                   # контракт API: types, pricing, attributes, labels,
│                             #   seed-data (общий для сервера и превью)
├── services/
│   └── parser/               # Python FastAPI + Telethon + selectolax (этап 2.5)
├── tools/
│   └── make_icons.py         # генератор PWA-иконок
├── BRIEF.md                  # полное ТЗ
├── render.yaml               # Blueprint для Render (web + api)
└── README.md
```

Каждое приложение standalone (без npm-workspaces) — так проще собирать
на Render из `rootDir` и не тащить лишнее. `shared/` подключается алиасом
`@shared/*` (vite alias / tsconfig paths / tsx).

## Локальный запуск

### База (Neon)

1. Заведите проект на [neon.tech](https://neon.tech), скопируйте connection string.
2. `cd apps/server && cp .env.example .env`, вставьте `DATABASE_URL`.

### Сервер (apps/server)

```bash
cd apps/server
npm install
npm run db:dev        # prisma migrate dev — создать/применить миграции
npm run db:seed       # демо-данные (3 поставщика, 5 культур, 7 позиций)
npm run dev           # http://localhost:3001/api/health
```

### Фронтенд (apps/web)

```bash
cd apps/web
npm install
npm run dev           # http://localhost:5173 — /api проксируется на :3001
```

Сборка и предпросмотр продакшен-версии:

```bash
VITE_API_URL=https://agropost-api.onrender.com/api npm run build
npm run preview
```

Без `VITE_API_URL` сборка ходит на относительный `/api` (для reverse-proxy).

### Иконки

```bash
pip install pillow
python3 tools/make_icons.py
```

## Деплой (только бесплатные tier'ы)

1. **GitHub**: создайте новый репозиторий `agropost` (существующие проекты
   не трогаем) и запушьте этот каталог:
   ```bash
   git init && git add . && git commit -m "Этап 1: поставщики и позиции"
   git remote add origin git@github.com:ВАШ_ЛОГИН/agropost.git
   git push -u origin main
   ```
2. **Neon**: проект `agropost` → connection string в env `agropost-api`.
   Один раз примените миграции и сид локально:
   `DATABASE_URL="..." npm run db:migrate && DATABASE_URL="..." npm run db:seed`
   (Render при деплое тоже выполняет `prisma migrate deploy`).
3. **Render** → New → Blueprint → выберите репозиторий `agropost`.
   Render прочитает `render.yaml` и создаст два сервиса:
   - `agropost-web` (Static Site — не спит; `VITE_API_URL` уже в yaml);
   - `agropost-api` (Web Service, free tier — спит через 15 минут бездействия,
     первый запрос после сна ~30 сек; для MVP терпимо).
   В переменные `agropost-api` вставьте `DATABASE_URL` из Neon.
4. **Cloudflare R2** (медиа и сертификаты): отдельный бесплатный аккаунт,
   бакет `agropost-media`, ключи — в env `agropost-api` (см. раздел ниже).
5. **OpenRouter** (этап 3, ИИ): ключ пользователя, только на бэкенде.

Проверка после деплоя: `https://agropost-api.onrender.com/api/health` →
`{"ok":true,...}`; `https://agropost-web.onrender.com` → Пульт с позициями из БД.

## R2 и CORS

Медиа грузятся **из браузера напрямую в R2** по presigned PUT-ссылке
(живёт 15 минут, Content-Type зашит в подпись). Для этого бакет должен
принимать CORS-запросы с домена статики. В настройках бакета
(R2 → agropost-media → Settings → CORS policy) вставьте:

```json
[
  {
    "AllowedOrigins": ["https://agropost-web.onrender.com", "http://localhost:5173"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

Переменные окружения сервера: `R2_ENDPOINT` (S3-эндпоинт аккаунта),
`R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL`
(публичный домен бакета, например `https://pub-xxxx.r2.dev`).

Без настроенного R2 приложение полностью работает, а эндпоинты загрузки
честно отвечают `503 R2_NOT_CONFIGURED` — медиа можно добавить позже.

## Непреложные правила

- **White-label**: покупатель не видит поставщика — ни в объявлениях,
  ни в ответах ИИ, ни в документах. Внутренние экраны — исключение.
- **Anti-ban**: автопостинг только в свои каналы через бота; чужие чаты
  и Авито — полуавтомат (текст + deep link + отметка «размещено»).
- **Парсер**: только обезличенные цены/названия/ссылки, без телефонов и ФИО.
- Предоплату не берём: отправка только после полной оплаты.
- Доставку оплачивает покупатель — в маржу не входит.
- Все секреты — в `.env`; в репозитории только `.env.example`.
