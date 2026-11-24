"""Cron внутри сервиса: APScheduler, сбор раз в 12 часов.

Планировщик не запускается при SCHEDULER_INTERVAL_HOURS=0 (только ручной
запуск через POST /run). Ошибка прогона не убивает расписание.
"""

from __future__ import annotations

import logging
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from .config import settings
from .runner import run_collection

log = logging.getLogger("agropost.parser.scheduler")

_scheduler: AsyncIOScheduler | None = None
_last_report: dict[str, Any] | None = None


def _handle_report(report: Any) -> None:
    global _last_report
    _last_report = report.as_dict()
    log.info("cron-прогон %s: сохранено %d", report.run_id, report.saved)


def start_scheduler() -> bool:
    """Запустить cron (раз в N часов). False — отключён конфигом."""
    global _scheduler
    if settings.scheduler_interval_hours <= 0:
        log.info("планировщик отключён (SCHEDULER_INTERVAL_HOURS=0)")
        return False
    _scheduler = AsyncIOScheduler(timezone="UTC")

    async def _job() -> None:
        try:
            report = await run_collection()
            _handle_report(report)
        except Exception:  # noqa: BLE001 — cron не должен падать
            log.exception("ошибка cron-прогона парсера")

    _scheduler.add_job(
        _job,
        trigger=IntervalTrigger(hours=settings.scheduler_interval_hours),
        id="collect-prices",
        name="Сбор цен конкурентов",
        replace_existing=True,
    )
    _scheduler.start()
    log.info("планировщик запущен: каждые %d ч", settings.scheduler_interval_hours)
    return True


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None


def last_scheduled_report() -> dict[str, Any] | None:
    """Отчёт последнего cron-прогона (для /status)."""
    return _last_report
