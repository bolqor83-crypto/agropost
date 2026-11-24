/**
 * ЭТАП 9 — XML Автозагрузки Авито (Ads formatVersion=3) + локальный
 * валидатор: обязательные теги, лимиты (Title ≤ 50, Description ≤ 7500,
 * Address ≤ 256, картинки ≤ 40), уникальность Id, предупреждения
 * (телефон, фото), dry-run без площадки.
 */

import { describe, expect, test } from "bun:test";
import { buildFeedData } from "../data.js";
import {
  AVITO_LIMITS,
  avitoAddress,
  avitoCategoryFor,
  avitoTitle,
  buildAvitoAds,
  validateAvitoAds,
} from "../avito-xml.js";
import { ALFALFA_ROW, FIXED_NOW, OWNER, SHOP_URL, WALNUT_ROW } from "./fixtures.js";

const phone = "+7 900 000-00-00";

describe("Авито XML: сборка Ads v3", () => {
  test("семена: теги Авито, телефон, категория, CDATA-описание", () => {
    const data = buildFeedData([ALFALFA_ROW], OWNER, SHOP_URL, FIXED_NOW.toISOString());
    const xml = buildAvitoAds(data, { contactPhone: phone });

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<Ads formatVersion="3" target="Avito.ru">');
    expect(xml).toContain("<Ad>");
    expect(xml).toContain("<Id>pos-1</Id>");
    expect(xml).toContain("<Address>Россия, Краснодарский край</Address>");
    expect(xml).toContain("<Category>Товары для дома и дачи</Category>");
    expect(xml).toContain(`<ContactPhone>${phone}</ContactPhone>`);
    expect(xml).toContain("<Condition>Новое</Condition>");
    expect(xml).toContain("<Price>213</Price>");

    /* Заголовок ≤ 50 символов. */
    const title = xml.match(/<Title>([^<]*)<\/Title>/)?.[1] ?? "";
    expect(title.length).toBeLessThanOrEqual(AVITO_LIMITS.title);

    /* Описание — в CDATA, white-label. */
    expect(xml).toContain("<Description><![CDATA[");
    expect(xml).toContain("Краснодарский край");

    /* Картинки: только фото-URL (2 из 4 медиа). */
    expect((xml.match(/<Image url="/g) ?? []).length).toBe(2);
  });

  test("орех: категория «Продукты питания»", () => {
    const data = buildFeedData([WALNUT_ROW], OWNER, SHOP_URL, FIXED_NOW.toISOString());
    const xml = buildAvitoAds(data, { contactPhone: null });
    expect(xml).toContain("<Category>Продукты питания</Category>");
    /* Телефон не задан — тега нет. */
    expect(xml).not.toContain("<ContactPhone>");
  });

  test("пустой фид: Ads без Ad-элементов (Авито снимет объявления)", () => {
    const data = buildFeedData([], null, SHOP_URL, FIXED_NOW.toISOString());
    const xml = buildAvitoAds(data, { contactPhone: null });
    expect(xml).toContain('<Ads formatVersion="3" target="Avito.ru">');
    expect(xml).not.toContain("<Ad>");
    expect(xml).toContain("нет позиций в наличии");
  });

  test("категория по типу культуры + свой маппинг", () => {
    const alfalfa = buildFeedData([ALFALFA_ROW], null, SHOP_URL, FIXED_NOW.toISOString());
    expect(avitoCategoryFor(alfalfa.offers[0], { seed: "Семена", nut: "Орехи" })).toBe("Семена");
    const walnut = buildFeedData([WALNUT_ROW], null, SHOP_URL, FIXED_NOW.toISOString());
    expect(avitoCategoryFor(walnut.offers[0], { seed: "Семена", nut: "Орехи" })).toBe("Орехи");
  });
});

describe("Авито XML: лимиты и адрес", () => {
  test("avitoTitle: длинное имя обрезается по слову ≤ 50", () => {
    const long = "Люцерна «Супер-длинное имя сорта, которое не влезает в заголовок Авито» РС1";
    const cut = avitoTitle(long);
    expect(cut.length).toBeLessThanOrEqual(AVITO_LIMITS.title);
    expect(cut.endsWith(" ")).toBe(false);
  });

  test("avitoTitle: короткое имя не трогается", () => {
    expect(avitoTitle("Люцерна «Вега 87» РС1")).toBe("Люцерна «Вега 87» РС1");
  });

  test("avitoAddress: регион + «Россия»; неизвестный — просто Россия", () => {
    expect(avitoAddress("Краснодарский край")).toBe("Россия, Краснодарский край");
    expect(avitoAddress("регион уточняйте")).toBe("Россия");
    expect(avitoAddress("")).toBe("Россия");
  });
});

describe("Авито XML: локальный валидатор (dry-run)", () => {
  test("валидный фид: valid, ошибки пусты; предупреждения про телефон/фото", () => {
    const data = buildFeedData([ALFALFA_ROW], OWNER, SHOP_URL, FIXED_NOW.toISOString());
    const xml = buildAvitoAds(data, { contactPhone: phone });
    const result = validateAvitoAds(xml, {
      expectedOffers: data.offers.length,
      contactPhone: phone,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);

    /* Без телефона — предупреждение (одна уникальная строка, не по Ad). */
    const noPhoneXml = buildAvitoAds(data, { contactPhone: null });
    const noPhone = validateAvitoAds(noPhoneXml, {
      expectedOffers: data.offers.length,
      contactPhone: null,
    });
    expect(noPhone.valid).toBe(true);
    expect(noPhone.warnings.join(" ")).toContain("телефон продавца не задан");
    /* Дублей предупреждений нет (было по одному на каждый Ad). */
    expect(noPhone.warnings.filter((w) => w.includes("телефон продавца не задан")).length).toBe(1);
  });

  test("сломанный XML: ошибки формата блокируют отправку", () => {
    const broken = buildAvitoAds(buildFeedData([ALFALFA_ROW], null, SHOP_URL, FIXED_NOW.toISOString()), {
      contactPhone: null,
    })
      .replace(/<Title>.*?<\/Title>/s, "") /* нет Title */
      .replace("<Price>213</Price>", "<Price>дорого</Price>"); /* Price не число */

    const result = validateAvitoAds(broken, { expectedOffers: 1, contactPhone: null });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("нет тега Title");
    expect(result.errors.join(" ")).toContain("Price не число");
  });

  test("несовпадение числа Ad и дубли Id — ошибки", () => {
    const data = buildFeedData([ALFALFA_ROW], null, SHOP_URL, FIXED_NOW.toISOString());
    let xml = buildAvitoAds(data, { contactPhone: null });
    /* Дублируем Ad — теперь 2 элемента вместо 1 и Id повторяется. */
    const ad = xml.match(/<Ad>[\s\S]*?<\/Ad>/)?.[0] ?? "";
    xml = xml.replace("<Ads formatVersion=\"3\" target=\"Avito.ru\">", `<Ads formatVersion="3" target="Avito.ru">${ad}`);
    const result = validateAvitoAds(xml, { expectedOffers: 1, contactPhone: null });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("Ad-элементов 2, ожидалось 1");
    expect(result.errors.join(" ")).toContain("дублирующийся Id");
  });

  test("пустой фид: valid, предупреждение «нет позиций»", () => {
    const data = buildFeedData([], null, SHOP_URL, FIXED_NOW.toISOString());
    const xml = buildAvitoAds(data, { contactPhone: null });
    const result = validateAvitoAds(xml, { expectedOffers: 0, contactPhone: null });
    expect(result.valid).toBe(true);
    expect(result.warnings).toContain("в фиде нет позиций в наличии");
  });
});
