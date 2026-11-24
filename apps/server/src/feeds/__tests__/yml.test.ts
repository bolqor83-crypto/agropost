/**
 * ЭТАП 9 — golden set YML-генератора (стандарт Яндекс.Маркета):
 * 1) семена (Люцерна «Вега 87» РС1) — все обязательные поля, атрибуты
 *    из JSONB по шаблону, фото только http(s), цена = salePrice;
 * 2) орех (Грецкий орех «Идеал») — категория ореха, калибр;
 * 3) пустой фид — валидный каталог без офферов.
 */

import { describe, expect, test } from "bun:test";
import { buildFeedData, feedOfferName, feedParams, feedPictures } from "../data.js";
import { buildYmlCatalog, escapeXml } from "../yml.js";
import { ALFALFA_ROW, FIXED_NOW, OWNER, SHOP_URL, WALNUT_ROW } from "./fixtures.js";

describe("YML: золотой набор этапа 9", () => {
  test("семена: обязательные поля, атрибуты, фото, цена", () => {
    const data = buildFeedData([ALFALFA_ROW], OWNER, SHOP_URL, FIXED_NOW.toISOString());
    const xml = buildYmlCatalog(data);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<yml_catalog date="2026-11-25T12:00">');
    expect(xml).toContain("<name>АгроПост</name>");
    expect(xml).toContain(`<company>${OWNER.name}</company>`);
    expect(xml).toContain(`<url>${SHOP_URL}</url>`);
    expect(xml).toContain('<currency id="RUB" rate="1"/>');
    expect(xml).toContain('<category id="cult-alfalfa">Люцерна</category>');

    const offer = data.offers[0];
    expect(offer.id).toBe("pos-1");
    expect(offer.name).toBe("Люцерна «Вега 87» РС1, всхожесть 92%");
    expect(offer.price).toBe(213);
    expect(offer.url).toBe("https://agropost-web.onrender.com/positions/pos-1");

    /* Категория — только одна (уникальные культуры). */
    expect((xml.match(/<category /g) ?? []).length).toBe(1);
    expect((xml.match(/<offer /g) ?? []).length).toBe(1);

    /* Поля оффера по стандарту YML. */
    expect(xml).toContain('<offer id="pos-1" available="true">');
    expect(xml).toContain("<price>213</price>");
    expect(xml).toContain("<currencyId>RUB</currencyId>");
    expect(xml).toContain("<categoryId>cult-alfalfa</categoryId>");
    expect(xml).toContain("<name>Люцерна «Вега 87» РС1, всхожесть 92%</name>");

    /* Описание — white-label из listing-text (регион, фасовка, цена). */
    expect(xml).toContain("Краснодарский край");
    expect(xml).toContain("Фасовка");

    /* Атрибуты из JSONB по шаблону культуры. */
    expect(xml).toContain('<param name="Сорт">Вега 87</param>');
    expect(xml).toContain('<param name="Репродукция">РС1</param>');
    expect(xml).toContain('<param name="Всхожесть">92%</param>');
    expect(xml).toContain('<param name="Чистота">98%</param>');

    /* Фото: только http(s)-картинки; data-URL и видео не отдаём. */
    expect((xml.match(/<picture>/g) ?? []).length).toBe(2);
    expect(xml).toContain("https://pub-fake.r2.dev/positions/pos-1/1-alfalfa.jpg");
    expect(xml).not.toContain("data:image");
    expect(xml).not.toContain("video.mp4");
  });

  test("орех: категория грецкого ореха, калибр в параметрах", () => {
    const data = buildFeedData([WALNUT_ROW], OWNER, SHOP_URL, FIXED_NOW.toISOString());
    const xml = buildYmlCatalog(data);

    expect(xml).toContain('<category id="cult-walnut">Грецкий орех</category>');
    expect(xml).toContain('<offer id="pos-2" available="true">');
    expect(xml).toContain("<price>450</price>");
    expect(xml).toContain('<param name="Сорт">Идеал</param>');
    expect(xml).toContain('<param name="Калибр">32+</param>');
    expect(xml).toContain('<param name="Влажность">8%</param>');
    expect(data.offers[0].cultureType).toBe("NUT");
  });

  test("пустой фид: валидный каталог без офферов", () => {
    const data = buildFeedData([], null, SHOP_URL, FIXED_NOW.toISOString());
    const xml = buildYmlCatalog(data);

    expect(xml).toContain("<yml_catalog");
    expect(xml).toContain("<name>АгроПост</name>");
    /* Владельца нет — витрина по умолчанию. */
    expect(xml).toContain("<company>АгроПост</company>");
    expect((xml.match(/<offer /g) ?? []).length).toBe(0);
    expect(xml).toContain("нет позиций в наличии");
    expect(data.offers.length).toBe(0);
  });

  test("две культуры → две категории, порядок первого вхождения", () => {
    const data = buildFeedData(
      [ALFALFA_ROW, WALNUT_ROW],
      OWNER,
      SHOP_URL,
      FIXED_NOW.toISOString(),
    );
    const xml = buildYmlCatalog(data);
    expect((xml.match(/<category /g) ?? []).length).toBe(2);
    expect(xml.indexOf("cult-alfalfa")).toBeLessThan(xml.indexOf("cult-walnut"));
    expect((xml.match(/<offer /g) ?? []).length).toBe(2);
  });
});

describe("YML: экранирование и сборка полей", () => {
  test("escapeXml: & < > \" ' экранируются", () => {
    expect(escapeXml('Люцерна «Вега & 87» <класс> "1" \'РС1\'')).toBe(
      "Люцерна «Вега &amp; 87» &lt;класс&gt; &quot;1&quot; &apos;РС1&apos;",
    );
  });

  test("feedOfferName: без репродукции/всхожести — просто культура+сорт", () => {
    expect(feedOfferName("Эспарцет", { sort: "Зоря" })).toBe("Эспарцет «Зоря»");
  });

  test("feedParams: пропуски пустых значений, проценты с %", () => {
    const params = feedParams(
      [
        { key: "sort", label: "Сорт", type: "text", required: true },
        { key: "grade", label: "Класс", type: "text", required: false },
        { key: "germination", label: "Всхожесть", type: "percent", required: true },
      ],
      { sort: "Вега 87", germination: 92 },
    );
    expect(params).toEqual([
      { name: "Сорт", value: "Вега 87" },
      { name: "Всхожесть", value: "92%" },
    ]);
  });

  test("feedPictures: только http(s)-фото, без data-URL и видео", () => {
    const urls = feedPictures(ALFALFA_ROW.media);
    expect(urls).toEqual([
      "https://pub-fake.r2.dev/positions/pos-1/1-alfalfa.jpg",
      "https://pub-fake.r2.dev/positions/pos-1/2-alfalfa.jpg",
    ]);
  });
});
