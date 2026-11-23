import { z } from "zod";

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

export const attributeFieldSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-zA-Z0-9]*$/, "Ключ поля — латиница с маленькой буквы"),
  label: z.string().trim().min(1, "У поля схемы нужен заголовок").max(60),
  type: z.enum(["text", "number", "percent", "year"]),
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
