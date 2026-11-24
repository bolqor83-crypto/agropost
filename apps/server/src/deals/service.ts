/**
 * Сервис сделок (этап 4): создание из лида/позиции, статусный граф,
 * калькулятор доставки (AI-план + детерминированная формула),
 * генерация документов, рекламации, справочник ТК.
 * Экономика (налог, маржа) считается только здесь — на сервере.
 */

import { positionName } from "@shared/attributes";
import {
  canDeleteDeal,
  canTransitionDeal,
  isDealTerminal,
} from "@shared/deals";
import { computeDealEconomics, deriveDealTaxMode } from "@shared/pricing";
import { SUPPLIER_LOCATION_LABEL } from "@shared/labels";
import type {
  ClaimCreateInput,
  ClaimStatus,
  ClaimUpdateInput,
  DealCreateInput,
  DealShipInput,
  DealStatus,
  DealTaxMode,
  DealUpdateInput,
  DeliveryCalculateDTO,
  DeliveryOptionDTO,
  DocumentType,
} from "@shared/types";
import { ApiError, badRequest, conflict, notFound } from "../errors.js";
import {
  assertBankRequisites,
  assertSellerRequisites,
  generateDocumentPdf,
} from "../documents/generator.js";
import { documentNumber, dealNumber } from "../documents/numbering.js";
import type { DocumentData } from "../documents/types.js";
import { getStorage } from "../storage/factory.js";
import { parseDataUrl } from "../storage/types.js";
import type { StorageMode } from "../storage/types.js";
import type {
  CarrierRow,
  ClaimRow,
  DealRow,
  DealsDb,
  DealsDeps,
  ListDealsFilter,
} from "./types.js";

/* ---------- Справочник ТК ---------- */

const DEFAULT_CARRIERS: Omit<CarrierRow, "id" | "createdAt">[] = [
  { name: "ПЭК", city: "Павловская", pickupAvailable: true, isLocal: true, notes: "Терминал в Павловской, забирает со склада поставщика" },
  { name: "СДЭК", city: "Павловская", pickupAvailable: true, isLocal: true, notes: "Локальный склад, доставка до адреса" },
  { name: "АгроТранс Кубань", city: "Павловская", pickupAvailable: false, isLocal: true, notes: "Локальная ТК для демо, самопривоз на склад" },
  { name: "КубаньАвтоЛогистика", city: "ст. Ленинградская", pickupAvailable: false, isLocal: true, notes: "Локальная ТК для демо" },
  { name: "Деловые Линии", city: "Краснодар", pickupAvailable: true, isLocal: false, notes: "Забирает со склада поставщика" },
  { name: "ГрузовичкоФ", city: "Краснодар", pickupAvailable: false, isLocal: false, notes: "Мелкие партии, самопривоз" },
];

/** Сеем справочник ТК один раз (идемпотентно, если таблица пуста). */
export async function ensureDefaultCarriers(db: DealsDb): Promise<void> {
  const count = await db.countCarriers();
  if (count > 0) return;
  for (const c of DEFAULT_CARRIERS) {
    await db.createCarrier({ ...c });
  }
}

export async function listCarriers(deps: DealsDeps): Promise<CarrierRow[]> {
  await ensureDefaultCarriers(deps.db);
  return deps.db.listCarriers();
}

export async function createCarrier(
  input: { name: string; city: string; pickupAvailable?: boolean; isLocal?: boolean; notes?: string },
  deps: DealsDeps,
): Promise<CarrierRow> {
  return deps.db.createCarrier({
    name: input.name,
    city: input.city,
    pickupAvailable: input.pickupAvailable ?? false,
    isLocal: input.isLocal ?? false,
    notes: input.notes ?? null,
  });
}

/* ---------- Список и карточка ---------- */

export function listDeals(filter: ListDealsFilter, deps: DealsDeps): Promise<DealRow[]> {
  return deps.db.listDeals(filter);
}

export interface DealBundle {
  deal: DealRow;
  documents: Awaited<ReturnType<DealsDb["listDocuments"]>>;
  claims: Awaited<ReturnType<DealsDb["listClaims"]>>;
  shipment: Awaited<ReturnType<DealsDb["findShipmentByDeal"]>>;
}

