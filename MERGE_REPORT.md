# MERGE_REPORT — мерж ветки этапа 5.1/5.2 в main и подготовка к деплою

Дата: 2026-11-24
Мерж: `fix/stage-5-1-security-analytics` → `main` (репозиторий `bolqor83-crypto/agropost`)

## 1. Что мержилось и как

- Ветка: `fix/stage-5-1-security-analytics`, последний коммит `4484c5a`
  («docs: отчёт этапа 5.2 — независимый release-аудит, статус READY FOR STAGING»).
- `main` на момент мержа: `c4325a0` — совпадал с точкой ветвления
  (0 уникальных коммитов после ответвления).
- **Выбран fast-forward**: `git merge --ff-only` — main просто переместился
  `c4325a0 → 4484c5a`. Это чище merge-коммита: история остаётся линейной,
  конфликтов не было и не могло быть, SHA коммитов этапа сохранены
  (в т.ч. `ad7a2e5` — исправление двух критических дефектов аудита).
- Итог: **`main = 4484c5a6bc7a3f42fb72f9dbcbb7660d41cda4ae`**, запушено
  (`c4325a0..4484c5a main -> main`). Ветка `fix/...` в репозитории осталась
  (не удалялась — решение за владельцем).

Гигиена diff перед мержем (78 файлов, +5222/−918):

- `.env`, секретов, ключей в diff нет — проверено сканом паттернов токенов
  (GitHub PAT / OpenRouter / Neon / Render / Cloudflare / Telegram) по полному diff — чисто.
- Из «env»-файлов менялись только `.env.example` (плейсхолдеры, значения пустые).
- Ни одного бинарника/артефакта; main до мержа не содержал стадийных изменений.

## 2. Тесты после мержа (на `4484c5a`)

| Компонент | Команда | Результат |
|---|---|---|
| server | `bun test src/ai src/telegram src/deals src/documents src/analytics src/auth` | **180 pass / 0 fail** (665 expect, 19 файлов, 12.25s) |
| web (юнит) | `bun test src/lib` | **13 pass / 0 fail** (33 expect) |
| web (сборка) | `npm run build` | OK: `tsc --noEmit` чисто, `vite build` OK, PWA SW сгенерирован (precache 8 entries) |
| parser | `pytest` (без DATABASE_URL) | **39 pass / 2 skipped** (2 — интеграционные с базой, designed-to-skip) |

Пояснение по парсеру: при первом прогоне в песочнице 2 интеграционных теста
падали с `socket.gaierror` — глобальный мусорный `DATABASE_URL` песочницы
(указывает на неразолваемый хост) заставил тесты пытаться подключаться к базе.
С `env -u DATABASE_URL` тесты корректно пропускаются, остальные 39 — зелёные.
**Кода это не касается**: на CI/проде без лишней переменной поведение идентично
предыдущим прогонам (этап 5.2, 41/41 в аудите при том же наборе).

## 3. Репетиция миграций на КОПИИ прод-базы (Neon)

Прод не трогался: база читалась только через копию. Действия в Neon API —
только для проекта `agropost` (`blue-credit-73280517`): чтение списка веток
и создание/удаление временной ветки. Изменений на ветке `main` (прод) — нет.

### 3.1 Сценарий

1. Прод-ветка Neon: `main` (`br-orange-union-be1q3aei`) — primary, в проекте
   две базы: `agropost` (владелец — роль `agropost`) и `neondb` (дефолтная).
   **Прод-база приложения — `agropost`.**
2. Создана временная ветка `temp-migration-rehearsal` (copy-on-write снимок
   прода на LSN `0/40BC370`) + read-write endpoint. Пароли ролей сброшены
   только на временной ветке (у Neon пароли ролей на каждой ветке свои —
   прод-пароли не менялись).
3. `prisma migrate deploy` гонялся против копии; после — сверка состояния,
   диф со схемой, повторный прогон (идемпотентность), живой запрос Prisma Client.
4. Временная ветка **удалена** (проверено: в проекте осталась только `main`).

### 3.2 Состояние ДО (копия прода = реальное состояние прод-базы)

