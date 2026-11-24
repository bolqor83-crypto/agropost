"""Настройки парсера (этап 2.5). Всё читается из .env, ничего в коде.

Правила безопасности (152-ФЗ и ТЗ):
- собираем ТОЛЬКО обезличенные данные: цены, названия, ссылки;
- никаких телефонов, ФИО, адресов;
- Telegram — только публичные каналы, отдельный аккаунт;
- Агросервер — robots.txt и не более 1 запроса в 2 секунды;
- ключи (TG_API_ID/TG_API_HASH, session) — только в .env.

Этап 5.1 (безопасность и законность):
- TG_COLLECT_ENABLED=0 ПО УМОЛЧАНИЮ: массовый MTProto-сбор публичных
  каналов выключен — включается только владельцем вручную для
  ИСТОЧНИКОВ, НА КОТОРЫЕ У НЕГО ЕСТЬ ПРАВО (официальные API/свои каналы);
- PARSER_SECRET: внутренний секрет Node API → Python /run — без него
  запуск сбора запрещён (fail-closed, сервер-сервер);
- robots.txt недоступен → обход НЕ начинается (fail-closed, раньше
  ошибка чтения трактовалась как «разрешено»).
"""

from __future__ import annotations

import os

from dotenv import load_dotenv

# override=True: в песочницах/CI бывает глобальный DATABASE_URL (мусор от
# соседних сервисов) — наш .env важнее окружения.
load_dotenv(override=True)


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    try:
        return int(raw) if raw else default
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name, "").strip()
    try:
        return float(raw) if raw else default
    except ValueError:
        return default


def _env_list(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return list(default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name, "").strip().lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


class Settings:
    """Все параметры парсера. Меняйте через .env, не в коде."""

    # База — та же, что у основного API (Neon).
    database_url: str = os.getenv("DATABASE_URL", "").strip()

    # Порт сервиса.
    port: int = _env_int("PORT", 8000)

    # Запросы парсера (ТЗ этапа 2.5).
    queries: list[str] = _env_list(
        "AGROSERVER_QUERIES",
        ["люцерна", "эспарцет", "суданка", "грецкий орех"],
    )

    # Агросервер: sitemap-подход (robots.txt разрешает sitemap и /b/*.htm,
    # а /search/ запрещён — им не пользуемся). Объявления лежат в ПЕРВЫХ
    # чанках sitemap (хвостовые — категории; разведка 2026-11-24).
    agroserver_base: str = "https://agroserver.ru"
    agroserver_sitemap_chunks: int = _env_int("AGROSERVER_SITEMAP_CHUNKS", 3)
    agroserver_max_ads_per_query: int = _env_int("AGROSERVER_MAX_ADS_PER_QUERY", 5)
    agroserver_request_interval: float = _env_float("AGROSERVER_REQUEST_INTERVAL", 2.0)

    # Telegram (MTProto, Telethon) — отдельный аккаунт, не основной!
    tg_api_id: str = os.getenv("TG_API_ID", "").strip()
    tg_api_hash: str = os.getenv("TG_API_HASH", "").strip()
    tg_session: str = os.getenv("TG_SESSION", "").strip()
    tg_channels: list[str] = _env_list("TG_CHANNELS", ["selhoz032", "RUSSIAN_WHOLESALER"])
    tg_messages_limit: int = _env_int("TG_MESSAGES_LIMIT", 200)
    tg_request_interval: float = _env_float("TG_REQUEST_INTERVAL", 1.5)
    tg_max_channels: int = _env_int("TG_MAX_CHANNELS", 500)

    # Этап 5.1: массовый MTProto-сбор публичных каналов ВЫКЛЮЧЕН по
    # умолчанию. Включайте только для источников, на обработку которых
    # у владельца есть подтверждённое право (свои каналы/официальные API).
    # Telegram ToS ограничивает сбор и агрегирование контента публичных
    # каналов без разрешения — по умолчанию не собираем.
    tg_collect_enabled: bool = _env_bool("TG_COLLECT_ENABLED", False)

    # Этап 5.1: внутренний секрет сервер-сервер (Node API → /run).
    # Без него /run отвечает отказом — публичный запуск невозможен.
    parser_secret: str = os.getenv("PARSER_SECRET", "").strip()

    # Cron внутри сервиса: раз в 12 часов (0 = выключить).
    scheduler_interval_hours: int = _env_int("SCHEDULER_INTERVAL_HOURS", 12)

    # User-Agent — как у браузера (вежливый обход, 1 запрос / 2 сек).
    user_agent: str = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    )

    @property
    def slug_keywords(self) -> dict[str, list[str]]:
        """Транслитерация ключевых слов для слагов sitemap Агросервера."""
        return {
            "люцерна": ["lyutserna", "lyucerna", "lucerna", "lucerne"],
            "эспарцет": ["esparcet", "espartset", "esparset"],
            "суданка": ["sudan", "sudank"],
            "суданская трава": ["sudan", "sudank"],
            "грецкий орех": ["oreh", "orekh", "greck", "grek", "orehovo", "oresh"],
        }


settings = Settings()