export async function getDealBundle(id: string, deps: DealsDeps): Promise<DealBundle | null> {
  const deal = await deps.db.findDeal(id);
  if (!deal) return null;
  const [documents, claims, shipment] = await Promise.all([
    deps.db.listDocuments(deal.id),
    deps.db.listClaims({ dealId: deal.id }),
    deps.db.findShipmentByDeal(deal.id),
  ]);
  return { deal, documents, claims, shipment };
}

/* ---------- Создание ---------- */

function recompute(deal: {
  volumeKg: number;
  salePrice: number;
  supplierPrice: number;
  taxMode: DealTaxMode;
  deliveryToTerminalCost?: number | null;
}): { taxAmount: number; margin: number; revenue: number } {
  const econ = computeDealEconomics({
    ...deal,
    deliveryToTerminalCost: deal.deliveryToTerminalCost ?? undefined,
  });
  return { taxAmount: econ.taxAmount, margin: econ.margin, revenue: econ.revenue };
}

/* Этап 5.1: снимок условий сделки на момент создания — история не
   теряется при изменении/удалении позиции поставщика. Поля поставщика —
   white-label: только внутри приложения, в клиентские документы не идут. */
interface DealSnapshot {
  itemName: string | null;
  itemCulture: string | null;
  itemAttributes: Record<string, string | number> | null;
  supplierName: string | null;
  supplierLocation: string | null;
  shippingMode: string | null;
}

function buildSnapshot(position: import("./types.js").PositionRow | null): DealSnapshot {
  if (!position) {
    return {
      itemName: null,
      itemCulture: null,
      itemAttributes: null,
      supplierName: null,
      supplierLocation: null,
      shippingMode: null,
    };
  }
  return {
    itemName: positionName(position.cultureName, position.attributes),
    itemCulture: position.cultureName,
    itemAttributes: position.attributes,
    supplierName: position.supplierName || null,
    supplierLocation: SUPPLIER_LOCATION_LABEL[position.supplierLocation] ?? null,
    shippingMode: position.supplierShippingMode ?? null,
  };
}

