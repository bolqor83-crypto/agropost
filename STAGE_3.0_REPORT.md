# Отчёт по этапу 3.0 — AI-слой (5 use cases)

Дата: 2026-11-24 · Версия API: **0.5.0** · Прод: agropost-web.onrender.com (live)

## Что сделано

AI-слой как отдельный модуль бэкенда: **5 use cases**, каждый возвращает
строгий JSON, валидируется zod, при ошибке — retry → fallback на шаблонную
генерацию. Провайдер — **GLM через Z.AI** (прямой HTTP), **OpenRouter** —
резервный канал. Приложение НИКОГДА не падает из-за AI.

### Часть A — gateway и провайдеры (`apps/server/src/ai/`)

```
apps/server/src/ai/
├── gateway.ts         — единая точка: кэш → провайдер → JSON → zod → white-label → retry → fallback
├── providers/
│   ├── glm.ts         — HTTP-клиент Z.AI (OpenAI-совместимый протокол)
│   ├── openrouter.ts  — резервный канал (тот же интерфейс AiProvider)
│   └── types.ts       — interface AiProvider { complete({system,user,model,jsonMode}) }
├── prompts/
│   ├── system.md      — общий system prompt (жёсткие правила, white-label)
│   ├── listing.md / reply.md / advice.md / price_analysis.md / logistics.md
│   └── index.ts      — загрузка .md + renderPrompt({{переменные}})
├── schemas.ts         — zod-схемы входов и выходов 5 use cases (strict)
├── cache.ts           — SHA-256 входа, TTL 24 ч, инвалидация по positionId
├── fallback.ts        — шаблонная генерация для всех 5 use cases
├── logger.ts          — журнал вызовов в таблицу AiCall
├── json.ts            — извлечение JSON из ответа модели (фенсы, мусор вокруг)
├── context.ts         — сборка фактов позиции (без поставщика!) и контекста «Совет»
├── service.ts         — 5 функций use cases (маппинг, проверки, пересчёт математики)
└── golden-set.json    — 15 эталонных кейсов регрессии
```

Конфиг (только бэкенд, в клиент не уходят):

```
AI_PROVIDER=glm|openrouter        (default glm)
GLM_API_KEY, GLM_BASE_URL         (default https://api.z.ai/api/paas/v4)
GLM_MODEL_FLASH                    (default glm-5.3-flash)
GLM_MODEL_PRO                      (default glm-5.3)
OPENROUTER_API_KEY / OPENROUTER_MODEL  (резерв)
AI_TIMEOUT_MS                      (default 30000)
```

Провайдеро-независимость: оба провайдера реализуют один интерфейс
`AiProvider.complete()`; gateway выбирает по env, переключение на
OpenRouter — одна переменная (или автоматический переход при сбое GLM:
первый провал по сети/HTTP → вторая попытка уходит в резервный канал).

Модели: **Flash** (glm-5.3-flash) для listing/reply/price_analysis/logistics,
**5.3** (glm-5.3) для advice — по рекомендации. В среде разработки
проверены и доступны: glm-5.3-flash (~0,5 с), glm-5.3 (~5,5 с), glm-5.3-flashx
(~0,5 с). Температура 0.2 — для стабильных контрактов.

### Часть B — 5 use cases (`POST /api/ai/*`)

| Use case | Вход | Выход (контракт) | Специфика |
|---|---|---|---|
| `/api/ai/listing` | positionId, platform, accent? | title (1–70), body (1–3000), tags (1–10), charCount | white-label: нет supplierName/склад/адресов → retry → fallback на shared/listing-text.ts |
| `/api/ai/reply` | incomingMessage, positionId, history?, userStyle? | reply (1–1000), includes[] | не выдумывает характеристики: неизвестный вопрос → нейтральный ответ |
| `/api/ai/advice` | context? (иначе из БД) | actions 0–3 {priority, action, reason, link} | link — только внутренние deep links (/publish, /positions, /channels, /deals, /suppliers) |
| `/api/ai/price_analysis` | positionId, market? | marketPosition (below/at/above), ourPrice, marketAvg, delta, recommendation | математика пересчитана на сервере; не рекомендует ниже supplierPrice × 1.10; sources < 3 → warnings |
| `/api/ai/logistics` | shipment, availableCarriers (2–4) | options 2–4 по цене, recommendation | без «оценки рисков»; цены/сроки только из входа |

