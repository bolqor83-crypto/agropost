/**
 * Zod-схемы AI-слоя. Вход — strict (не принимаем лишние поля),
 * выход — строгий контракт use case; любая невалидная модель
 * уходит в retry, затем в шаблонный fallback.
 */

import { z } from "zod";
import type { ListingPlatform } from "@shared/listing-text";

const PLATFORMS = ["avito", "telegram", "agroserver"] as const satisfies readonly ListingPlatform[];

/* ---------- Входы ---------- */

export const aiListingInputSchema = z
  .object({
    positionId: z.string().trim().min(1, "Укажите позицию"),
    platform: z.enum(PLATFORMS),
    accent: z.enum(["price", "quality", "volume"]).optional(),
  })
  .strict();

const replyMessageSchema = z.object({
  role: z.enum(["user", "assistant", "buyer", "seller"]),
  text: z.string().trim().min(1).max(2000),
});

export const aiReplyInputSchema = z
  .object({
    incomingMessage: z.string().trim().min(1, "Введите сообщение покупателя").max(2000),
    positionId: z.string().trim().min(1, "Укажите позицию"),
    history: z.array(replyMessageSchema).max(10).optional(),
    userStyle: z
      .object({
        tone: z.string().trim().max(60).optional(),
        examples: z.array(z.string().trim().min(1).max(500)).max(3).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const adviceLeadSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(200),
  channel: z.string().trim().max(120).optional(),
  days: z.number().int().min(0).optional(),
});

const adviceListingSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(200),
  channel: z.string().trim().max(120).optional(),
  daysAgo: z.number().int().min(0).optional(),
});

const advicePositionSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(200),
  volumeKg: z.number().int().min(0).optional(),
  salePrice: z.number().min(0).optional(),
});

const adviceChannelSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(200),
  city: z.string().trim().max(120).nullable().optional(),
  daysSince: z.number().int().min(0).nullable().optional(),
});

export const aiAdviceContextSchema = z
  .object({
    activeLeads: z.array(adviceLeadSchema).max(10),
    recentListings: z.array(adviceListingSchema).max(10),
    staleListings: z.array(adviceListingSchema).max(10),
    positionsInStock: z.array(advicePositionSchema).max(10),
    cooledDownChannels: z.array(adviceChannelSchema).max(10),
  })
  .strict();

export const aiAdviceInputSchema = z
  .object({
    context: aiAdviceContextSchema.optional(),
  })
  .strict();

const marketSampleSchema = z.object({
  price: z.number().min(0),
  source: z.enum(["AGROSERVER", "TELEGRAM"]),
});

const marketSnapshotSchema = z
  .object({
    min: z.number().min(0).nullable(),
    max: z.number().min(0).nullable(),
    avg: z.number().min(0).nullable(),
    sources: z.array(z.enum(["AGROSERVER", "TELEGRAM"])).max(2),
    samples: z.array(marketSampleSchema).max(20),
    count: z.number().int().min(0).optional(),
  })
  .strict();

export const aiPriceAnalysisInputSchema = z
  .object({
    positionId: z.string().trim().min(1, "Укажите позицию"),
    market: marketSnapshotSchema.optional(),
  })
  .strict();

const shipmentSchema = z
  .object({
    fromRegion: z.string().trim().min(1).max(80),
    fromCity: z.string().trim().min(1).max(80),
    toRegion: z.string().trim().min(1).max(80),
    toCity: z.string().trim().min(1).max(80),
    weightKg: z.number().positive(),
    bagWeightKg: z.number().positive(),
    bagsCount: z.number().int().positive(),
    volumeM3: z.number().min(0),
  })
  .strict();

const carrierSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    price: z.number().min(0),
    days: z.number().int().min(0).max(60),
  })
  .strict();

export const aiLogisticsInputSchema = z
  .object({
    shipment: shipmentSchema,
    availableCarriers: z.array(carrierSchema).min(2, "Нужно минимум 2 перевозчика").max(4),
  })
  .strict();

/* ---------- Выходы (контракт модели) ---------- */

export const aiListingDataSchema = z
  .object({
    title: z.string().trim().min(1, "Заголовок пустой").max(70, "Заголовок длиннее 70 символов"),
    body: z.string().trim().min(1, "Текст пустой").max(3000, "Текст длиннее 3000 символов"),
    tags: z
      .array(z.string().trim().min(1).max(40))
      .min(1, "Нужен хотя бы один тег")
      .max(10, "Не больше 10 тегов"),
  })
  .strict();

export const aiReplyDataSchema = z
  .object({
    reply: z.string().trim().min(1, "Ответ пустой").max(1000, "Ответ длиннее 1000 символов"),
    includes: z.array(z.string().trim().min(1).max(60)).max(20),
  })
  .strict();

export const aiAdviceDataSchema = z
  .object({
    actions: z
      .array(
        z
          .object({
            priority: z.enum(["high", "medium"]),
            action: z.string().trim().min(1).max(200),
            reason: z.string().trim().min(1).max(300),
            link: z
              .string()
              .trim()
              .min(1)
              .max(200)
              .refine((v) => v.startsWith("/"), {
                message: "link должен быть внутренним deep link (начинается с /)",
              }),
          })
          .strict(),
      )
      .max(3, "Не больше 3 действий"),
  })
  .strict();

export const aiPriceAnalysisDataSchema = z
  .object({
    marketPosition: z.enum(["below", "at", "above"]),
    ourPrice: z.number().min(0),
    marketAvg: z.number().min(0).nullable(),
    delta: z.number().nullable(),
    recommendation: z.string().trim().min(1).max(300),
  })
  .strict();

export const aiLogisticsDataSchema = z
  .object({
    options: z
      .array(
        z
          .object({
            carrier: z.string().trim().min(1).max(60),
            price: z.number().min(0),
            days: z.number().int().min(0).max(60),
            note: z.string().trim().min(1).max(200),
          })
          .strict(),
      )
      .min(2, "Минимум 2 варианта")
      .max(4, "Максимум 4 варианта"),
    recommendation: z.string().trim().min(1).max(300),
  })
  .strict();

export type AiListingInputParsed = z.infer<typeof aiListingInputSchema>;
export type AiReplyInputParsed = z.infer<typeof aiReplyInputSchema>;
export type AiAdviceInputParsed = z.infer<typeof aiAdviceInputSchema>;
export type AiPriceAnalysisInputParsed = z.infer<typeof aiPriceAnalysisInputSchema>;
export type AiLogisticsInputParsed = z.infer<typeof aiLogisticsInputSchema>;
