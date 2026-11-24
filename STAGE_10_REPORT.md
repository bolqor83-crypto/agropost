# ЭТАП 10 — MAX Bot API + userbot для чтения чужих Telegram-чатов

Дата: 2026-11-25 · Коммит: `f251eec` (main) · Предыдущий этап: `b768b9f`

## Итог

| Метрика | Значение |
|---|---|
| Тесты сервера (bun) | **283/0** (было 253, +30) |
| Тесты web (bun) | **47/0** (было 40, +7) |
| Тесты userbot (pytest) | **12/12** (новый сервис) |
| Браузерный аудит | **142/142** (108 регрессия этапа 9 + 34 новых) |
| tsc --noEmit (server) | чисто |
| npm run build (web) | чисто |

## Ответы на 2 вопроса (по праву «выбирай сам»)

1. **MAX Bot API существует?** Да — проверено по актуальной документации
   dev.max.ru (см. «Источники»): базовый домен `platform-api2.max.ru`,
   авторизация заголовком `Authorization: <access_token>` (query-параметр
   платформа больше не принимает), методы GET /me, GET /updates
   (Long Polling по marker), POST /messages?chat_id=|user_id=,
   GET /chats/{chatId}/bot-membership (is_admin), диплинки
   `https://max.ru/<bot>?start=<payload>`. Решение: **прямой HTTP-клиент
   (fetch), без SDK** — как у Авито, зависимостей 0.
2. **Userbot: Telethon или grammY+MTProto?** **Telethon (Python)** —
   как у парсера (services/parser): уже есть креды api_id/hash,
   тот же стиль мини-сервиса FastAPI + asyncpg + отдельный mini-сервис
   в services/userbot.

## Часть A — MAX Bot API (apps/server/src/max/)

Файлы: `types.ts`, `config.ts`, `bot.ts` (клиент), `db.ts`, `handlers.ts`,
`publish.ts`, `poller.ts`, `runtime.ts`, `routes.ts`, `__tests__/` (4 файла).

- **Транспорт**: Long Polling `GET /updates` (marker-based, backoff
  2→60 с, ошибки не роняют сервис) — стартует автоматически при
  заданном токене, без публичного webhook-домена и сертификатов;
  webhook (POST /subscriptions) — опция, описана в README.
- **Входящие**: `message_created` в личном чате → `Lead(source=MAX)`,
  дедупликация по `mid`, авто-ack первому контакту, уведомление
  владельцу в **Telegram-бот** (тот же дайджест-нотификатор), интерес
  из справочника культур; `bot_started` → приветствие (аналог /start);
  группы/каналы не обрабатываются; сообщения владельца (MAX_USER_ID) —
  подсказка «управление в инбоксе».
- **bot_added** — единственный официальный способ получить chat_id:
  бот запоминает чат (AppSetting `maxDiscovered`) и уведомляет
  владельца; в «Настройки → MAX» chat_id можно привязать к каналу
  каталога (AppSetting `maxChats`).
- **Публикация** `POST /api/max/publish`: проверка bot-membership
  (is_admin), анти-бан 24 ч (обходится подтверждением), пауза 2,5 с,
  HTML с жирной первой строкой, диплинк `https://max.ru/<bot>?start=lst_…`
  (аттрибуция лида), привязка сохраняется, статус листинга → PUBLISHED.
- **Настройки**: env `MAX_BOT_TOKEN`/`MAX_USER_ID` ⋁ «Настройки → MAX»
  (AppSetting `max`, env приоритет, токен маскирован), «Проверить
  подключение» — реальный `GET /me`.
- **Ответ покупателю из MAX-лида** — через MAX-бота (маршрут
  /api/leads/:id/reply расширен; Telegram-лиды — как раньше).
- **Миграция** `20261126090000_stage10_max_lead_source`: `LeadSource`
  + значение `MAX`. **Сид**: 4 MAX-канала → `submissionMethod: BOT`,
  `automationLevel: AUTO` (бейдж «Авто» в мастере); канал с чужим
  ботом-приёмщиком (@DaromTagBot) остался SEMI.

## Часть B — userbot для чтения (services/userbot/, Python)

Файлы: `app/{config,db,reader,notifier,main,login}.py`, `tests/test_reader.py`,
`requirements.txt`, `pytest.ini`, `Dockerfile`, `README.md`.

- **ТОЛЬКО ЧТЕНИЕ**: слушает `events.NewMessage` только в чатах из
  списка; в коде нет ни одного отправляющего вызова MTProto —
  проверяется тестом `test_reader_never_sends` (AST, не текст).
- **Отдельный аккаунт** (`TELEGRAM_SESSION`, StringSession из
  `python -m app.login`), креды api_id/hash общие с парсером.
- **Фильтр ключевых слов** (люцерна, эспарцет, суданка, орех, семена,
  куплю, продам, цена — `USERBOT_KEYWORDS`), FloodWait → сон.
- **Запись**: `Lead(source=TELEGRAM_CHAT, externalId=chat_id)` — один
  лид на чат + `Message(INBOUND, telegramMessageId=mid)` — дедуп;
  интерес из текста (с учётом падежей — усечение основы).