Применённые миграции (таблица `_prisma_migrations`): `20261123210926_init`,
`20261123230036_stage2…`, `20261124131643_stage4…` — 3 из 6.
Ожидающие: `20261124000000_stage32_schema_baseline`,
`20261125090000_stage51…`, `20261125120000_stage52…`.

Данные на проде (счётчики, 20 таблиц): Account 2, **AiCall 184**, Carrier 6,
Certificate 3, Channel 20, CultureTemplate 5, Listing 1, Media 30,
SupplierPosition 7, Supplier 3, User 1, Lead 1, Message 1; пустые: Claim 0,
Deal 0, Document 0, Shipment 0, CompetitorPrice 0, BotConfig 0.

Колонки `Channel.city`, `Listing.publishedCount`, `Listing.url` на проде есть
(появились через `db push`) — stage52 их добавляет `IF NOT EXISTS`, на проде тихо пропустится.

### 3.3 Важная находка: роль в DATABASE_URL имеет значение

Первый прогон `migrate deploy` от роли `neondb_owner` (дефолтная строка
подключения проекта) упал с **P3018, `permission denied for schema public`**:
база `agropost` принадлежит роли `agropost`, `neondb_owner` в ней не владелец
и не имеет CREATE на схеме `public`.

От роли `agropost` всё применяется чисто. Вывод для деплоя: **в Render
`DATABASE_URL` должна быть строка на базу `agropost` от роли `agropost`**
(`postgresql://agropost:•••@…/agropost?sslmode=require`), иначе
`npx prisma migrate deploy` в startCommand упадёт с той же ошибкой.
(Если до этого этапа деплой с этой переменной уже работал — там уже правильная роль.)

### 3.4 Прогон и результаты

`npx prisma migrate deploy` (роль `agropost`, pooled endpoint):

- применены: `20261124000000_stage32_schema_baseline`,
  `20261125090000_stage51_auth_attribution_analytics`,
  `20261125120000_stage52_history_integrity` — **без ошибок**;

Состояние ПОСЛЕ:

| Проверка | Результат |
|---|---|
| `prisma migrate status` | «Database schema is up to date!» — 6/6 миграций |
| `prisma migrate diff` (копия → schema.prisma) | **пустой diff — 0 расхождений** |
| Повторный `migrate deploy` | «No pending migrations to apply» — идемпотентно |
| Таблицы | 22 (+`LeadTouch`, +`OwnerSession`), данные целы |
| Счётчики данных | идентичны «до» по всем 20 таблицам (Account 2, AiCall 184, Channel 20, Media 30 …) |
| `Deal` | +8 колонок: `closedAt`, `deliveryToTerminalCost`, `itemAttributes`, `itemCulture`, `itemName`, `shippingMode`, `supplierLocation`, `supplierName` |
| `Channel` | +3 индекса: `Channel_submissionMethod_idx`, `Channel_audienceType_idx`, `Channel_mirrorOf_idx` |
| `Channel.city / Listing.publishedCount / Listing.url` | на месте (stage52 `IF NOT EXISTS` — тихо пропущено) |
| Живой запрос Prisma Client | OK: `Channel: 20, AiCall: 184, Account: 2`; выборка `Channel {city:"Новочеркасск", submissionMethod:"ADMIN_CONTACT", audienceType:"B2B"}` — реальные прод-данные читаются через поля, объявленные baseline |

Вывод: **миграции готовы к деплою**. На проде применятся те же 3 миграции
(в startCommand Render при первом деплое) — сценарий воспроизведён на точной
копии прод-данных, деструктивных операций нет, данные не теряются.

## 4. Чек-лист деплоя (ручного, через dashboard Render)

### 4.1 Коммит для деплоя

**`4484c5a`** (полный: `4484c5a6bc7a3f42fb72f9dbcbb7660d41cda4ae`) — текущий
`origin/main`. Деплоить оба сервиса именно с него.

### 4.2 Переменные Render → `agropost-api` (Environment)

Обязательные для этого релиза (новые):

