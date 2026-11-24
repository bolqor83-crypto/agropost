"""Извлечение цен и обезличивание (152-ФЗ) — ядро обоих адаптеров."""

from __future__ import annotations

from app.extract import (
    parse_price_per_kg,
    sanitize_snippet,
    snippet_around_price,
    strip_html,
)


def test_price_rub_sign() -> None:
    assert parse_price_per_kg("Семена люцерны, 180 ₽/кг, от 1 т") == 180


def test_price_rub_word() -> None:
    assert parse_price_per_kg("суданка 95 руб/кг") == 95


def test_price_rubles_full() -> None:
    assert parse_price_per_kg("эспарцет от 210 рублей за кг") == 210


def test_price_decimal_comma() -> None:
    assert parse_price_per_kg("85,5 ₽/кг") == 85.5


def test_price_thousands_separator() -> None:
    # «1 200 ₽/кг» — с пробелом-разделителем тысяч
    assert parse_price_per_kg("пшеница 1 200 ₽/кг") == 1200


def test_price_absent() -> None:
    assert parse_price_per_kg("Цена договорная, звоните") is None
    assert parse_price_per_kg("") is None


def test_price_nonsense_rejected() -> None:
    # отрицательные/гигантские значения отбрасываем
    assert parse_price_per_kg("0 ₽/кг") is None


def test_sanitize_strips_phone() -> None:
    cleaned = sanitize_snippet("Продажа. Тел: +7 900 123-45-67. Цена 100 ₽/кг")
    assert "+7" not in cleaned
    assert "900" not in cleaned
    assert "100 ₽/кг" in cleaned


def test_sanitize_strips_email_and_url() -> None:
    cleaned = sanitize_snippet("Пишите ivan@mail.ru или http://ex.ru, цена 90 руб/кг")
    assert "ivan@mail.ru" not in cleaned
    assert "http" not in cleaned
    assert "90 руб/кг" in cleaned


def test_sanitize_truncates_words() -> None:
    text = " ".join(f"слово{i}" for i in range(60))
    cleaned = sanitize_snippet(text, max_len=40)
    assert len(cleaned) <= 45
    assert cleaned.endswith("…")


def test_strip_html() -> None:
    html = "<html><head><style>.x{}</style></head><body><p>Продаём семена.</p></body></html>"
    assert strip_html(html) == "Продаём семена."
