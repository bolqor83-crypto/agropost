"""Запись прочитанных сообщений в Leads (Neon) через asyncpg.

Схемой владеет основной бэкенд (apps/server, Prisma): userbot только
вставляет строки — как парсер цен (services/parser/app/db.py).

Ключевая семантика (ТЗ, Часть B):
- Lead: source=TELEGRAM_CHAT, externalId=<chat_id> — один лид на чат
  (сообщения в этом чате дописываются в него);
- Message: direction=INBOUND, text, telegramMessageId=<mid> —
  дедупликация по mid (Telethon/ретраи не создадут дублей);
- AppSetting "userbotStatus" — живой статус для UI (компонует
  основной API в GET /api/userbot/status);
- AppSetting "userbotChats" — список чатов из UI («Добавить чат»).
"""

from __future__ import annotations

import json
import logging
import ssl as ssl_mod
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import asyncpg

from .config import settings

log = logging.getLogger("agropost.userbot.db")

_pool: asyncpg.Pool | None = None

CUID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"


def _cuid_like() -> str:
    """Идентификатор вида cuid (Prisma @default(cuid) не вызывается)."""
    import secrets

    return "c" + "".join(secrets.choice(CUID_ALPHABET) for _ in range(24))


def _naive_utc(dt: datetime | None) -> datetime:
    """Prisma DateTime — timestamp WITHOUT time zone: наивный UTC."""
    value = dt if dt is not None else datetime.now(timezone.utc)
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _neon_ssl_context() -> ssl_mod.SSLContext:
    """Neon требует TLS; обычный контекст с проверкой цепочки."""
    return ssl_mod.create_default_context()


async def pool() -> asyncpg.Pool:
    """Ленивый пул соединений (per-процесс)."""
    global _pool
    if _pool is not None and not _pool._closed:  # noqa: SLF001 — штатной проверки нет
        return _pool
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL не задан (.env)")
    parsed = urlparse(settings.database_url)
    dsn = f"postgres://{parsed.username}:{parsed.password}@{parsed.hostname}:{parsed.port or 5432}{parsed.path}"
    _pool = await asyncpg.create_pool(
        dsn,
        min_size=1,
        max_size=4,
        ssl=_neon_ssl_context(),
        timeout=30,
        command_timeout=30,
    )
    log.info("пул БД готов: %s", parsed.hostname)
    return _pool


async def close() -> None:
    """Закрыть пул (при остановке сервиса)."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def ping() -> bool:
    """Проверка доступности БД (для /health)."""
    try:
        p = await pool()
        async with p.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return True
    except Exception:  # noqa: BLE001
        return False


# ---------- AppSetting (userbotChats / userbotStatus) ----------


async def read_setting(key: str) -> dict[str, Any] | None:
    """Значение секции AppSetting (JSONB) или None."""
    p = await pool()
    async with p.acquire() as conn:
        raw = await conn.fetchval(
            'SELECT value FROM "AppSetting" WHERE key = $1', key
        )
    if raw is None:
        return None
    try:
        value = json.loads(raw) if isinstance(raw, str) else raw
        return value if isinstance(value, dict) else None
    except (TypeError, ValueError):
        return None


async def write_setting(key: str, value: dict[str, Any]) -> None:
    """Upsert секции AppSetting (статус/список чатов)."""
    p = await pool()
    async with p.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO "AppSetting" (id, key, value, "createdAt", "updatedAt")
            VALUES ($1, $2, $3::jsonb, now(), now())
            ON CONFLICT (key) DO UPDATE
            SET value = $3::jsonb, "updatedAt" = now()
            """,
            _cuid_like(),
            key,
            json.dumps(value),
        )


async def chats_list() -> list[str]:
    """Чаты: env-заготовка ⋁ список из UI (AppSetting userbotChats)."""
    saved = await read_setting("userbotChats") or {}
    raw = saved.get("chats", [])
    chats = [c for c in raw if isinstance(c, str) and c.strip()]
    merged = list(dict.fromkeys(settings.chats_to_read + chats))
    return merged


# ---------- Лиды и сообщения ----------


async def find_lead(source: str, external_id: str) -> dict[str, Any] | None:
    """Лид по (source, externalId) — один лид на чат."""
    p = await pool()
    async with p.acquire() as conn:
        row = await conn.fetchrow(
            'SELECT id, interest, status FROM "Lead" WHERE source = $1 AND "externalId" = $2',
            source,
            external_id,
        )
    return dict(row) if row else None


async def create_lead(source: str, external_id: str, name: str | None) -> str:
    """Новый лид (source=TELEGRAM_CHAT, externalId=chat_id, name=чат)."""
    p = await pool()
    async with p.acquire() as conn:
        lead_id = await conn.fetchval(
            """
            INSERT INTO "Lead" (id, source, "externalId", name, status,
                                "createdAt", "updatedAt")
            VALUES ($1, $2, $3, $4, 'NEW', now(), now())
            RETURNING id
            """,
            _cuid_like(),
            source,
            external_id,
            name,
        )
    return str(lead_id)


async def message_exists(lead_id: str, message_id: str) -> bool:
    """Дедупликация: сообщение с этим mid уже записано."""
    p = await pool()
    async with p.acquire() as conn:
        found = await conn.fetchval(
            'SELECT id FROM "Message" WHERE "leadId" = $1 AND "telegramMessageId" = $2 LIMIT 1',
            lead_id,
            message_id,
        )
    return found is not None


async def insert_message(lead_id: str, text: str, message_id: str) -> None:
    """Входящее сообщение покупателя из чата (mid — дедупликация)."""
    p = await pool()
    async with p.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO "Message" (id, "leadId", direction, text,
                                   "telegramMessageId", "sentAt", "aiGenerated", "createdAt")
            VALUES ($1, $2, 'INBOUND', $3, $4, now(), false, now())
            """,
            _cuid_like(),
            lead_id,
            text,
            message_id,
        )


async def update_interest(lead_id: str, interest: str) -> None:
    """Запомнить культуру, если ещё не заполнено (аналог бота)."""
    p = await pool()
    async with p.acquire() as conn:
        await conn.execute(
            'UPDATE "Lead" SET interest = $2, "updatedAt" = now() '
            'WHERE id = $1 AND interest IS NULL',
            lead_id,
            interest,
        )


async def count_leads_today() -> int:
    """Сколько лидов создано с полуночи (для статуса)."""
    p = await pool()
    async with p.acquire() as conn:
        return int(
            await conn.fetchval('SELECT COUNT(*) FROM "Lead" WHERE "createdAt" >= date_trunc(\'day\', now())') or 0
        )


# ---------- Статус сервиса ----------


async def write_status(status: dict[str, Any]) -> None:
    """Записать живой статус в AppSetting userbotStatus."""
    await write_setting("userbotStatus", status)
