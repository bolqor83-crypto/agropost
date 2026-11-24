/**
 * CSV-экспорт (этап 5.1): защита от Formula Injection (CSV/Excel injection).
 *
 * Значение, начинающееся (после пробелов/управляющих символов) с
 * = + - @ табуляции или перевода строки, исполнилось бы таблицей как
 * формула (=HYPERLINK, =cmd|..., @SUM...). Такие значения экспортируются
 * как текст: опасный первый символ нейтрализуется префиксом «'».
 *
 * Обычное экранирование сохранено: кавычки удваиваются, значения с
 * разделителем («;»), кавычками или переносами строк — в кавычках.
 */

/** Опасное начало ячейки для табличек (CSV/Excel formula injection). */
const FORMULA_PREFIX = /^[=+\-@\t\r\n]/;

/** Первый значащий символ после пробелов и управляющих. */
function firstSignificantChar(value: string): string {
  for (const ch of value) {
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") continue;
    return ch;
  }
  return "";
}

/** Значение как безопасная CSV-ячейка (разделитель «;»). */
export function csvEscape(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? "" : String(value);
  if (raw === "") return "";

  /* Formula injection: опасное начало — префикс-апостроф + экранирование. */
  let safe = raw;
  if (FORMULA_PREFIX.test(firstSignificantChar(raw))) {
    safe = `'${raw}`;
  }

  /* Стандартное экранирование: кавычки/разделитель/переносы → в кавычках. */
  if (/[",;\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

/** Таблица в CSV: заголовок + строки, разделитель «;», BOM для Excel. */
export function toCsv(
  header: string[],
  rows: (string | number | null | undefined)[][],
): string {
  const lines = [header, ...rows].map((cells) => cells.map(csvEscape).join(";"));
  return `\uFEFF${lines.join("\n")}`;
}

/** Скачивание CSV-файла в браузере. */
export function downloadCsv(name: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
