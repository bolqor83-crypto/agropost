/**
 * Демо-данные этапа 1 (из брифа). Чистый модуль без prisma-импортов:
 * - apps/server/prisma/seed.ts раскладывает их в базу;
 * - Next-превью поднимает из них мок-API (те же данные, что и в проде).
 *
 * ТЕЛЕФОНЫ — заглушки +7 900 000-00-0X: замените на реальные в интерфейсе.
 * Демо-фото — встроенные SVG-заглушки (data-URL), работают без R2.
 */

import type {
  AccountPlatform,
  AccountStatus,
  AudienceType,
  AttributeField,
  ChannelTag,
  ChannelType,
  ConfirmationStatus,
  CultureType,
  PositionStatus,
  PriceSource,
  ShippingMode,
  SubmissionMethod,
  SupplierLocation,
  TaxMode,
  AttributesMap,
} from "./types";

/* ---------- Пользователь (один, без ролей) ---------- */

export const SEED_USER: {
  name: string;
  inn: string | null;
  taxMode: TaxMode;
  taxRate: number;
} = {
  name: "Владелец АгроПост",
  inn: null,
  taxMode: "IP",
  taxRate: 0.06,
};

/* ---------- Поставщики ---------- */

export interface SeedSupplier {
  id: string;
  name: string;
  phone: string;
  location: SupplierLocation;
  shippingMode: ShippingMode;
  notes?: string;
}

export const SEED_SUPPLIERS: SeedSupplier[] = [
  {
    id: "sup-agroyug",
    name: "Агро-Юг",
    phone: "+7 900 000-00-01",
    location: "PAVLOVSKAYA",
    shippingMode: "SELF_LOADS",
    notes:
      "Основной поставщик. Сам грузит в ТК; при выезде за пределы Павловской — " +
      "небольшая доплата за дорогу.",
  },
  {
    id: "sup-semstart",
    name: "СемСтарт",
    phone: "+7 900 000-00-02",
    location: "LENINGRADSKAYA",
    shippingMode: "FROM_WAREHOUSE",
    notes: "Продаёт со склада, погрузка за счёт поставщика.",
  },
  {
    id: "sup-orehprom",
    name: "ОрехПром",
    phone: "+7 900 000-00-03",
    location: "TIHORETSK",
    shippingMode: "BOTH",
    notes: "Склад в Тихорецке; по договорённости может сам привезти в ТК.",
  },
];

/* ---------- Шаблоны культур ---------- */

export interface SeedCulture {
  id: string;
  name: string;
  type: CultureType;
  attributesSchema: AttributeField[];
}

export const SEED_CULTURES: SeedCulture[] = [
  {
    id: "cult-alfalfa",
    name: "Люцерна",
    type: "SEED",
    attributesSchema: [
      { key: "sort", label: "Сорт", type: "text", displayType: "FIXED", required: true },
      { key: "grade", label: "Класс", type: "text", displayType: "FIXED", required: false },
      { key: "reproduction", label: "Репродукция", type: "text", displayType: "FIXED", required: true },
      { key: "germination", label: "Всхожесть", type: "percent", unit: "%", displayType: "FIXED", required: true },
      { key: "purity", label: "Чистота", type: "percent", unit: "%", displayType: "FIXED", required: true },
      { key: "weed", label: "Засорённость", type: "percent", unit: "%", displayType: "FIXED", required: false },
      { key: "moisture", label: "Влажность", type: "percent", unit: "%", displayType: "RANGE", required: false },
      { key: "year", label: "Год урожая", type: "year", displayType: "FIXED", required: true },
    ],
  },
  {
    id: "cult-sainfoin",
    name: "Эспарцет",
    type: "SEED",
    attributesSchema: [
      { key: "sort", label: "Сорт", type: "text", displayType: "FIXED", required: true },
      { key: "reproduction", label: "Репродукция", type: "text", displayType: "FIXED", required: true },
      { key: "germination", label: "Всхожесть", type: "percent", unit: "%", displayType: "FIXED", required: true },
      { key: "purity", label: "Чистота", type: "percent", unit: "%", displayType: "FIXED", required: true },
      { key: "moisture", label: "Влажность", type: "percent", unit: "%", displayType: "RANGE", required: false },
      { key: "year", label: "Год урожая", type: "year", displayType: "FIXED", required: false },
    ],
  },
  {
    id: "cult-sudan",
    name: "Суданская трава",
    type: "SEED",
    attributesSchema: [
      { key: "sort", label: "Сорт", type: "text", displayType: "FIXED", required: true },
      { key: "reproduction", label: "Репродукция", type: "text", displayType: "FIXED", required: true },
      { key: "germination", label: "Всхожесть", type: "percent", unit: "%", displayType: "FIXED", required: true },
      { key: "purity", label: "Чистота", type: "percent", unit: "%", displayType: "FIXED", required: true },
      { key: "moisture", label: "Влажность", type: "percent", unit: "%", displayType: "RANGE", required: false },
      { key: "year", label: "Год урожая", type: "year", displayType: "FIXED", required: false },
    ],
  },
  {
    id: "cult-meadow",
    name: "Разнотравье",
    type: "SEED",
    attributesSchema: [
      { key: "mix", label: "Состав", type: "text", displayType: "TEXT", required: true },
      { key: "germination", label: "Всхожесть", type: "percent", unit: "%", displayType: "FIXED", required: true },
      { key: "year", label: "Год урожая", type: "year", displayType: "FIXED", required: false },
    ],
  },
  {
    id: "cult-walnut",
    name: "Грецкий орех",
    type: "NUT",
    attributesSchema: [
      { key: "sort", label: "Сорт", type: "text", displayType: "FIXED", required: false },
      { key: "calibre", label: "Калибр", type: "text", displayType: "RANGE", required: true },
      { key: "kernel", label: "Выход ядра", type: "percent", unit: "%", displayType: "RANGE", required: true },
      { key: "moisture", label: "Влажность", type: "percent", unit: "%", displayType: "FIXED", required: true },
      { key: "shellThickness", label: "Толщина скорлупы", type: "text", displayType: "TEXT", required: false },
      { key: "grade", label: "Товарный сорт", type: "text", displayType: "FIXED", required: false },
      { key: "year", label: "Год урожая", type: "year", displayType: "FIXED", required: true },
    ],
  },
];

