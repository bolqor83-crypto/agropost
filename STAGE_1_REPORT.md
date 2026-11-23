# Отчёт по этапу 1 — Поставщики, шаблоны культур, позиции

Дата: 2026-11-24 · Версия: 0.2.0 · Статус: **готов, проверено, задеплоено**

## Живые ссылки (прод)

| Что | URL |
|---|---|
| Веб-приложение (PWA) | https://agropost-web.onrender.com |
| API | https://agropost-api.onrender.com/api/health |
| База | Neon, проект `agropost` (org `bolqor`), ветка main |
| Репозиторий | https://github.com/bolqor83-crypto/agropost |

Деплой: push в `main` → Render собирает оба сервиса автоматически
(`autoDeploy` включён; при старте API применяет `prisma migrate deploy`).
Free-tier: API засыпает через ~15 минут бездействия, первый запрос ~30 сек.
Загрузка медиа заработает после добавления ключей R2 (env `agropost-api`).

> Примечание: репозиторий публичный, чтобы Render тянул код без настройки
> GitHub App (как bazar-deploy/agromoll-public). Чтобы закрыть: переведите
> репо в private и добавьте его в доступ приложения Render
> (GitHub → Settings → Applications → Render → Repository access).

## Что сделано

### 1. База данных (Prisma + PostgreSQL/Neon)

- Схема перенесена в `apps/server/src/prisma/schema.prisma` (по спеке этапа 1),
  конфиг CLI — `apps/server/prisma.config.ts` (замена deprecated `package.json#prisma`).
- Модели: `Supplier` (локация, схема отгрузки, телефон, заметки),
  `CultureTemplate` (тип семена/орех, `attributesSchema` JSONB — массив
  `{key, label, type, unit, required}`), `SupplierPosition` (плоский
  `attributes` JSONB `{key: value}`, `volumeKg`, `bagWeightKg`, `minLotKg`,
  Decimal-цены, **`salePrice` вычисляется и хранится**, статус, сертификат-флаг),
  `Media`, `Certificate`, `User` (налоговый режим).
- Миграция: `src/prisma/migrations/20261123210926_init/` — применена к Neon.
- Демо-сид из `shared/seed-data.ts`: 3 поставщика, 5 шаблонов культур,
  7 позиций (как в превью этапа 0), демо-фото — SVG data-URL (работают без R2).
  Сид идемпотентен: позиции создаёт только в пустую таблицу.

### 2. API (Fastify, `apps/server`, порт 3001)

| Метод | Маршрут | Примечание |
|---|---|---|
| GET/POST | `/api/suppliers` | список / создание |
| GET/PATCH/DELETE | `/api/suppliers/:id` | удаление блокируется, если есть позиции (409) |
| GET/POST | `/api/cultures` | шаблоны культур |
| GET/POST | `/api/positions` | фильтры: `type`, `cultureId`, `supplierId`, `status`, поиск `q` (культура или сорт) |
| GET/PATCH/DELETE | `/api/positions/:id` | PATCH пересчитывает `salePrice` на сервере |
| POST | `/api/positions/:id/media` | presigned PUT в R2, 15 минут, Content-Type в подписи |
| DELETE | `/api/positions/:id/media/:mediaId` | + best-effort удаление объекта |
| POST/DELETE | `/api/positions/:id/certificates[/:cid]` | PDF, тот же presigned-флоу |
| GET | `/api/user`, `/api/meta`, `/api/health` | профиль (налог), этапы, health |

- Валидация — zod; атрибуты позиций — `shared/attributes.ts#normalizeAttributes`
  (обязательные поля, проценты 0–100, годы 1990–2035, ключи вне шаблона отбрасываются).
- Единый формат ошибок `{ error: { code, message } }`; коды: `VALIDATION_ERROR`,
  `NOT_FOUND`, `CONFLICT`, `R2_NOT_CONFIGURED`, `DATABASE_UNAVAILABLE`, `INTERNAL`.
  Обработчик ошибок регистрируется **до** маршрутов (иначе Fastify отдаёт свой формат).
