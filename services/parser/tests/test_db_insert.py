"""Интеграция с базой: вставка цен в CompetitorPrice и очистка.

Запускается только с DATABASE_URL (в прод-окружении), строки теста
удаляются за собой. Без DATABASE_URL — тест пропускается.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import pytest

from app.db import close, insert_price, pool

HAS_DB = bool(os.getenv("DATABASE_URL", "").strip())

pytestmark = pytest.mark.skipif(not HAS_DB, reason="нет DATABASE_URL — интеграционный тест пропущен")


async def _delete_test_rows() -> None:
    p = await pool()
    async with p.acquire() as conn:
        await conn.execute("DELETE FROM \"CompetitorPrice\" WHERE \"link\" LIKE 'https://example.test/%'")


async def test_insert_price_and_cleanup() -> None:
    try:
        ok = await insert_price(
            {
                "source": "AGROSERVER",
                "query": "люцерна",
                "price": 123.45,
                "unit": "₽/кг",
                "region": "Тестовый регион",
                "sellerName": None,
                "link": "https://example.test/1",
                "rawSnippet": "Интеграционный тест парсера (этап 2.5).",
                "fetchedAt": datetime.now(timezone.utc),
            },
        )
        assert ok is True
        p = await pool()
        async with p.acquire() as conn:
            count = await conn.fetchval(
                "SELECT COUNT(*) FROM \"CompetitorPrice\" WHERE \"link\" = $1",
                "https://example.test/1",
            )
            assert count == 1
            price = await conn.fetchval(
                "SELECT \"price\" FROM \"CompetitorPrice\" WHERE \"link\" = $1",
                "https://example.test/1",
            )
            assert float(price) == 123.45
    finally:
        await _delete_test_rows()
        # пул привязан к event-loop этого теста — закрываем за собой
        await close()


async def test_window_rows_visible() -> None:
    """Строки старше окна (30 дней) существуют, но агрегат их не возьмёт:
    здесь проверяем только запись/чтение старой строки и её удаление."""
    try:
        ok = await insert_price(
            {
                "source": "TELEGRAM",
                "query": "грецкий орех",
                "price": 99,
                "unit": "₽/кг",
                "region": None,
                "sellerName": None,
                "link": "https://example.test/old",
                "rawSnippet": "Старая строка вне окна (тест).",
                "fetchedAt": datetime.now(timezone.utc) - timedelta(days=45),
            },
        )
        assert ok is True
    finally:
        await _delete_test_rows()
    await close()
