"""АгроПост — сервис парсинга цен (этап 2.5, каркас).

Запускать НЕ раньше этапа 2.5. Правила обязательны:
- только обезличенные данные: цены, названия, характеристики, ссылки;
- без телефонов, ФИО и контактов (152-ФЗ);
- Telegram: отдельный аккаунт (не основной), лимит 1–2 запроса/сек,
  паузы, не более 500 каналов на аккаунт;
- Авито: отложено, только полуавтомат (открыть страницу вручную).

Структура (по ТЗ):
    app/adapters/agroserver.py  — HTTP + selectolax
    app/adapters/telegram.py    — Telethon (MTProto)
    app/scheduler.py            — cron-расписание
    app/db.py                   — запись в Neon (asyncpg)
"""

from fastapi import FastAPI

app = FastAPI(title="agropost-parser", version="0.1.0")


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "service": "agropost-parser", "stage": "2.5-pending"}
