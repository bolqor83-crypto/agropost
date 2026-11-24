/**
 * Интеграционные тесты сервиса сделок (часть F ТЗ, этап 4) на памяти:
 * 1) полный жизненный цикл: заявка → оплата → отгрузка → доставка → закрытие;
 * 2) рекламация + переадресация поставщику;
 * 3) калькулятор: локальные ТК приоритетнее; AI-план логистики подключается;
 * 4) нумерация документов из БД: СЧ-001 → СЧ-002;
 * 5) сделка без реквизитов профиля → 400 при генерации.
 */

import { describe, expect, test } from "bun:test";
import type { AiLogisticsData } from "@shared/ai";
import { ApiError } from "../../errors.js";
import { seededDb } from "./fixtures.js";
import {
  calculateDelivery,
  createClaim,
  createDeal,
  dealAction,
  deleteDeal,
  ensureDefaultCarriers,
  generateDealDocument,
  updateClaim,
  updateDeal,
} from "../service.js";
import { DocumentsError } from "../../documents/types.js";
import type { DealsDeps } from "../types.js";

function deps(db = seededDb()): DealsDeps {
  return { db };
}

describe("создание сделки", () => {
  test("из лида: покупатель и позиция подставляются, экономика на сервере", async () => {
    const d = deps();
    const deal = await createDeal({ leadId: "lead-1", volumeKg: 1000 }, d);
    expect(deal.number).toBe("СД-0001");
    expect(deal.buyerName).toBe("Пётр Смирнов");
    expect(deal.buyerRegion).toBe("Ростовская область");
    expect(deal.positionId).toBe("pos-1");
    expect(deal.supplierPrice).toBe(80); /* из позиции на момент сделки */
    expect(deal.salePrice).toBe(100);
    expect(deal.taxMode).toBe("IP_6"); /* из User.taxMode (ИП, 6%) */
    expect(deal.taxAmount).toBe(6000);
    expect(deal.margin).toBe(14000);
    expect(deal.status).toBe("DRAFT");
  });

  test("вручную без позиции и цен — 400", async () => {
    const d = deps();
    await expect(
      createDeal(
        { buyerName: "Иван", buyerPhone: "+7 900 111-22-33", buyerRegion: "Краснодар", volumeKg: 100 },
        d,
      ),
    ).rejects.toThrow(ApiError);
  });

  test("закуп выше продажи — 400 (маржа отрицательная)", async () => {
    const d = deps();
    await expect(
      createDeal({ positionId: "pos-1", volumeKg: 100, salePrice: 50, supplierPrice: 80 }, d),
    ).rejects.toThrow(ApiError);
  });

  test("из позиции: цены берутся из позиции, номер инкрементируется", async () => {
    const d = deps();
    const first = await createDeal(
      { positionId: "pos-1", volumeKg: 100, buyerName: "Ольга Ким", buyerPhone: "+7 900 555-66-77", buyerRegion: "Краснодар" },
      d,
    );
    const second = await createDeal(
      {
        positionId: "pos-1",
        volumeKg: 200,
        buyerName: "Иван",
        buyerPhone: "+7 900 111-22-33",
        buyerRegion: "Краснодар",
      },
      d,
    );
    expect(first.number).toBe("СД-0001");
    expect(second.number).toBe("СД-0002");
    expect(second.margin).toBe(2800); /* (100−80)×200 − 1200 налога */
  });
});

