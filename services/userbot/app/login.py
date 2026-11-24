"""Получение TELEGRAM_SESSION для userbot (запускается ЛОКАЛЬНО один раз).

    cd services/userbot
    python -m app.login

Спрашивает телефон отдельного аккаунта (НЕ основного!) и код из
Telegram, печатает строку StringSession — вставьте её в env
(TELEGRAM_SESSION) на хостинге userbot. Креды api_id/api_hash — те же,
что у парсера (TELEGRAM_API_ID / TELEGRAM_API_HASH в .env рядом).
"""

from __future__ import annotations

import asyncio

from telethon import TelegramClient
from telethon.sessions import StringSession

from .config import settings


async def main() -> None:
    if not settings.tg_api_id or not settings.tg_api_hash:
        print("Задайте TELEGRAM_API_ID и TELEGRAM_API_HASH в .env (как у парсера).")
        return
    session = StringSession()
    client = TelegramClient(session, int(settings.tg_api_id), settings.tg_api_hash)
    async with client:
        print("\nStringSession (вставьте в TELEGRAM_SESSION):\n")
        print(session.save())


if __name__ == "__main__":
    asyncio.run(main())
