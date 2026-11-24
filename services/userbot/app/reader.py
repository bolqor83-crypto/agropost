"""Чтение чужих Telegram-чатов через Telethon (ЭТАП 10, Часть B).

ТОЛЬКО ЧТЕНИЕ (анти-бан, ТЗ):
- слушаем НОВЫЕ сообщения только в чатах из списка (CHATS_TO_READ +
  «Добавить чат»): личные переписки НЕ читаем;
- фильтр по ключевым словам (люцерна/эспарцет/…/куплю/продам/цена);
- прочитанное → Lead(source=TELEGRAM_CHAT) → Message + уведомление
  владельцу через Telegram-БОТА;
- НИ ОДНОГО вызова отправки от имени userbot: в этом модуле нет ни
  client.send_message, ни любых других пишущих вызовов MTProto
  (проверяется тестом test_reader.py::test_reader_never_sends);
- FloodWaitError → сон на указанные секунды (не более ~1 запроса/сек);
- все действия логируются.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from telethon import TelegramClient, events

from . import db
from .config import settings
from .notifier import OwnerNotifier

log = logging.getLogger("agropost.userbot.reader")


def matches_keywords(text: str, keywords: list[str]) -> bool:
    """Сообщение содержит хотя бы одно ключевое слово (без регистра)."""
    lower = text.lower()
    return any(keyword.lower() in lower for keyword in keywords if keyword)


def extract_culture(text: str, culture_names: list[str]) -> str | None:
    """Культура из справочника в тексте; падежи (люцерну/люцерна)
    ловим усечением основы — как в основном приложении, но мягче."""
    lower = text.lower()
    for name in culture_names:
        if len(name) >= 4:
            if name.lower() in lower:
                return name
            stem = name.lower()[:-2]
            if len(stem) >= 4 and stem in lower:
                return name
    return None


CULTURE_HINTS = [
    "Люцерна", "Эспарцет", "Суданка", "Грецкий орех", "Семена",
]


class ChatReader:
    """Обёртка Telethon: подписка на новые сообщения выбранных чатов."""

    def __init__(self, notifier: OwnerNotifier) -> None:
        self._notifier = notifier
        self._client: TelegramClient | None = None
        self._chats: list[str] = []
        self.last_message_at: str | None = None
        self.leads_created = 0
        self.messages_saved = 0

    @property
    def connected(self) -> bool:
        return self._client is not None and self._client.is_connected()

    @property
    def chats(self) -> list[str]:
        return list(self._chats)

    async def start(self) -> None:
        """Подключиться и слушать выбранные чаты (chats_list из БД)."""
        if not settings.tg_configured:
            log.warning(
                "TELEGRAM_SESSION/API_ID не заданы — userbot не запускается "
                "(чтение чужих чатов выключено; приложение работает как раньше)"
            )
            return
        self._chats = await db.chats_list()
        if not self._chats:
            log.warning("список чатов пуст: задайте CHATS_TO_READ или «Добавить чат» в Настройках")
            return

        client = TelegramClient(
            "userbot-session",  # строковая сессия ниже подменяется
            int(settings.tg_api_id),
            settings.tg_api_hash,
        )
        # Сессия хранится в env (StringSession).
        from telethon.sessions import StringSession

        client.session = StringSession(settings.tg_session)
        await client.start()  # type: ignore[arg-type]
        self._client = client

        for chat in self._chats:
            # Только чтение: регистрируем обработчик входящих сообщений.
            client.add_event_handler(
                self._on_new_message(chat),
                events.NewMessage(chats=chat),
            )
        log.info("userbot слушает чаты: %s", ", ".join(self._chats))

    async def stop(self) -> None:
        if self._client is not None:
            await self._client.disconnect()
            self._client = None
            log.info("userbot остановлен")

    def _on_new_message(self, chat: str):
        """Хендлер сообщений ОДНОГО чата (замыкание адреса чата)."""

        async def handler(event: events.NewMessage.Event) -> None:
            try:
                await self.handle_message(event, chat)
            except Exception:  # noqa: BLE001 — цикл чтения не падает
                log.exception("ошибка обработки сообщения в чате %s", chat)

        return handler

    async def handle_message(self, event: Any, chat: str) -> None:
        """Одно входящее сообщение выбранного чата → Лид/Message/уведомление."""
        from telethon.errors import FloodWaitError

        try:
            msg = getattr(event, "message", None)
            text = (
                getattr(msg, "raw_text", None)
                or getattr(msg, "text", None)
                or getattr(event, "raw_text", "")
                or ""
            ).strip()
            if not text:
                return
            if not matches_keywords(text, settings.keywords):
                log.debug("чат %s: без ключевых слов — пропуск", chat)
                return

            chat_id = str(getattr(event, "chat_id", None) or chat)
            chat_title = getattr(getattr(event, "chat", None), "title", None) or chat
            message_id = str(getattr(event, "message_id", None) or "")

            # Дедупликация: ретраи Telethon не создают дублей.
            lead = await db.find_lead("TELEGRAM_CHAT", chat_id)
            if lead is None:
                lead_id = await db.create_lead("TELEGRAM_CHAT", chat_id, chat_title)
                self.leads_created += 1
                log.info("новый лид из чата %s (%s)", chat_title, chat_id)
            else:
                lead_id = str(lead["id"])
            if message_id and await db.message_exists(lead_id, message_id):
                return

            await db.insert_message(lead_id, text, message_id)
            self.messages_saved += 1
            self.last_message_at = datetime.now(timezone.utc).isoformat()

            culture = extract_culture(text, CULTURE_HINTS)
            if culture:
                await db.update_interest(lead_id, culture)

            await self._notifier.notify_chat_message(chat_title, text)
        except FloodWaitError as flood:
            seconds = getattr(flood, "seconds", 30)
            log.warning("FloodWait %s c — пауза (не более ~1 запроса/сек)", seconds)
            import asyncio

            await asyncio.sleep(min(int(seconds), 300))

    def status(self) -> dict[str, Any]:
        """Живой статус для AppSetting userbotStatus (читает основной API)."""
        return {
            "connected": self.connected,
            "chats": len(self._chats),
            "lastMessageAt": self.last_message_at,
            "leadsToday": self.leads_created,
            "version": "0.1.0",
        }