describe("жизненный цикл сделки", () => {
  test("заявка → к оплате → оплачено → отгружено → доставлено → закрыто", async () => {
    const d = deps();
    const deal = await createDeal({ leadId: "lead-1", volumeKg: 1000 }, d);

    await dealAction(deal.id, "awaiting-payment", d);
    let row = (await d.db.findDeal(deal.id))!;
    expect(row.status).toBe("AWAITING_PAYMENT");

    await dealAction(deal.id, "pay", d);
    row = (await d.db.findDeal(deal.id))!;
    expect(row.status).toBe("PAID");
    expect(row.paidAt).toBeInstanceOf(Date);

    const shipped = await dealAction(
      deal.id,
      "ship",
      d,
      {
        method: "TK",
        fromCity: "Павловская",
        toCity: "Ростов-на-Дону",
        cost: 8000,
        carrierId: (await ensureDefaultCarriers(d.db), (await d.db.listCarriers()).find((c) => c.name === "ПЭК")!.id),
        days: 2,
        trackingNumber: "PEK-000111",
      },
    );
    expect(shipped.status).toBe("SHIPPED");
    expect(shipped.deliveryCost).toBe(8000);
    const shipment = await d.db.findShipmentByDeal(deal.id);
    expect(shipment).not.toBeNull();
    expect(shipment!.status).toBe("PICKED_UP");
    expect(shipment!.trackingNumber).toBe("PEK-000111");
    expect(shipment!.carrierName).toBe("ПЭК");

    await dealAction(deal.id, "deliver", d);
    expect((await d.db.findShipmentByDeal(deal.id))!.status).toBe("DELIVERED");

    const closed = await dealAction(deal.id, "close", d);
    expect(closed.status).toBe("CLOSED");
  });

  test("повторная оплата и переходы назад — 409 CONFLICT", async () => {
    const d = deps();
    const deal = await createDeal({ leadId: "lead-1", volumeKg: 100 }, d);
    await dealAction(deal.id, "awaiting-payment", d);
    await dealAction(deal.id, "pay", d);
    await expect(dealAction(deal.id, "pay", d)).rejects.toThrow(ApiError);
    await expect(
      updateDeal(deal.id, { status: "DRAFT" }, d),
    ).rejects.toThrow(ApiError);
  });

  test("отмена возможна до отгрузки; удаление — только черновика/отменённой", async () => {
    const d = deps();
    const deal = await createDeal({ leadId: "lead-1", volumeKg: 100 }, d);
    await dealAction(deal.id, "cancel", d);
    await deleteDeal(deal.id, d);
    expect(await d.db.findDeal(deal.id)).toBeNull();

    const paid = await createDeal({ leadId: "lead-1", volumeKg: 100 }, d);
    await dealAction(paid.id, "awaiting-payment", d);
    await dealAction(paid.id, "pay", d);
    await expect(deleteDeal(paid.id, d)).rejects.toThrow(ApiError);
  });

  test("обновление цен пересчитывает маржу на сервере", async () => {
    const d = deps();
    const deal = await createDeal({ leadId: "lead-1", volumeKg: 1000 }, d);
    const updated = await updateDeal(deal.id, { salePrice: 110 }, d);
    expect(updated.salePrice).toBe(110);
    expect(updated.taxAmount).toBe(6600);
    expect(updated.margin).toBe(23400); /* (110−80)×1000 − 6600 налога */
  });
});

describe("рекламации", () => {
  test("создание и переадресация поставщику", async () => {
    const d = deps();
    const deal = await createDeal({ leadId: "lead-1", volumeKg: 100 }, d);

    const claim = await createClaim(
      { dealId: deal.id, description: "Пришло 3 мешка с плесенью" },
      d,
    );
    expect(claim.status).toBe("NEW");
    expect(claim.forwardedToSupplier).toBe(false);

    const forwarded = await updateClaim(
      claim.id,
      { forwardedToSupplier: true, resolution: "Поставщик подтвердил замену 3 мешков" },
      d,
    );
    expect(forwarded.status).toBe("FORWARDED_TO_SUPPLIER");
    expect(forwarded.forwardedToSupplier).toBe(true);
    expect(forwarded.resolution).toContain("замену");
  });
});

describe("калькулятор доставки", () => {
  test("локальные ТК приоритетнее дальних; рекомендуемый вариант — локальный", async () => {
    const d = deps();
    await ensureDefaultCarriers(d.db);
    const res = await calculateDelivery({ positionId: "pos-1", toCity: "Москва", volumeKg: 5000 }, d);
    expect(res.ok).toBe(true);
    expect(res.fromCity).toBe("Павловская");
    expect(res.options.length).toBeGreaterThanOrEqual(4);
    expect(res.options[0].isLocal).toBe(true);
    /* сортировка: сначала локальные, внутри — по цене */
    const localCount = res.options.filter((o) => o.isLocal).length;
    for (let i = 0; i < localCount; i += 1) {
      expect(res.options[i].isLocal).toBe(true);
    }
    expect(res.options[localCount].isLocal).toBe(false);
    expect(res.recommendedIndex).toBe(0);
    expect(res.meta.ai).toBe(false); /* AI не подключали — формула */
  });

  test("AI-план логистики: пометки и рекомендация от AI, цены детерминированы", async () => {
    const db = seededDb();
    await ensureDefaultCarriers(db);
    const aiData: AiLogisticsData = {
      options: [
        { carrier: "ПЭК", price: 1, days: 1, note: "Лучший вариант: забирает со склада в Павловской" },
      ],
      recommendation: "Рекомендую ПЭК: заберёт со склада поставщика в тот же день",
    };
    const d: DealsDeps = {
      db,
      planLogistics: async () => ({
        data: aiData,
        warnings: [],
        meta: { status: "ok", provider: "glm", model: "glm-5.3-flash", latencyMs: 800 },
      }),
    };
    const res = await calculateDelivery({ positionId: "pos-1", toCity: "Москва", volumeKg: 5000 }, d);
    expect(res.meta.ai).toBe(true);
    expect(res.meta.model).toBe("glm-5.3-flash");
    expect(res.meta.note).toContain("ПЭК");
    const pek = res.options.find((o) => o.carrier === "ПЭК");
    expect(pek!.note).toContain("забирает со склада");
  });
});

