# Отчёт по этапу 3.2 — Telegram-бот, инбокс, автопостинг

Дата: 2026-11-24 · Версия API: **0.6.0** · Прод: agropost-web.onrender.com (live)

## Что сделано

Три связанных блока этапа 3.2: **(B)** бот-приёмщик вопросов покупателей,
**(C)** инбокс с AI-черновиками ответа, **(D)** автопостинг в свои каналы
(там, где наш бот — администратор), **(F)** уведомления владельцу.
Транспорт — grammY webhook (обновление при każdym push в прод ставится
автоматически). AI-слой этапа 3.0 не менялся — только потреблялся.

### Часть B — бот-приёмщик (`apps/server/src/telegram/`)

```
apps/server/src/telegram/
├── index.ts       — сборка модуля: grammY Bot, конфиг, кэш getMe
├── config.ts      — env: TELEGRAM_BOT_TOKEN/USER_ID/WEBHOOK_URL/SECRET/WEB_URL
│                    webhook-URL выводится из RENDER_EXTERNAL_URL;
│                    секрет = sha256("agropost:"+token)[:32] — стабилен между рестартами
├── api.ts         — тонкий клиент Bot API поверх grammY (TgApi, подменяется в тестах)
├── db.ts          — prismaTelegramDb: узкий интерфейс БД для модуля
├── update.ts      — роутер апдейтов: /start, команды (молча), message, callback_query
├── handlers/
│   ├── start.ts   — deep link t.me/{bot}?start=pos_{id}: позиция+цена, привязка лида
│   ├── message.ts — лид по externalId или reply-привязке, дедупликация ретраев,
│   │                авто-ack «Спасибо за сообщение!…», interest без AI (регекс культур)
│   └── callback.ts — answerCallbackQuery
├── notifier.ts    — уведомления владельцу: троттлинг 60 с, склейка в дайджест,
│                    кнопка «Открыть инбокс» (deep link на web)
├── interest.ts    — культура + класс качества из текста (без AI)
├── publish.ts     — публикация в свой канал (см. часть D)
├── reply.ts       — AI-черновик ответа лиду (потребляет /api/ai/reply)
└── types.ts       — контракты: TelegramConfig, TgApi, TelegramDb, TelegramDeps
```

Вебхук: `POST /api/telegram/webhook` — проверка заголовка
`X-Telegram-Bot-Api-Secret-Token`; при ошибке всё равно **200** (иначе
Telegram ретраит бесконечно). Владелец, пишущий боту — не лид: получает
подсказку «управление — в инбоксе». Группы не обрабатываются. SPAM/CLOSED
лиды не уведомляют владельца.

### Часть C — инбокс (лиды) в БД и API

Prisma (db push на Neon применён):

```
Lead     — source(TELEGRAM_BOT/TELEGRAM_CHAT/AVITO/MANUAL), externalId, externalUsername,
           name, phone, region, interest, status(NEW/IN_PROGRESS/ANSWERED/CLOSED/SPAM),
           positionId?, notes; unique [source,externalId], индексы source/status
Message  — leadId FK, direction INBOUND/OUTBOUND, text, sentAt, aiGenerated,
           aiCallId (без FK — AI-слой не трогаем), telegramMessageId
           unique [leadId, telegramMessageId] (дедупликация ретраев webhook)
BotConfig — channelId unique, telegramChatId — «канал, где бот — админ»
Listing  — + url String? (ссылка на пост, запоминается после публикации ботом)
```

Роуты (`apps/server/src/routes/`):

- `GET /api/leads` — фильтры status/source/q (поиск по полям), превью
  последнего сообщения, сортировка updatedAt desc, take 200
- `GET /api/leads/:id` — карточка с полной перепиской
- `PATCH /api/leads/:id` — статус, заметка, интерес, позиция (валидация позиции)
- `POST /api/leads/:id/reply` — два режима:
  - `useAi:true` (без text) — черновик: `composeLeadDraft` вызывает
    `/api/ai/reply` с историей (INBOUND→buyer, OUTBOUND→seller); лид без
    позиции — вежливый шаблон, честный meta fallback; нет входящих — приветствие
  - `text` — отправка ботом (только Telegram-лиды с externalId),
    Message OUTBOUND + telegramMessageId + aiGenerated, статус ANSWERED
    (SPAM/CLOSED не трогаются)
- `GET /api/telegram/status` — бот (getMe), webhook (getWebhookInfo),
  новые лиды, лиды за сегодня, свои каналы из BotConfig