- Без ключей R2 всё приложение работает; загрузка файлов честно отвечает 503.

### 3. Фронтенд (`apps/web`, React 19 + Vite, TS strict)

Новые экраны и компоненты:

- `routes/SuppliersScreen.tsx` — список → карточка (Sheet: данные, «Позвонить»,
  удаление с подтверждением) → форма из 5 полей (название, локация, схема
  отгрузки, телефон, заметки).
- `routes/PositionsScreen.tsx` — фильтр «Все / Семена / Орехи» + поиск
  ( debounce 300 мс, уходят в API как `?type=` / `?q=`), статус-чипы,
  «Добавить позицию».
- `components/PositionDetailSheet.tsx` — карточка позиции: медиа-галерея,
  сертификаты, **сетка атрибутов по шаблону культуры**, экономика
  (закуп, наценка, цена продажи, выручка, налог, маржа после налога),
  **inline-редактирование остатка** (карандаш → ввод → PATCH → оптимистичное
  обновление), блок поставщика (только внутренние экраны), «Разместить».
- `components/PositionWizard.tsx` — мастер в 4 шага: поставщик+культура →
  атрибуты по шаблону → цена/объём (живой предпросмотр цены продажи,
  статус, сертификат-флаг) → медиа (выбор файлов; загрузка в R2 после
  создания позиции, при 503 — позиция сохраняется без медиа).
- `api/client.ts` — типизированный клиент: база `VITE_API_URL` →
  `NEXT_PUBLIC_API_URL` → относительный `/api` (в dev Vite проксирует
  `/api` на `:3001`); `ApiError` с кодом и сообщением.
- `stores/catalog.ts` — zustand-кэш каталога (поставщики, культуры,
  позиции, пользователь с налоговой ставкой).
- Пульт, «Разместить», «Сделки» и «Ещё» переведены с моков на API;
  разделы этапа 1 в «Ещё» активны.
- Расчёты маржи — из `shared/pricing.ts` (один источник для сервера и веба).

### 4. Превью Next.js (синхронизация, не дублирование)

- Превью рендерит **те же компоненты** `apps/web` (импорт `@agropost/web/*`
  из tsconfig-paths), а не копию этапа 0 (дубликат `src/components/agro/` удалён).
- Данные — мок-API на тех же маршрутах (`/api/suppliers`, `/api/positions`, …)
  поверх `shared/seed-data.ts`: те же фильтры, та же валидация атрибутов,
  тот же пересчёт salePrice и формат ошибок, in-memory с выживанием hot-reload.
- Токены Warm Utility в globals.css превью — те же значения, что в apps/web.

## Структура (изменения этапа 1)

```
agropost/
├── apps/
│   ├── web/src/
│   │   ├── api/client.ts            # НОВОЕ: типизированный клиент API
│   │   ├── stores/catalog.ts        # НОВОЕ: кэш каталога (zustand)
│   │   ├── components/
│   │   │   ├── SupplierSheet.tsx    # НОВОЕ: форма поставщика (5 полей)
│   │   │   ├── PositionDetailSheet.tsx # НОВОЕ: карточка позиции + inline-остаток
│   │   │   └── PositionWizard.tsx   # НОВОЕ: мастер создания, 4 шага
│   │   └── routes/
│   │       ├── SuppliersScreen.tsx  # НОВОЕ
│   │       └── PositionsScreen.tsx  # НОВОЕ
│   └── server/
│       ├── prisma.config.ts         # НОВОЕ: конфиг Prisma CLI
│       └── src/prisma/schema.prisma # ПЕРЕНЕСНО из prisma/ (миграции рядом)
├── shared/                          # типы, pricing, attributes, labels, seed-data
└── render.yaml                      # обновлён: R2_ENDPOINT/R2_PUBLIC_URL, VITE_API_URL
```

