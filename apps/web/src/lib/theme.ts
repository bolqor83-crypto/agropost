/**
 * Тема (этап 5): светлая по умолчанию, тёмная — по переключателю
 * в «Ещё» → Настройки. Выбор живёт в localStorage, применяется
 * классом html.dark (токены — globals.css) + meta theme-color.
 */

const KEY = "agropost-theme";

export type Theme = "light" | "dark";

export function loadTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#1E1C1A" : "#FAF8F5");
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* приватный режим — просто без сохранения */
  }
  applyTheme(theme);
}
