import { z } from "zod";
import { CHANNEL_TAGS } from "@shared/channels";

/**
 * Zod-схемы входных данных. Ошибки валидации превращаются
 * в ApiError(400, VALIDATION_ERROR) с человеческим сообщением.
 */

import { badRequest } from "./errors.js";

export const supplierLocationSchema = z.enum([
  "PAVLOVSKAYA",
  "LENINGRADSKAYA",
  "TIHORETSK",
  "OTHER",
]);
export const shippingModeSchema = z.enum(["SELF_LOADS", "FROM_WAREHOUSE", "BOTH"]);
export const cultureTypeSchema = z.enum(["SEED", "NUT"]);
export const positionStatusSchema = z.enum(["IN_STOCK", "ON_ORDER", "OUT_OF_STOCK"]);
export const mediaTypeSchema = z.enum(["PHOTO", "VIDEO"]);

export const supplierCreateSchema = z.object({
  name: z.string().trim().min(1, "Укажите название").max(120),
  phone: z.string().trim().min(7, "Укажите телефон").max(30),
  location: supplierLocationSchema,
  shippingMode: shippingModeSchema,
  notes: z.string().trim().max(2000).optional(),
});

export const supplierUpdateSchema = supplierCreateSchema.partial();

export const attributeDisplayTypeSchema = z.enum(["FIXED", "RANGE", "MIN", "TEXT"]);

export const attributeFieldSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-zA-Z0-9]*$/, "Ключ поля — латиница с маленькой буквы"),
  label: z.string().trim().min(1, "У поля схемы нужен заголовок").max(60),
  type: z.enum(["text", "number", "percent", "year"]),
  /* Патч 4.1: формат значения атрибута (FIXED/RANGE/MIN/TEXT) — контракт для AI. */
  displayType: attributeDisplayTypeSchema.optional(),
  unit: z.string().trim().max(10).optional(),
  required: z.boolean(),
});

export const cultureCreateSchema = z.object({
  name: z.string().trim().min(1, "Укажите название культуры").max(60),
  type: cultureTypeSchema,
  attributesSchema: z
    .array(attributeFieldSchema)
    .min(1, "У культуры нужен хотя бы один атрибут")
    .max(24),
});

export const cultureUpdateSchema = z.object({
  name: z.string().trim().min(1, "Укажите название культуры").max(60).optional(),
  attributesSchema: z
    .array(attributeFieldSchema)
    .min(1, "У культуры нужен хотя бы один атрибут")
    .max(24)
    .optional(),
});

export const positionCreateSchema = z.object({
  supplierId: z.string().min(1),
  cultureId: z.string().min(1),
  attributes: z.record(z.string(), z.union([z.string(), z.number()])),
  volumeKg: z.number().int().min(0).max(10_000_000),
  bagWeightKg: z.number().int().min(1).max(1000),
  supplierPrice: z.number().min(0).max(1_000_000),
  markupPercent: z.number().min(0).max(1000),
  minLotKg: z.number().int().min(0).max(10_000_000),
  hasCertificate: z.boolean().optional(),
  status: positionStatusSchema.optional(),
});

export const positionUpdateSchema = z.object({
  supplierId: z.string().min(1).optional(),
  cultureId: z.string().min(1).optional(),
  attributes: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  volumeKg: z.number().int().min(0).max(10_000_000).optional(),
  bagWeightKg: z.number().int().min(1).max(1000).optional(),
  supplierPrice: z.number().min(0).max(1_000_000).optional(),
  markupPercent: z.number().min(0).max(1000).optional(),
  minLotKg: z.number().int().min(0).max(10_000_000).optional(),
  hasCertificate: z.boolean().optional(),
  status: positionStatusSchema.optional(),
});

export const mediaCreateSchema = z.object({
  type: mediaTypeSchema,
  contentType: z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
    "video/mp4",
    "video/quicktime",
  ]),
  watermark: z.boolean().optional(),
});

/** ЭТАП 6: JSON-загрузка медиа через сервер (data-URL + тип). */
export const mediaUploadSchema = z.object({
  dataUrl: z
    .string()
    .trim()
    .min(30, "Пустой файл")
    .max(34_500_000, "Файл больше 25 МБ")
    .regex(/^data:[a-z0-9/+.-]+;base64,/, "Ожидается файл как data-URL (base64)"),
  type: mediaTypeSchema,
  watermark: z.boolean().optional(),
});

/* ---------- Этап 2: каналы, аккаунты, размещения ---------- */

