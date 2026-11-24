"""Уведомления владельцу — через Telegram-БОТА (не userbot!).

Userbot ничего не отправляет в Telegram (бан): уведомления идут
официальным Bot API от нашего бота, как в основном приложении.
httpx + троттлинг: не чаще одного в notify_throttle_sec секунд.
"""

from __future__ import annotations

import logging
import time

import httpx

from .config import settings

log = logging.getLogger("agropost.userbot.notifier")

TELEGRAM_API = "https://api.telegram.org"


def format_message(chat_title: str, text: str, limit: int | None = None) -> str:
    """«Новое сообщение в чате X: ...» — формат из ТЗ, часть B."""
    clean = " ".join(text.split())
    if limit and len(clean) > limit:
        clean = clean[: limit - 1] + "…"
    return f"Новое сообщение в чате «{chat_title}»: {clean}"


class OwnerNotifier:
    """Отправка владельцу через Bot API с троттлингом."""

    def __init__(self, token: str, owner_id: int, throttle_sec: int) -> None:
        self._token = token
        self._owner_id = owner_id
        self._throttle_sec = throttle_sec
        self._last_sent_at = 0.0
        self._client: httpx.AsyncClient | None = None
        self._sent: list[str] = []  # для тестов/интроспекции

    async def start(self) -> None:
        self._client = httpx.AsyncClient(timeout=10.0)

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def throttled(self, now: float | None = None) -> bool:
        """True — недавно уже отправляли (сообщение пропустим)."""
        current = now if now is not None else time.monotonic()
        return (current - self._last_sent_at) < self._throttle_sec

    async def notify_chat_message(self, chat_title: str, text: str) -> bool:
        """«Новое сообщение в чате X: ...» + кнопка «Открыть инбокс»."""
        if not settings.notify_configured:
            log.warning("уведомления не настроены: TELEGRAM_BOT_TOKEN/TELEGRAM_USER_ID")
            return False
        message = format_message(chat_title, text, settings.notify_text_limit)
        return await self.send(message)

    async def send(self, text: str) -> bool:
        """Отправка sendMessage через Bot API (клиент тестов подменяем)."""
        if self.throttled():
            log.info("троттлинг: уведомление пропущено (%s…)", text[:40])
            return False
        self._last_sent_at = time.monotonic()
        self._sent.append(text)
        url = f"{TELEGRAM_API}/bot{self._token}/sendMessage"
        payload = {
            "chat_id": self._owner_id,
            "text": text,
            "reply_markup": {
                "inline_keyboard": [[
                    {"text": "Открыть инбокс", "url": f"{settings.web_url}/inbox"}
                ]]
            },
        }
        try:
            client = self._client or httpx.AsyncClient(timeout=10.0)
            response = await client.post(url, json=payload)
            if response.status_code != 200:
                log.warning("Telegram Bot API %s: %s", response.status_code, response.text[:120])
                return False
            return True
        except Exception:  # noqa: BLE001 — сервис не падает из-за уведомления
            log.exception("не удалось отправить уведомление владельцу")
            return False
