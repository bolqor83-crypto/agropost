"""АгроПост — сервис парсинга цен конкурентов (этап 2.5).

FastAPI поверх адаптеров (Агросервер + Telegram/MTProto):
- GET  /health  — живость, БД, креды TG, планировщик;
- POST /run     — запуск сбора (только с внутренним секретом X-Parser-Secret,
                   фоновое выполнение: ответ сразу, итог в /status);
- GET  /status  — текущий/последний прогон + cron-прогон.

Этап 5.1 (безопасность):
- /run закрыт внутренним секретом PARSER_SECRET (Node API передаёт его
  сервер-сервер); без секрета — 503 fail-closed, запуск невозможен.
  Секрет не логируется;
- запуск защищён asyncio.Lock: два одновременных /run не запускают
  два независимых обхода — второй получает «сбор уже идёт»;
- MTProto-сбор публичных каналов выключен по умолчанию (TG_COLLECT_ENABLED).

Правила безопасности обязательны (см. README): только обезличенные
данные, Telegram — отдельный аккаунт, Агросервер — robots.txt и
1 запрос / 2 сек. Креды — только в .env.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Response

from .adapters.telegram import configured as tg_configured
from .config import settings
from .db import close as db_close
from .db import ping as db_ping
from .runner import run_collection
from .scheduler import last_scheduled_report, start_scheduler, stop_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("agropost.parser")

VERSION = "0.3.0"

_state: dict[str, Any] = {"running": False, "current": None, "last": None}

# Этап 5.1: атомарная блокировка запуска — конкурентные /run
# не запускают второй обход.
_run_lock = asyncio.Lock()


async def _execute(run_queries: list[str] | None, run_sources: list[str] | None) -> None:
    """Фоновый прогон: результат копится в _state, ошибки не всплывают.

    Флаг running/current выставлены вызывающим (/run) ДО старта задачи —
    чтобы конкурентный запрос между create_task и первым тактом задачи
    уже видел «сбор идёт» и не запустил второй обход.
    """
    try:
        report = await run_collection(run_queries, run_sources)
        _state["last"] = report.as_dict()
    except Exception:  # noqa: BLE001 — сервис не падает из-за прогона
        log.exception("прогон упал")
    finally:
        _state["running"] = False
        _state["current"] = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    scheduler_on = start_scheduler()
    log.info(
        "agropost-parser %s: cron=%s, telegram=%s",
        VERSION,
        f"раз в {settings.scheduler_interval_hours} ч" if scheduler_on else "выключен",
        "настроен (сбор выключен до TG_COLLECT_ENABLED=1)"
        if tg_configured() and not settings.tg_collect_enabled
        else ("включён" if settings.tg_collect_enabled else "нет кредов (skipped)"),
    )
    if not settings.parser_secret:
        log.warning(
            "PARSER_SECRET не задан: запуск сбора через /run запрещён "
            "(fail-closed). Задайте одинаковый секрет в env Node API и парсера."
        )
    try:
        yield
    finally:
        stop_scheduler()
        await db_close()


app = FastAPI(title="agropost-parser", version=VERSION, lifespan=lifespan)


def _check_parser_secret(x_parser_secret: str | None) -> None:
    """Fail-closed: без совпавшего секрета /run запрещён (503)."""
    if not settings.parser_secret:
        raise HTTPException(
            status_code=503,
            detail=(
                "Парсер не настроен: не задан PARSER_SECRET "
                "(внутренний секрет Node API → парсер)"
            ),
        )
    if not x_parser_secret or x_parser_secret != settings.parser_secret:
        raise HTTPException(status_code=401, detail="Неверный внутренний секрет")


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "agropost-parser",
        "version": VERSION,
        "stage": "5.1",
        "database": await db_ping() if settings.database_url else False,
        "telegram": (
            "disabled"
            if tg_configured() and not settings.tg_collect_enabled
            else ("configured" if tg_configured() else "skipped")
        ),
        "telegramCollect": settings.tg_collect_enabled,
        "runSecured": bool(settings.parser_secret),
        "scheduler": settings.scheduler_interval_hours > 0,
    }


@app.post("/run")
async def run(
    response: Response,
    body: dict[str, Any] | None = None,
    x_parser_secret: str | None = Header(default=None, alias="X-Parser-Secret"),
) -> dict[str, Any]:
    """Запуск сбора — только с внутренним секретом (сервер-сервер).

    Сбор идёт фоном, итог — в /status. Атомарная блокировка:
    конкурентный вызов не создаёт второй обход.
    """
    _check_parser_secret(x_parser_secret)

    if _run_lock.locked() or _state["running"]:
        return {
            "ok": True,
            "runId": "busy",
            "started": False,
            "note": "сбор уже идёт — итог смотрите в /status",
        }

    body = body or {}
    queries = body.get("queries")
    sources = body.get("sources")
    if not isinstance(queries, list) and queries is not None:
        queries = None
    if not isinstance(sources, list) and sources is not None:
        sources = None
    async with _run_lock:
        if _state["running"]:
            return {
                "ok": True,
                "runId": "busy",
                "started": False,
                "note": "сбор уже идёт — итог смотрите в /status",
            }
        # Захват флага ДО create_task: окно гонки закрыто.
        _state["running"] = True
        _state["current"] = {
            "startedAt": datetime.now(timezone.utc).isoformat(),
            "queries": queries or settings.queries,
            "sources": sources or ["AGROSERVER"],
        }
        task = asyncio.create_task(_execute(queries, sources))
        task.add_done_callback(lambda t: t.exception() if not t.cancelled() else None)
        return {
            "ok": True,
            "runId": "запущен фоном",
            "started": True,
            "note": "итог прогона появится в /status через несколько минут",
        }


@app.get("/status")
async def status() -> dict[str, Any]:
    return {
        "running": _state["running"],
        "current": _state["current"],
        "last": _state["last"],
        "scheduled": last_scheduled_report(),
        "telegramCollect": settings.tg_collect_enabled,
    }
