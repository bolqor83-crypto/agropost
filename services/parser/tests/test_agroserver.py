"""Адаптер Агросервера: robots.txt, sitemap-матчинг, страницы, лимиты.

HTML-фикстуры синтетические: парсер читает ЦЕНУ ИЗ ТЕКСТА, поэтому
структура вёрстки на тесты не влияет (это и есть защита от «сайт
изменился — упал»).
"""

from __future__ import annotations

import asyncio

from app.adapters.agroserver import (
    AgroserverAdapter,
    RateLimiter,
    is_allowed,
    is_blocked_page,
    match_ad_urls,
    parse_ad_page,
    parse_robots,
    sitemap_loc_urls,
)

# Реальный robots.txt Агросервера (снят 2026-11-24 при разведке этапа).
ROBOTS_TXT = """User-Agent: *
Disallow: /b/img/
Disallow: /portal/kontragent
Disallow: /reklama/
Disallow: /rk/
Disallow: /b/redir/
Disallow: /b/sm/
Disallow: /b/ajax
Disallow: /account/
Disallow: /spros/ajax
Disallow: /spros/sm/
Disallow: /search/
Disallow: /user-fav/
Disallow: /user/*/spros
Disallow: /user/*/rating
Disallow: /user/*/contacts

User-Agent: Yandex
Disallow: /
"""

SITEMAP_XML = """<?xml version="1.0" encoding="UTF-8"?>
<urlset>
<url><loc>https://agroserver.ru/b/semena-sudanskoy-travy-elitnye-156827.htm</loc></url>
<url><loc>https://agroserver.ru/b/sudanka-semena-sort-kamyshinskaya-179354.htm</loc></url>
<url><loc>https://agroserver.ru/b/semena-kormovykh-trav-espartset-lyutserna-sudanskaya-trava-192823.htm</loc></url>
<url><loc>https://agroserver.ru/b/zil-131-kung-10088.htm</loc></url>
<url><loc>https://agroserver.ru/korma-dlya-koshek-sobak/p1-city-559.htm</loc></url>
<url><loc>https://agroserver.ru/spros/okhladiteli-moloka/p1-city-1114.htm</loc></url>
</urlset>
"""

AD_HTML = """<!DOCTYPE html><html lang="ru"><head><title>Продам семена люцерны — АгроСервер.ру</title></head>
<body><h1>Продам семена люцерны</h1>
<p>Продаём семена люцерны Вега 87, репродукция РС-1, всхожесть 92%.
Цена 180 ₽/кг при самовывозе. Тел: +7 900 123-45-67, e-mail: sale@example.ru</p>
</body></html>"""

AD_HTML_NO_PRICE = """<html><head><title>Куплю семена</title></head>
<body><p>Куплю люцерну, цена договорная, звоните.</p></body></html>"""

CAPTCHA_HTML = """<html><body><h1>Сервер временно недоступен</h1>
<p>Введите код, указанный на картинке:</p><form><input name="code"></form></body></html>"""


def test_parse_robots_real_txt() -> None:
    rules = parse_robots(ROBOTS_TXT)
    assert "/search/" in rules
    assert "/account/" in rules
    # секция Yandex не должна попасть в правила «*»
    assert "/" not in rules


def test_is_allowed_ads_pages() -> None:
    rules = parse_robots(ROBOTS_TXT)
    assert is_allowed("/b/semena-29926.htm", rules)
    assert is_allowed("/sitemap/sitemap.xml", rules)
    assert not is_allowed("/search/?text=lucerne", rules)
    assert not is_allowed("/account/login", rules)
    assert not is_allowed("/b/img/1.jpg", rules)


def test_sitemap_loc_urls() -> None:
    urls = sitemap_loc_urls(SITEMAP_XML)
    assert len(urls) == 6
    assert urls[0].endswith("156827.htm")


def test_match_ad_urls_translit() -> None:
    urls = sitemap_loc_urls(SITEMAP_XML)
    # «люцерна» → lyutserna
    assert match_ad_urls(urls, ["lyutserna"], 5) == [urls[2]]
    # «суданка» → sudan/sudank
    sudan = match_ad_urls(urls, ["sudan"], 5)
    assert urls[0] in sudan and urls[1] in sudan and urls[2] in sudan
    # «зил» не матчится по агро-ключевым словам
    assert match_ad_urls(urls, ["lyutserna"], 5) != urls[3]


def test_match_ad_urls_limit() -> None:
    urls = sitemap_loc_urls(SITEMAP_XML)
    assert len(match_ad_urls(urls, ["sudan"], 2)) == 2


def test_is_blocked_page_captcha() -> None:
    assert is_blocked_page(CAPTCHA_HTML)
    assert not is_blocked_page(AD_HTML)


def test_parse_ad_page_price_and_sanitized_snippet() -> None:
    row = parse_ad_page(AD_HTML, "https://agroserver.ru/b/prodam-semena-lyutserny-1.htm", "люцерна")
    assert row is not None
    assert row["source"] == "AGROSERVER"
    assert row["query"] == "люцерна"
    assert row["price"] == 180
    assert row["unit"] == "₽/кг"
    assert row["link"].endswith(".htm")
    # 152-ФЗ: телефон и e-mail вычищены из сниппета
    assert "+7 900" not in row["rawSnippet"]
    assert "example.ru" not in row["rawSnippet"]
    assert "180 ₽/кг" in row["rawSnippet"]


def test_parse_ad_page_no_price() -> None:
    assert parse_ad_page(AD_HTML_NO_PRICE, "https://agroserver.ru/b/kuplyu-1.htm", "люцерна") is None


def test_parse_ad_page_blocked() -> None:
    assert parse_ad_page(CAPTCHA_HTML, "https://agroserver.ru/b/x-1.htm", "люцерна") is None


async def test_rate_limiter_paces_requests() -> None:
    limiter = RateLimiter(interval=0.2)
    await limiter.wait()
    await asyncio.sleep(0.01)
    import time

    start = time.monotonic()
    await limiter.wait()
    elapsed = time.monotonic() - start
    assert elapsed >= 0.15  # второй запрос не раньше, чем через interval


async def test_collect_network_error_is_graceful(monkeypatch) -> None:
    """Агросервер недоступен → статус error, исключение НЕ всплывает."""
    from types import SimpleNamespace

    import app.adapters.agroserver as ag_mod

    fake_settings = SimpleNamespace(
        agroserver_base="http://127.0.0.1:9",
        agroserver_request_interval=0.01,
        agroserver_sitemap_chunks=1,
        slug_keywords=ag_mod.settings.slug_keywords,
        user_agent=ag_mod.settings.user_agent,
    )
    monkeypatch.setattr(ag_mod, "settings", fake_settings)
    adapter = AgroserverAdapter()
    try:
        rows, stats = await adapter.collect(["люцерна"])
        assert rows == []
        assert stats.status in {"error", "empty", "blocked"}
        assert stats.note
    finally:
        await adapter.close()