export const channelTypeSchema = z.enum([
  "TELEGRAM_CHAT",
  "TELEGRAM_CHANNEL",
  "AVITO",
  "AGROSERVER",
  "MAX",
  "YOULA",
  "OTHER",
]);

export const accountPlatformSchema = z.enum(["TELEGRAM", "AVITO", "MAX", "YOULA", "OTHER"]);
export const accountStatusSchema = z.enum(["ACTIVE", "LIMITED", "PAUSED", "BLOCKED"]);
export const listingStatusSchema = z.enum(["DRAFT", "COPIED", "PUBLISHED"]);

/* Этап 2.5: способы подачи и профиль канала. */
export const submissionMethodSchema = z.enum([
  "BOT",
  "ADMIN_CONTACT",
  "SITE_FORM",
  "CABINET",
  "NONE",
]);
export const confirmationStatusSchema = z.enum(["CONFIRMED", "REQUIRES_CHECK"]);
export const audienceTypeSchema = z.enum(["B2B", "B2C", "REGIONAL", "GENERAL"]);

/** Словарь тегов — единый источник в shared/channels.ts. */
export const channelTagSchema = z.enum(CHANNEL_TAGS);

const optionalCount = z
  .number()
  .int("Укажите целое число")
  .min(0)
  .max(50_000_000)
  .optional()
  .nullable();

/** @username или ссылка контакта; пустая строка → null в роуте. */
const optionalHandle = z
  .string()
  .trim()
  .max(60, "Контакт — до 60 символов")
  .optional()
  .nullable();

export const channelCreateSchema = z.object({
  name: z.string().trim().min(1, "Укажите название канала").max(120),
  type: channelTypeSchema,
  url: z
    .string()
    .trim()
    .url("Укажите ссылку (https://…)")
    .max(500)
    .refine((v) => v.startsWith("http://") || v.startsWith("https://"), {
      message: "Ссылка должна начинаться с http(s)://",
    }),
  region: z.string().trim().min(1, "Укажите регион").max(60),
  /** Город для гео-ротации; пустая строка обрабатывается в роуте → null. */
  city: z.string().trim().max(60, "Город — до 60 символов").optional().nullable(),
  tags: z
    .array(channelTagSchema)
    .min(1, "Выберите хотя бы один тег")
    .max(5, "Не больше пяти тегов"),
  subscribersCount: optionalCount,
  averageReach: optionalCount,
  lastActivityAt: z
    .string()
    .datetime({ offset: true, message: "Дата активности — ISO (например, 2026-11-24T10:00:00Z)" })
    .optional()
    .nullable(),
  accountId: z.string().trim().min(1).optional().nullable(),
  notes: z.string().trim().max(2000).optional(),
  /* Этап 2.5: подача и профиль. */
  submissionMethod: submissionMethodSchema.optional(),
  submissionBotUsername: optionalHandle,
  adminContact: optionalHandle,
  frequencyLimit: z.string().trim().max(60, "Лимит — до 60 символов").optional().nullable(),
  confirmationStatus: confirmationStatusSchema.optional(),
  mirrorOf: z.string().trim().min(1).optional().nullable(),
  audienceType: audienceTypeSchema.optional().nullable(),
});

export const channelUpdateSchema = channelCreateSchema.partial();

/** POST /api/parser/run — ручной запуск парсера (для теста). */
export const parserRunSchema = z
  .object({
    /** Запросы (по умолчанию — DEFAULT_PARSER_QUERIES из shared/market.ts). */
    queries: z.array(z.string().trim().min(1)).max(10).optional(),
    /** Источники: только перечисленные адаптеры. */
    sources: z.array(z.enum(["AGROSERVER", "TELEGRAM"])).optional(),
  })
  .strict();

export const accountCreateSchema = z.object({
  platform: accountPlatformSchema,
  phone: z.string().trim().min(7, "Укажите телефон").max(30).optional().nullable(),
  status: accountStatusSchema.optional(),
  dailyLimit: z.number().int().min(1, "Лимит — от 1").max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const accountUpdateSchema = accountCreateSchema.partial();

export const listingCreateSchema = z.object({
  positionId: z.string().min(1, "Не указана позиция"),
  channelId: z.string().min(1, "Не указан канал"),
  text: z.string().trim().min(1, "Текст не может быть пустым").max(4000).optional(),
});

export const listingUpdateSchema = z.object({
  text: z.string().trim().min(1, "Текст не может быть пустым").max(4000).optional(),
  status: listingStatusSchema.optional(),
});

export const certificateCreateSchema = z.object({
  name: z.string().trim().min(1, "Укажите название сертификата").max(200),
  issuedAt: z.string().optional(),
  contentType: z.literal("application/pdf"),
});

/** safeParse с превращением первой проблемы в ApiError. */
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw badRequest(issue?.message ?? "Некорректные данные");
  }
  return result.data;
}