/* ---------- Позиции ---------- */

export interface SeedCertificate {
  name: string;
  /** ISO-дата выдачи. */
  issuedAt: string;
}

export interface SeedPosition {
  id: string;
  supplierId: string;
  cultureId: string;
  attributes: AttributesMap;
  /** Остаток, кг. */
  volumeKg: number;
  bagWeightKg: number;
  minLotKg: number;
  /** Закуп поставщика, ₽/кг. */
  supplierPrice: number;
  markupPercent: number;
  hasCertificate: boolean;
  status: PositionStatus;
  /** Сколько демо-фото создать. */
  photoCount: number;
  certificates: SeedCertificate[];
  /** Для «Обновлено N дн. назад» в демо. */
  updatedDaysAgo: number;
}

export const SEED_POSITIONS: SeedPosition[] = [
  {
    id: "pos-1",
    supplierId: "sup-agroyug",
    cultureId: "cult-alfalfa",
    attributes: {
      sort: "Вега 87",
      grade: "1 класс",
      reproduction: "РС-1",
      germination: 92,
      purity: 98,
      weed: 2,
      moisture: "8–10",
      year: 2025,
    },
    volumeKg: 3000,
    bagWeightKg: 25,
    minLotKg: 1500,
    supplierPrice: 185,
    markupPercent: 15,
    hasCertificate: true,
    status: "IN_STOCK",
    photoCount: 6,
    certificates: [
      { name: "Сертификат соответствия — Вега 87 (РС-1)", issuedAt: "2025-08-15" },
    ],
    updatedDaysAgo: 0,
  },
  {
    id: "pos-2",
    supplierId: "sup-agroyug",
    cultureId: "cult-alfalfa",
    attributes: {
      sort: "Славянская",
      grade: "2 класс",
      reproduction: "РС-2",
      germination: 82,
      purity: 96,
      weed: 3,
      moisture: "9–11",
      year: 2025,
    },
    volumeKg: 4000,
    bagWeightKg: 50,
    minLotKg: 2000,
    supplierPrice: 165,
    markupPercent: 18,
    hasCertificate: false,
    status: "OUT_OF_STOCK",
    photoCount: 3,
    certificates: [],
    updatedDaysAgo: 1,
  },
  {
    id: "pos-3",
    supplierId: "sup-agroyug",
    cultureId: "cult-walnut",
    attributes: {
      sort: "Идеал",
      calibre: "32+",
      moisture: 8,
      kernel: "45–50",
      shellThickness: "тонкая",
      grade: "высший",
      year: 2025,
    },
    volumeKg: 10000,
    bagWeightKg: 25,
    minLotKg: 500,
    supplierPrice: 100,
    markupPercent: 18,
    hasCertificate: true,
    status: "IN_STOCK",
    photoCount: 8,
    certificates: [{ name: "Протокол испытаний — орех Идеал 32+", issuedAt: "2025-10-02" }],
    updatedDaysAgo: 0,
  },
  {
    id: "pos-4",
    supplierId: "sup-semstart",
    cultureId: "cult-sainfoin",
    attributes: { sort: "Песчаный 1251", reproduction: "РС-1", germination: 90, purity: 98, moisture: "8–10", year: 2025 },
    volumeKg: 5000,
    bagWeightKg: 25,
    minLotKg: 1000,
    supplierPrice: 145,
    markupPercent: 15,
    hasCertificate: true,
    status: "IN_STOCK",
    photoCount: 4,
    certificates: [{ name: "Сертификат соответствия — Песчаный 1251", issuedAt: "2025-07-21" }],
    updatedDaysAgo: 2,
  },
  {
    id: "pos-5",
    supplierId: "sup-semstart",
    cultureId: "cult-sudan",
    attributes: { sort: "Донская 5", reproduction: "РС-2", germination: 85, purity: 97, moisture: "9–12", year: 2024 },
    volumeKg: 3750,
    bagWeightKg: 25,
    minLotKg: 1000,
    supplierPrice: 120,
    markupPercent: 15,
    hasCertificate: false,
    status: "ON_ORDER",
    photoCount: 2,
    certificates: [],
    updatedDaysAgo: 3,
  },
  {
    id: "pos-6",
    supplierId: "sup-semstart",
    cultureId: "cult-alfalfa",
    attributes: { sort: "Находка", reproduction: "РС-1", germination: 86, purity: 98, weed: 2, moisture: "8–10", year: 2025 },
    volumeKg: 2250,
    bagWeightKg: 25,
    minLotKg: 1000,
    supplierPrice: 175,
    markupPercent: 16,
    hasCertificate: false,
    status: "IN_STOCK",
    photoCount: 2,
    certificates: [],
    updatedDaysAgo: 5,
  },
  {
    id: "pos-7",
    supplierId: "sup-orehprom",
    cultureId: "cult-walnut",
    attributes: { sort: "Садовый", calibre: "30+", moisture: 9, kernel: "48–50", shellThickness: "средняя", grade: "первый", year: 2024 },
    volumeKg: 6500,
    bagWeightKg: 25,
    minLotKg: 500,
    supplierPrice: 100,
    markupPercent: 15,
    hasCertificate: false,
    status: "IN_STOCK",
    photoCount: 5,
    certificates: [],
    updatedDaysAgo: 4,
  },
];