| Переменная | Значение | Комментарий |
|---|---|---|
| `OWNER_LOGIN` | например `agropost` (дефолт из render.yaml) | логин владельца для входа |
| `OWNER_PASSWORD_HASH` | строка `$argon2id$…` | см. генерацию ниже |
| `TRUSTED_ORIGINS` | `https://agropost-web.onrender.com` | доверенные origin для CORS/CSRF; несколько — через запятую |
| `OPENROUTER_API_KEY` | ключ OpenRouter (`sk-or-v1-…`) | резервный AI-канал; старое имя `OPENROUTER_KEY` тоже поддерживается, но задавать новое |

Уже должны быть заданы (проверить существование): `DATABASE_URL` (роль
`agropost`, база `agropost` — см. §3.3), `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_USER_ID`, при желании `AI_PROVIDER` (`glm` — дефолт) и `GLM_API_KEY`
(тогда OpenRouter — автоматический резерв), `PARSER_URL`/`PARSER_SECRET`
(парсер выключен, необязательно), R2-переменные (медиа).

**Генерация хеша пароля (локально, на любом компьютере с Node 22+):**

```bash
git clone https://github.com/bolqor83-crypto/agropost && cd agropost
cd apps/server
npm install            # подтянет @node-rs/argon2
npx tsx scripts/hash-password        # интерактивный скрытый ввод пароля
# ИЛИ одной строкой (осторожно: пароль останется в истории шелла):
# npx tsx scripts/hash-password -- "ваш-пароль"
```

Вывод — строка `$argon2id$…` → вставить в `OWNER_PASSWORD_HASH` и
перезапустить сервис. Без хеша логин честно отвечает 503 и приватные маршруты
закрыты (fail-closed) — сервис при этом поднимается, публичные health/meta работают.

### 4.3 Нужно ли трогать `agropost-web`? — ДА, передеплоить

В мерже есть изменения веба: экран логина (`LoginScreen`), честный logout с
уничтожением сессии (`lib/logout.ts`), фиксы API-клиента (cookies,
Content-Type), CSV-экспорт, правки аналитики. Старая статика не умеет вход:
после обновления API приватные маршруты требуют сессию, и устаревший фронт
начнёт получать 401. В Render → `agropost-web` → Manual Deploy → Deploy
latest commit (`4484c5a`). Меняется только статика — сборка та же
(`npm run build`), новая env для web не нужна (`VITE_API_URL` уже задан).

Порядок: сначала `agropost-api` (миграции применит startCommand), затем
`agropost-web`. Между ними несколько минут API будет требовать авторизацию,
которую старый фронт не проходит — это нормально и не портит данные.

### 4.4 Проверки после деплоя

```bash
API=https://agropost-api.onrender.com
curl -s $API/api/health          # {"ok":true,...} — сервис жив
curl -s $API/api/meta | head -c 200
#   ожидание: "version":"0.8.0","stage":5, все stages:true

# Вход (проверить 200 + Set-Cookie httpOnly; пароль — ваш из хеша):
curl -i -X POST $API/api/auth/login -H 'Content-Type: application/json' \
  -d '{"login":"agropost","password":"ваш-пароль"}'

# С приватным маршрутом (куки из логина) + AI через OpenRouter:
curl -s -X POST $API/api/ai/advice -H 'Content-Type: application/json' \
  -b 'agropost_session=…' -d '{"leadId":…}' | rg 'provider'
#   ожидание: "provider":"openrouter", когда GLM не задан/недоступен
#   (AI_PROVIDER=glm: primary=GLM если GLM_API_KEY задан, иначе сразу OpenRouter)
```

Дополнительно глазами в браузере: вход на https://agropost-web.onrender.com,
разделы сделок/аналитики, выход — и повторный вход по прямой ссылке в приватный
раздел должен перенаправлять на логин (сессия реально убита — дефект D1 закрыт).

## 5. Итог

- Мерж выполнен и запушен: `main = 4484c5a`.
- Все тесты после мержа зелёные (180 + 13 + 39, parser 2 skip by design).
- Миграции проверены на точной копии прод-базы: 3 новые миграции применяются
  чисто, данные целы, идемпотентно, 0 расхождений со схемой.
- Прод не трогался: деплой — вручную владельцем по чек-листу §4.
- Статус: **ГОТОВО К РУЧНОМУ ДЕПЛОЮ** (после деплоя — smoke-проверки §4.4).
