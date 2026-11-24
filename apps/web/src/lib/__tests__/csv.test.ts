/**
 * Тесты CSV (этап 5.1): formula injection + обычное экранирование.
 * Запуск из корня репозитория: bun test apps/web/src/lib/__tests__/csv.test.ts
 */

import { describe, expect, test } from "bun:test";
import { csvEscape, toCsv } from "../csv.js";

describe("csvEscape: formula injection (этап 5.1)", () => {
  test("опасные начала нейтрализуются апострофом", () => {
    /* Содержит кавычки → дополнительно оборачивается в кавычки (двойные). */
    expect(csvEscape('=HYPERLINK("http://evil","x")')).toBe(
      `"'=HYPERLINK(""http://evil"",""x"")"`,
    );
    expect(csvEscape("+SUM(1+1)")).toBe("'+SUM(1+1)");
    expect(csvEscape("-2+3+cmd|' /C calc'!A0")).toBe("'-2+3+cmd|' /C calc'!A0");
    expect(csvEscape("@cmd")).toBe("'@cmd");
  });

  test("пробелы/табуляция/переводы перед опасным символом не спасают", () => {
    expect(csvEscape("  =1+1")).toBe("'  =1+1");
    expect(csvEscape("\t=cmd")).toBe("'\t=cmd");
    /* Перенос строки → ещё и в кавычках (стандартное экранирование). */
    expect(csvEscape("\r\n=cmd")).toBe(`"'\r\n=cmd"`);
    expect(csvEscape("\n+SUM(A1:A2)")).toBe(`"'\n+SUM(A1:A2)"`);
  });

  test("безопасные значения не префиксуются", () => {
    expect(csvEscape("Люцерна Вега 87")).toBe("Люцерна Вега 87");
    expect(csvEscape("180")).toBe("180");
  });

  test("отрицательные числа — тоже потенциальные формулы: префикс", () => {
    /* Excel интерпретирует -123 как формулу; безопасный текст важнее. */
    expect(csvEscape(-123)).toBe("'-123");
  });

  test("текст с дефисом внутри — не формула, без префикса", () => {
    expect(csvEscape("Павловская-Краснодар")).toBe("Павловская-Краснодар");
    expect(csvEscape("8–10% влажности")).toBe("8–10% влажности");
  });

  test("пустое/null — пустая ячейка", () => {
    expect(csvEscape("")).toBe("");
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });
});

describe("csvEscape: стандартное экранирование сохранено", () => {
  test("кавычки удваиваются, значение в кавычках", () => {
    expect(csvEscape('Товар "Люцерна"')).toBe('"Товар ""Люцерна"""');
  });

  test("разделитель «;» — значение в кавычках", () => {
    expect(csvEscape("a;b")).toBe('"a;b"');
  });

  test("запятая — текст в кавычках (экранирование добросовестное)", () => {
    expect(csvEscape("1,5 т")).toBe('"1,5 т"');
  });

  test("перенос строки — в кавычках", () => {
    expect(csvEscape("строка1\nстрока2")).toBe('"строка1\nстрока2"');
  });

  test("Unicode без искажений", () => {
    expect(csvEscape("₽/кг №5 «Люцерна» — отборное")).toBe("₽/кг №5 «Люцерна» — отборное");
  });
});

describe("toCsv", () => {
  test("BOM + разделитель «;» + переносы", () => {
    const csv = toCsv(["Канал", "Лидов"], [["AgroMarket", 12]]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Канал;Лидов");
    expect(csv).toContain("AgroMarket;12");
  });

  test("злые значения полей (название поставщика/товара) не ломают таблицу", () => {
    const csv = toCsv(
      ["Позиция", "Поставщик"],
      [["=SUM(A1:A2)", "@ivan"], ["+36", "-=cmd"]],
    );
    const lines = csv.replace(/^\uFEFF/, "").split("\n");
    expect(lines.length).toBe(3);
    for (const line of lines.slice(1)) {
      expect(line.startsWith("=")).toBe(false);
      expect(line.startsWith("@")).toBe(false);
      expect(line.startsWith("+")).toBe(false);
    }
    /* Значения всё ещё читаемы человеком. */
    expect(csv).toContain("'=SUM(A1:A2)");
    expect(csv).toContain("'@ivan");
  });
});