- `POST /api/telegram/setup-webhook` — ручная переустановка (например, после сбоя)
- `POST /api/telegram/publish` — публикация черновика ботом (см. часть D)

### Часть D — автопостинг в СВОИ каналы

`publishListingViaBot` (`publish.ts`):

1. Адрес канала: BotConfig.telegramChatId (уже проверенный) либо @username
   из ссылки канала (t.me/name, t.me/s/name, @name — регекс исправлен в тестах)
2. `getChat` → канал должен существовать, иначе 400 CHAT_NOT_FOUND
3. `getChatMember(botId)` → **только administrator/creator**, иначе
   **403 BOT_NOT_ADMIN** + уведомление владельцу. Чужие чаты не трогаем.
4. Анти-бан: не более одной публикации в канал за 24 ч (без `confirm:true` — 409)
5. Пауза 2,5 с между публикациями (глобальная, модульная память)
6. Аудитория <1000 подписчиков — предупреждение, но публикуем
7. Текст: HTML-escape, первая строка жирная, в конце
   «📩 Задать вопрос продавцу: t.me/{bot}?start=pos_{positionId}» —
   вопрос покупателя автоматически привязывается к позиции (white-label)
8. URL поста: t.me/{username}/{msg_id} или t.me/c/{internal}/{msg_id};
   Listing → PUBLISHED с url, upsert BotConfig, bump аккаунта канала

Публикация — только по кнопке в мастере (шаг 3). Без cron и отложенных постов.

### Часть F — уведомления владельцу

`OwnerNotifier`: первое сообщение уходит сразу, следующие в течение минуты
склеиваются в дайджест («💬 2 новых сообщения: • @ivan: … • @anna: …»),
кнопка «Открыть инбокс». Ошибка публикации — прямой тост «⚠️ Не удалось
опубликовать в «Канал»: причина». Очередь в памяти процесса — на free tier
допустимо: данные живут в БД, уведомление лишь «подпрыгивает».

### UI (`apps/web`)

- **Инбокс** (`InboxScreen`): фильтры Все/Новые/В работе/Отвечен/Спам +
  поиск (имя, интерес, текст); строка: аватар-инициал, имя/@username,
  превью последнего сообщения («Вы: …»), бейдж нового/отвечен/спам, время
- **Карточка лида** (`LeadDetailSheet`): чат (входящие слева, исходящие
  справа, «AI» у генерированных), «Черновик AI» → POST useAi → редактирование
  → «Отправить»; кнопки «Спам»/«Закрыть»/«В работу», заметка (по blur),
  мини-карточка позиции, мета AI (модель, латентность или «Шаблон»)
- **Telegram-бот** (`TelegramBotScreen`): статус подключения, webhook
  (кнопка переустановки), новые лиды, свои каналы, «как это работает»
- **Пульт**: бейдж «Новые: N» в шапке (из /api/telegram/status)
- **Мастер публикации, шаг 3**: для каналов, где наш бот — админ
  (submissionMethod=BOT и submissionBotUsername совпадает с нашим ботом),
  кнопка «Через бота» вместо ручного «Размещено»: бот публикует сам,
  появляется ссылка «Открыть в Telegram»; 409 → «нажмите ещё раз для
  подтверждения» → confirm:true; ошибки → тост, рядом остаётся fallback-кнопка
  «Открыть @канал»
- **Ещё**: разделы «Инбокс» и «Telegram-бот» открыты (этап 3.2)

### Превью (песочница, не в git agropost)

Те же экраны из монорепо (`@agropost/web/*`), мок-API поверх seed-данных:
5 демо-лидов с перепиской (новые с вопросом цены, в работе, отвеченный,
спам), свой канал «АгроПост — свой канал» с ботом-админом. **AI в превью —
реальный GLM** через шлюз песочницы (`glm-4.5-air`, без ключей, скрыт от
клиента): `/api/ai/*` и черновики лида собираются моделью по фактам
позиции с фолбэком на шаблоны при любой ошибке.

## Тесты (`bun test src/telegram` — 36 тестов, все зелёные)

Фейк Bot API поверх интерфейсов (без живого бота): MemoryDb поверх массивов
+ FakeApi + FakeNotifier (`__tests__/fixtures.ts`).