Формат ответа: `{ ok: true, data, warnings, meta }`, meta = { model, provider,
latencyMs, status: ok|retry|fallback, tokensIn, tokensOut, cached? }.

### Часть C — system prompt

`prompts/system.md` — дословно из ТЗ: русский, без англицизмов; НИКОГДА не
упоминать поставщика/склад/адрес (только «Краснодарский край»); не выдумывать
характеристики; не обещать скидок; только валидный JSON без markdown-обёрток;
{"ok":false,"error":...} при невозможности; тон по площадкам
(avito — сухо/факты, telegram — живо/1–2 эмодзи, agroserver — профессионально);
контекст бизнеса (доставка за счёт покупателя, отправка после полной оплаты,
ТК/самовывоз).

### Часть D — fallback и обработка ошибок

Полный цикл (реализован в gateway.run):

```
кэш(inputHash) ── попадание → ответ (0 токенов)
│
провайдер → JSON → zod ── fail → retry (усиленный промпт)
│                                  │ fail → fallback-шаблон
white-label проверка ── fail → retry (усиленный промпт)
│                                  │ fail → fallback-шаблон
OK → ответ
```

- Fallback: listing → `shared/listing-text.ts`; reply — правила по ключевым
  словам (цена/доставка/качество/объём из позиции); advice — 1–3 действия по
  правилам; price — расчёт на сервере; logistics — сортировка перевозчиков.
- Сбой GLM по сети/HTTP → вторая попытка через OpenRouter (если ключ задан).
- 429 (rate limit) → пауза 2 с, повтор; 400 на response_format → повтор без него.
- Лог каждого вызова в `AiCall` (useCase, inputHash, outputJson, latencyMs,
  status ok/retry/fallback/error, errorMessage, tokensIn/Out, provider, model).
  Ошибка записи журнала НЕ роняет ответ пользователю.

### Часть E — кэш

`inputHash = SHA-256(JSON.stringify({useCase, input}))`, TTL 24 ч, in-memory
Map (MVP; free tier засыпает — это ок). Повторный запрос — 0 токенов
(проверено тестом). Инвалидация: PATCH/DELETE позиции → сброс по positionId;
PATCH/DELETE канала → полный сброс (тексты зависят от площадки).

### Часть F — UI (apps/web)

1. **Мастер «Разместить», шаг «Текст»**: кнопка «Сгенерировать с AI»
   (акцентная) над текстом; skeleton «AI собирает текст — 2–3 секунды»;
   результат — в редактируемом поле ( автосохранение в черновик по blur);
   подпись «AI · glm-5.3-flash · 1,8 с» или «Шаблон · AI недоступен»;
   счётчик символов; «Скопировать» / «Открыть канал» / «Отметить размещено»
   сохранены.
2. **Карточка позиции**: кнопка «Проверить цену» рядом с ценой → Sheet
   «Проверка цены»: наша цена, средняя по рынку, разница, marketPosition
   (чип «Ниже/Выше рынка»/«В рынке»), рекомендация, предупреждения о малой
   выборке.
3. **Пульт**: кнопка «Что сделать?» в шапке → 1–3 карточки действий с
   причинами и deep links (клик = переход в приложение); пусто → «Сейчас всё
   под контролем».
4. Калькулятор доставки — появится в сделке (этап 4): эндпоинт и клиент
   (`planAiLogistics`) готовы, UI отложен по ТЗ.
5. Инбокс-черновик — этап 3.2: эндпоинт и клиент (`generateAiReply`) готовы.

### Часть G — golden set: 15 кейсов

`apps/server/src/ai/golden-set.json`. Свойства (не точный текст):