/* ---------- Этап 2: аккаунты ---------- */

export interface SeedAccount {
  id: string;
  platform: AccountPlatform;
  phone: string;
  status: AccountStatus;
  dailyLimit: number;
  notes?: string;
}

export const SEED_ACCOUNTS: SeedAccount[] = [
  {
    id: "acc-tg-main",
    platform: "TELEGRAM",
    phone: "+7 900 000-00-11",
    status: "ACTIVE",
    dailyLimit: 20,
    notes: "Основной аккаунт Telegram. Автопостинг (этап 3) — только через него.",
  },
  {
    id: "acc-tg-backup",
    platform: "TELEGRAM",
    phone: "+7 900 000-00-12",
    status: "ACTIVE",
    dailyLimit: 15,
    notes: "Резервный: подключаю, когда основной упирается в лимит.",
  },
];

/* ---------- Этап 2.5: каналы (реальные, из исследования) ----------
 * Источник: docs/CHANNEL_RESEARCH.md (таблица исследования рынка).
 * reach из исследования пишем в subscribersCount; averageReach не
 * измеряли — null. Лимиты подач исследование не зафиксировало — null.
 * «Новочеркасск аграрный» оставлен из сида 2.1 (username-заглушка). */

export interface SeedChannel {
  id: string;
  name: string;
  type: ChannelType;
  /** Deep link: t.me/…, URL подачи объявления, URL чата. Заглушки — замените. */
  url: string;
  region: string;
  /** Город для гео-ротации; null — канал на весь регион. */
  city: string | null;
  tags: ChannelTag[];
  subscribersCount: number | null;
  averageReach: number | null;
  /** Сколько дней назад была активность (для демо; null — не заполнено). */
  activityDaysAgo: number | null;
  accountId: string | null;
  notes?: string;
  /* Этап 2.5: подача и профиль канала (см. docs/CHANNEL_RESEARCH.md). */
  submissionMethod: SubmissionMethod;
  /** Бот-приёмщик, например @Taganrog_Predlozhka_bot. */
  submissionBotUsername?: string | null;
  /** Контакт администратора, например @admn_013. */
  adminContact?: string | null;
  /** Лимит подач, например «2 раза в день». */
  frequencyLimit?: string | null;
  confirmationStatus: ConfirmationStatus;
  /** Id канала-зеркала на другой площадке (TG↔MAX). */
  mirrorOf?: string | null;
  /** Профиль аудитории: B2B / B2C / REGIONAL / GENERAL. */
  audienceType: AudienceType | null;
}