/* ---------- Этап 3.2: лиды, инбокс, Telegram-бот ---------- */

export const leadStatusSchema = z.enum([
  "NEW",
  "IN_PROGRESS",
  "ANSWERED",
  "CLOSED",
  "SPAM",
]);
export const leadSourceSchema = z.enum([
  "TELEGRAM_BOT",
  "TELEGRAM_CHAT",
  "AVITO",
  "MANUAL",
]);

export const leadUpdateSchema = z.object({
  status: leadStatusSchema.optional(),
  notes: z.string().trim().max(2000, "Заметка — до 2000 символов").optional(),
  interest: z.string().trim().max(120, "Интерес — до 120 символов").optional(),
  positionId: z.string().trim().min(1).optional().nullable(),
});

/** POST /api/leads/:id/reply: черновик AI или готовый текст на отправку. */
export const leadReplySchema = z
  .object({
    useAi: z.boolean().optional(),
    text: z.string().trim().min(1, "Ответ не может быть пустым").max(4000, "Ответ — до 4000 символов").optional(),
    /** id AiCall черновика, если отправили его как есть/с правками. */
    aiCallId: z.string().trim().min(1).optional(),
  })
  .refine((v) => v.useAi === true || (v.text !== undefined), {
    message: "Укажите text для отправки или useAi для черновика",
  });

export const telegramPublishSchema = z.object({
  listingId: z.string().trim().min(1, "Не указано размещение"),
  /** Обход анти-бана «1 публикация в 24 ч» — ручное подтверждение повтора. */
  confirm: z.boolean().optional(),
});

/**
 * Этап 5.1: setup-webhook игнорирует тело — URL строится только из
 * серверной конфигурации. Схема оставлена как явный «пустой контракт»:
 * любые переданные поля (в т.ч. url) отбрасываются.
 */
export const telegramSetupWebhookSchema = z.object({}).passthrough();

/* ---------- Этап 4: сделки, доставка, документы, рекламации ---------- */

export const dealStatusSchema = z.enum([
  "DRAFT",
  "AWAITING_PAYMENT",
  "PAID",
  "SHIPPED",
  "DELIVERED",
  "CLOSED",
  "CANCELLED",
]);

/** Псевдо-группы для фильтра списка: ACTIVE (в работе) и FINISHED (закрыты). */
export const dealListStatusSchema = z.enum([
  "DRAFT",
  "AWAITING_PAYMENT",
  "PAID",
  "SHIPPED",
  "DELIVERED",
  "CLOSED",
  "CANCELLED",
  "ACTIVE",
  "FINISHED",
]);

export const dealTaxModeSchema = z.enum(["IP_6", "SELF_EMPLOYED_4", "SELF_EMPLOYED_6"]);
export const deliveryMethodSchema = z.enum(["PICKUP", "TK", "FELLOW_TRAVELER"]);
export const documentTypeSchema = z.enum(["INVOICE", "CONTRACT", "TRANSPORT_NOTE", "UPD"]);
export const claimStatusSchema = z.enum([
  "NEW",
  "IN_REVIEW",
  "RESOLVED",
  "REJECTED",
  "FORWARDED_TO_SUPPLIER",
]);
export const dealPeriodSchema = z.enum(["all", "week", "month"]);

export const dealCreateSchema = z.object({
  leadId: z.string().trim().min(1).optional(),
  positionId: z.string().trim().min(1).optional(),
  buyerName: z.string().trim().min(1, "Укажите имя покупателя").max(120).optional(),
  buyerPhone: z.string().trim().min(5, "Укажите телефон покупателя").max(30).optional(),
  buyerRegion: z.string().trim().min(1, "Укажите регион покупателя").max(80).optional(),
  buyerInn: z
    .string()
    .trim()
    .regex(/^\d{10,12}$/, "ИНН — 10–12 цифр")
    .optional()
    .nullable(),
  volumeKg: z.number().positive("Объём должен быть больше нуля").max(10_000_000),
  salePrice: z.number().min(0).max(1_000_000).optional(),
  supplierPrice: z.number().min(0).max(1_000_000).optional(),
  taxMode: dealTaxModeSchema.optional(),
  deliveryMethod: deliveryMethodSchema.optional(),
  deliveryCost: z.number().min(0).max(10_000_000).optional().nullable(),
  /* Этап 5.1: доп. затраты на доставку до терминала ТК (в себестоимости). */
  deliveryToTerminalCost: z.number().min(0).max(10_000_000).optional().nullable(),
  notes: z.string().trim().max(2000).optional(),
});

