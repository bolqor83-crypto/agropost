/**
 * Подготовка фактов для промптов. Здесь же — сборка контекста «Совет»
 * из БД. ВАЖНО: в факты намеренно не попадают имя поставщика, его
 * телефон, локация и заметки — white-label проверяется на выходе.
 */

import { formatAttrValue, positionName } from "@shared/attributes";
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
    if (value !== "—") lines.push(`${field.label}: ${value}`);
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

  return { activeLeads, recentListings, staleListings, positionsInStock, cooledDownChannels };
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
  ].join("\n\n");
}
