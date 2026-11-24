/**
 * Работа с гибкими атрибутами позиций (плоский JSONB).
 *
 * Решение этапа 1: значение хранится как {key: value}, а подписи,
 * порядок, типы и единицы живут в attributesSchema шаблона культуры.
 * Смена шаблона не ломает старые позиции: у позиций просто нет
 * значения для нового ключа (UI покажет «—»).
 *
 * Патч 4.1: у каждого атрибута может быть displayType (FIXED / RANGE /
 * MIN / TEXT) — формат значения. validateAttributes проверяет соответствие
 * значения формату (например, RANGE — «45–50» или «32+»), а AI-слой
 * использует это как жёсткий контракт «только переданные числа».
 */

import type {
  AttributeDisplayType,
  AttributeField,
  AttributesMap,
  AttributeValue,
} from "./types";

/** displayType по умолчанию для полей, где он не задан явно. */
export function attributeDisplayType(field: AttributeField): AttributeDisplayType {
  if (field.displayType) return field.displayType;
  return field.type === "text" ? "TEXT" : "FIXED";
}

/** Разбирает диапазон/минимум: «45–50», «45 - 50», «32+», «45», «не менее 45». */
export interface ParsedRange {
  /** Нижняя граница. */
  min: number;
  /** Верхняя граница (null для «32+», «45», «не менее 45»). */
  max: number | null;
  /** Исходная запись была «N+» — сохраняем плюс при канонизации. */
  plus: boolean;
}

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const RANGE_RE = new RegExp(
  String.raw`^\s*(${NUM})\s*(?:[–—-]|…|\.\.)\s*(${NUM})\s*%?\s*$`,
);
const MIN_BOUND_RE = new RegExp(String.raw`^\s*(${NUM})\s*\+\s*%?\s*$`);
const PLAIN_NUM_RE = new RegExp(String.raw`^\s*(${NUM})\s*%?\s*$`);
const NOT_LESS_RE = new RegExp(String.raw`^\s*(?:не\s+менее|не\s+меньше|от|≥)\s*(${NUM})\s*%?\s*$`);

export function parseRangeValue(raw: string): ParsedRange | null {
  const text = raw.trim();
  const range = text.match(RANGE_RE);
  if (range) {
    const min = Number(range[1].replace(",", "."));
    const max = Number(range[2].replace(",", "."));
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min, max, plus: false };
  }
  const bound = text.match(MIN_BOUND_RE) ?? text.match(NOT_LESS_RE) ?? text.match(PLAIN_NUM_RE);
  if (!bound) return null;
  const value = Number(bound[1].replace(",", "."));
  if (!Number.isFinite(value)) return null;
  return { min: value, max: null, plus: MIN_BOUND_RE.test(text) };
}

/** Канонический вид для хранения: «45–50», «32+», «45». */
export function canonicalRangeValue(parsed: ParsedRange): string {
  if (parsed.max !== null) return `${round2(parsed.min)}–${round2(parsed.max)}`;
  return parsed.plus ? `${round2(parsed.min)}+` : round2(parsed.min);
}

