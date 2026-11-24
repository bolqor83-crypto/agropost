"""Адаптер Агросервера (агро-доска объявлений, agroserver.ru).

Подход — без единого удара по запрещённым robots.txt путям:
- robots.txt запрещает /search/ → поиском не пользуемся;
- sitemap.xml сайт публикует для роботов (это его инвентарь) — читаем;
- в sitemap находим объявления /b/{slug}-{id}.htm по транслит-ключевым
  словам запроса («люцерна» → lyutserna, «суданка» → sudan…);
- страницы объявлений /b/*.htm robots.txt разрешает — читаем их
  с лимитом 1 запрос / 2 сек и браузерным User-Agent.

Цена извлекается из ТЕКСТА страницы (regex «180 ₽/кг»…): смена вёрстки
не ломает парсер. Если сайт закрыл контент капчей («Сервер временно
недоступен») — фиксируем статус «blocked», НЕ падаем и НЕ пишем мусор.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import httpx

from ..config import settings
from ..extract import (
    html_title,
    parse_price_per_kg,
    sanitize_snippet,
    snippet_around_price,
    strip_html,
)

log = logging.getLogger("agropost.parser.agroserver")

UA = settings.user_agent
BLOCK_MARKERS = ("Введите код", "Сервер временно недоступен", "введите код, указанный")


@dataclass
class AdapterStats:
    """Итоги прогона адаптера — уходят в /status и отчёт прогона."""

    status: str = "idle"  # idle | ok | empty | blocked | error
    pages: int = 0
    candidates: int = 0
    saved: int = 0
    note: str = ""
    started_at: str | None = None
    finished_at: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "pages": self.pages,
            "candidates": self.candidates,
            "saved": self.saved,
            "note": self.note,
            "startedAt": self.started_at,
            "finishedAt": self.finished_at,
        }


def parse_robots(robots_text: str) -> list[str]:
    """Disallow-правила секции User-agent: * (простой парсер robots.txt)."""
    rules: list[str] = []
    current_agents: list[str] = []
    for line in robots_text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, value = line.partition(":")
        key = key.strip().lower()
        value = value.strip()
        if key == "user-agent":
            current_agents = [value] if value else []
        elif key == "disallow" and current_agents and value:
            if any(agent == "*" for agent in current_agents):
                rules.append(value)
    return rules


def is_allowed(path: str, disallow_rules: list[str]) -> bool:
    """Путь разрешён? Сравнение префиксов по правилам robots.txt."""
    for rule in disallow_rules:
        if rule == "/":
            return False
        if path.startswith(rule):
            return False
    return True


def sitemap_loc_urls(xml_text: str) -> list[str]:
    """Все <loc> из sitemap-XML (в порядке следования)."""
    return re.findall(r"(?is)<loc>\s*(.*?)\s*</loc>", xml_text)


def match_ad_urls(urls: list[str], slug_keywords: list[str], limit: int) -> list[str]:
    """Объявления /b/*.htm, чей слаг содержит ключевое слово (транслит)."""
    matched: list[str] = []
    for url in urls:
        path = urlparse(url).path
        if not path.startswith("/b/") or not path.endswith(".htm"):
            continue
        slug = path[len("/b/"): -len(".htm")].lower()
        if any(keyword in slug for keyword in slug_keywords):
            matched.append(url)
            if len(matched) >= limit:
                break
    return matched


def is_blocked_page(html: str) -> bool:
    """Сайт отдал капчу/заглушку вместо контента?"""
    if not html:
        return True
    if len(html) < 15_000 and any(marker in html for marker in BLOCK_MARKERS):
        return True
    return any(marker in html for marker in BLOCK_MARKERS[:2]) and "<form" in html


def parse_ad_page(html: str, url: str, query: str) -> dict[str, Any] | None:
    """Объявление → строка цены. None = цены нет или страница закрыта."""
    if is_blocked_page(html):
        return None
    text = strip_html(html)
    price = parse_price_per_kg(text)
    if price is None:
        return None
    title = html_title(html) or ""
    snippet = snippet_around_price(text)
    if title and title not in snippet:
        snippet = f"{title} — {snippet}"
    return {
        "source": "AGROSERVER",
        "query": query,
        "price": price,
        "unit": "₽/кг",
        "region": None,  # регион на странице разный — не спекулируем
        "sellerName": None,  # только названия компаний, а их разметка меняется
        "link": url,
        "rawSnippet": sanitize_snippet(snippet, 200),
        "fetchedAt": datetime.now(timezone.utc),
    }


class RateLimiter:
    """Не чаще 1 запроса в interval секунд (ТЗ: не более 1 в 2 сек)."""

    def __init__(self, interval: float) -> None:
        self.interval = interval
        self._last = 0.0
        self._lock = asyncio.Lock()

    async def wait(self) -> None:
        async with self._lock:
            now = time.monotonic()
            delay = self._last + self.interval - now
            if delay > 0:
                await asyncio.sleep(delay)
            self._last = time.monotonic()


@dataclass
class AgroserverAdapter:
    """Агросервер: sitemap → объявления → цены."""

    http: httpx.AsyncClient = field(
        default_factory=lambda: httpx.AsyncClient(
            headers={"User-Agent": UA, "Accept-Language": "ru-RU,ru;q=0.9"},
            timeout=30,
            follow_redirects=True,
        ),
    )
    _robots_cache: dict[str, list[str]] = field(default_factory=dict)
    _robots_cached_at: float = 0.0
    limiter: RateLimiter = field(
        default_factory=lambda: RateLimiter(settings.agroserver_request_interval),
    )

    async def robots_rules(self) -> list[str]:
        """robots.txt (кэш 24 ч). Ошибка загрузки — консервативно пустой список."""
        now = time.time()
        if now - self._robots_cached_at < 24 * 3600 and self._robots_cache:
            return list(self._robots_cache.get("rules", []))
        try:
            await self.limiter.wait()
            res = await self.http.get(f"{settings.agroserver_base}/robots.txt")
            res.raise_for_status()
            rules = parse_robots(res.text)
        except Exception as err:  # noqa: BLE001 — robots не должен ронять парсер
            log.warning("robots.txt не прочитан (%s) — продолжаем осторожно", err)
            rules = ["/search/", "/account/"]  # известные запреты из ТЗ-разведки
        self._robots_cache["rules"] = rules
        self._robots_cached_at = now
        return list(rules)

    async def sitemap_chunks(self) -> list[str]:
        """Индекс sitemap → первые N чанков (там лежат /b/-объявления;
        хвостовые чанки — только страницы категорий, разведка 2026-11-24)."""
        await self.limiter.wait()
        res = await self.http.get(f"{settings.agroserver_base}/sitemap/sitemap.xml")
        res.raise_for_status()
        chunks = re.findall(r"(?is)<loc>\s*(.*?)\s*</loc>", res.text)
        if not chunks:
            raise RuntimeError("индекс sitemap пуст — структура сайта изменилась?")
        head = chunks[: settings.agroserver_sitemap_chunks]
        return head

    async def collect(self, queries: list[str]) -> tuple[list[dict[str, Any]], AdapterStats]:
        """Собрать цены по всем запросам. Не бросает исключений наружу."""
        stats = AdapterStats()
        stats.started_at = datetime.now(timezone.utc).isoformat()
        rows: list[dict[str, Any]] = []
        try:
            rules = await self.robots_rules()
            for chunk_url in await self.sitemap_chunks():
                if not is_allowed(urlparse(chunk_url).path, rules):
                    log.info("sitemap %s запрещён robots.txt — пропускаем", chunk_url)
                    continue
                await self.limiter.wait()
                res = await self.http.get(chunk_url)
                res.raise_for_status()
                stats.pages += 1
                urls = sitemap_loc_urls(res.text)
                for query in queries:
                    keywords = settings.slug_keywords.get(query, [query])
                    ads = match_ad_urls(
                        urls, keywords, settings.agroserver_max_ads_per_query,
                    )
                    stats.candidates += len(ads)
                    for url in ads:
                        if not is_allowed(urlparse(url).path, rules):
                            continue
                        await self.limiter.wait()
                        ad_res = await self.http.get(url)
                        stats.pages += 1
                        row = parse_ad_page(ad_res.text, url, query)
                        if row is not None:
                            rows.append(row)
                        elif is_blocked_page(ad_res.text):
                            stats.status = "blocked"
                            stats.note = (
                                "сайт отдал капчу/заглушку (IP заблокирован?) — "
                                "запустите сбор вручную с другой машины"
                            )
                            log.warning("Агросервер закрыт капчей: %s", url)
                            return rows, stats
            stats.status = "ok" if rows else "empty"
            if stats.status == "empty":
                stats.note = "подходящих объявлений с ценой не найдено"
        except Exception as err:  # noqa: BLE001 — парсер не должен падать
            stats.status = "error"
            stats.note = f"{type(err).__name__}: {err}"
            log.exception("Агросервер: ошибка адаптера")
        stats.finished_at = datetime.now(timezone.utc).isoformat()
        return rows, stats

    async def close(self) -> None:
        await self.http.aclose()
