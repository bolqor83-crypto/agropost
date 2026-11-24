"""Адаптер Telegram (MTProto через Telethon, отдельный аккаунт).

Правила (ТЗ этапа 2.5):
- аккаунт парсера ОТДЕЛЬНЫЙ, не основной: TG_API_ID + TG_API_HASH +
  TG_SESSION (строка StringSession или путь к файлу) в .env;
- только ПУБЛИЧНЫЕ каналы/чаты из TG_CHANNELS (не личные переписки);
- лимит 1–2 запроса/сек: пауза между каналами + flood_sleep_threshold;
- не более 500 каналов на аккаунт (tg_max_channels);
- нет кредов → статус «skipped», сервис продолжает работать;
- FloodWait/блокировка аккаунта → лог, НЕ падаем.

Собираем только обезличенное: цена, фрагмент текста, ссылка на пост.
sellerName не заполняем: имена отправителей — это ФИО (152-ФЗ),
а @username в чатах часто отсутствует. Никаких телефонов.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from ..config import settings
from ..extract import parse_price_per_kg, sanitize_snippet

log = logging.getLogger("agropost.parser.telegram")


@dataclass
class TelegramStats:
    """Итоги прогона TG-адаптера (зеркало AdapterStats Агросервера)."""

    status: str = "idle"  # idle | ok | empty | disabled | skipped | limited | error
    channels: int = 0
    messages: int = 0
    saved: int = 0
    note: str = ""
    started_at: str | None = None
    finished_at: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "channels": self.channels,
            "messages": self.messages,
            "saved": self.saved,
            "note": self.note,
            "startedAt": self.started_at,
            "finishedAt": self.finished_at,
        }


def configured() -> bool:
    """Есть ли креды отдельного аккаунта (для /health и /status)."""
    return bool(settings.tg_api_id and settings.tg_api_hash)


def collect_enabled() -> bool:
    """Этап 5.1: сбор реально разрешён? По умолчанию ВЫКЛЮЧЕН —
    MTProto-сбор публичных каналов ограничен условиями Telegram;
    включается владельцем явно для источников с подтверждённым правом."""
    return settings.tg_collect_enabled


def _stem(word: str) -> str:
    """Основа слова для матчинга русских словоформ.

    «люцерна»→«люцер» (матчит «люцерны», «люцерну»),
    «эспарцет»→«эспарц», «грецкий»→«грецк», «суданка»→«судан».
    """
    return word[:5] if len(word) > 5 else word


def message_matches(text: str, query: str) -> bool:
    """Сообщение по теме запроса? (все слова запроса — по основам)."""
    if not text:
        return False
    text_lower = text.lower()
    return all(_stem(word) in text_lower for word in query.lower().split())


def extract_rows_from_messages(
    messages: list[Any],
    query: str,
    channel_link: str,
) -> list[dict[str, Any]]:
    """Публичные посты по теме → строки цен (обезличенные).

    messages — объекты Telethon Message (или любые с .text/.message/.id).
    channel_link — «https://t.me/{username}» без хвоста.
    """
    rows: list[dict[str, Any]] = []
    for msg in messages:
        text = getattr(msg, "text", None) or getattr(msg, "message", None) or ""
        if not message_matches(text, query):
            continue
        price = parse_price_per_kg(text)
        if price is None:
            continue
        msg_id = getattr(msg, "id", None)
        link = f"{channel_link}/{msg_id}" if msg_id else channel_link
        rows.append(
            {
                "source": "TELEGRAM",
                "query": query,
                "price": price,
                "unit": "₽/кг",
                "region": None,
                "sellerName": None,  # ФИО отправителей не храним (152-ФЗ)
                "link": link,
                "rawSnippet": sanitize_snippet(text, 120),
                "fetchedAt": datetime.now(timezone.utc),
            },
        )
    return rows


@dataclass
class TelegramAdapter:
    """Telegram: публичные каналы → цены конкурентов (MTProto)."""

    _client: Any = field(default=None, repr=False)

    def configured(self) -> bool:
        return configured()

    def collect_enabled(self) -> bool:
        """Этап 5.1: выключен по умолчанию (TG_COLLECT_ENABLED=0)."""
        return collect_enabled()

    async def collect(self, queries: list[str]) -> tuple[list[dict[str, Any]], TelegramStats]:
        """Собрать цены из TG_CHANNELS. Не бросает исключений наружу."""
        stats = TelegramStats()
        stats.started_at = datetime.now(timezone.utc).isoformat()
        rows: list[dict[str, Any]] = []
        if not self.configured():
            stats.status = "skipped"
            stats.note = (
                "нет TG_API_ID/TG_API_HASH в .env — Telegram-адаптер отключён "
                "(graceful-skip); передайте креды отдельного аккаунта"
            )
            return rows, stats
        if not self.collect_enabled():
            stats.status = "disabled"
            stats.note = (
                "MTProto-сбор публичных каналов выключен по умолчанию "
                "(TG_COLLECT_ENABLED=0) — включите только для источников, "
                "на обработку которых есть подтверждённое право"
            )
            return rows, stats
        if len(settings.tg_channels) > settings.tg_max_channels:
            stats.status = "limited"
            stats.note = (
                f"каналов {len(settings.tg_channels)} > лимита "
                f"{settings.tg_max_channels} — обрезано"
            )
        channels = settings.tg_channels[: settings.tg_max_channels]
        try:
            rows = await self._collect_rows(channels, queries, stats)
            stats.status = "ok" if rows else "empty"
            if stats.status == "empty" and not stats.note:
                stats.note = "сообщений с ценой не найдено"
        except Exception as err:  # noqa: BLE001 — парсер не должен падать
            stats.status = "error"
            stats.note = f"{type(err).__name__}: {err}"
            log.exception("Telegram: ошибка адаптера")
        stats.finished_at = datetime.now(timezone.utc).isoformat()
        return rows, stats

    async def _collect_rows(
        self, channels: list[str], queries: list[str], stats: TelegramStats,
    ) -> list[dict[str, Any]]:
        from telethon import TelegramClient, errors  # noqa: PLC0415 — лениво
        from telethon.sessions import StringSession

        api_id = int(settings.tg_api_id)
        api_hash = settings.tg_api_hash
        if settings.tg_session and "/" in settings.tg_session:
            session: Any = settings.tg_session  # путь к файлу сессии
        elif settings.tg_session:
            session = StringSession(settings.tg_session)
        else:
            raise RuntimeError(
                "TG_SESSION не задан: нужна строка StringSession или путь к файлу "
                "(получите интерактивно: python -m app.login)"
            )

        rows: list[dict[str, Any]] = []
        client = TelegramClient(session, api_id, api_hash)
        client.flood_sleep_threshold = 60  # FloodWait до минуты — спим сами
        await client.start()
        self._client = client
        try:
            for username in channels:
                try:
                    entity = await client.get_entity(username)
                except errors.FloodWaitError as fw:  # noqa: PERF203
                    log.warning("FloodWait %s c на %s — пропускаем канал", fw.seconds, username)
                    stats.note = f"FloodWait {fw.seconds}с — часть каналов пропущена"
                    continue
                except Exception as err:  # noqa: BLE001
                    log.warning("канал %s недоступен: %s", username, err)
                    continue
                stats.channels += 1
                messages = await client.iter_messages(entity, limit=settings.tg_messages_limit)
                batch = list(messages)
                stats.messages += len(batch)
                channel_link = f"https://t.me/{username.lstrip('@')}"
                for query in queries:
                    rows.extend(extract_rows_from_messages(batch, query, channel_link))
                await asyncio.sleep(settings.tg_request_interval)
        finally:
            await client.disconnect()
            self._client = None
        return rows

    async def close(self) -> None:
        if self._client is not None:
            try:
                await self._client.disconnect()
            except Exception:  # noqa: BLE001
                pass
            self._client = None
