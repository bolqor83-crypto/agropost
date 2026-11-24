FROM python:3.12-slim

# CA-сертификаты: Neon (TLS) и api.telegram.org (уведомления).
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8010

# Userbot — только чтение выбранных чатов (анти-бан: без отправки).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010"]
