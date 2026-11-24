# Исследование каналов для АгроПост (этап 2.5)

Дата: ноябрь 2026. Источник — ручное исследование рынка (таблица из
промта этапа 2.5). Эти данные лежат в основе сида каналов
(`shared/seed-data.ts`, `SEED_CHANNELS`) и полей модели `Channel`.

## Зачем

Каналы различаются **способом подачи**: бот-приёмщик, админ-контакт,
форма сайта, кабинет. Без этих полей приложение открывает не ту точку
входа — пользователь теряет время на каждом размещении. Модель этапа 2.5:

- `submissionMethod` (BOT / ADMIN_CONTACT / SITE_FORM / CABINET / NONE);
- `submissionBotUsername` — бот-приёмщик (`@Taganrog_Predlozhka_bot`);
- `adminContact` — контакт админа (`@admn_013`, `@maksnaz77`);
- `frequencyLimit` — лимит подач («2 раза в день»);
- `confirmationStatus` (CONFIRMED / REQUIRES_CHECK) — честный статус;
- `mirrorOf` — TG↔MAX зеркала (`@farmers_market_dnr_lnr`);
- `audienceType` (B2B / B2C / REGIONAL / GENERAL) — профиль аудитории.

## Сводка (20 каналов)

| № | Название | @username | Тип | Регион/город | tags | reach | Подача | Кому | Статус |
|---|----------|-----------|-----|--------------|------|-------|--------|------|--------|
| 1 | Agro Market | @selhoz032 | Чат | Федеральный | SEEDS, LIVESTOCK, WHOLESALE | 13889 | ADMIN_CONTACT | @Ivan_plants12 | CONFIRMED |
| 2 | СЕЛЬХОЗТЕХНИКА, СЗР, Семена | @SELHOZTEHNIKA2024 | Чат | ДНР/ЛНР/Запорожье/Херсон/Крым | SEEDS, LIVESTOCK | 6695 | ADMIN_CONTACT | — | CONFIRMED |
| 3 | ФЕРМЕРСКИЙ РЫНОК ДНР ЛНР | @farmers_market_dnr_lnr | Канал | ДНР/ЛНР | SEEDS, LIVESTOCK, GENERAL | 3600 | ADMIN_CONTACT | — | CONFIRMED (есть MAX-зеркало №19) |
| 4 | Аграрии России | @rus_fermer | Чат | Федеральный | SEEDS, LIVESTOCK | 779 | ADMIN_CONTACT | @russianagro | CONFIRMED |
| 5 | ДНР Донецкий Фермер | @fferm_don | Канал | ДНР | SEEDS, LIVESTOCK | 303 | ADMIN_CONTACT | — | CONFIRMED |
| 6 | Оптовики России и Зарубежья | @RUSSIAN_WHOLESALER | Чат | Федеральный | NUT, WHOLESALE | 3652 | ADMIN_CONTACT | — | CONFIRMED |
| 7 | Фрукты овощи оптом Россия и СНГ | @optfruitss | Чат | Федеральный | NUT, WHOLESALE | 1420 | ADMIN_CONTACT | @maksnaz77 | CONFIRMED |
| 8 | COPANY MARKET | @copany_market | Чат | Херсонская | NUT, WHOLESALE | 3973 | ADMIN_CONTACT | @Copany_Market_Admin | CONFIRMED |
| 9 | Орехи Сухофрукты | @oreh_rf | Чат | Федеральный | NUT | 348 | ADMIN_CONTACT | — | REQUIRES_CHECK (5 постов/30 дней) |
| 10 | Барахолка Динская | @baraholka_dinskaya | Канал | Динская | GENERAL | 1076 | ADMIN_CONTACT | @managerAdel | CONFIRMED |
| 11 | Барахолка Динская — район | @baraholkadinsk | Чат | Динской район | GENERAL | 2572 | ADMIN_CONTACT | @guber123 | CONFIRMED |
| 12 | Барахолка Динского района | @baraholkaraiona | Чат | Динской район | GENERAL | 5902 | BOT | @reklama_v_rvs_bot | CONFIRMED |
| 13 | Барахолка Таганрог | @baraholka_taganrog61 | Канал | Таганрог | GENERAL, SEEDS | 6226 | BOT | @Taganrog_Predlozhka_bot | CONFIRMED |
| 14 | (БАРАХОЛКА) Ростов–Таганрог | — («открыть», username не зафиксирован) | Чат | Ростов/Таганрог | GENERAL | 1828 | ADMIN_CONTACT | — | REQUIRES_CHECK |
| 15 | Барахолка Ростов-на-Дону (MAX) | @channel_baraholka_rostov | Канал | Ростов, Батайск, Аксай, Азов, Таганрог, Шахты, Новочеркасск | GENERAL | 1295 | BOT | — (имя не зафиксировано) | CONFIRMED |
| 16 | Барахолка Краснодар (MAX) | @channel_barahl | Канал | Краснодарский край | GENERAL | 1899 | ADMIN_CONTACT | — | CONFIRMED |
| 17 | Барахолка Динского района (MAX) | @baraholka23 | Канал | Динской район | GENERAL | — | BOT | — | CONFIRMED |
| 18 | Отдам даром Таганрог (MAX) | @otdam_darom_taganrog | Канал | Таганрог | GENERAL | — | BOT | @DaromTagBot | CONFIRMED |
| 19 | Фермерский рынок ДНР/ЛНР (MAX) | @farmers_market_dnr_lnr | Канал | ДНР/ЛНР | SEEDS, LIVESTOCK | — | ADMIN_CONTACT | — | CONFIRMED (зеркало №3, TG↔MAX) |
| 20 | Новочеркасск аграрный | @novocherkassk_agro* | Чат | Новочеркасск | SEEDS, LIVESTOCK | 1100 | ADMIN_CONTACT | — | CONFIRMED |

