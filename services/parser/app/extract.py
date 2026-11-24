"""Извлечение цен из текста объявлений + обезличивание (152-ФЗ).

Только цена, название и МИНИМАЛЬНЫЙ фрагмент текста: телефоны,
@usernames, e-mail, веб-адреса и «контакты» вычищаются ДО записи.

Этап 5.1 (честность): сниппет — служебный минимум для карточки цены,
по умолчанию 120 символов. Полной анонимизации НЕ гарантируем —
свободный текст может содержать узнаваемые детали; поэтому его
объём урезан до необходимого. Персональные идентификаторы вычищаются
эвристиками (телефоны/email/URL/@username).
"""

from __future__ import annotations

import re

# 180 ₽/кг · 180 руб/кг · 180 р/кг · 180 руб./кг · 180 рублей за кг
# Поддерживаем пробелы-разделители тысяч (180 000) и «от N».
_PRICE_RE = re.compile(
    r"(?:от\s+)?(\d{1,3}(?:[ \u00a0]\d{3})+|\d+(?:[.,]\d{1,2})?)"
    r"[ \t]*(?:₽|руб(?:лей|ля|\.)?|р\.)?"
    r"[ \t]*(?:/|за|за\s+кг\.?)?[ \t]*кг\b",
    re.IGNORECASE,
)

# Телефоны: +7..., 8-900-..., 8 900 000 00 00
_PHONE_RE = re.compile(
    r"(?:\+?\d[\d\s\(\)\-]{8,}\d)|(?:8[\s\-]?\d{3}[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2})"
)
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_URL_RE = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)
# Этап 5.1: @usernames Telegram/соцсетей — тоже персональные
# идентификаторы, вычищаем (раньше оставались в сниппетах).
_USERNAME_RE = re.compile(r"(?<![\w.])@[A-Za-z0-9_]{3,}\b")
# Имена с телефонным контекстом («Иван +7…») не вытаскиваем вовсе.

SANITIZE_RE_LIST = [_PHONE_RE, _EMAIL_RE, _URL_RE, _USERNAME_RE]


def parse_price_per_kg(text: str) -> float | None:
    """Цена за кг из текста («180 ₽/кг», «95 руб/кг»…); None — если нет."""
    if not text:
        return None
    match = _PRICE_RE.search(text)
    if not match:
        return None
    raw = match.group(1).replace(" ", "").replace("\u00a0", "").replace(",", ".")
    try:
        price = float(raw)
    except ValueError:
        return None
    if price <= 0 or price > 1_000_000:
        return None
    return price


def sanitize_snippet(text: str, max_len: int = 120) -> str:
    """Фрагмент объявления без телефонов, @usernames, e-mail и ссылок.

    Этап 5.1: максимум по умолчанию 120 символов — служебный минимум
    (цена/товар/условия), а не база текстов. Анонимность НЕ гарантируем
    на 100%: эвристики вычищают известные идентификаторы, свободный
    текст может содержать узнаваемые детали — поэтому его объём урезан.
    """
    cleaned = text
    for regex in SANITIZE_RE_LIST:
        cleaned = regex.sub("…", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" \t\n,.:;—-")
    if len(cleaned) > max_len:
        cut = cleaned[:max_len]
        # не рвём слово посередине
        if " " in cut:
            cut = cut[: cut.rfind(" ")]
        cleaned = cut + "…"
    return cleaned


def snippet_around_price(text: str, max_len: int = 120) -> str:
    """Сниппет вокруг найденной цены (проще для чтения в карточке)."""
    match = _PRICE_RE.search(text)
    if not match:
        return sanitize_snippet(text, max_len)
    start = max(0, match.start() - 60)
    end = min(len(text), match.end() + 80)
    return sanitize_snippet(text[start:end], max_len)


def strip_html(html: str) -> str:
    """Текст из HTML: скрипты/стили вон, теги вон, сущности — в текст."""
    cleaned = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", html)
    cleaned = re.sub(r"(?s)<!--.*?-->", " ", cleaned)
    cleaned = re.sub(r"(?s)<[^>]+>", " ", cleaned)
    cleaned = cleaned.replace("&nbsp;", " ").replace("&amp;", "&")
    cleaned = cleaned.replace("&quot;", '"').replace("&#39;", "'")
    cleaned = cleaned.replace("&laquo;", "«").replace("&raquo;", "»")
    cleaned = cleaned.replace("&mdash;", "—").replace("&ndash;", "–")
    return re.sub(r"\s+", " ", cleaned).strip()


def html_title(html: str) -> str | None:
    """<title> страницы (до site-суффикса)."""
    match = re.search(r"(?is)<title[^>]*>(.*?)</title>", html)
    if not match:
        return None
    raw = match.group(1)
    raw = re.sub(r"\s+", " ", raw).strip()
    if not raw:
        return None
    for sep in (" - АгроСервер", " | АгроСервер", " — АгроСервер", " - agroserver", " | AgroServer"):
        raw = raw.split(sep)[0].strip()
    return raw or None