export const dealUpdateSchema = z
  .object({
    buyerName: z.string().trim().min(1, "Укажите имя покупателя").max(120).optional(),
    buyerPhone: z.string().trim().min(5, "Укажите телефон покупателя").max(30).optional(),
    buyerRegion: z.string().trim().min(1, "Укажите регион покупателя").max(80).optional(),
    buyerInn: z
      .string()
      .trim()
      .regex(/^\d{10,12}$/, "ИНН — 10–12 цифр")
      .optional()
      .nullable(),
    volumeKg: z.number().positive("Объём должен быть больше нуля").max(10_000_000).optional(),
    salePrice: z.number().min(0).max(1_000_000).optional(),
    supplierPrice: z.number().min(0).max(1_000_000).optional(),
    taxMode: dealTaxModeSchema.optional(),
    deliveryMethod: deliveryMethodSchema.optional(),
    deliveryCost: z.number().min(0).max(10_000_000).optional().nullable(),
    /* Этап 5.1: доп. затраты на доставку до терминала — пересчёт маржи. */
    deliveryToTerminalCost: z.number().min(0).max(10_000_000).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    status: dealStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Пустой запрос на обновление" });

export const dealShipSchema = z.object({
  method: deliveryMethodSchema.optional(),
  carrierId: z.string().trim().min(1).optional().nullable(),
  carrierName: z.string().trim().min(1).max(80).optional().nullable(),
  fromCity: z.string().trim().min(1, "Откуда отгружаем").max(60),
  toCity: z.string().trim().min(1, "Куда доставляем").max(60),
  cost: z.number().min(0, "Стоимость доставки не может быть отрицательной").max(10_000_000),
  days: z.number().int().min(0).max(60).optional().nullable(),
  trackingNumber: z.string().trim().min(1).max(40).optional().nullable(),
});

export const dealCalculateSchema = z.object({
  positionId: z.string().trim().min(1).optional(),
  toCity: z.string().trim().min(1, "Куда доставляем").max(60),
  volumeKg: z.number().positive("Объём должен быть больше нуля").max(10_000_000),
});

export const claimCreateSchema = z.object({
  dealId: z.string().trim().min(1, "Не указана сделка"),
  description: z.string().trim().min(1, "Опишите претензию").max(4000, "Описание — до 4000 символов"),
});

/** ЭТАП 6: фото рекламации — data-URL (JPEG/PNG/WebP, лимит размера на сервисе). */
export const claimPhotoSchema = z.object({
  dataUrl: z
    .string()
    .trim()
    .min(30, "Пустой файл")
    .max(14_500_000, "Фото больше 10 МБ — уменьшите перед загрузкой")
    .regex(/^data:image\/(jpeg|png|webp);base64,/, "Ожидается фото JPEG, PNG или WebP"),
});

export const claimUpdateSchema = z
  .object({
    status: claimStatusSchema.optional(),
    resolution: z.string().trim().max(4000).optional(),
    forwardedToSupplier: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Пустой запрос на обновление" });

export const carrierCreateSchema = z.object({
  name: z.string().trim().min(1, "Укажите название ТК").max(80),
  city: z.string().trim().min(1, "Укажите город").max(60),
  pickupAvailable: z.boolean().optional(),
  isLocal: z.boolean().optional(),
  notes: z.string().trim().max(500).optional(),
});

export const userProfileSchema = z
  .object({
    name: z.string().trim().min(1, "Укажите ФИО/название").max(120).optional(),
    inn: z
      .string()
      .trim()
      .regex(/^\d{10,12}$/, "ИНН — 10–12 цифр")
      .optional()
      .nullable(),
    ogrnip: z
      .string()
      .trim()
      .regex(/^\d{13,15}$/, "ОГРНИП — 13–15 цифр")
      .optional()
      .nullable(),
    address: z.string().trim().max(200).optional().nullable(),
    bank: z.string().trim().max(80).optional().nullable(),
    bik: z
      .string()
      .trim()
      .regex(/^\d{9}$/, "БИК — 9 цифр")
      .optional()
      .nullable(),
    account: z
      .string()
      .trim()
      .regex(/^\d{20}$/, "Расчётный счёт — 20 цифр")
      .optional()
      .nullable(),
    dealTaxMode: dealTaxModeSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Пустой запрос на обновление" });