export const SEED_CHANNELS: SeedChannel[] = [
  {
    id: "ch-agro-market",
    name: "Agro Market",
    type: "TELEGRAM_CHAT",
    url: "https://t.me/selhoz032",
    region: "Федеральный",
    city: null,
    tags: ["SEEDS", "LIVESTOCK", "WHOLESALE"],
    subscribersCount: 13889,
    averageReach: null,
    activityDaysAgo: 0,
    accountId: "acc-tg-backup",
    notes: "Федеральный агро-чат. Подача: админ @Ivan_plants12.",
    submissionMethod: "ADMIN_CONTACT",
    adminContact: "@Ivan_plants12",
    confirmationStatus: "CONFIRMED",
    audienceType: "B2B",
  },
  {
    id: "ch-selhoztehnika",
    name: "СЕЛЬХОЗТЕХНИКА, СЗР, Семена",
    type: "TELEGRAM_CHAT",
    url: "https://t.me/SELHOZTEHNIKA2024",
    region: "ДНР/ЛНР/Запорожье/Херсон/Крым",
    city: null,
    tags: ["SEEDS", "LIVESTOCK"],
    subscribersCount: 6695,
    averageReach: null,
    activityDaysAgo: 0,
    accountId: "acc-tg-backup",
    notes: "Новые регионы: техника, СЗР, семена. Заявки и предложения.",
    submissionMethod: "ADMIN_CONTACT",
    confirmationStatus: "CONFIRMED",
    audienceType: "B2B",
  },
  {
    id: "ch-farmers-dnr",
    name: "ФЕРМЕРСКИЙ РЫНОК ДНР ЛНР",
    type: "TELEGRAM_CHANNEL",
    url: "https://t.me/farmers_market_dnr_lnr",
    region: "ДНР/ЛНР",
    city: null,
    tags: ["SEEDS", "LIVESTOCK", "GENERAL"],
    subscribersCount: 3600,
    averageReach: null,
    activityDaysAgo: 1,
    accountId: "acc-tg-backup",
    notes: "Канал ДНР/ЛНР. Есть MAX-зеркало (см. ch-max-farmers-dnr).",
    submissionMethod: "ADMIN_CONTACT",
    confirmationStatus: "CONFIRMED",
    mirrorOf: "ch-max-farmers-dnr",
    audienceType: "B2B",
  },
  {
    id: "ch-rus-fermer",
    name: "Аграрии России",
    type: "TELEGRAM_CHAT",
    url: "https://t.me/rus_fermer",
    region: "Федеральный",
    city: null,
    tags: ["SEEDS", "LIVESTOCK"],
    subscribersCount: 779,
    averageReach: null,
    activityDaysAgo: 1,
    accountId: "acc-tg-backup",
    notes: "Небольшой, но живой федеральный агро-чат. Админ @russianagro.",
    submissionMethod: "ADMIN_CONTACT",
    adminContact: "@russianagro",
    confirmationStatus: "CONFIRMED",
    audienceType: "B2B",
  },
  {
    id: "ch-don-farmer",
    name: "ДНР Донецкий Фермер",
    type: "TELEGRAM_CHANNEL",
    url: "https://t.me/fferm_don",
    region: "ДНР",
    city: null,
    tags: ["SEEDS", "LIVESTOCK"],
    subscribersCount: 303,
    averageReach: null,
    activityDaysAgo: 2,
    accountId: "acc-tg-backup",
    notes: "Канал для фермеров ДНР.",
    submissionMethod: "ADMIN_CONTACT",
    confirmationStatus: "CONFIRMED",
    audienceType: "B2B",
  },
  {
    id: "ch-russian-wholesaler",
    name: "Оптовики России и Зарубежья",
    type: "TELEGRAM_CHAT",
    url: "https://t.me/RUSSIAN_WHOLESALER",
    region: "Федеральный",
    city: null,
    tags: ["NUT", "WHOLESALE"],
    subscribersCount: 3652,
    averageReach: null,
    activityDaysAgo: 0,
    accountId: "acc-tg-backup",
    notes: "Федеральный опт, в т.ч. орех. Для позиций грецкого ореха.",
    submissionMethod: "ADMIN_CONTACT",
    confirmationStatus: "CONFIRMED",
    audienceType: "B2B",
  },
  {
    id: "ch-optfruits",
    name: "Фрукты овощи оптом Россия и СНГ",
    type: "TELEGRAM_CHAT",
    url: "https://t.me/optfruitss",
    region: "Федеральный",
    city: null,
    tags: ["NUT", "WHOLESALE"],
    subscribersCount: 1420,
    averageReach: null,
    activityDaysAgo: 0,
    accountId: "acc-tg-backup",
    notes: "Фрукты и овощи оптом; админ @maksnaz77.",
    submissionMethod: "ADMIN_CONTACT",
    adminContact: "@maksnaz77",
    confirmationStatus: "CONFIRMED",
    audienceType: "B2B",
  },
  {
    id: "ch-copany",
    name: "COPANY MARKET",
    type: "TELEGRAM_CHAT",
    url: "https://t.me/copany_market",
    region: "Херсонская область",
    city: null,
    tags: ["NUT", "WHOLESALE"],
    subscribersCount: 3973,
    averageReach: null,
    activityDaysAgo: 1,
    accountId: "acc-tg-backup",
    notes: "Херсонская область; орехи и опт. Админ @Copany_Market_Admin.",
    submissionMethod: "ADMIN_CONTACT",
    adminContact: "@Copany_Market_Admin",
    confirmationStatus: "CONFIRMED",
    audienceType: "B2B",
  },
  {
    id: "ch-oreh-rf",
    name: "Орехи Сухофрукты",
    type: "TELEGRAM_CHAT",
    url: "https://t.me/oreh_rf",
    region: "Федеральный",
    city: null,
    tags: ["NUT"],
    subscribersCount: 348,
    averageReach: null,
    activityDaysAgo: 5,
    accountId: "acc-tg-backup",
    notes: "Активность низкая (~5 постов/30 дней) — статус «требует проверки».",
    submissionMethod: "ADMIN_CONTACT",
    confirmationStatus: "REQUIRES_CHECK",
    audienceType: "B2B",
  },
  {
    id: "ch-baraholka-dinskaya",
    name: "Барахолка Динская",
    type: "TELEGRAM_CHANNEL",
    url: "https://t.me/baraholka_dinskaya",
    region: "Краснодарский край",
    city: "Динская",
    tags: ["GENERAL"],
    subscribersCount: 1076,
    averageReach: null,
    activityDaysAgo: 1,
    accountId: "acc-tg-main",
    notes: "Канал ст. Динская; админ @managerAdel.",
    submissionMethod: "ADMIN_CONTACT",
    adminContact: "@managerAdel",
    confirmationStatus: "CONFIRMED",
    audienceType: "REGIONAL",
  },
  {
    id: "ch-baraholkadinsk",
    name: "Барахолка Динская — район",
    type: "TELEGRAM_CHAT",
    url: "https://t.me/baraholkadinsk",
    region: "Краснодарский край",
    city: "Динская",
    tags: ["GENERAL"],
    subscribersCount: 2572,
    averageReach: null,
    activityDaysAgo: 0,
    accountId: "acc-tg-main",
    notes: "Чат Динского района; админ @guber123.",
    submissionMethod: "ADMIN_CONTACT",
    adminContact: "@guber123",
    confirmationStatus: "CONFIRMED",
    audienceType: "REGIONAL",
  },
  {
    id: "ch-baraholkaraiona",
    name: "Барахолка Динского района",
    type: "TELEGRAM_CHAT",
    url: "https://t.me/baraholkaraiona",
    region: "Краснодарский край",
    city: "Динская",
    tags: ["GENERAL"],
    subscribersCount: 5902,
    averageReach: null,
    activityDaysAgo: 0,
    accountId: "acc-tg-main",
    notes: "Чат; подача через бот @reklama_v_rvs_bot.",
    submissionMethod: "BOT",
    submissionBotUsername: "@reklama_v_rvs_bot",
    confirmationStatus: "CONFIRMED",
    audienceType: "REGIONAL",
  },
  {
    id: "ch-bara-taganrog",
    name: "Барахолка Таганрог",
    type: "TELEGRAM_CHANNEL",
    url: "https://t.me/baraholka_taganrog61",
    region: "Ростовская область",
    city: "Таганрог",
    tags: ["GENERAL", "SEEDS"],
    subscribersCount: 6226,
    averageReach: null,
    activityDaysAgo: 0,
    accountId: "acc-tg-main",
    notes: "Канал Таганрога; подача через бот @Taganrog_Predlozhka_bot.",
    submissionMethod: "BOT",
    submissionBotUsername: "@Taganrog_Predlozhka_bot",
    confirmationStatus: "CONFIRMED",
    audienceType: "REGIONAL",
  },
  {
    id: "ch-rostov-taganrog",
    name: "(БАРАХОЛКА) Ростов–Таганрог",
    type: "TELEGRAM_CHAT",
    url: "https://t.me/baraholka_rostov_taganrog",
    region: "Ростовская область",
    city: null,
    tags: ["GENERAL"],
    subscribersCount: 1828,
    averageReach: null,
    activityDaysAgo: 3,
    accountId: "acc-tg-main",
    notes:
      "Username в исследовании не зафиксирован (запись «открыть» из каталога) — " +
      "проверьте и замените ссылку. Чат Ростов/Таганрог.",
    submissionMethod: "ADMIN_CONTACT",
    confirmationStatus: "REQUIRES_CHECK",
    audienceType: "REGIONAL",
  },
  {
    id: "ch-max-rostov",
    name: "Барахолка Ростов-на-Дону (MAX)",
    type: "MAX",
    url: "https://max.ru/channel_baraholka_rostov",
    region: "Ростовская область",
    city: null,
    tags: ["GENERAL"],
    subscribersCount: 1295,
    averageReach: null,
    activityDaysAgo: 1,
    accountId: null,
    notes:
      "MAX-канал: Ростов, Батайск, Аксай, Азов, Таганрог, Шахты, Новочеркасск. " +
      "Подача ботом — имя не зафиксировано.",
    submissionMethod: "BOT",
    confirmationStatus: "CONFIRMED",
    audienceType: "REGIONAL",
  },
  {
    id: "ch-max-krasnodar",
    name: "Барахолка Краснодар (MAX)",
    type: "MAX",
    url: "https://max.ru/channel_barahl",
    region: "Краснодарский край",
    city: null,
    tags: ["GENERAL"],
    subscribersCount: 1899,
    averageReach: null,
    activityDaysAgo: 1,
    accountId: null,
    notes: "MAX-барахолка Краснодарского края.",
    submissionMethod: "ADMIN_CONTACT",
    confirmationStatus: "CONFIRMED",
    audienceType: "REGIONAL",
  },
  {
    id: "ch-max-dinskoy",
    name: "Барахолка Динского района (MAX)",
    type: "MAX",
    url: "https://max.ru/baraholka23",
    region: "Краснодарский край",
    city: "Динская",
    tags: ["GENERAL"],
    subscribersCount: null,
    averageReach: null,
    activityDaysAgo: null,
    accountId: null,
    notes: "MAX-барахолка Динского района.",
    submissionMethod: "BOT",
    confirmationStatus: "CONFIRMED",
    audienceType: "REGIONAL",
  },
  {
    id: "ch-max-darom-tag",
    name: "Отдам даром Таганрог (MAX)",
    type: "MAX",
    url: "https://max.ru/otdam_darom_taganrog",
    region: "Ростовская область",
    city: "Таганрог",
    tags: ["GENERAL"],
    subscribersCount: null,
    averageReach: null,
    activityDaysAgo: null,
    accountId: null,
    notes: "MAX-канал «Отдам даром»; подача через бот @DaromTagBot.",
    submissionMethod: "BOT",
    submissionBotUsername: "@DaromTagBot",
    confirmationStatus: "CONFIRMED",
    audienceType: "REGIONAL",
  },
  {
    id: "ch-max-farmers-dnr",
    name: "Фермерский рынок ДНР/ЛНР (MAX)",
    type: "MAX",
    url: "https://max.ru/farmers_market_dnr_lnr",
    region: "ДНР/ЛНР",
    city: null,
    tags: ["SEEDS", "LIVESTOCK"],
    subscribersCount: null,
    averageReach: null,
    activityDaysAgo: null,
    accountId: null,
    notes: "MAX-зеркало TG-канала @farmers_market_dnr_lnr.",
    submissionMethod: "ADMIN_CONTACT",
    confirmationStatus: "CONFIRMED",
    mirrorOf: "ch-farmers-dnr",
    audienceType: "B2B",
  },
  {
    id: "ch-novocherkassk",
    name: "Новочеркасск аграрный",
    type: "TELEGRAM_CHAT",
    url: "https://t.me/novocherkassk_agro",
    region: "Ростовская область",
    city: "Новочеркасск",
    tags: ["SEEDS", "LIVESTOCK"],
    subscribersCount: 1100,
    averageReach: null,
    activityDaysAgo: 2,
    accountId: "acc-tg-main",
    notes: "Аграрный чат Новочеркасска (из сида 2.1; username — заглушка).",
    submissionMethod: "ADMIN_CONTACT",
    confirmationStatus: "CONFIRMED",
    audienceType: "B2B",
  },
];

