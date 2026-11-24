"""Тесты userbot: фильтр ключевых слов, обработка сообщения → лид →
уведомление, дедупликация, БЕЗ отправки от имени userbot (анти-бан)."""

from __future__ import annotations

import ast
import inspect
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.config import Settings
from app.db import _cuid_like, _naive_utc
from app.notifier import OwnerNotifier, format_message
from app.reader import CULTURE_HINTS, ChatReader, extract_culture, matches_keywords

# ---------- Фильтры ----------


def test_matches_keywords_positive_and_negative():
    assert matches_keywords("Куплю люцерну 10 тонн", ["куплю", "люцерна"]) is True
    assert matches_keywords("ПРОДАМ суданскую траву", ["продам"]) is True
    assert matches_keywords("Привет, как дела?", ["куплю", "люцерна"]) is False


def test_extract_culture_from_text():
    assert extract_culture("Нужна люцерна 2 класс", CULTURE_HINTS) == "Люцерна"
    assert extract_culture("Грецкий орех крупным оптом", CULTURE_HINTS) == "Грецкий орех"
    assert extract_culture("Продаю гвозди", CULTURE_HINTS) is None


# ---------- Уведомления ----------


def test_format_message_matches_task():
    text = format_message("Агро чат", "Люцерна 2 класс, 10 т, цена?", limit=40)
    assert text.startswith("Новое сообщение в чате «Агро чат»:")
    assert "Люцерна" in text


@pytest.mark.asyncio
async def test_notifier_throttle_skips_second_message(monkeypatch):
    notifier = OwnerNotifier(token="", owner_id=0, throttle_sec=60)
    # Отправку подменяем фейком httpx не нужно: без кредов → False.
    assert await notifier.send("первое") is False  # notify не настроен
    notifier._last_sent_at = 0.0
    notifier._token = "t"
    notifier._owner_id = 42
    # Фейк-клиент с POST-ответом 200.
    class FakeResponse:
        status_code = 200
        text = ""

    class FakeClient:
        async def post(self, url, json=None):  # noqa: A002
            return FakeResponse()

    notifier._client = FakeClient()
    assert await notifier.send("первое") is True
    assert await notifier.send("второе") is False  # троттлинг


# ---------- Анти-бан: userbot НЕ отправляет ----------


def _called_names(module) -> set[str]:
    """Имена всех вызовов в AST модуля (без комментариев/докстрингов)."""
    tree = ast.parse(inspect.getsource(module))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Attribute):
                names.add(func.attr)
            elif isinstance(func, ast.Name):
                names.add(func.id)
    return names


def test_reader_never_sends():
    """В reader.py нет НИ ОДНОГО отправляющего вызова MTProto (AST, не текст)."""
    import app.reader as reader_module

    calls = _called_names(reader_module)
    forbidden = {
        "send_message", "send_file", "send_photo", "send_audio",
        "send_voice", "forward_messages", "delete_messages",
        "edit_message", "delete",
    }
    assert not (calls & forbidden), f"отправляющие вызовы в reader: {calls & forbidden}"


def test_notifier_is_the_only_sender():
    """Отправка — только через Telegram Bot API (httpx), не MTProto."""
    import app.notifier as notifier_module

    source = inspect.getsource(notifier_module)
    assert "api.telegram.org" in source
    assert "TelegramClient" not in source
    calls = _called_names(notifier_module)


# ---------- Обработка сообщения → лид + дедупликация ----------


class FakeDb:
    """Фейк БД поверх словарей (как MemoryMaxDb в серверных тестах)."""

    def __init__(self):
        self.leads: dict[str, dict] = {}
        self.messages: list[dict] = []
        self.interest_updates: list[tuple[str, str]] = []

    async def find_lead(self, source, external_id):
        return self.leads.get(external_id)

    async def create_lead(self, source, external_id, name):
        lead_id = f"lead-{len(self.leads) + 1}"
        self.leads[external_id] = {"id": lead_id, "interest": None}
        return lead_id

    async def message_exists(self, lead_id, message_id):
        return any(m["mid"] == message_id for m in self.messages)

    async def insert_message(self, lead_id, text, message_id):
        self.messages.append({"leadId": lead_id, "text": text, "mid": message_id})

    async def update_interest(self, lead_id, interest):
        self.interest_updates.append((lead_id, interest))


