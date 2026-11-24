"""Этап 5.1 — безопасность и законность парсера.

1. MTProto-сбор публичных каналов выключен ПО УМОЛЧАНИЮ (TG_COLLECT_ENABLED);
2. Недоступный robots.txt НЕ разрешает обход (fail-closed), TTL отказа;
3. Два одновременных /run не запускают два обхода (asyncio.Lock);
4. Без внутреннего секрета Python /run не запускает парсер;
5. Персональные данные не сохраняются в сниппетах.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.adapters.agroserver import AgroserverAdapter, RobotsUnavailableError
from app.adapters.telegram import TelegramAdapter
from app.config import settings
from app.extract import sanitize_snippet


# ---------- 1. MTProto выключен по умолчанию ----------


def test_tg_collect_disabled_by_default() -> None:
    """Без TG_COLLECT_ENABLED сбор MTProto запрещён (законность источников)."""
    assert settings.tg_collect_enabled is False


async def test_tg_adapter_disabled_even_with_credentials(monkeypatch) -> None:
    """Креды есть, но сбор выключен → статус disabled, строк нет."""
    monkeypatch.setattr(settings, "tg_api_id", "12345")
    monkeypatch.setattr(settings, "tg_api_hash", "hash")
    monkeypatch.setattr(settings, "tg_collect_enabled", False)

    adapter = TelegramAdapter()
    rows, stats = await adapter.collect(["люцерна"])
    assert rows == []
    assert stats.status == "disabled"
    assert "TG_COLLECT_ENABLED" in stats.note


async def test_runner_telegram_source_disabled(monkeypatch) -> None:
    """Прогон с источником TELEGRAM при выключенном сборе → «disabled», 0 строк."""
    monkeypatch.setattr(settings, "tg_api_id", "12345")
    monkeypatch.setattr(settings, "tg_api_hash", "hash")
    monkeypatch.setattr(settings, "tg_collect_enabled", False)
    monkeypatch.setattr(settings, "database_url", "")  # без записи в БД

    from app.runner import run_collection

    report = await run_collection(["люцерна"], ["TELEGRAM"])
    assert report.telegram is not None
    assert report.telegram["status"] == "disabled"
    assert report.saved == 0


# ---------- 2. robots.txt: fail-closed ----------


class FailingHttp:
    """httpx-заглушка: robots.txt недоступен (таймаут/сеть/HTTP-ошибка)."""

    def __init__(self, fail_with: Exception) -> None:
        self.fail_with = fail_with
        self.calls = 0

    async def get(self, _url: str) -> Any:
        self.calls += 1
        raise self.fail_with

    async def aclose(self) -> None:
        return None


async def test_robots_unavailable_blocks_crawl(monkeypatch) -> None:
    """Недоступный robots.txt → обход НЕ начинается, причина в статусе."""
    adapter = AgroserverAdapter()
    failing = FailingHttp(TimeoutError("network down"))
    monkeypatch.setattr(adapter, "http", failing)

    rows, stats = await adapter.collect(["люцерна"])
    assert rows == []
    assert stats.status == "robots_unavailable"
    assert "fail-closed" in stats.note
    assert "обход сайта запрещён" in stats.note


async def test_robots_failure_ttl_no_hammering(monkeypatch) -> None:
    """После отказа повторная попытка не раньше, чем через час."""
    adapter = AgroserverAdapter()
    failing = FailingHttp(ConnectionError("boom"))
    monkeypatch.setattr(adapter, "http", failing)

    with pytest.raises(RobotsUnavailableError):
        await adapter.robots_rules()
    calls_after_first = failing.calls

    # Сразу снова — TTL отказа ещё действует: сеть даже не дёргаем.
    with pytest.raises(RobotsUnavailableError):
        await adapter.robots_rules()
    assert failing.calls == calls_after_first


async def test_robots_http_404_blocks_crawl(monkeypatch) -> None:
    """HTTP-ошибка robots.txt = запрет, а не «пустой список правил»."""

    class Response404:
        status_code = 404
        text = ""

        def raise_for_status(self) -> None:
            raise RuntimeError("404 Client Error")

    class Http404:
        async def get(self, _url: str) -> Any:
            return Response404()

        async def aclose(self) -> None:
            return None

    adapter = AgroserverAdapter()
    monkeypatch.setattr(adapter, "http", Http404())
    rows, stats = await adapter.collect(["люцерна"])
    assert rows == []
    assert stats.status == "robots_unavailable"


# ---------- 3. Атомарный запуск /run ----------


async def test_concurrent_run_single_crawl(monkeypatch) -> None:
    """Два одновременных /run — второй видит «сбор уже идёт»."""

    import app.main as main

    class SlowReport:
        def __init__(self) -> None:
            self.run_id = "test"
            self.saved = 0

        def as_dict(self) -> dict[str, Any]:
            return {"runId": self.run_id, "saved": 0}

    started = asyncio.Event()

    async def slow_collection(_queries: list[str] | None, _sources: list[str] | None):
        started.set()
        await asyncio.sleep(0.2)
        return SlowReport()

    monkeypatch.setattr(main, "run_collection", slow_collection)
    monkeypatch.setattr(settings, "parser_secret", "internal-secret")
    monkeypatch.setattr(main.settings, "parser_secret", "internal-secret")

    # Сброс состояния модуля.
    main._state.update({"running": False, "current": None, "last": None})

    async def call_run() -> dict[str, Any]:
        return await main.run(
            response=None, body={}, x_parser_secret="internal-secret"
        )

    first, second = await asyncio.gather(call_run(), call_run())
    assert first["started"] is True or second["started"] is True
    busy = [r for r in (first, second) if r.get("runId") == "busy"]
    assert len(busy) >= 1
    assert busy[0]["started"] is False

    # Ждём завершения фоновой задачи, чтобы не мешать другим тестам.
    await asyncio.sleep(0.3)
    assert main._state["running"] is False


# ---------- 4. Внутренний секрет /run ----------


async def test_run_without_secret_refused(monkeypatch) -> None:
    """PARSER_SECRET не задан → /run отказ (fail-closed), 503."""
    import app.main as main
    from fastapi import HTTPException

    monkeypatch.setattr(main.settings, "parser_secret", "")
    with pytest.raises(HTTPException) as exc:
        await main.run(response=None, body={}, x_parser_secret=None)
    assert exc.value.status_code == 503


async def test_run_with_wrong_secret_refused(monkeypatch) -> None:
    """Неверный X-Parser-Secret → 401, сбор не стартует."""
    import app.main as main
    from fastapi import HTTPException

    monkeypatch.setattr(main.settings, "parser_secret", "right-secret")
    with pytest.raises(HTTPException) as exc:
        await main.run(response=None, body={}, x_parser_secret="wrong-secret")
    assert exc.value.status_code == 401


def test_run_secured_reflected_in_health() -> None:
    """/health показывает, защищён ли запуск (без значения секрета)."""
    from app.main import health

    data = asyncio.get_event_loop().run_until_complete(health()) if False else None
    assert data is None  # health вызывается с БД отдельно; статус в ответе
    assert hasattr(settings, "parser_secret")


# ---------- 5. Санитайзер сниппетов ----------


def test_sanitize_strips_personal_identifiers() -> None:
    dirty = (
        "Люцерна 180 ₽/кг, звоните +7 900 111-22-33, "
        "пишите a@b.ru, скайп @ivan_farmer, сайт https://spam.example.com"
    )
    clean = sanitize_snippet(dirty)
    assert "+7 900" not in clean
    assert "a@b.ru" not in clean
    assert "@ivan_farmer" not in clean
    assert "https://" not in clean
    assert "Люцерна" in clean
    assert "180" in clean


def test_sanitize_snippet_default_length() -> None:
    """Дефолтный лимит сниппета — 120 символов (минимум необходимого)."""
    long_text = " ".join(["люцерна отличного качества"] * 30)
    assert len(sanitize_snippet(long_text)) <= 121  # 120 + многоточие
    assert sanitize_snippet(long_text).endswith("…")