/** Демо-каналы этапов 2/2.1 — сид 2.5 их удаляет из базы (замена на реальные). */
export const OBSOLETE_SEED_CHANNEL_IDS = [
  "ch-kuban-farmers",
  "ch-dinskaya",
  "ch-fodder-yufo",
  "ch-copany-market",
  "ch-fruvesh-opt",
  "ch-nut-rf",
  "ch-agroserver-nut",
  "ch-avito-seeds",
  "ch-max-agro",
  "ch-youla-agro",
  "ch-rostov-agro",
  "ch-taganrog",
  "ch-shakhty",
];

/* ---------- Этап 2.1: демо-история ротации ---------- */

export interface SeedRotationListing {
  id: string;
  channelId: string;
  /** Дней назад была публикация (для демо-состояния cooldown). */
  publishedDaysAgo: number;
}

/**
 * Демо-история для ротации: Новочеркасск разместили 2 дня назад
 * (cooldown), Таганрог — «никогда». Поэтому первый recommendedCity —
 * Таганрог, после публикации там список городов ротации обновится.
 * Позиция подставляется первой доступной на момент сида.
 */
export const SEED_ROTATION_LISTINGS: SeedRotationListing[] = [
  { id: "lst-rotation-novocherkassk", channelId: "ch-novocherkassk", publishedDaysAgo: 2 },
];

