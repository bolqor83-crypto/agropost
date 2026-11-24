/**
 * Подготовка фактов для промптов. Здесь же — сборка контекста «Совет»
 * из БД. ВАЖНО: в факты намеренно не попадают имя поставщика, его
 * телефон, локация и заметки — white-label проверяется на выходе.
 */

import { attributeDisplayType, formatAttrValue, positionName } from "@shared/attributes";
import { extractNumbers } from "./gateway.js";
import type { AiAdviceContext } from "@shared/ai";
import type { PositionDTO } from "@shared/types";
import { prisma } from "../prisma.js";

/** Единственный регион, который можно называть в текстах. */
export const PUBLIC_REGION = "Краснодарский край";

/** Человеческая цена: 212,75 ₽/кг. */
export function rubPerKg(value: number): string {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value)} ₽/кг`;
}

export function positionFacts(p: PositionDTO): string {
  const lines: string[] = [
    `Культура: ${p.culture.name}`,
    `Название: ${positionName(p.culture.name, p.attributes)}`,
  ];
  for (const field of p.culture.attributesSchema) {
    const value = formatAttrValue(field, p.attributes[field.key]);
    if (value !== "—") {
      const display = attributeDisplayType(field);
      const hint =
        display === "RANGE"
          ? " (формат: диапазон, только эти числа)"
          : display === "MIN"
            ? " (формат: минимум, только это число)"
            : display === "FIXED"
              ? " (формат: точное значение, не менять)"
              : "";
      lines.push(`${field.label}: ${value}${hint}`);
    }
  }
  lines.push(`Остаток: ${new Intl.NumberFormat("ru-RU").format(p.volumeKg)} кг`);
  lines.push(`Фасовка: мешки ${p.bagWeightKg} кг`);
  lines.push(`Минимальная партия: от ${new Intl.NumberFormat("ru-RU").format(p.minLotKg)} кг`);
  lines.push(`Цена продажи: ${rubPerKg(p.salePrice)}`);
  lines.push(`Сертификат: ${p.hasCertificate ? "есть" : "нет"}`);
  lines.push(
    `Статус: ${p.status === "IN_STOCK" ? "в наличии" : p.status === "ON_ORDER" ? "под заказ" : "нет в наличии"}`,
  );
  lines.push(`Регион отгрузки: ${PUBLIC_REGION}`);
  lines.push(
    "Условия: доставку оплачивает покупатель; отправка после полной оплаты; ТК (ПЭК, СДЭК) или самовывоз.",
  );
  return lines.join("\n");
}

/** Теги для fallback-объявления: культура, сорт, тип товара, опт. */
export function fallbackTags(p: PositionDTO): string[] {
  const tags = new Set<string>();
  tags.add(p.culture.name.toLowerCase());
  const sort = p.attributes["sort"];
  if (sort) tags.add(String(sort));
  tags.add(p.culture.type === "NUT" ? "грецкий орех" : "семена трав");
  tags.add("опт");
  if (p.hasCertificate) tags.add("сертификат");
  return [...tags].slice(0, 8);
}

/**
 * Разрешённые числа для пост-проверки AI-текстов (патч 4.1):
 * все числа атрибутов позиции (включая границы диапазонов «45–50»
 * и числа внутри текстовых значений вроде «Вега 87»), цена, объём,
 * фасовка, минимальная партия и детерминированные производные
 * (мешки, тонны, выручка, цена за тонну). Число вне списка —
 * галлюцинация, ответ отклоняется.
 */
export function listingAllowedNumbers(p: PositionDTO): number[] {
  const nums: number[] = [];
  for (const field of p.culture.attributesSchema) {
    const raw = p.attributes[field.key];
    if (raw === undefined || raw === null || raw === "") continue;
    nums.push(...extractNumbers(String(raw)));
  }
  nums.push(p.salePrice, p.volumeKg, p.bagWeightKg, p.minLotKg);
  if (p.bagWeightKg > 0) {
    nums.push(Math.round(p.volumeKg / p.bagWeightKg));
  }
  if (p.volumeKg > 0) {
    nums.push(Math.round((p.volumeKg / 1000) * 100) / 100);
  }
  nums.push(Math.round(p.salePrice * p.volumeKg * 100) / 100);
  nums.push(Math.round(p.salePrice * 1000 * 100) / 100);
  return nums.filter((n) => Number.isFinite(n));
}

/** Короткая строка позиции для контекста «Совет». */
function positionTitle(p: { culture: { name: string }; attributes: unknown }): string {
  return positionName(p.culture.name, (p.attributes ?? {}) as Record<string, string | number>);
}

export async function adviceContextFromDb(): Promise<AiAdviceContext> {
  const now = Date.now();
  const [positions, listings, channels] = await Promise.all([
    prisma.supplierPosition.findMany({
      where: { status: "IN_STOCK", volumeKg: { gt: 0 } },
      include: { culture: true },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    prisma.listing.findMany({
      include: { position: { include: { culture: true } }, channel: true },
      orderBy: { updatedAt: "desc" },
      take: 40,
    }),
    prisma.channel.findMany({
      include: { _count: { select: { listings: true } } },
      orderBy: { lastActivityAt: "desc" },
      take: 30,
    }),
  ]);

  const activeLeads = listings
    .filter((l) => l.status === "COPIED")
    .slice(0, 5)
    .map((l) => ({
      id: l.id,
      title: positionTitle(l.position),
      channel: l.channel.name,
      days: Math.max(0, Math.floor((now - l.updatedAt.getTime()) / 86_400_000)),
    }));

  const recentListings = listings
    .filter((l) => l.status === "PUBLISHED")
    .slice(0, 5)
    .map((l) => ({
      id: l.id,
      title: positionTitle(l.position),
      channel: l.channel.name,
      daysAgo: Math.max(0, Math.floor((now - (l.publishedAt ?? l.updatedAt).getTime()) / 86_400_000)),
    }));

  const staleListings = listings
    .filter((l) => l.status === "DRAFT" && now - l.createdAt.getTime() > 3 * 86_400_000)
    .slice(0, 5)
    .map((l) => ({
      id: l.id,
      title: positionTitle(l.position),
      channel: l.channel.name,
      daysAgo: Math.floor((now - l.createdAt.getTime()) / 86_400_000),
    }));

  const positionsInStock = positions.map((p) => ({
    id: p.id,
    title: positionTitle(p),
    volumeKg: p.volumeKg,
    salePrice: Number(p.salePrice),
  }));

  const publishedChannelIds = new Set(
    listings.filter((l) => l.status === "PUBLISHED").map((l) => l.channelId),
  );
  const cooledDownChannels = channels
    .filter((c) => !publishedChannelIds.has(c.id))
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      name: c.name,
      city: c.city,
      daysSince:
        c.lastActivityAt === null
          ? null
          : Math.max(0, Math.floor((now - c.lastActivityAt.getTime()) / 86_400_000)),
    }));

  /* ---------- Этап 5: расширенный контекст ---------- */
  const adviceContext = await buildExtendedAdviceContext(
    { activeLeads, recentListings, staleListings, positionsInStock, cooledDownChannels },
    { positions, listings, channels, now },
  );
  return adviceContext;
}

/**
 * Этап 5, ЧАСТЬ B: лиды, сделки, позиции без публикаций, каналы.
 * Пороги — из ТЗ: лид завис, если старше 3 дней без исходящего
 * сообщения; сделка зависшая — AWAITING_PAYMENT дольше 2 дней;
 * позиция «давно не публиковалась» — 14 дней; канал — 14 дней.
 */
const STALE_DEAL_DAYS = 2;
const STALE_PUBLISH_DAYS = 14;
const COOLDOWN_DAYS = 3;

export async function buildExtendedAdviceContext(
  base: AiAdviceContext,
  facts: {
    positions: { id: string; culture: { name: string }; attributes: unknown; updatedAt: Date }[];
    listings: { positionId: string; channelId: string; status: string; publishedAt: Date | null }[];
    channels: { id: string; name: string; city: string | null; lastActivityAt: Date | null }[];
    now: number;
  },
): Promise<AiAdviceContext> {
  const now = facts.now;
  const day = (d: Date): number => Math.max(0, Math.floor((now - d.getTime()) / 86_400_000));

  /* Лиды инбокса: активные + зависшие (без исходящего сообщения). */
  const leadRows = await prisma.lead.findMany({
    where: { status: { in: ["NEW", "IN_PROGRESS"] } },
    include: { position: { include: { culture: true } }, messages: { orderBy: { sentAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const inboxLeads = leadRows.slice(0, 10).map((l) => ({
    id: l.id,
    name: l.name,
    interest:
      l.interest ??
      (l.position ? positionName(l.position.culture.name, (l.position.attributes ?? {}) as Record<string, string | number>) : null),
    status: l.status,
    days: day(l.createdAt),
    answered: l.messages[0]?.direction === "OUTBOUND",
  }));

  /* Сделки: активные и зависшие в AWAITING_PAYMENT. */
  const dealRows = await prisma.deal.findMany({
    where: { status: { in: ["AWAITING_PAYMENT", "PAID", "SHIPPED"] } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const dealToAdvice = (d: (typeof dealRows)[number]) => ({
    id: d.id,
    number: d.number,
    buyerName: d.buyerName,
    status: d.status,
    amount: Number(d.salePrice) * Number(d.volumeKg),
    days: day(d.createdAt),
  });
  const activeDeals = dealRows.map(dealToAdvice);
  const staleDeals = dealRows
    .filter((d) => d.status === "AWAITING_PAYMENT" && day(d.createdAt) > STALE_DEAL_DAYS)
    .map(dealToAdvice);

  /* Позиции в наличии, по которым нет публикаций > 14 дней. */
  const publishedByPosition = new Map<string, Date>();
  for (const l of facts.listings) {
    if (l.status !== "PUBLISHED" || !l.publishedAt) continue;
    const prev = publishedByPosition.get(l.positionId);
    if (!prev || l.publishedAt > prev) publishedByPosition.set(l.positionId, l.publishedAt);
  }
  const unpublishedPositions = facts.positions
    .filter((p) => {
      const last = publishedByPosition.get(p.id);
      return !last || now - last.getTime() > STALE_PUBLISH_DAYS * 86_400_000;
    })
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      title: positionName(
        (p as { culture: { name: string } }).culture.name,
        (p.attributes ?? {}) as Record<string, string | number>,
      ),
    }));

  /* Каналы: доступные сегодня (cooldown прошёл) и «давно без публикаций». */
  const lastByChannel = new Map<string, Date | null>();
  for (const l of facts.listings) {
    if (l.status !== "PUBLISHED" || !l.publishedAt) continue;
    const prev = lastByChannel.get(l.channelId);
    if (prev === undefined || prev === null || l.publishedAt > prev) {
      lastByChannel.set(l.channelId, l.publishedAt);
    }
  }
  const channelsInCooldown = facts.channels
    .filter((c) => {
      const last = lastByChannel.get(c.id) ?? null;
      const days = last === null ? null : day(last);
      return days === null || days >= COOLDOWN_DAYS;
    })
    .slice(0, 8)
    .map((c) => ({
      id: c.id,
      name: c.name,
      city: c.city,
      daysSince: lastByChannel.has(c.id)
        ? day(lastByChannel.get(c.id) as Date)
        : null,
    }));
  const staleChannels = facts.channels
    .filter((c) => {
      const last = lastByChannel.get(c.id) ?? null;
      return last === null ? false : now - last.getTime() > STALE_PUBLISH_DAYS * 86_400_000;
    })
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      name: c.name,
      city: c.city,
      daysSince: day(lastByChannel.get(c.id) as Date),
    }));

  /* Новые лиды за сегодня. */
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const newLeadsToday = await prisma.lead.count({
    where: { createdAt: { gte: todayStart } },
  });

  return {
    ...base,
    inboxLeads,
    activeDeals,
    staleDeals,
    unpublishedPositions,
    channelsInCooldown,
    staleChannels,
    newLeadsToday,
  };
}

export function adviceContextToPrompt(ctx: AiAdviceContext): string {
  const line = (items: string[]) => (items.length ? items.map((x) => `- ${x}`).join("\n") : "- (пусто)");
  return [
    `Активные размещения (ждут отметки «размещено»):\n${line(
      ctx.activeLeads.map((x) => `${x.title}${x.channel ? ` · ${x.channel}` : ""}${x.days !== undefined ? ` · ${x.days} дн.` : ""}`),
    )}`,
    `Недавние публикации:\n${line(
      ctx.recentListings.map((x) => `${x.title}${x.channel ? ` · ${x.channel}` : ""}${x.daysAgo !== undefined ? ` · ${x.daysAgo} дн. назад` : ""}`),
    )}`,
    `Залежавшиеся черновики:\n${line(
      ctx.staleListings.map((x) => `${x.title}${x.channel ? ` · ${x.channel}` : ""}${x.daysAgo !== undefined ? ` · ${x.daysAgo} дн.` : ""}`),
    )}`,
    `Позиции в наличии:\n${line(
      ctx.positionsInStock.map(
        (x) => `${x.title}${x.volumeKg !== undefined ? ` · ${x.volumeKg} кг` : ""}${x.salePrice !== undefined ? ` · ${x.salePrice} ₽/кг` : ""}`,
      ),
    )}`,
    `Каналы без публикаций:\n${line(
      ctx.cooledDownChannels.map(
        (x) => `${x.name}${x.city ? ` · ${x.city}` : ""}${x.daysSince !== null && x.daysSince !== undefined ? ` · ${x.daysSince} дн.` : ""}`,
      ),
    )}`,
    /* Этап 5: расширенный контекст. */
    `Лиды инбокса (NEW/IN_PROGRESS):\n${line(
      (ctx.inboxLeads ?? []).map(
        (x) => `${x.name ?? "Покупатель"}${x.interest ? ` · интерес: ${x.interest}` : ""} · ${x.days} дн. · ${x.answered ? "отвечен" : "без ответа"}`,
      ),
    )}`,
    `Активные сделки:\n${line(
      (ctx.activeDeals ?? []).map((x) => `${x.number} · ${x.buyerName} · ${x.status} · ${Math.round(x.amount)} ₽ · ${x.days} дн.`),
    )}`,
    `Сделки, зависшие в ожидании оплаты (> 2 дн.):\n${line(
      (ctx.staleDeals ?? []).map((x) => `${x.number} · ${x.buyerName} · ${Math.round(x.amount)} ₽ · ${x.days} дн.`),
    )}`,
    `Позиции без публикаций > 14 дн.:\n${line(
      (ctx.unpublishedPositions ?? []).map((x) => `${x.title}`),
    )}`,
    `Каналы, доступные к публикации сегодня:\n${line(
      (ctx.channelsInCooldown ?? []).map(
        (x) => `${x.name}${x.city ? ` · ${x.city}` : ""}${x.daysSince !== null && x.daysSince !== undefined ? ` · публикация была ${x.daysSince} дн. назад` : " · не публиковали"}`,
      ),
    )}`,
    `Каналы без публикаций > 14 дн.:\n${line(
      (ctx.staleChannels ?? []).map((x) => `${x.name}${x.city ? ` · ${x.city}` : ""} · ${x.daysSince} дн.`),
    )}`,
    `Новых лидов сегодня: ${ctx.newLeadsToday ?? 0}`,
  ].join("\n\n");
}