describe("документы сделки", () => {
  test("нумерация из БД: СЧ-001 → СЧ-002; договор — Д-001", async () => {
    const d = deps();
    const deal = await createDeal({ leadId: "lead-1", volumeKg: 1000 }, d);

    const first = await generateDealDocument(deal.id, "INVOICE", d);
    const second = await generateDealDocument(deal.id, "INVOICE", d);
    const contract = await generateDealDocument(deal.id, "CONTRACT", d);

    expect(first.number).toBe("СЧ-001");
    expect(second.number).toBe("СЧ-002");
    expect(contract.number).toBe("Д-001");

    const docs = await d.db.listDocuments(deal.id);
    expect(docs.length).toBe(3);
    expect(docs[0].fileUrl.startsWith("data:application/pdf;base64,")).toBe(true);
    const bytes = Buffer.from(docs[0].fileUrl.split(",")[1], "base64");
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("без реквизитов профиля — ошибка реквизитов (роут отдаст 400)", async () => {
    const d = deps();
    d.db.user = {
      id: "user-2",
      name: "Иванов",
      inn: null,
      ogrnip: null,
      address: null,
      bank: null,
      bik: null,
      account: null,
      taxMode: "IP",
      taxRate: 0.06,
    };
    const deal = await createDeal({ leadId: "lead-1", volumeKg: 100 }, d);
    await expect(generateDealDocument(deal.id, "INVOICE", d)).rejects.toThrow(DocumentsError);
  });
});

/* ---------- Этап 5.1: снимок условий, closedAt, доп. расходы ---------- */

describe("снимок условий сделки (этап 5.1)", () => {
  test("создание фиксирует товар, поставщика и условия позиции", async () => {
    const d = deps();
    const deal = await createDeal({ leadId: "lead-1", volumeKg: 1000 }, d);
    expect(deal.itemName).toBe("Люцерна «Вега 87»");
    expect(deal.itemCulture).toBe("Люцерна");
    expect(deal.itemAttributes).toEqual({ sort: "Вега 87", germination: 92 });
    expect(deal.supplierName).toBe("Агро-Юг");
    expect(deal.supplierLocation).toBe("Павловская");
    expect(deal.shippingMode).toBe("SELF_LOADS");
    expect(deal.closedAt).toBeNull();
  });

  test("история survives: удаление позиции не теряет название товара", async () => {
    const d = deps();
    const deal = await createDeal({ leadId: "lead-1", volumeKg: 1000 }, d);
    d.db.positions.length = 0; /* позиция удалена */
    /* Prisma перечитывает relation: позиции больше нет — row.position null. */
    const stored = d.db.deals.find((x) => x.id === deal.id)!;
    stored.position = null;
    const row = await d.db.findDeal(deal.id);
    expect(row?.itemName).toBe("Люцерна «Вега 87»");
    expect(row?.position).toBeNull();
    /* Позиции нет — а название товара в сделке живёт в снимке. */
  });

  test("доп. затраты на доставку до терминала вычитаются из маржи", async () => {
    const d = deps();
    const deal = await createDeal(
      { leadId: "lead-1", volumeKg: 1000, deliveryToTerminalCost: 3000 },
      d,
    );
    /* (100 − 80) × 1000 − 6000 налога − 3000 терминала = 11000. */
    expect(deal.taxAmount).toBe(6000);
    expect(deal.margin).toBe(11000);
    expect(deal.deliveryToTerminalCost).toBe(3000);
  });

  test("close фиксирует closedAt; повторный PATCH CLOSED дату не перезаписывает", async () => {
    const d = deps();
    const deal = await createDeal({ leadId: "lead-1", volumeKg: 100 }, d);
    await dealAction(deal.id, "pay", d);
    await dealAction(deal.id, "ship", d, { method: "PICKUP", fromCity: "ст. Павловская", toCity: "Краснодар", cost: 0 });
    await dealAction(deal.id, "deliver", d);
    await dealAction(deal.id, "close", d);
    const closed = await d.db.findDeal(deal.id);
    expect(closed?.status).toBe("CLOSED");
    expect(closed?.closedAt).toBeInstanceOf(Date);
    const first = closed!.closedAt!.getTime();

    /* Повторный PATCH со статусом CLOSED: same-status — не переход,
       closedAt не перезаписывается (документированное поведение). */
    await updateDeal(deal.id, { status: "CLOSED" }, d);
    const after = await d.db.findDeal(deal.id);
    expect(after!.closedAt!.getTime()).toBe(first);

    /* Переход CLOSED → DRAFT запрещён графом — «повторного открытия» нет. */
    await expect(updateDeal(deal.id, { status: "DRAFT" }, d)).rejects.toThrow(ApiError);
  });
});

describe("калькулятор: честная подпись оценки (этап 5.1)", () => {
  test("мета помечена как оценка, не тариф перевозчика", async () => {
    const d = deps();
    const res = await calculateDelivery({ toCity: "Краснодар", volumeKg: 1000 }, d);
    expect(res.meta.estimate).toBe(true);
    expect(res.meta.disclaimer).toBe("Ориентировочно, не является тарифом перевозчика");
    expect(res.options.length).toBeGreaterThan(0);
  });
});
