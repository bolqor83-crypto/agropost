"""Запись собранных цен в Postgres (Neon) через asyncpg.

Таблицу CompetitorPrice создаёт Prisma (apps/server, `prisma db push`):
парсер только INSERT-ит строки — схемой владеет основной бэкенд.
"""

from __future__ import annotations

import logging
import ssl as ssl_mod
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import asyncpg

from .config import settings
log = logging.getLogger("agropost.parser.db")

_pool: asyncpg.Pool | None = None

INSERT_SQL = """
INSERT INTO "CompetitorPrice"
    ("id", "source", "query", "price", "unit", "region",
     "sellerName", "link", "rawSnippet", "fetchedAt", "createdAt")
VALUES ($1, $2, $3, $4::numeric, $5, $6, $7, $8, $9, $10, $10)
"""

CUID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"


def _cuid_like() -> str:
    """Идентификатор вида cuid (Prisma @default(cuid) не вызывается)."""
    import secrets

    return "c" + "".join(secrets.choice(CUID_ALPHABET) for _ in range(24))


def _naive_utc(value: Any) -> datetime:
    """Prisma DateTime → timestamp WITHOUT time zone: нужен наивный UTC.

    (asyncpg не примет offset-aware datetime в naive-колонку.)
    """
    dt = value if isinstance(value, datetime) else datetime.now(timezone.utc)
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _neon_ssl_context() -> ssl_mod.SSLContext:
    """Neon требует TLS; обычный контекст с проверкой цепочки."""
    return ssl_mod.create_default_context()


async def pool() -> asyncpg.Pool:
    """Ленивый пул соединений (per-процесс, создаётся при первом запуске)."""
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
    """Закрыть пул (вызывается при остановке сервиса)."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def insert_price(row: dict[str, Any]) -> bool:
    """Вставить одну строку цены. Ошибки не роняют сервис — логируем."""
    p = await pool()
    try:
        async with p.acquire() as conn:
            await conn.execute(
                INSERT_SQL,
                _cuid_like(),
                row["source"],
                row["query"],
                float(row["price"]),
                row.get("unit") or "₽/кг",
                row.get("region"),
                row.get("sellerName"),
                row["link"],
                row.get("rawSnippet", ""),
                _naive_utc(row.get("fetchedAt") or datetime.now(timezone.utc)),
            )
        return True
    except Exception:  # noqa: BLE001 — парсер не падает из-за одной строки
        log.exception("не удалось записать цену: %s", row.get("link"))
        return False


async def insert_prices(rows: list[dict[str, Any]]) -> int:
    """Вставить пачку, вернуть число успешно записанных."""
    saved = 0
    for row in rows:
        if await insert_price(row):
            saved += 1
    return saved


async def ping() -> bool:
    """Проверка доступности БД (для /health)."""
    try:
        p = await pool()
        async with p.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return True
    except Exception:  # noqa: BLE001
        return False