function round2(n: number): string {
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

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

/* ---------- Патч 4.1: проверка значения по displayType ---------- */

function inBounds(field: AttributeField, n: number): string | null {
  if (field.type === "percent" && (n < 0 || n > 100)) {
    return `«${field.label}» — от 0 до 100`;
  }
  if (field.type === "year" && (n < 1990 || n > 2035)) {
    return `«${field.label}» — от 1990 до 2035`;
  }
  return null;
}

/**
 * Проверяет, что значение атрибута соответствует displayType поля:
 * - FIXED (числовой тип) — одно число в границах типа;
 * - FIXED (text) — непустая строка;
 * - RANGE — «45–50», «32+» или одно число (в границах, min ≤ max);
 * - MIN — «45», «45+», «не менее 45» — минимум (не диапазон);
 * - TEXT — любая строка.
 *
 * Текстовое поле тоже может нести числовой контракт: калибр «32+» —
 * это type: "text" + displayType: "RANGE".
 *
 * Возвращает список нарушений (пустой = всё хорошо). Не кидает исключений —
 * удобно для UI и тестов; normalizeAttributes кидает первое же как ошибку.
 */
export function validateAttributes(
  schema: AttributeField[],
  values: AttributesMap,
): string[] {
  const issues: string[] = [];
  if (!schema.length) return issues;
  for (const field of schema) {
    const raw = values[field.key];
    if (raw === undefined || raw === null || raw === "") continue;
    const display = attributeDisplayType(field);

    /* Числовой контракт: FIXED/RANGE/MIN у числового поля (percent/number/year).
     * FIXED у текстового поля — «точная строка» (сорт «Идеал»), проверяем как текст. */
    if (field.type !== "text" && display !== "TEXT") {
      if (typeof raw !== "number" && typeof raw !== "string") {
        issues.push(`«${field.label}» — число или диапазон`);
        continue;
      }
      const text = String(raw).trim();

      if (display === "FIXED") {
        const num = Number(text.replace(",", "."));
        if (!Number.isFinite(num)) {
          issues.push(`«${field.label}» — одно число (${text} не подходит)`);
          continue;
        }
        const bound = inBounds(field, num);
        if (bound) issues.push(bound);
        continue;
      }

      const parsed = parseRangeValue(text);
      if (!parsed) {
        issues.push(
          display === "RANGE"
            ? `«${field.label}» — диапазон вида «45–50» или «32+» (${text} не подходит)`
            : `«${field.label}» — минимальное значение вида «45» или «не менее 45» (${text} не подходит)`,
        );
        continue;
      }
      if (display === "MIN" && parsed.max !== null) {
        issues.push(`«${field.label}» — минимум, не диапазон (${text})`);
        continue;
      }
      if (display === "RANGE" && parsed.max !== null && parsed.min > parsed.max) {
        issues.push(`«${field.label}» — начало диапазона больше конца (${text})`);
        continue;
      }
      for (const n of [parsed.min, parsed.max]) {
        if (n === null) continue;
        const bound = inBounds(field, n);
        if (bound) issues.push(bound);
      }
      continue;
    }

    /* TEXT (или text-поле без контракта): любая строка. */
    if (typeof raw !== "string" || !raw.trim()) {
      issues.push(`«${field.label}» — текстовое значение`);
    }
  }
  return issues;
}

/**
 * Валидация и нормализация атрибутов по шаблону культуры.
 * Используется и сервером, и мок-API превью — правила одни.
 *
 * - ключи вне шаблона отбрасываются;
 * - обязательные поля должны быть заполнены;
 * - percent: 0–100; year: 1990–2035; number: любое число;
 * - RANGE/MIN: диапазон «45–50» / «32+» / «не менее 45» канонизируется
 *   в «45–50» / «45» (патч 4.1).
 */
export function normalizeAttributes(
  schema: AttributeField[],
  input: Record<string, unknown> | undefined,
): AttributesMap {
  const out: AttributesMap = {};
  if (!schema.length) return out;
  const issues = validateAttributes(schema, (input ?? {}) as AttributesMap);
  if (issues.length > 0) {
    throw new AttributesValidationError(issues[0]);
  }
  for (const field of schema) {
    const raw = input?.[field.key];
    if (raw === undefined || raw === null || raw === "") {
      if (field.required) {
        throw new AttributesValidationError(`Заполните «${field.label}»`);
      }
      continue;
    }
    const display = attributeDisplayType(field);

    /* RANGE/MIN — числовой контракт независимо от type поля
     * (калибр: type "text" + displayType "RANGE" → «32+»). */
    if (display === "RANGE" || display === "MIN") {
      const parsed = parseRangeValue(String(raw).trim());
      if (!parsed) {
        throw new AttributesValidationError(
          `«${field.label}» — ${
            display === "RANGE" ? "диапазон вида «45–50» или «32+»" : "минимум вида «45»"
          }`,
        );
      }
      out[field.key] = canonicalRangeValue(parsed);
      continue;
    }

    if (field.type === "text" || display === "TEXT") {
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

    const num = typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));
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