\* «Новочеркасск аграрный» — из сида этапа 2.1; username-заглушка,
проверьте и замените.

## Решения по сиду

- **reach из исследования пишем в `subscribersCount`**; `averageReach`
  не измеряли — null. Лимиты подач исследование не зафиксировало — null.
- **audienceType**: агро-чаты/оптовые чаты → B2B; городские барахолки →
  REGIONAL. MAX-каналы «Отдам даром» — REGIONAL (общая городская
  аудитория, но гео привязано к Таганрогу).
- **mirrorOf**: №3 (TG) ↔ №19 (MAX), self-FK в обе стороны.
- **№14 «(БАРАХОЛКА) Ростов–Таганрог»**: username в исследовании не
  зафиксирован (запись «открыть» из каталога). Канал оставлен со
  статусом REQUIRES_CHECK, ссылка — заглушка: **проверьте и замените**
  (см. заметку на карточке канала).
- **MAX-ссылки**: `https://max.ru/{username}`. У MAX-ботов (№18
  `@DaromTagBot`) формат deep link свой — кнопка подачи открывает сам
  канал, имя бота видно в подписи (см. `shared/channels.ts`,
  `submissionTarget`).
- Демо-каналы этапов 2/2.1 (14 шт.) сид 2.5 удаляет из базы —
  «заменить на 20 реальных» по ТЗ; пользовательские каналы не трогаем.

## Что даёт приложение (этап 2.5)

- В шите канала: «Способ подачи: бот @Taganrog_Predlozhka_bot»,
  «Лимит: …», «Статус: требует проверки» (жёлтый бейдж), «Зеркало: …».
- В мастере «Разместить», шаг 3: кнопка ведёт в **правильную точку
  входа** — «Открыть @Taganrog_Predlozhka_bot» (deep link t.me),
  «Написать @admn_013» или «Открыть страницу подачи».
- Парсер цен (Агросервер + Telegram) → строка «Рынок: 180–240 ₽/кг
  (средняя 205)» в карточке позиции.
