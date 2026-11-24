"""Интерактивный логин отдельного аккаунта → строка TG_SESSION.

Запуск:  python -m app.login
(находясь в services/parser, с уже заполненными TG_API_ID/TG_API_HASH
 в .env). Спросит телефон, код из Telegram и (если включена) пароль 2FA,
 затем напечатает строку StringSession — её кладём в .env как TG_SESSION.

ВНИМАНИЕ: аккаунт парсера — ОТДЕЛЬНЫЙ, не основной аккаунт АгроПост!
"""

from __future__ import annotations

import asyncio

from telethon import TelegramClient
from telethon.sessions import StringSession

from .config import settings


async def main() -> None:
    if not settings.tg_api_id or not settings.tg_api_hash:
        print("Сначала заполните TG_API_ID и TG_API_HASH в .env")
        return
    client = TelegramClient(
        StringSession(), int(settings.tg_api_id), settings.tg_api_hash,
    )
    await client.start()
    session_string = client.session.save()  # type: ignore[attr-defined]
    me = await client.get_me()
    print(f"\nВошли как: {me.first_name if me else 'неизвестно'}")
    print("\nTG_SESSION (скопируйте в .env):")
    print(session_string)
    print(
        "\nКаналы для сбора — TG_CHANNELS в .env "
        f"(сейчас: {', '.join(settings.tg_channels)})."
    )
    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