class FakeNotifier:
    def __init__(self):
        self.sent: list[str] = []

    async def notify_chat_message(self, chat_title, text):
        self.sent.append(f"{chat_title}: {text}")
        return True


def make_event(chat_id=555, title="Агро чат", text="Куплю люцерну 2 класс", mid=1001):
    return SimpleNamespace(
        message=SimpleNamespace(raw_text=text, text=text),
        raw_text=text,
        chat_id=chat_id,
        message_id=mid,
        chat=SimpleNamespace(id=chat_id, title=title),
    )


@pytest.fixture
def patched_db(monkeypatch):
    fake = FakeDb()
    import app.reader as reader_module
    import app.db as db_module

    monkeypatch.setattr(reader_module.db, "find_lead", fake.find_lead)
    monkeypatch.setattr(reader_module.db, "create_lead", fake.create_lead)
    monkeypatch.setattr(reader_module.db, "message_exists", fake.message_exists)
    monkeypatch.setattr(reader_module.db, "insert_message", fake.insert_message)
    monkeypatch.setattr(reader_module.db, "update_interest", fake.update_interest)
    _ = db_module
    return fake


@pytest.mark.asyncio
async def test_message_creates_lead_and_notifies(patched_db, monkeypatch):
    notifier = FakeNotifier()
    monkeypatch.setattr("app.reader.settings", Settings())
    reader = ChatReader(notifier)  # type: ignore[arg-type]
    await reader.handle_message(make_event(), "@agro_chat")

    assert len(patched_db.leads) == 1
    assert patched_db.messages[0]["text"].startswith("Куплю люцерну")
    assert notifier.sent == ["Агро чат: Куплю люцерну 2 класс"]
    assert reader.messages_saved == 1
    assert patched_db.interest_updates == [("lead-1", "Люцерна")]


@pytest.mark.asyncio
async def test_duplicate_message_is_skipped(patched_db, monkeypatch):
    monkeypatch.setattr("app.reader.settings", Settings())
    reader = ChatReader(FakeNotifier())  # type: ignore[arg-type]
    await reader.handle_message(make_event(mid=77), "@agro_chat")
    await reader.handle_message(make_event(mid=77), "@agro_chat")
    assert len(patched_db.messages) == 1
    assert reader.messages_saved == 1


@pytest.mark.asyncio
async def test_message_without_keywords_is_ignored(patched_db, monkeypatch):
    monkeypatch.setattr("app.reader.settings", Settings())
    reader = ChatReader(FakeNotifier())  # type: ignore[arg-type]
    await reader.handle_message(make_event(text="Привет всем!", mid=90), "@agro_chat")
    assert patched_db.messages == []
    assert patched_db.leads == {}


@pytest.mark.asyncio
async def test_second_message_same_chat_same_lead(patched_db, monkeypatch):
    monkeypatch.setattr("app.reader.settings", Settings())
    reader = ChatReader(FakeNotifier())  # type: ignore[arg-type]
    await reader.handle_message(make_event(mid=1, text="Продам суданку"), "@agro_chat")
    await reader.handle_message(make_event(mid=2, text="Цена на орех?"), "@agro_chat")
    assert len(patched_db.leads) == 1
    assert len(patched_db.messages) == 2


# ---------- Мелочи БД ----------


def test_cuid_like_format():
    value = _cuid_like()
    assert len(value) == 25 and value.startswith("c")


def test_naive_utc_strips_timezone():
    now = datetime.now(timezone.utc) + timedelta(hours=3)
    naive = _naive_utc(now)
    assert naive.tzinfo is None
