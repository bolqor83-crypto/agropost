/**
 * Памятка фейковой БД для тестов сервиса сделок (как MemoryDb в 3.2):
 * плоские массивы, идемпотентный сид ТК и профиля продавца.
 */

import type {
  CarrierRow,
  ClaimRow,
  DealRow,
  DealsDb,
  DocumentRow,
  LeadRow,
  PositionRow,
  SellerRow,
  ShipmentRow,
} from "../types.js";
import type { ListDealsFilter } from "../types.js";

export function sellerFixture(): SellerRow {
  return {
    id: "user-1",
    name: "Иванов Иван Иванович (ИП)",
    inn: "231234567890",
    ogrnip: "314231234500012",
    address: "Краснодарский край, ст. Павловская, ул. Мира 1",
    bank: "АО «Тинькофф Банк»",
    bik: "046015208",
    account: "40802810123456789012",
    taxMode: "IP",
    taxRate: 0.06,
  };
}

export function positionFixture(): PositionRow {
  return {
    id: "pos-1",
    cultureId: "culture-1",
    cultureName: "Люцерна",
    cultureType: "SEED",
    attributes: { sort: "Вега 87", germination: 92 },
    volumeKg: 20_000,
    bagWeightKg: 25,
    supplierPrice: 80,
    salePrice: 100,
    supplierLocation: "PAVLOVSKAYA",
  };
}

export function leadFixture(): LeadRow {
  return {
    id: "lead-1",
    source: "TELEGRAM_BOT",
    externalId: "100200",
    externalUsername: "agro_buyer",
    name: "Пётр Смирнов",
    phone: "+7 (918) 123-45-67",
    region: "Ростовская область",
    positionId: "pos-1",
  };
}

export class MemoryDealsDb implements DealsDb {
  user: SellerRow | null = null;
  positions: PositionRow[] = [];
  leads: LeadRow[] = [];
  deals: DealRow[] = [];
  shipments: ShipmentRow[] = [];
  documents: DocumentRow[] = [];
  claims: ClaimRow[] = [];
  carriers: CarrierRow[] = [];
  private seq = 0;

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  findUser() {
    return Promise.resolve(this.user);
  }

  findPosition(id: string) {
    return Promise.resolve(this.positions.find((p) => p.id === id) ?? null);
  }

  findLead(id: string) {
    return Promise.resolve(this.leads.find((l) => l.id === id) ?? null);
  }

  listDeals(filter: ListDealsFilter) {
    return Promise.resolve(
      this.deals.filter((d) => {
        if (filter.status === "ACTIVE") {
          if (["CLOSED", "CANCELLED"].includes(d.status)) return false;
        } else if (filter.status === "FINISHED") {
          if (d.status !== "CLOSED") return false;
        } else if (filter.status && d.status !== filter.status) {
          return false;
        }
        if (filter.q) {
          const q = filter.q.toLowerCase();
          const hay = `${d.number} ${d.buyerName} ${d.buyerRegion} ${d.notes ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    );
  }

  countDeals() {
    return Promise.resolve(this.deals.length);
  }

  findDeal(id: string) {
    return Promise.resolve(this.deals.find((d) => d.id === id) ?? null);
  }

  createDeal(data: Omit<DealRow, "id" | "createdAt" | "updatedAt">) {
    const row: DealRow = { ...data, id: this.nextId("deal"), createdAt: new Date(), updatedAt: new Date() };
    this.deals.push(row);
    return Promise.resolve(row);
  }

  updateDeal(id: string, data: Partial<DealRow>) {
    const i = this.deals.findIndex((d) => d.id === id);
    if (i < 0) return Promise.resolve(null);
    this.deals[i] = { ...this.deals[i], ...data };
    return Promise.resolve(this.deals[i]);
  }

  deleteDeal(id: string) {
    const i = this.deals.findIndex((d) => d.id === id);
    if (i < 0) return Promise.resolve(false);
    this.deals.splice(i, 1);
    return Promise.resolve(true);
  }

  createShipment(data: Omit<ShipmentRow, "id" | "createdAt">) {
    const row: ShipmentRow = { ...data, id: this.nextId("ship"), createdAt: new Date() };
    this.shipments.push(row);
    return Promise.resolve(row);
  }

  updateShipmentByDeal(dealId: string, data: Partial<ShipmentRow>) {
    const i = this.shipments.findIndex((s) => s.dealId === dealId);
    if (i < 0) return Promise.resolve(null);
    this.shipments[i] = { ...this.shipments[i], ...data };
    return Promise.resolve(this.shipments[i]);
  }

  findShipmentByDeal(dealId: string) {
    const rows = this.shipments.filter((s) => s.dealId === dealId);
    return Promise.resolve(rows.length > 0 ? rows[rows.length - 1] : null);
  }

  countDocuments(type: DocumentRow["type"]) {
    return Promise.resolve(this.documents.filter((d) => d.type === type).length);
  }

  createDocument(data: Omit<DocumentRow, "id" | "createdAt">) {
    const row: DocumentRow = { ...data, id: this.nextId("doc"), createdAt: new Date() };
    this.documents.push(row);
    return Promise.resolve(row);
  }

  listDocuments(dealId: string) {
    return Promise.resolve(this.documents.filter((d) => d.dealId === dealId));
  }

  findDocument(id: string) {
    return Promise.resolve(this.documents.find((d) => d.id === id) ?? null);
  }

  listClaims(filter: { dealId?: string; status?: ClaimRow["status"] }) {
    return Promise.resolve(
      this.claims.filter(
        (c) =>
          (!filter.dealId || c.dealId === filter.dealId) &&
          (!filter.status || c.status === filter.status),
      ),
    );
  }

  findClaim(id: string) {
    return Promise.resolve(this.claims.find((c) => c.id === id) ?? null);
  }

  createClaim(data: { dealId: string; description: string }) {
    const row: ClaimRow = {
      id: this.nextId("claim"),
      dealId: data.dealId,
      description: data.description,
      photos: [],
      status: "NEW",
      resolution: null,
      forwardedToSupplier: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.claims.push(row);
    return Promise.resolve(row);
  }

  updateClaim(id: string, data: Partial<ClaimRow>) {
    const i = this.claims.findIndex((c) => c.id === id);
    if (i < 0) return Promise.resolve(null);
    this.claims[i] = { ...this.claims[i], ...data, updatedAt: new Date() };
    return Promise.resolve(this.claims[i]);
  }

  listCarriers() {
    return Promise.resolve([...this.carriers]);
  }

  countCarriers() {
    return Promise.resolve(this.carriers.length);
  }

  createCarrier(data: Omit<CarrierRow, "id" | "createdAt">) {
    const row: CarrierRow = { ...data, id: this.nextId("carrier"), createdAt: new Date() };
    this.carriers.push(row);
    return Promise.resolve(row);
  }
}

/** Засеянная БД: продавец с реквизитами, позиция, лид, пустые сделки. */
export function seededDb(): MemoryDealsDb {
  const db = new MemoryDealsDb();
  db.user = sellerFixture();
  db.positions.push(positionFixture());
  db.leads.push(leadFixture());
  return db;
}
