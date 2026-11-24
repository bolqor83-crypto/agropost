"""Настройки userbot-сервиса (ЭТАП 10, Часть B).

Всё читается из .env, ничего в коде. Безопасность (ТЗ):
- ОТДЕЛЬНЫЙ Telegram-аккаунт (TELEGRAM_SESSION) — не основной;
- ТОЛЬКО ЧТЕНИЕ выбранных чатов: сервис не имеет кода отправки
  сообщений от имени userbot (см. tests/test_reader.py);
- не более ~1 запроса/сек, FloodWait — сон;
- читаем ТОЛЬКО чаты из списка (CHATS_TO_READ / «Добавить чат»);
- ключи — только в .env.

Креды совпадают с парсером (services/parser): api_id/hash общие,
сессия — отдельная строка StringSession.
"""

from __future__ import annotations

import os
from dotenv import load_dotenv

load_dotenv(override=True)


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _env_int(name: str, default: int) -> int:
    raw = _env(name)
    try:
        return int(raw) if raw else default
    except ValueError:
        return default


def _env_list(name: str, default: list[str]) -> list[str]:
    raw = _env(name)
    if not raw:
        return list(default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def _env_bool(name: str, default: bool) -> bool:
    raw = _env(name).lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


class Settings:
    """Все параметры userbot. Меняйте через .env, не в коде."""

    # База — та же, что у основного API и парсера (Neon).
    database_url: str = _env("DATABASE_URL")

    # Порт сервиса.
    port: int = _env_int("PORT", 8010)

    # Креды MTProto: api_id/hash общие с парсером, СЕССИЯ ОТДЕЛЬНАЯ
    # (это другой аккаунт — не основной и не парсерный).
    tg_api_id: str = _env("TELEGRAM_API_ID") or _env("TG_API_ID")
    tg_api_hash: str = _env("TELEGRAM_API_HASH") or _env("TG_API_HASH")
    tg_session: str = _env("TELEGRAM_SESSION")

    # Чаты для чтения: env-заготовка + добавленные из UI (AppSetting
    # "userbotChats"). Только их слушаем — личные переписки НЕ читаем.
    chats_to_read: list[str] = _env_list("CHATS_TO_READ", [])

    # Ключевые слова: сообщение должно содержать хотя бы одно,
    # иначе пропускаем (не создаём лид из болтовни).
    keywords: list[str] = _env_list(
        "USERBOT_KEYWORDS",
        ["люцерна", "эспарцет", "суданка", "орех", "семена", "куплю", "продам", "цена"],
    )

    # Уведомления владельцу — через Telegram-БОТА (не userbot!):
    # это безопасно, бот не банится за рассылку владельцу.
    notify_bot_token: str = _env("TELEGRAM_BOT_TOKEN")
    notify_owner_id: int = _env_int("TELEGRAM_USER_ID", 0)
    web_url: str = _env("USERBOT_WEB_URL", "https://agropost-web.onrender.com")
    notify_throttle_sec: int = _env_int("USERBOT_NOTIFY_THROTTLE_SEC", 60)

    # Периоды: обновление списка чатов из БД и запись статуса.
    chats_refresh_sec: int = _env_int("USERBOT_CHATS_REFRESH_SEC", 60)
    status_refresh_sec: int = _env_int("USERBOT_STATUS_REFRESH_SEC", 60)

    # Длина текста в уведомлении.
    notify_text_limit: int = _env_int("USERBOT_NOTIFY_TEXT_LIMIT", 200)

    @property
    def tg_configured(self) -> bool:
        return bool(self.tg_api_id and self.tg_api_hash and self.tg_session)

    @property
    def notify_configured(self) -> bool:
        return bool(self.notify_bot_token and self.notify_owner_id)


settings = Settings()