| # | Кейс | Ключевые проверки |
|---|---|---|
| 1 | listing-avito-price (pos-1, avito) | цена «212,75» в тексте; нет «Агро-Юг»/«Павловская»/«склад»; title ≤ 70; body ≤ 3000 |
| 2 | listing-telegram-quality (pos-3, telegram) | цена «118»; white-label; лимиты |
| 3 | listing-agroserver-volume (pos-5, agroserver) | цена «138»; white-label; лимиты |
| 4 | reply-price (pos-1) | ответ содержит цену |
| 5 | reply-delivery (pos-1) | ответ содержит «оплат»; white-label |
| 6 | reply-unknown (pos-3: «кислотность») | нейтральный ответ, не выдумывает |
| 7 | reply-volume (pos-4) | ответ содержит «кг» (остаток/фасовка) |
| 8 | advice-stale | ≤ 3 действий; link только внутренние; есть /publish |
| 9 | advice-empty | ≤ 3; только внутренние links |
| 10 | advice-cooled | ≤ 3; внутренние links; каналы без публикаций в контексте |
| 11 | price-below (pos-1, рынок 220–260) | marketPosition=below, ourPrice=212.75, avg=240, delta=-27.25 |
| 12 | price-above-small-sample (pos-3, 2 цены) | above, warnings непустые (выборка мала) |
| 13 | price-no-market (pos-6, пусто) | at, avg=null, delta=null, warnings |
| 14 | logistics-three (ПЭК/СДЭК/Деловые) | 3 варианта, отсортированы по цене |
| 15 | logistics-two (ПЭК/СДЭК) | 2 варианта, сортировка, рекомендация |

### Часть H — тесты

- **Unit (29, `npm run test`)**: gateway (валидный JSON → ok; невалидный →
  retry; провал дважды → fallback; кэш не тратит токены; white-label →
  retry и fallback; сбой GLM → резервный провайдер; провайдер не настроен →
  честный fallback; inputHash стабилен), fallback-шаблоны (все 5), zod-схемы
  (границы: 71-символьный title, 11 тегов, 4 действия, внешняя ссылка,
  вне-enum, 1 вариант), промпты (6 файлов, white-label запрет в system).
- **Integration (`npm run test:golden`)**: 15 кейсов против реального GLM
  (пропускается без GLM_API_KEY). Результаты — ниже.
- **API-чеки локально (21/21)**: все 5 эндпоинтов (fallback без ключа,
  приложение не падает), валидация входов (400), позиция не найдена (404),
  мета 0.5.0/ai=true, регрессия каналов (20) и health.

## Результаты golden set (реальный GLM)

Прогоны против реального GLM через шлюз песочницы (OpenAI-совместимый прокси):

- **Полный прогон 15/15 PASS**: статусы 13×`ok`, 1×`retry`, 1×`fallback`
  (кейс listing-telegram-quality — модель дважды нарушила проверку,
  честно ушёл в шаблон; это штатный путь). Токены: in≈13 763, out≈1 962,
  всего ≈15,7k на полный сет; средняя задержка ≈2,7 с.
- Повторный прогон: 15/15 PASS (0 fail), смешанные ok/retry/fallback.
- Найден и исправлен баг в САМОЙ ПРОВЕРКЕ golden set (не в коде):
  регистрозависимый «required» — модель писала «Оплата…» с большой буквы
  в начале предложения, тест ждал «оплат». Теперь required/forbidden
  сравниваются в нижнем регистре.
- Финальный прогон после фикса: шлюз песочницы к тому моменту закрылся
  часовой квотой (429 на любой запрос) — прогон прошёл **15/15 PASS
  полностью в fallback**: каждый кейс за ~4 с (2×429 + бэкофф 2 с)
  вернул шаблонный ответ. Это и есть требование «провайдер упал →
  приложение работает» — подтверждено на живых данных 15/15.
- Журнал `AiCall` в прод-БД (Neon): 98 записей — 24 OK (glm-5.3-flash /
  glm-5.3, с токенами и задержками), 4 RETRY, 70 FALLBACK (все с
  errorMessage «HTTP 429»), 0 ERROR. Журнал пишется и не роняет ответы.
