"""Точка входа userbot-сервиса (ЭТАП 10, Часть B).

FastAPI + Telethon (mini-сервис, как парсер):
- GET /health — живость: БД, креды TG, подключение, чаты;
- GET /status — состояние: последний листинг апдейтов, статистика.

Жизненный цикл (lifespan):
- стартует ChatReader (только чтение выбранных чатов);
- раз в chats_refresh_sec подтягивает список чатов из БД (UI-«Добавить
  чат» подхватывается без рестарта);
- раз в status_refresh_sec пишет живой статус в AppSetting userbotStatus
  (его показывает «Настройки → Userbot» в приложении).
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI

from . import db
from .config import settings
from .notifier import OwnerNotifier
from .reader import ChatReader

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("agropost.userbot")

VERSION = "0.1.0"

_state: dict[str, Any] = {
    "startedAt": None,
    "readerConnected": False,
    "chats": 0,
    "lastMessageAt": None,
    "leadsCreated": 0,
    "messagesSaved": 0,
}

notifier = OwnerNotifier(
    settings.notify_bot_token,
    settings.notify_owner_id,
    settings.notify_throttle_sec,
)
reader = ChatReader(notifier)


async def _refresh_loop() -> None:
    """Фоновый цикл: обновить чаты + записать статус в AppSetting."""
    while True:
        try:
            leads_today = await db.count_leads_today()
            status = reader.status()
            status["lastMessageAt"] = status["lastMessageAt"] or _state.get("lastMessageAt")
            await db.write_status(
                {
                    **status,
                    "leadsToday": leads_today,
                    "version": VERSION,
                    "updatedAt": datetime.now(timezone.utc).isoformat(),
                }
            )
            _state.update(
                {
                    "readerConnected": status["connected"],
                    "chats": status["chats"],
                    "lastMessageAt": status["lastMessageAt"],
                    "leadsCreated": reader.leads_created,
                    "messagesSaved": reader.messages_saved,
                }
            )
        except Exception:  # noqa: BLE001 — цикл не падает
            log.exception("не удалось записать статус userbot")
        await asyncio.sleep(settings.status_refresh_sec)


@asynccontextmanager
async def lifespan(_: FastAPI):
    log.info(
        "agropost-userbot %s: tg=%s, chats(env)=%s, уведомления=%s",
        VERSION,
        "настроен" if settings.tg_configured else "нет кредов (skipped)",
        len(settings.chats_to_read),
        "да" if settings.notify_configured else "нет",
    )
    _state["startedAt"] = datetime.now(timezone.utc).isoformat()
    await notifier.start()
    await reader.start()
    task = asyncio.create_task(_refresh_loop())
    try:
        yield
    finally:
        task.cancel()
        await reader.stop()
        await notifier.close()
        await db.close()


app = FastAPI(title="agropost-userbot", version=VERSION, lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, Any]:
    database = await db.ping() if settings.database_url else False
    return {
        "ok": True,
        "service": "agropost-userbot",
        "version": VERSION,
        "stage": "10",
        "database": database,
        "telegram": "configured" if settings.tg_configured else "skipped",
        "connected": reader.connected,
        "chats": len(reader.chats),
        "notifications": "configured" if settings.notify_configured else "off",
    }


@app.get("/status")
async def status() -> dict[str, Any]:
    return {
        "running": reader.connected,
        **_state,
        "chats": reader.chats,
    }
