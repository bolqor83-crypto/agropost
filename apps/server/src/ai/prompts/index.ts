/**
 * Промпты лежат в .md — их удобно править без пересборки кода.
 * Читаем один раз и кэшируем; плейсхолдеры {{key}} заполняет renderPrompt.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export type PromptName =
  | "system"
  | "listing"
  | "reply"
  | "advice"
  | "price_analysis"
  | "logistics";

const promptsDir = path.join(path.dirname(fileURLToPath(import.meta.url)));
const cache = new Map<string, string>();

export function loadPrompt(name: PromptName): string {
  const cached = cache.get(name);
  if (cached) return cached;
  const file = path.join(promptsDir, `${name}.md`);
  const text = readFileSync(file, "utf8").trim();
  cache.set(name, text);
  return text;
}

export function renderPrompt(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    if (key in vars) {
      const value = vars[key];
      return value === null || value === undefined ? "—" : String(value);
    }
    return match;
  });
}

/** Сброс кэша в тестах, если промпты правят на лету. */
export function resetPromptCache(): void {
  cache.clear();
}
