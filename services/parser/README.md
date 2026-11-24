# Парсер цен конкурентов (этап 2.5)

Отдельный Python-сервис: FastAPI + httpx (Агросервер) + Telethon
(MTProto, Telegram) + APScheduler (cron). Пишет строки в ту же базу
(Neon, таблица `CompetitorPrice`), основной Node-бэкенд их агрегирует
(`GET /api/positions/:id/market`).

## Правила (не нарушать)

- Собираем **только обезличенные данные**: цены, названия, ссылки.
  **Без телефонов, ФИО, адресов** (152-ФЗ) — сниппеты чистятся на лету.
- **Агросервер**: robots.txt (`/search/` запрещён — не трогаем), чтение
  официального sitemap + страницы объявлений `/b/*.htm`, не более
  **1 запроса в 2 секунды**, User-Agent как у браузера. Сайт закрыт
  капчей → статус `blocked`, сервис НЕ падает (запустите с другой машины).
- **Telegram**: Telethon (MTProto), **отдельный аккаунт** (не основной!),
  только **публичные** каналы из `TG_CHANNELS`, лимит 1–2 запроса/сек,
  пауза при FloodWait, не более 500 каналов на аккаунт.
  Нет кредов → статус `skipped`, Агросервер работает дальше.
- Ключи (`TG_API_ID`, `TG_API_HASH`, `TG_SESSION`, `DATABASE_URL`) —
  **только в `.env`** (см. `.env.example`); `.env` в git не попадает.

## Как это работает

1. **Агросервер, sitemap-подход** (robots-friendly):
   индекс `sitemap.xml` → последние N чанков → объявления `/b/*.htm`,
   отобранные по транслит-ключевым словам запроса («люцерна» →
   `lyutserna`, «суданка» → `sudan`) → цена из **текста** страницы
   (регексп «180 ₽/кг» — смены вёрстки не ломают парсер).
2. **Telegram**: последние N сообщений публичных каналов → сообщения по
   теме (основы слов: «люцерн…») → цена за кг из текста.
3. Строки пишутся в `CompetitorPrice` (`source`, `query`, `price`,
   `unit`, `link`, `rawSnippet`, `fetchedAt`), история копится.
4. Cron **раз в 12 часов** (`SCHEDULER_INTERVAL_HOURS`); ручной запуск —
   `POST /api/parser/run` (прокси Node-бэкенда) или напрямую `POST /run`.

## Запуск (локально)

```bash
cd services/parser
cp .env.example .env      # заполнить DATABASE_URL (+ TG_API_* по желанию)
pip install -r requirements.txt

python -m pytest          # 29 тестов: экстракция цен, robots, адаптеры, БД

uvicorn app.main:app --port 8000
curl http://127.0.0.1:8000/health
curl -X POST http://127.0.0.1:8000/run -H 'Content-Type: application/json' -d '{}'
curl http://127.0.0.1:8000/status   # итоги прогона (фоном)
```

## Запуск (Docker / Render)

`Dockerfile` готов: `python:3.12-slim` + ca-certificates. На Render —
Web Service из корня `services/parser` (blueprint-запись закомментирована
в `render.yaml` до отдельного решения). Переменные окружения — как
в `.env.example`.

## Telegram-креды (когда будете готовы)

1. `api_id`/`api_hash` — на <https://my.telegram.org> (для отдельного
   аккаунта парсера, не основного!).
2. `python -m app.login` → телефон + код → строка `TG_SESSION` в `.env`.
3. Каналы сбора — `TG_CHANNELS` (сейчас `selhoz032`, `RUSSIAN_WHOLESALER`).

Без кредов сервис живёт и работает: Агросервер собирает, Telegram
возвращает статус `skipped`.

## Эндпоинты

| Метод | Путь     | Что делает                                       |
| ----- | -------- | ------------------------------------------------ |
| GET   | `/health`  | живость, БД, Telegram-креды, cron                |
| POST  | `/run`     | ручной сбор (фон): `{queries?, sources?}`        |
| GET   | `/status`  | текущий/последний прогон + последний cron-прогон |

Node-прокси: `POST /api/parser/run`, `GET /api/parser/status`
(см. `apps/server/src/routes/parser.ts`, адрес — `PARSER_URL`).