/** Демо-история ротации этапа 2.1 — сид 2.5 её удаляет (каналы заменены). */
export const OBSOLETE_ROTATION_LISTING_IDS = ["lst-rotation-rostov"];

/* ---------- Этап 2.5: демо-цены рынка (только для превью) ----------
 * Использует ИСКЛЮЧИТЕЛЬНО мок-БД Next-превью: чтобы строка «Рынок: …»
 * в карточке позиции работала в демо до первого запуска парсера.
 * В прод-базу (prisma/seed.ts) НЕ пишутся — реальные цены собирает
 * парсер (services/parser). Цены демонстрационные, сниппеты помечены.
 * Периодически устаревшие строки (fetchedDaysAgo > окна) сами выпадают
 * из агрегатов — как живые данные. */

export interface SeedMarketPrice {
  id: string;
  source: PriceSource;
  /** Поисковый запрос парсера (lowercase, см. shared/market.ts). */
  query: string;
  price: number;
  unit: string;
  region: string | null;
  sellerName: string | null;
  link: string;
  rawSnippet: string;
  fetchedDaysAgo: number;
}

export const SEED_MARKET_PRICES: SeedMarketPrice[] = [
  /* люцерна */
  { id: "mp-luc-1", source: "AGROSERVER", query: "люцерна", price: 160, unit: "₽/кг", region: "Тамбовская область", sellerName: null, link: "https://agroserver.ru/b/", rawSnippet: "Демо: семена люцерны, 1 класс — 160 ₽/кг.", fetchedDaysAgo: 0 },
  { id: "mp-luc-2", source: "TELEGRAM", query: "люцерна", price: 175, unit: "₽/кг", region: null, sellerName: null, link: "https://t.me/selhoz032", rawSnippet: "Демо: люцерна Вега 87, РС-1 — 175 ₽/кг.", fetchedDaysAgo: 1 },
  { id: "mp-luc-3", source: "AGROSERVER", query: "люцерна", price: 190, unit: "₽/кг", region: "Воронежская область", sellerName: null, link: "https://agroserver.ru/b/", rawSnippet: "Демо: люцерна 2 репр., всхожесть 85 — 190 ₽/кг.", fetchedDaysAgo: 2 },
  { id: "mp-luc-4", source: "TELEGRAM", query: "люцерна", price: 210, unit: "₽/кг", region: null, sellerName: null, link: "https://t.me/selhoz032", rawSnippet: "Демо: люцерна элита — 210 ₽/кг.", fetchedDaysAgo: 1 },
  { id: "mp-luc-5", source: "AGROSERVER", query: "люцерна", price: 240, unit: "₽/кг", region: "Краснодарский край", sellerName: null, link: "https://agroserver.ru/b/", rawSnippet: "Демо: люцерна элитная репродукция — 240 ₽/кг.", fetchedDaysAgo: 5 },
  /* эспарцет */
  { id: "mp-esp-1", source: "AGROSERVER", query: "эспарцет", price: 130, unit: "₽/кг", region: "Ростовская область", sellerName: null, link: "https://agroserver.ru/b/", rawSnippet: "Демо: эспарцет песчаный — 130 ₽/кг.", fetchedDaysAgo: 1 },
  { id: "mp-esp-2", source: "TELEGRAM", query: "эспарцет", price: 145, unit: "₽/кг", region: null, sellerName: null, link: "https://t.me/selhoz032", rawSnippet: "Демо: эспарцет РС-1 — 145 ₽/кг.", fetchedDaysAgo: 0 },
  { id: "mp-esp-3", source: "AGROSERVER", query: "эспарцет", price: 155, unit: "₽/кг", region: "Ставропольский край", sellerName: null, link: "https://agroserver.ru/b/", rawSnippet: "Демо: эспарцет, всхожесть 88 — 155 ₽/кг.", fetchedDaysAgo: 3 },
  { id: "mp-esp-4", source: "TELEGRAM", query: "эспарцет", price: 170, unit: "₽/кг", region: null, sellerName: null, link: "https://t.me/selhoz032", rawSnippet: "Демо: эспарцет элита — 170 ₽/кг.", fetchedDaysAgo: 2 },
  /* суданка */
  { id: "mp-sud-1", source: "AGROSERVER", query: "суданка", price: 95, unit: "₽/кг", region: "Волгоградская область", sellerName: null, link: "https://agroserver.ru/b/", rawSnippet: "Демо: суданская трава РС-2 — 95 ₽/кг.", fetchedDaysAgo: 1 },
  { id: "mp-sud-2", source: "TELEGRAM", query: "суданка", price: 105, unit: "₽/кг", region: null, sellerName: null, link: "https://t.me/RUSSIAN_WHOLESALER", rawSnippet: "Демо: суданка, всхожесть 80 — 105 ₽/кг.", fetchedDaysAgo: 0 },
  { id: "mp-sud-3", source: "AGROSERVER", query: "суданка", price: 120, unit: "₽/кг", region: "Саратовская область", sellerName: null, link: "https://agroserver.ru/b/", rawSnippet: "Демо: суданская трава — 120 ₽/кг.", fetchedDaysAgo: 4 },
  { id: "mp-sud-4", source: "TELEGRAM", query: "суданка", price: 130, unit: "₽/кг", region: null, sellerName: null, link: "https://t.me/RUSSIAN_WHOLESALER", rawSnippet: "Демо: суданка Донская 5 — 130 ₽/кг.", fetchedDaysAgo: 2 },
  /* грецкий орех */
  { id: "mp-oreh-1", source: "TELEGRAM", query: "грецкий орех", price: 90, unit: "₽/кг", region: null, sellerName: null, link: "https://t.me/RUSSIAN_WHOLESALER", rawSnippet: "Демо: орех переработка, 32+ — 90 ₽/кг.", fetchedDaysAgo: 0 },
  { id: "mp-oreh-2", source: "AGROSERVER", query: "грецкий орех", price: 100, unit: "₽/кг", region: "Краснодарский край", sellerName: null, link: "https://agroserver.ru/b/", rawSnippet: "Демо: орех нечищеный — 100 ₽/кг.", fetchedDaysAgo: 1 },
  { id: "mp-oreh-3", source: "TELEGRAM", query: "грецкий орех", price: 110, unit: "₽/кг", region: null, sellerName: null, link: "https://t.me/optfruitss", rawSnippet: "Демо: орех Садовый 30+ — 110 ₽/кг.", fetchedDaysAgo: 2 },
  { id: "mp-oreh-4", source: "AGROSERVER", query: "грецкий орех", price: 135, unit: "₽/кг", region: "Воронежская область", sellerName: null, link: "https://agroserver.ru/b/", rawSnippet: "Демо: орех 32+, выход ядра 52 — 135 ₽/кг.", fetchedDaysAgo: 3 },
];

/* ---------- Демо-фото (SVG data-URL, без внешних сервисов) ---------- */

/** Тёплая заглушка вместо фото поставщика: работает и без R2. */
export function demoPhoto(label: string, index: number): string {
  const text = `${label} · ${index}`.replace(/[<>&"]/g, "");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">` +
    `<rect width="240" height="240" rx="28" fill="#F2EFE9"/>` +
    `<circle cx="120" cy="92" r="30" fill="#E6F0EA"/>` +
    `<path d="M120 122 v36 M120 126 c-12-16-30-20-42-12 7 14 25 19 42 12 Z ` +
    `M120 126 c12-16 30-20 42-12 -7 14 -25 19 -42 12 Z" ` +
    `stroke="#3E7C5A" stroke-width="6" fill="none" stroke-linecap="round"/>` +
    `<text x="120" y="204" font-family="system-ui, sans-serif" font-size="20" ` +
    `font-weight="600" fill="#7A756D" text-anchor="middle">${text}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
