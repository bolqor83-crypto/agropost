/**
 * Работа с гибкими атрибутами позиций (плоский JSONB).
 *
 * Решение этапа 1: значение хранится как {key: value}, а подписи,
 * порядок, типы и единицы живут в attributesSchema шаблона культуры.
 * Смена шаблона не ломает старые позиции: у позиций просто нет
 * значения для нового ключа (UI покажет «—»).
 */

import type { AttributeField, AttributesMap, AttributeValue } from "./types";

/** Значение атрибута для UI: проценты с «%», остальное как есть. */
export function formatAttrValue(
  field: AttributeField,
  value: AttributeValue | undefined,
): string {
  if (value === undefined || value === "") return "—";
  if (field.type === "percent") return `${value}%`;
  return String(value);
}

/** Короткая сводка атрибутов для карточки позиции. */
export function attrSummary(fields: AttributeField[], attrs: AttributesMap, max = 2): string {
  const parts = fields
    .filter((f) => f.key !== "sort" && f.key !== "mix")
    .map((f) => formatAttrValue(f, attrs[f.key]))
    .filter((s) => s !== "—")
    .slice(0, max);
  return parts.length > 0 ? parts.join(" · ") : "атрибуты не заполнены";
}

/** Название позиции: культура + сорт («Люцерна «Вега 87»»). */
export function positionName(cultureName: string, attrs: AttributesMap): string {
  const sort = attrs["sort"] ?? attrs["mix"];
  return sort ? `${cultureName} «${String(sort)}»` : cultureName;
}

export class AttributesValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttributesValidationError";
  }
}

/**
 * Валидация и нормализация атрибутов по шаблону культуры.
 * Используется и сервером, и мок-API превью — правила одни.
 *
 * - ключи вне шаблона отбрасываются;
 * - обязательные поля должны быть заполнены;
 * - percent: 0–100; year: 1990–2035; number: любое число.
 */
export function normalizeAttributes(
  schema: AttributeField[],
  input: Record<string, unknown> | undefined,
): AttributesMap {
  const out: AttributesMap = {};
  if (!schema.length) return out;
  for (const field of schema) {
    const raw = input?.[field.key];
    if (raw === undefined || raw === null || raw === "") {
      if (field.required) {
        throw new AttributesValidationError(`Заполните «${field.label}»`);
      }
      continue;
    }
    if (field.type === "text") {
      if (typeof raw !== "string") {
        throw new AttributesValidationError(`«${field.label}» — текстовое значение`);
      }
      const value = raw.trim().slice(0, 120);
      if (field.required && !value) {
        throw new AttributesValidationError(`Заполните «${field.label}»`);
      }
      out[field.key] = value;
      continue;
    }
    const num = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
    if (!Number.isFinite(num)) {
      throw new AttributesValidationError(`«${field.label}» — число`);
    }
    if (field.type === "percent" && (num < 0 || num > 100)) {
      throw new AttributesValidationError(`«${field.label}» — от 0 до 100`);
    }
    if (field.type === "year" && (num < 1990 || num > 2035)) {
      throw new AttributesValidationError(`«${field.label}» — от 1990 до 2035`);
    }
    out[field.key] = field.type === "year" ? Math.round(num) : num;
  }
  return out;
}
