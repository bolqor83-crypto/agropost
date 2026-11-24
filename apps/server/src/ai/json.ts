/**
 * Достаёт JSON из ответа модели: модель может обернуть в ```json … ```,
 * добавить пояснение до/после или вернуть «None». Ищем первый `{` и
 * последний `}` — это устойчивее, чем regex по Markdown.
 */

export class AiJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiJsonError";
  }
}

export function extractJson(content: string): unknown {
  const text = content.trim();
  if (!text) throw new AiJsonError("Пустой ответ модели");

  /* Быстрый путь: чистый JSON. */
  try {
    return JSON.parse(text);
  } catch {
    /* идём дальше */
  }

  /* Убираем Markdown-обёртку ```json … ```. */
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* пробуем ниже */
    }
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      /* не JSON */
    }
  }

  throw new AiJsonError("Модель не вернула валидный JSON");
}

/** Первый способный к JSON объект из ответа — для диагностики. */
export function safeExtractJson(content: string): { ok: true; data: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, data: extractJson(content) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Не удалось разобрать JSON" };
  }
}
