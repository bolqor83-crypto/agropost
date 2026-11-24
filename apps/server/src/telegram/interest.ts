/**
 * Лёгкое извлечение интереса покупателя без AI (опция из ТЗ):
 * культура из справочника + класс качества, если назван.
 */

export function extractInterest(text: string, cultureNames: string[]): string | null {
  const lower = text.toLowerCase();
  const culture = cultureNames.find((name) => name.length >= 4 && lower.includes(name.toLowerCase()));
  if (!culture) return null;
  const cls = lower.match(/([123])\s*класс/);
  return cls ? `${culture} ${cls[1]} класс` : culture;
}