- **Уведомление владельцу — через Telegram-БОТА** (httpx →
  api.telegram.org, троттлинг 60 с, кнопка «Открыть инбокс»), не MTProto.
- **Список чатов** — env `CHATS_TO_READ` + «Добавить чат» в UI
  (сервер `routes/userbot.ts`: `GET /api/userbot/status`,
  `POST/DELETE /api/userbot/chats`, нормализация @username/t.me/ID;
  сервис перечитывает список из БД раз в минуту — рестарт не нужен).
- **Статус** — сервис пишет `AppSetting userbotStatus` (connected,
  чатов, лидов сегодня, последнее сообщение); UI показывает честный
  warning при ненастроенных кредах, приложение работает как раньше.
- Отправка покупателю — вручную или через бота: userbot не пишет.

## Часть C — UI

- «Ещё» → «Настройки» → **«MAX»** (статус/токен/ID, «Проверить
  подключение», привязки chat_id, найденные чаты, ссылка на dev.max.ru)
  и **«Userbot (чтение)»** (статус, чаты, «Добавить чат»/удаление,
  пометка «ничего не отправляем»).
- **Инбокс**: бейджи источников — «MAX» (зелёный), «TG-чат» (тёплый),
  «Авито»/«Вручную»; TELEGRAM_BOT без бейджа (умолчание).
- **Мастер «Разместить»**: MAX-каналы с бейджем «Авто»; на шаге 3 у
  MAX-канала кнопка **«Опубликовать в MAX»** (chat_id-инпут, если
  привязки нет; 409 → «Подтвердить публикацию»; после — «Размещено» +
  «Открыть в MAX»); без токена — честный warning «MAX-бот не настроен»
  и ручной фолбэк (копирование текста), полуавто не ломается.
- api/client.ts: `getMaxStatus/getMaxSettings/saveMaxSettings/
  checkMaxConnection/maxPublish`, `getUserbotStatus/addUserbotChat/
  removeUserbotChat`; shared/types.ts: Max* и Userbot* DTO.

## Тесты (Часть C по ТЗ)

- **Unit сервер**: клиент (авторизация без Bearer, marker, тело
  /messages, is_admin, разбор ошибок), хендлеры (лид/дедуп/владелец/
  группы/bot_started/bot_added на фейках), publish (права/24 ч/диплинк/
  привязка).
- **Интеграционные**: buildApp+inject — status 200/503, publish →
  фейк-платформа, настройки, проверка; userbot-маршруты (env, чаты,
  нормализация, дубли).
- **Web**: MAX-флоу (isMaxChannel, chat_id привязка, подписи кнопки),
  бейджи источников.
- **pytest userbot**: 12 — фильтры, формат уведомления, троттлинг,
  анти-бан AST (нет отправки), лид+дедуп на фейк-БД, без ключевых слов.
- **Регрессия**: 253+40+108 — всё зелёное (283/47/142).

## Ограничения (соблюдены)

- Агросервер/НССиС не автоматизированы; userbot — только чтение
  (отправка — вручную или ботом); MAX — только официальный Bot API;
  без env/токенов ничего не падает (честные warnings, полуавто).
- AI/бот Telegram/сделки/документы/R2/визуал не тронуты.

## Что делать пользователю

1. **MAX**: создать бота (dev.max.ru → «Чат-боты») → задать
   `MAX_BOT_TOKEN` (и `MAX_USER_ID` позже) на Render → проверить в
   «Настройки → MAX». Добавить бота админом в свои MAX-каналы — chat_id
   придёт сам (bot_added) и появится в настройках.
2. **Userbot**: завести отдельный Telegram-аккаунт →
   `cd services/userbot && python -m app.login` → StringSession →
   задать `TELEGRAM_SESSION`, `CHATS_TO_READ`, `DATABASE_URL` →
   запустить сервис (Render или локально, порт 8010) → чаты добавлять
   можно из UI («Настройки → Userbot»).
3. Деплой Render: приложить миграцию `20261126090000…` (auto-migrate на
   старте есть) — подробнее в README («Как подключить MAX-бота»,
   «Как настроить userbot»).

## Источники (факты MAX Bot API)

- https://dev.max.ru/docs-api — обзор API, домен platform-api2.max.ru,
  заголовок Authorization.
- https://dev.max.ru/docs-api/methods/GET/updates — Long Polling
  (marker, timeout, limit, типы апдейтов).
- https://dev.max.ru/docs-api/methods/POST/messages — NewMessageBody
  (text, attachments, format html|markdown), ответ Message.stat.url.
- https://dev.max.ru/docs-api/objects/ChatMember — is_admin/is_owner;
  GET /chats/{chatId}/bot-membership.
- https://dev.max.ru/docs-api/use-cases/getting-chat-id — chat_id только
  из апдейтов (bot_added/bot_started); Long Polling для этого достаточно.
- https://dev.max.ru/docs/chatbots/bots-coding/prepare — диплинки
  `https://max.ru/<botName>?start=<payload>`, права админа (write),
  webhook/long polling.

Архив этапа: `agropost-stage10.zip` (код + отчёт).