- `handlers.test.ts` (14): покупатель → Lead+Message+авто-ack+уведомление;
  дубликат ретрая webhook → одна запись; владелец → без лида, подсказка;
  reply на наше сообщение → тот же лид; SPAM — без уведомления и ack;
  группа — игнор; /start с pos_ → позиция+цена в ответе; /start владельца —
  статус; /stop — молча; извлечение интереса (культура/класс/null)
- `publish.test.ts` (11): бот-админ → PUBLISHED+url+BotConfig+bump+HTML с
  жирной первой строкой и deep link; не админ → 403 BOT_NOT_ADMIN+уведомление;
  24 ч → 409 без confirm, проходит с confirm; малая аудитория → предупреждение;
  нет черновика → 404; ссылка без @username → 400. **Тесты поймали реальный
  баг** регекса t.me/имя (требовал лишний слэш) — исправлен
- `notifier.test.ts` (5): первое — сразу с кнопкой; склейка дайджеста при
  flush; обрезка длинного текста; publishError напрямую; api=null — не падает
- `reply.test.ts` (4): с позицией — история уходит в generateReply
  (buyer/seller); без позиции / без сообщений — честный fallback; 404
- `config.test.ts` (3): секрет детерминирован; webhookURL из
  RENDER_EXTERNAL_URL; без env — бот не настроен

`npx tsc --noEmit` — чисто; `bun test src/ai src/telegram` — 65/65.
Веб: tsc чисто, vite build OK.

## Прод (проверено после деплоя, 2026-11-24)

Деплой: `2bafe18` → api `dep-dc2o9vk9v7es73d7cbhg` (live), web
`dep-dc2o9vks728c73b69i6g` (live). Env api-сервиса: TELEGRAM_BOT_TOKEN,
TELEGRAM_USER_ID (заданы ещё на 3.0), DATABASE_URL.

- `GET /api/meta` → `{"version":"0.6.0","stage":3.2,"bot":true}` ✔
- `GET /api/health` → `{"ok":true,"stage":3.2}` ✔
- `GET /api/telegram/status` → configured, бот **@aylatica_sales_bot**,
  webhook установлен при старте, 0 в очереди ✔
- `api.telegram.org/getWebhookInfo` → url
  `https://agropost-api.onrender.com/api/telegram/webhook`,
  allowed_updates [message, callback_query] ✔
- **Синтетический апдейт** в прод-webhook с верным секретом → `{"ok":true}`;
  лид создан (source TELEGRAM_BOT, interest «Люцерна» извлечён из текста,
  status NEW, INBOUND Message) ✔ — владелец получил уведомление в Telegram
- `GET /api/leads` → список с превью ✔
- `POST /api/leads/:id/reply` useAi: без позиции — шаблон с честным
  предупреждением; после PATCH positionId=pos-1 — AI-слой отработал свой
  fallback с реальными фактами («Цена — 213 ₽/кг при минимальной партии
  от 1 500 кг…», warning «AI недоступен — использован шаблон.») ✔
- `PATCH /api/leads/:id` — статус/заметка/позиция; тестовый лид закрыт с
  пометкой «Синтетический тест webhook этапа 3.2» ✔
- Web: https://agropost-web.onrender.com — сборка содержит инбокс/экран
  бота/мастер с «Через бота» ✔

## Ограничения соблюдены

- НЕ тронуты: AI-слой (3.0 — только потреблялся), парсер (2.5 закрыт),
  сделки (этап 4), чужие чаты (публикация только в каналы, где бот — админ),
  R2-медиа (текстовый прогон).
- Публикация только по кнопке; без cron, без отложенных постов.
- Инбокс хранит ВСЕ сообщения; статусы NEW/IN_PROGRESS/ANSWERED/CLOSED/SPAM.
- Секрет webhook детерминирован от токена — спящий free-инстанс после
  рестарта не теряет валидацию заголовка.
- Токен бота только в env бэкенда; в git и клиент не попадает.

## Что дальше

1. **Канал в прод**: добавить свой канал в «Каналы» (ссылка t.me/…),
   добавить @aylatica_sales_bot админом — появится кнопка «Через бота»
   в мастере (канал из BotConfig появится после первой публикации).
2. **GLM-ключ на Render** — AI-черновики в инбоксе оживут без деплоя
   (сейчас честный fallback с фактами позиции).
3. Реальный трафик: покупатель жмёт «Задать вопрос продавцу» под
   объявлением → вопрос в инбокс → уведомление → «Черновик AI» → «Отправить».
4. Этап 4: сделки и документы.
