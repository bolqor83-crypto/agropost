import { describe, expect, test } from "bun:test";
import { resolveBackTarget } from "../navigation";

describe("resolveBackTarget — умная кнопка «Назад»", () => {
  test("внутри приложения (ключ записи есть) — шаг назад по истории", () => {
    expect(resolveBackTarget("abc123xyz", "/more")).toBe(-1);
  });

  test("прямой вход (key = default) — запасной путь", () => {
    expect(resolveBackTarget("default", "/more")).toBe("/more");
  });

  test("без ключа (первый вход / SSR) — запасной путь", () => {
    expect(resolveBackTarget(undefined, "/settings")).toBe("/settings");
  });

  test("пустой ключ — запасной путь", () => {
    expect(resolveBackTarget("", "/")).toBe("/");
  });
});