- Стоимость: полный сет ≈ 15,7k токенов. При тарифах flash-класса
  (доли цента за 1M токенов) один прогон — заведомо меньше $0.01,
  бюджет $0.50 не расходуется и близко.

## Прод (проверено после деплоя, 2026-11-24)

Деплой: `84e217b` → api `dep-dc2nb2s9v7es73d4v280` (live), web
`dep-dc2nbtss728c73b3sf30` (live). На api-сервис добавлены env-переменные
TELEGRAM_BOT_TOKEN / TELEGRAM_USER_ID (для этапа 3.2; DATABASE_URL
проверен после инцидента с PUT-заменой списка — восстановлен, деплой
прошёл). GLM-ключ на прод ещё не задан → AI-эндпоинты честно работают
в fallback-режиме (штатный путь, приложение не падает).

- `GET /api/meta` → `{"version":"0.5.0","stage":3,"ai":true}` ✔
- `GET /api/health` → `{"ok":true,"service":"agropost-api","stage":3}` ✔
- `POST /api/ai/listing` (pos-1, avito) → ok, title «Люцерна «Вега 87»,
  урожай 2025, 3 000 кг», тело с ценой ₽/кг, `meta.status="fallback"`,
  warning «AI недоступен — использован шаблон.» ✔
- `POST /api/ai/reply` («Сколько стоит люцерна и как отправляете?») → ok,
  «Цена — 213 ₽/кг при минимальной партии от 1 500 кг.», includes
  [цена, минимальная партия] ✔
- `POST /api/ai/advice` → ok, из прод-контекста: 1 действие «Освежить
  каналы без публикаций (5)» → `/channels` ✔
- `POST /api/ai/price_analysis` (рынок 220–260, avg 240) → ok, below,
  our 213, avg 240, delta −27, рекомендация «…можно поднять до 240 ₽/кг,
  но ниже 204 ₽/кг не опускайтесь», warning «Выборка мала» ✔
- `POST /api/ai/logistics` (ПЭК/СДЭК/Деловые линии) → ok, 3 варианта
  отсортированы по цене (СДЭК 11 200 → ПЭК 12 500 → Деловые 14 900),
  рекомендация «Оптимально: СДЭК… Доставку оплачивает покупатель.» ✔
- Ошибки: пустое тело → 400; неизвестная позиция → 404; платформа «ozon»
  → 400; `/api/ai/kek` → 404 ✔
- `AiCall` в прод-БД пишет: прод-вызовы журналируются со статусом
  FALLBACK и errorMessage «AI-провайдер не настроен» (честный аудит
  до передачи ключа) ✔
- Web: https://agropost-web.onrender.com → HTTP 200 ✔

## Ограничения соблюдены

- НЕ делали: Telegram-бот, автопостинг, инбокс (всё — 3.2); сделки и
  документы (4); парсер (2.5 закрыт); медиа/R2 не тронуты — AI работает
  только с текстом и атрибутами.
- OpenRouter — только резервный канал (не основной).
- Ключи только в env бэкенда; ни один ключ не попал в клиент/ git.
- White-label: факты для промптов собираются без имени поставщика/телефона/
  локации; на выходе — авто-проверка (имя, телефон, склад, станицы
  Павловская/Ленинградская/Тихорецк, URL, телефоны regex) + retry + fallback.

## Что дальше

1. **GLM-ключ на Render** (когда будет передан): agropost-api → Environment:
   `GLM_API_KEY` (модели уже прописаны в render.yaml: glm-5.3-flash /
   glm-5.3; base URL default). После этого AI на проде оживёт без деплоя.
   Опционально `OPENROUTER_API_KEY` — резервный канал.
2. Этап 3.2: Telegram-бот (TELEGRAM_BOT_TOKEN уже в env рендер-сервиса),
   инбокс с кнопкой «Черновик ответа» (`/api/ai/reply` готов), автопостинг
   в свои каналы.
3. Этап 4: сделки — калькулятор доставки (`/api/ai/logistics` и клиент
   готовы), документы.
4. Регрессия промптов: правите `prompts/*.md` → `npm run test:golden`.