export async function createDeal(input: DealCreateInput, deps: DealsDeps): Promise<DealRow> {
  const db = deps.db;

  const lead = input.leadId ? await db.findLead(input.leadId) : null;
  if (input.leadId && !lead) throw notFound("Лид не найден");
  if (lead && lead.positionId && !input.positionId) {
    input = { ...input, positionId: lead.positionId };
  }

  const position = input.positionId ? await db.findPosition(input.positionId) : null;
  if (input.positionId && !position) throw badRequest("Позиция не найдена");

  const user = await db.findUser();
  const taxMode = input.taxMode ?? deriveDealTaxMode(user?.taxMode ?? "IP", user?.taxRate ?? 0.06);

  const salePrice = input.salePrice ?? position?.salePrice;
  const supplierPrice = input.supplierPrice ?? position?.supplierPrice;
  if (salePrice === undefined) {
    throw badRequest("Укажите цену продажи или выберите позицию с ценой");
  }
  if (supplierPrice === undefined) {
    throw badRequest("Укажите закупную цену или выберите позицию");
  }
  if (supplierPrice > salePrice) {
    throw badRequest("Закупная цена выше цены продажи — маржа будет отрицательной");
  }

  const buyerName = input.buyerName ?? lead?.name ?? undefined;
  const buyerPhone = input.buyerPhone ?? lead?.phone ?? undefined;
  const buyerRegion = input.buyerRegion ?? lead?.region ?? undefined;
  if (!buyerName || !buyerPhone || !buyerRegion) {
    throw badRequest("Укажите имя, телефон и регион покупателя");
  }

  /* Этап 5.1: доп. затраты на доставку до терминала — в себестоимости. */
  const deliveryToTerminalCost = input.deliveryToTerminalCost ?? null;
  const econ = computeDealEconomics({
    salePrice,
    supplierPrice,
    volumeKg: input.volumeKg,
    taxMode,
    deliveryToTerminalCost: deliveryToTerminalCost ?? undefined,
  });

  const snapshot = buildSnapshot(position);

  /* Номер: count+1 с повтором при коллизии (unique). */
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const count = await db.countDeals();
    const number = dealNumber(count);
    try {
      return await db.createDeal({
        number,
        leadId: lead?.id ?? null,
        positionId: position?.id ?? null,
        position,
        buyerName,
        buyerPhone,
        buyerRegion,
        buyerInn: input.buyerInn ?? null,
        volumeKg: input.volumeKg,
        salePrice,
        supplierPrice,
        taxMode,
        taxAmount: econ.taxAmount,
        margin: econ.margin,
        deliveryMethod: input.deliveryMethod ?? "PICKUP",
        deliveryCost: input.deliveryCost ?? null,
        /* Этап 5.1: снимок условий сделки (устойчив к удалению позиции). */
        ...snapshot,
        deliveryToTerminalCost,
        status: "DRAFT",
        paidAt: null,
        shippedAt: null,
        deliveredAt: null,
        closedAt: null,
        notes: input.notes ?? null,
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") continue;
      throw err;
    }
  }
  throw conflict("Не удалось присвоить номер сделки, попробуйте ещё раз");
}

/* ---------- Обновление и статусный граф ---------- */

export async function updateDeal(id: string, input: DealUpdateInput, deps: DealsDeps): Promise<DealRow> {
  const db = deps.db;
  const deal = await db.findDeal(id);
  if (!deal) throw notFound("Сделка не найдена");

  if (input.status !== undefined && input.status !== deal.status) {
    if (!canTransitionDeal(deal.status, input.status)) {
      throw conflict(`Нельзя перевести сделку из «${deal.status}» в «${input.status}»`);
    }
  }

  const volumeKg = input.volumeKg ?? deal.volumeKg;
  const salePrice = input.salePrice ?? deal.salePrice;
  const supplierPrice = input.supplierPrice ?? deal.supplierPrice;
  const taxMode = input.taxMode ?? deal.taxMode;
  const deliveryToTerminalCost =
    input.deliveryToTerminalCost !== undefined
      ? input.deliveryToTerminalCost
      : deal.deliveryToTerminalCost;
  const econ = recompute({ volumeKg, salePrice, supplierPrice, taxMode, deliveryToTerminalCost });

  /* Этап 5.1: закрытие фиксирует дату (один раз; CLOSED — терминальный
     статус, повторного открытия в графе нет — см. shared/deals.ts). */
  const closingNow = input.status === "CLOSED" && deal.status !== "CLOSED";

  const updated = await db.updateDeal(id, {
    ...(input.buyerName !== undefined ? { buyerName: input.buyerName } : {}),
    ...(input.buyerPhone !== undefined ? { buyerPhone: input.buyerPhone } : {}),
    ...(input.buyerRegion !== undefined ? { buyerRegion: input.buyerRegion } : {}),
    ...(input.buyerInn !== undefined ? { buyerInn: input.buyerInn } : {}),
    ...(input.volumeKg !== undefined ? { volumeKg: input.volumeKg } : {}),
    ...(input.salePrice !== undefined ? { salePrice: input.salePrice } : {}),
    ...(input.supplierPrice !== undefined ? { supplierPrice: input.supplierPrice } : {}),
    ...(input.taxMode !== undefined ? { taxMode: input.taxMode } : {}),
    ...(input.deliveryMethod !== undefined ? { deliveryMethod: input.deliveryMethod } : {}),
    ...(input.deliveryCost !== undefined ? { deliveryCost: input.deliveryCost } : {}),
    ...(input.deliveryToTerminalCost !== undefined
      ? { deliveryToTerminalCost: input.deliveryToTerminalCost }
      : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(closingNow ? { closedAt: new Date() } : {}),
    taxAmount: econ.taxAmount,
    margin: econ.margin,
  });
  if (!updated) throw notFound("Сделка не найдена");
  return updated;
}

export type DealAction = "awaiting-payment" | "pay" | "ship" | "deliver" | "close" | "cancel";

export async function dealAction(
  id: string,
  action: DealAction,
  deps: DealsDeps,
  ship?: DealShipInput,
): Promise<DealRow> {
  const db = deps.db;
  const deal = await db.findDeal(id);
  if (!deal) throw notFound("Сделка не найдена");

  switch (action) {
    case "awaiting-payment": {
      assertTransition(deal.status, "AWAITING_PAYMENT");
      return mustDeal(await db.updateDeal(id, { status: "AWAITING_PAYMENT" }));
    }
    case "pay": {
      assertTransition(deal.status, "PAID");
      return mustDeal(await db.updateDeal(id, { status: "PAID", paidAt: new Date() }));
    }
    case "ship": {
      assertTransition(deal.status, "SHIPPED");
      if (!ship) throw badRequest("Укажите данные отгрузки (город, стоимость доставки)");
      const method = ship.method ?? deal.deliveryMethod ?? "TK";
      let carrierName = ship.carrierName ?? null;
      if (ship.carrierId) {
        const carrier = (await listCarriers(deps)).find((c) => c.id === ship.carrierId);
        if (!carrier) throw badRequest("Транспортная компания не найдена");
        carrierName = carrier.name;
      }
      const shipment = await db.createShipment({
        dealId: deal.id,
        carrierId: ship.carrierId ?? null,
        method,
        carrierName,
        fromCity: ship.fromCity,
        toCity: ship.toCity,
        cost: ship.cost,
        days: ship.days ?? null,
        trackingNumber: ship.trackingNumber ?? null,
        status: "PICKED_UP",
      });
      void shipment;
      return mustDeal(
        await db.updateDeal(id, {
          status: "SHIPPED",
          shippedAt: new Date(),
          deliveryMethod: method,
          deliveryCost: ship.cost,
        }),
      );
    }
    case "deliver": {
      assertTransition(deal.status, "DELIVERED");
      await db.updateShipmentByDeal(id, { status: "DELIVERED" });
      return mustDeal(await db.updateDeal(id, { status: "DELIVERED", deliveredAt: new Date() }));
    }
    case "close": {
      assertTransition(deal.status, "CLOSED");
      /* Этап 5.1: дата закрытия — для аналитики выручки по периодам. */
      return mustDeal(await db.updateDeal(id, { status: "CLOSED", closedAt: new Date() }));
    }
    case "cancel": {
      if (isDealTerminal(deal.status)) {
        throw conflict("Сделка уже закрыта или отменена");
      }
      return mustDeal(await db.updateDeal(id, { status: "CANCELLED" }));
    }
  }
}

function assertTransition(from: DealStatus, to: DealStatus): void {
  if (!canTransitionDeal(from, to)) {
    throw conflict(`Нельзя перевести сделку из «${from}» в «${to}»`);
  }
}

function mustDeal(deal: DealRow | null): DealRow {
  if (!deal) throw notFound("Сделка не найдена");
  return deal;
}

export async function deleteDeal(id: string, deps: DealsDeps): Promise<void> {
  const deal = await deps.db.findDeal(id);
  if (!deal) throw notFound("Сделка не найдена");
  if (!canDeleteDeal(deal.status)) {
    throw conflict("Удалять можно только черновики и отменённые сделки");
  }
  const deleted = await deps.db.deleteDeal(id);
  if (!deleted) throw notFound("Сделка не найдена");
}

/* ---------- Калькулятор доставки ---------- */

/* Этап 5.1: фиксированные base/perKg НЕ тарифы перевозчика — оценки
   по базовой формуле (локальные ТК дешевле/быстрее). Помечаем ответ
   как предварительную оценку, чтобы не выдавалась за подтверждённую
   стоимость. Настоящие тарифы ТК — при подтверждённых заявках. */
const DELIVERY_DISCLAIMER = "Ориентировочно, не является тарифом перевозчика";

/** Детерминированная оценка: локальная ТК дешевле и быстрее. */
function estimateCarrier(carrier: CarrierRow, volumeKg: number, index: number): { cost: number; days: number } {
  const base = carrier.isLocal ? 400 : 1500;
  const perKg = carrier.isLocal ? 7 : 14;
  const raw = base + perKg * volumeKg;
  const cost = Math.round(raw / 10) * 10;
  const days = carrier.isLocal ? 1 + (index % 2) : 4 + (index % 3);
  return { cost, days };
}

export async function calculateDelivery(
  input: { positionId?: string; toCity: string; volumeKg: number },
  deps: DealsDeps,
): Promise<DeliveryCalculateDTO> {
  const db = deps.db;
  const position = input.positionId ? await db.findPosition(input.positionId) : null;
  const fromCity = position ? SUPPLIER_LOCATION_LABEL[position.supplierLocation] : "Павловская";

  const carriers = await listCarriers(deps);
  if (carriers.length === 0) {
    return {
      ok: true,
      fromCity,
      toCity: input.toCity,
      volumeKg: input.volumeKg,
      options: [],
      recommendedIndex: 0,
      meta: {
        ai: false,
        model: null,
        note: "Справочник транспортных компаний пуст",
        estimate: true,
        disclaimer: DELIVERY_DISCLAIMER,
      },
    };
  }

  const estimates = carriers.map((c, i) => {
    const est = estimateCarrier(c, input.volumeKg, i);
    return { carrier: c, cost: est.cost, days: est.days };
  });

  let ai = false;
  let model: string | null = null;
  let note = "Оценка по базовой формуле (не тариф ТК): локальные — приоритет";
  let notesByCarrier = new Map<string, string>();

  if (deps.planLogistics) {
    try {
      const plan = await deps.planLogistics({
        shipment: {
          fromRegion: "Краснодарский край",
          fromCity,
          toRegion: "—",
          toCity: input.toCity,
          weightKg: input.volumeKg,
          bagWeightKg: position?.bagWeightKg ?? 50,
          bagsCount: Math.ceil(input.volumeKg / (position?.bagWeightKg ?? 50)),
          volumeM3: Math.round((input.volumeKg * 0.0014) * 100) / 100,
        },
        availableCarriers: estimates.map((e) => ({ name: e.carrier.name, price: e.cost, days: e.days })),
      });
      if (plan.meta.status !== "fallback" && plan.data.options.length > 0) {
        ai = true;
        model = plan.meta.model ?? null;
        note = plan.data.recommendation || "Оценки уточнены AI-планом логистики";
        notesByCarrier = new Map(plan.data.options.map((o) => [o.carrier, o.note]));
      }
    } catch {
      /* AI недоступен — остаёмся на формуле */
    }
  }

  const options: DeliveryOptionDTO[] = estimates.map((e) => ({
    carrierId: e.carrier.id,
    carrier: e.carrier.name,
    cost: e.cost,
    days: e.days,
    isLocal: e.carrier.isLocal,
    pickupAvailable: e.carrier.pickupAvailable,
    note: notesByCarrier.get(e.carrier.name) ??
      (e.carrier.isLocal ? "В радиусе 50 км от Павловской" : "Из Краснодара"),
  }));

  options.sort((a, b) => Number(b.isLocal) - Number(a.isLocal) || a.cost - b.cost || a.days - b.days);

  return {
    ok: true,
    fromCity,
    toCity: input.toCity,
    volumeKg: input.volumeKg,
    options,
    recommendedIndex: 0,
    meta: {
      ai,
      model,
      note,
      estimate: true,
      disclaimer: DELIVERY_DISCLAIMER,
    },
  };
}

/* ---------- Документы ---------- */

export async function generateDealDocument(
  dealId: string,
  type: DocumentType,
  deps: DealsDeps,
): Promise<{ buffer: Buffer; number: string; generatedAt: Date; fileUrl: string }> {
  const db = deps.db;
  const bundle = await getDealBundle(dealId, deps);
  if (!bundle) throw notFound("Сделка не найдена");
  const { deal, shipment } = bundle;

  const user = await db.findUser();
  if (!user) {
    throw new ApiError(400, "REQUISITES_MISSING", "Заполните реквизиты в профиле — без них документ не сформировать");
  }
  const seller = {
    name: user.name,
    inn: user.inn,
    ogrnip: user.ogrnip,
    address: user.address,
    bank: user.bank,
    bik: user.bik,
    account: user.account,
    taxMode: deal.taxMode,
  };
  if (type === "INVOICE" || type === "UPD") {
    assertBankRequisites(seller);
  } else {
    assertSellerRequisites(seller);
  }

  const econ = computeDealEconomics({
    salePrice: deal.salePrice,
    supplierPrice: deal.supplierPrice,
    volumeKg: deal.volumeKg,
    taxMode: deal.taxMode,
    /* Этап 5.1: доп. расходы на терминал — в экономике документа. */
    deliveryToTerminalCost: deal.deliveryToTerminalCost ?? undefined,
  });

  const data: DocumentData = {
    type,
    number: "",
    generatedAt: new Date(),
    dealNumber: deal.number,
    seller,
    buyer: {
      name: deal.buyerName,
      phone: deal.buyerPhone,
      region: deal.buyerRegion,
      inn: deal.buyerInn,
    },
    goods: {
      /* Этап 5.1: снимок названия на момент сделки — работает даже
         после удаления/изменения позиции поставщика. */
      name:
        deal.itemName ??
        (deal.position ? positionName(deal.position.cultureName, deal.position.attributes) : null) ??
        "Сельскохозяйственная продукция",
      volumeKg: deal.volumeKg,
      bagWeightKg: deal.position?.bagWeightKg ?? null,
      salePrice: deal.salePrice,
      supplierPrice: deal.supplierPrice,
    },
    delivery: shipment
      ? {
          method: shipment.method,
          carrierName: shipment.carrierName,
          fromCity: shipment.fromCity,
          toCity: shipment.toCity,
          cost: shipment.cost,
          trackingNumber: shipment.trackingNumber,
        }
      : null,
    totals: {
      volumeKg: deal.volumeKg,
      revenue: econ.revenue,
      taxAmount: econ.taxAmount,
      margin: econ.margin,
    },
  };

  /* Номер документа: count по типу + повтор при коллизии. */
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const count = await db.countDocuments(type);
    data.number = documentNumber(type, count);
    const buffer = await generateDocumentPdf(data);
    /* ЭТАП 6: PDF — через единое хранилище (base64 → data-URL в БД;
    R2 настроен → файл в бакете, в БД публичный URL). */
    const storage = deps.storage ?? getStorage();
    const stored = await storage.upload(
      `documents/${deal.id}/${data.number}.pdf`,
      "application/pdf",
      buffer,
    );
    try {
      await db.createDocument({
        dealId: deal.id,
        type,
        number: data.number,
        fileUrl: stored.url,
        generatedAt: data.generatedAt,
      });
      return { buffer, number: data.number, generatedAt: data.generatedAt, fileUrl: stored.url };
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") continue;
      throw err;
    }
  }
  throw conflict("Не удалось присвоить номер документа, попробуйте ещё раз");
}

export function listDealDocuments(dealId: string, deps: DealsDeps) {
  return deps.db.listDocuments(dealId);
}

/** ЭТАП 6: файл документа — inline (base64 в БД) или remote (URL в R2). */
export type DocumentFile =
  | { kind: "inline"; buffer: Buffer; number: string; type: DocumentType }
  | { kind: "remote"; url: string; number: string; type: DocumentType };

export async function findDocumentFile(id: string, deps: DealsDeps): Promise<DocumentFile> {
  const doc = await deps.db.findDocument(id);
  if (!doc) throw notFound("Документ не найден");
  if (/^https?:\/\//.test(doc.fileUrl)) {
    /* R2: отдаём редирект на публичный URL бакета. */
    return { kind: "remote", url: doc.fileUrl, number: doc.number, type: doc.type };
  }
  const base64 = doc.fileUrl.split(",")[1] ?? "";
  return { kind: "inline", buffer: Buffer.from(base64, "base64"), number: doc.number, type: doc.type };
}

/* ---------- Рекламации ---------- */

export async function createClaim(input: ClaimCreateInput, deps: DealsDeps) {
  const deal = await deps.db.findDeal(input.dealId);
  if (!deal) throw notFound("Сделка не найдена");
  return deps.db.createClaim({ dealId: input.dealId, description: input.description });
}

export async function updateClaim(id: string, input: ClaimUpdateInput, deps: DealsDeps) {
  const claim = await deps.db.findClaim(id);
  if (!claim) throw notFound("Рекламация не найдена");

  const patch: Record<string, unknown> = {};
  if (input.forwardedToSupplier !== undefined) patch.forwardedToSupplier = input.forwardedToSupplier;
  if (input.forwardedToSupplier === true) patch.status = "FORWARDED_TO_SUPPLIER";
  if (input.status !== undefined && input.status !== claim.status) {
    patch.status = input.status;
  }
  if (input.resolution !== undefined) patch.resolution = input.resolution;

  const updated = await deps.db.updateClaim(id, patch);
  if (!updated) throw notFound("Рекламация не найдена");
  return updated;
}

export function listClaims(filter: { dealId?: string; status?: ClaimStatus }, deps: DealsDeps) {
  return deps.db.listClaims(filter);
}

/* ---------- ЭТАП 6: фото рекламаций (через единое хранилище) ---------- */

/** Лимиты фото рекламаций: типы, размер, максимальное количество. */
export const CLAIM_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const CLAIM_PHOTO_MAX_BYTES = 10 * 1024 * 1024; /* 10 МБ */
export const CLAIM_PHOTOS_MAX = 12;
const CLAIM_PHOTO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface ClaimPhotoResult {
  claim: ClaimRow;
  storage: StorageMode;
}

/** Добавить фото к рекламации: data-URL → storage.upload → url в claim.photos. */
export async function addClaimPhoto(
  id: string,
  dataUrl: string,
  deps: DealsDeps,
): Promise<ClaimPhotoResult> {
  const claim = await deps.db.findClaim(id);
  if (!claim) throw notFound("Рекламация не найдена");

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw badRequest("Ожидается фото как data-URL (base64)");
  if (!CLAIM_PHOTO_TYPES.includes(parsed.mime as (typeof CLAIM_PHOTO_TYPES)[number])) {
    throw badRequest("Фото рекламации — JPEG, PNG или WebP");
  }
  if (parsed.bytes.length === 0) throw badRequest("Пустой файл");
  if (parsed.bytes.length > CLAIM_PHOTO_MAX_BYTES) {
    throw badRequest("Фото больше 10 МБ — уменьшите перед загрузкой");
  }
  if (claim.photos.length >= CLAIM_PHOTOS_MAX) {
    throw badRequest(`Максимум ${CLAIM_PHOTOS_MAX} фото на рекламацию`);
  }

  const storage = deps.storage ?? getStorage();
  const ext = CLAIM_PHOTO_EXT[parsed.mime] ?? "jpg";
  const key = `claims/${claim.id}/${claim.photos.length + 1}-${Date.now()}.${ext}`;
  const stored = await storage.upload(key, parsed.mime, parsed.bytes);

  const updated = await deps.db.updateClaim(id, { photos: [...claim.photos, stored.url] });
  if (!updated) throw notFound("Рекламация не найдена");
  return { claim: updated, storage: storage.mode };
}

/** Убрать фото по индексу (объект в R2 удаляется best-effort). */
export async function removeClaimPhoto(
  id: string,
  index: number,
  deps: DealsDeps,
): Promise<ClaimRow> {
  const claim = await deps.db.findClaim(id);
  if (!claim) throw notFound("Рекламация не найдена");
  if (!Number.isInteger(index) || index < 0 || index >= claim.photos.length) {
    throw badRequest("Нет фото с таким номером");
  }
  const [removed] = claim.photos.splice(index, 1) as string[];
  const storage = deps.storage ?? getStorage();
  await storage.delete(removed);
  const updated = await deps.db.updateClaim(id, { photos: claim.photos });
  if (!updated) throw notFound("Рекламация не найдена");
  return updated;
}

export type { DeliveryOptionDTO };
