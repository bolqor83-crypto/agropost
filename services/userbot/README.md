# Userbot — чтение чужих Telegram-чатов (этап 10, Часть B)

Отдельный Python-сервис: FastAPI + Telethon (MTProto). **Только читает**
новые сообщения в выбранных чатах и пишет лиды (source=`TELEGRAM_CHAT`)
в ту же базу (Neon, таблица `Lead`/`Message`), основной Node-бэкенд
показывает их в инбоксе (`GET /api/leads?source=TELEGRAM_CHAT`).
Уведомления владельцу — через **Telegram-бота** (не userbot).

## Правила (не нарушать)

- **Userbot ТОЛЬКО читает**: в коде нет ни одного отправляющего вызова
  MTProto — проверяется тестом `test_reader_never_sends` (AST).
- **Отдельный аккаунт** (`TELEGRAM_SESSION`) — не основной и не
  парсерный: если аккаунт забанят, основной не пострадает.
- Читаем **только чаты из списка** (env `CHATS_TO_READ` + «Добавить чат»
  в UI): личные переписки не читаем.
- Фильтр ключевых слов (люцерна/эспарцет/суданка/орех/семена/куплю/
  продам/цена) — болтовню в лиды не тащим.
- **FloodWait — сон** на указанные секунды, не более ~1 запроса/сек.
- Все действия логируются; статус — в `AppSetting userbotStatus`
  (UI: «Ещё» → «Настройки» → «Userbot (чтение)»).
- Ключи (`TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION`,
  `DATABASE_URL`) — только в `.env`.

## Как это работает

1. Telethon подключается к MTProto, слушает `events.NewMessage`
   только для чатов из списка.
2. Сообщение с ключевым словом → `Lead(source=TELEGRAM_CHAT,
   externalId=chat_id)` (один лид на чат) + `Message(INBOUND,
   telegramMessageId=mid)` — дедупликация по mid.
3. Уведомление владельцу в Telegram-бота: «Новое сообщение в чате
   "X": …» с кнопкой «Открыть инбокс» (троттлинг 60 сек).
4. Раз в минуту сервис пишет живой статус в БД (`userbotStatus`) и
   перечитывает список чатов (`userbotChats`) — «Добавить чат» в UI
   подхватывается без рестарта.

## Переменные окружения

| Переменная | Что делает | По умолчанию |
| --- | --- | --- |
| `DATABASE_URL` | База Neon (та же, что основной API) | — |
| `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` | Креды MTProto (общие с парсером) | — |
| `TELEGRAM_SESSION` | **Отдельная** StringSession-строка userbot | — |
| `CHATS_TO_READ` | Чаты через запятую (@username или ID) | — |
| `USERBOT_KEYWORDS` | Ключевые слова фильтра | люцерна, эспарцет, … |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_USER_ID` | Уведомления владельцу (бот) | — |
| `PORT` | Порт сервиса | 8010 |

## Запуск

```bash
cd services/userbot
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8010   # .env рядом
pytest                                        # 12 тестов
```

Живой статус: `GET :8010/health`, `GET :8010/status`.

Получить `TELEGRAM_SESSION`: один раз локально выполните
`python -m app.login` (см. «Как настроить userbot» в README проекта).