Удалено: моки `positions/suppliers/cultures.mock.ts`, `PositionSheet.tsx`,
`lib/margin.ts` (заменены API и `shared/pricing.ts`).

## Как проверить

### Локально (нужна база)

```bash
cd apps/server
cp .env.example .env            # DATABASE_URL (Neon) + PORT=3001
npm install
npm run db:dev                  # миграции
npm run db:seed                 # демо-данные
npm run dev                     # :3001

cd ../web
npm install
npm run dev                     # :5173, /api -> :3001 (vite proxy)
```

### Сборка (TS strict)

```bash
cd apps/web && npm run build    # tsc --noEmit && vite build (+PWA) — без ошибок
```

Проверено: `tsc --noEmit` чисто; сборка 406 kB JS (124 kB gzip).

### API (чек-лист 17 проверок — все PASS)

```bash
curl localhost:3001/api/suppliers        # 3 поставщика
curl localhost:3001/api/cultures         # 5 шаблонов
curl localhost:3001/api/positions        # 7 позиций
curl "localhost:3001/api/positions?type=NUT"      # 2 (орехи)
curl "localhost:3001/api/positions?status=ON_ORDER"  # 1
curl "localhost:3001/api/positions?q=Вега"        # 1 (поиск по сорту)
curl -X PATCH localhost:3001/api/positions/pos-1 \
     -H "Content-Type: application/json" -d '{"volumeKg": 2800}'   # inline-остаток
curl -X POST localhost:3001/api/positions/pos-1/media \
     -H "Content-Type: application/json" \
     -d '{"type":"PHOTO","contentType":"image/jpeg"}'  # 503 R2_NOT_CONFIGURED
```

Контрольные числа: `salePrice` поз. 1 = 185 × 1.15 → **213 ₽/кг**;
маржа с остатка 3000 кг = 639 000 − 555 000 − 38 340 (6%) = **45 660 ₽**.

### UI-проверка превью

Пройдено в браузере: Пульт (позиции из API) → Ещё → Поставщики (карточка,
форма) → Позиции (фильтр «Орехи» → 2, поиск «донская» → 1) → карточка
(атрибуты, 6 фото, сертификат, экономика) → inline-остаток 3000 → 2700 → 3000
(PATCH 200) → мастер 4 шагов → создана позиция «Память» (132 ₽/кг) → удалена.
В черновике объявления имя поставщика отсутствует (white-label) —
только «Краснодарский край». Ошибок консоли нет.

## Решения и ограничения

1. **Плоский JSONB** `{key: value}` у позиции; подписи/типы/порядок — в
   `attributesSchema` шаблона. Смена шаблона не ломает старые позиции (UI
   покажет «—» для незаполненных ключей).
2. **Медиа**: presigned PUT с клиента (15 мин), CORS-политика бакета — в README.
   Без R2 — 503 и позиция сохраняется без медиа (можно добавить позже).
3. **Seed один** — `shared/seed-data.ts`: и для `prisma/seed.ts`, и для мок-API
   Next-превью (те же данные, что в проде).
4. Сертификаты: модель, API и отображение готовы; загрузка PDF-файлов появится
   вместе с настройкой R2 (кнопки загрузки в UI этапа 1 не включает — по спеке
   мастер заканчивается медиа).
5. Экран «Позиции» ходит в API с фильтрами напрямую; Пульт/«Разместить»/«Сделки»
   используют кэш каталога, обновляемый после мутаций.
6. Известная особенность песочницы: `DATABASE_URL` из окружения может
   перекрывать `.env` (dotenv не переопределяет существующие переменные) —
   локально задавайте переменную явно или чистите окружение.

## Границы этапа (что НЕ входило)

Парсер (2.5), каналы (2), генератор объявлений и ИИ (3), сделки/документы (4) —
замок на этапе «Ещё» показан честно. Telegram-бот не подключается.
