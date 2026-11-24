"""Оркестратор прогона: адаптеры → строки цен → база → статистика.

Этап 5.1: MTProto-сбор публичных Telegram-каналов ВЫКЛЮЧЕН по
умолчанию (TG_COLLECT_ENABLED=0). Даже если источник указан явно —
адаптер отвечает «disabled», сбор запрещённых данных не идёт.
Агросервер работает по robots.txt (fail-closed, см. adapters).
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from .adapters.agroserver import AdapterStats, AgroserverAdapter
from .adapters.telegram import TelegramAdapter, TelegramStats
from .config import settings
from .db import insert_prices

log = logging.getLogger("agropost.parser.runner")


class RunReport:
    """Итог прогона (возвращается в /run и хранится для /status)."""

    def __init__(self, run_id: str, queries: list[str], sources: list[str]) -> None:
        self.run_id = run_id
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.finished_at: str | None = None
        self.queries = queries
        self.sources = sources
        self.agroserver: dict[str, Any] | None = None
        self.telegram: dict[str, Any] | None = None
        self.saved = 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "runId": self.run_id,
            "startedAt": self.started_at,
            "finishedAt": self.finished_at,
            "queries": self.queries,
            "sources": self.sources,
            "adapters": {"agroserver": self.agroserver, "telegram": self.telegram},
            "saved": self.saved,
        }


async def run_collection(
    queries: list[str] | None = None,
    sources: list[str] | None = None,
) -> RunReport:
    """Запустить сбор. queries/sources — фильтры ручного запуска."""
    report = RunReport(
        run_id=uuid.uuid4().hex[:12],
        queries=list(queries or settings.queries),
        sources=list(sources or ["AGROSERVER", "TELEGRAM"]),
    )
    log.info("прогон %s: queries=%s sources=%s", report.run_id, report.queries, report.sources)

    rows: list[dict[str, Any]] = []

    if "AGROSERVER" in report.sources:
        adapter = AgroserverAdapter()
        try:
            agro_rows, stats = await adapter.collect(report.queries)
            rows.extend(agro_rows)
            report.agroserver = {**stats.as_dict(), "found": len(agro_rows)}
        finally:
            await adapter.close()

    if "TELEGRAM" in report.sources:
        adapter = TelegramAdapter()
        try:
            if not adapter.collect_enabled():
                report.telegram = {
                    "status": "disabled",
                    "note": (
                        "MTProto-сбор публичных каналов выключен по умолчанию "
                        "(TG_COLLECT_ENABLED=0): включайте только для источников, "
                        "на обработку которых есть подтверждённое право"
                    ),
                }
            else:
                tg_rows, stats = await adapter.collect(report.queries)
                rows.extend(tg_rows)
                report.telegram = {**stats.as_dict(), "found": len(tg_rows)}
        finally:
            await adapter.close()

    if settings.database_url:
        report.saved = await insert_prices(rows)
    else:
        log.warning("DATABASE_URL пуст — собранные строки не сохранены (%d)", len(rows))

    report.finished_at = datetime.now(timezone.utc).isoformat()
    log.info(
        "прогон %s завершён: найдено %d, сохранено %d",
        report.run_id,
        len(rows),
        report.saved,
    )
    return report
