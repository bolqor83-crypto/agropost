"""Адаптер Telegram: матчинг сообщений, извлечение цен, graceful без кредов."""

from __future__ import annotations

from dataclasses import dataclass

from app.adapters.telegram import (
    TelegramAdapter,
    extract_rows_from_messages,
    message_matches,
)


@dataclass
class StubMessage:
    """Заглушка сообщения Telethon: нужны .id и .text/.message."""

    id: int
    message: str

    @property
    def text(self) -> str:
        return self.message


MESSAGES = [
    StubMessage(11, "Продаю семена люцерны Вега 87, цена 180 ₽/кг, самовывоз"),
    StubMessage(12, "Люцерна от 160 руб/кг, качество отличное"),
    StubMessage(13, "Куплю люцерну, цена договорная"),
    StubMessage(14, "Продам сено, 50 ₽/кг"),
]


def test_message_matches_case_insensitive() -> None:
    assert message_matches("ПРОДАЮ ЛЮЦЕРНУ", "люцерна")
    assert not message_matches("Продам сено", "люцерна")
    assert not message_matches("", "люцерна")


def test_extract_rows_from_messages() -> None:
    rows = extract_rows_from_messages(MESSAGES, "люцерна", "https://t.me/selhoz032")
    assert len(rows) == 2  # только сообщения с ценой за кг
    prices = {row["price"] for row in rows}
    assert prices == {180, 160}
    for row in rows:
        assert row["source"] == "TELEGRAM"
        assert row["query"] == "люцерна"
        assert row["unit"] == "₽/кг"
        assert row["link"].startswith("https://t.me/selhoz032/")
        assert row["sellerName"] is None  # ФИО не храним (152-ФЗ)
        assert "сниппет" not in row["rawSnippet"]
    # ссылка на конкретное сообщение
    assert "https://t.me/selhoz032/11" in {row["link"] for row in rows}


def test_extract_rows_sanitizes_contacts() -> None:
    dirty = [StubMessage(21, "Люцерна 190 ₽/кг, тел +7 900 111-22-33, пишите a@b.ru")]
    rows = extract_rows_from_messages(dirty, "люцерна", "https://t.me/selhoz032")
    assert len(rows) == 1
    snippet = rows[0]["rawSnippet"]
    assert "+7 900" not in snippet
    assert "a@b.ru" not in snippet


async def test_collect_without_credentials_is_skipped() -> None:
    """Нет TG_API_ID/TG_API_HASH → статус skipped, без исключений."""
    adapter = TelegramAdapter()
    rows, stats = await adapter.collect(["люцерна"])
    assert rows == []
    assert stats.status == "skipped"
    assert "TG_API_ID" in stats.note


def test_config_covers_default_queries() -> None:
    """Транслит-словарь покрывает запросы ТЗ (для sitemap-матчинга)."""
    from app.config import settings

    for query in ("люцерна", "эспарцет", "суданка", "грецкий орех"):
        assert settings.slug_keywords.get(query), f"нет ключевых слов для {query}"
        assert all(isinstance(word, str) and word for word in settings.slug_keywords[query])
    # «суданская трава» матчится теми же словами, что «суданка»
    assert settings.slug_keywords["суданская трава"] == settings.slug_keywords["суданка"]
