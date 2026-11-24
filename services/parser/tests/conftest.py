"""Общие настройки pytest: чистое окружение (без TG-кредов),
asyncio-режим автоматом."""

from __future__ import annotations

import os

# Креды Telegram в тестах отсутствуют: адаптер должен graceful-skip.
for var in ("TG_API_ID", "TG_API_HASH", "TG_SESSION"):
    os.environ.pop(var, None)
os.environ.setdefault("SCHEDULER_INTERVAL_HOURS", "0")
