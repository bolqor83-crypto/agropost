import type { Channel } from "../../api/types";

/** Демо-каталог каналов этапа 0. Этап 2 — полный каталог, мультиаккаунты, лимиты. */
export const CHANNELS: Channel[] = [
  {
    id: "ch-1",
    name: "Семена Кубани",
    type: "telegram",
    region: "ЮФО",
    tags: ["семена", "опт"],
    audience: 3400,
    owned: true,
  },
  {
    id: "ch-2",
    name: "Животноводство ЮГА",
    type: "telegram",
    region: "ЮФО",
    tags: ["семена", "животноводство"],
    audience: 12000,
    owned: false,
  },
  {
    id: "ch-3",
    name: "Кормовые культуры РФ",
    type: "telegram",
    region: "Новые территории",
    tags: ["семена", "животноводство"],
    audience: 8500,
    owned: false,
  },
  {
    id: "ch-4",
    name: "Продаём орех",
    type: "telegram",
    region: "Федеральный",
    tags: ["орех", "опт"],
    audience: 25000,
    owned: false,
  },
  {
    id: "ch-5",
    name: "Орех оптом РФ",
    type: "telegram",
    region: "Федеральный",
    tags: ["орех"],
    audience: 18000,
    owned: false,
  },
  {
    id: "ch-6",
    name: "Агросервер — доска",
    type: "agroserver",
    region: "Федеральный",
    tags: ["семена", "орех", "опт"],
    audience: 30000,
    owned: false,
  },
  {
    id: "ch-7",
    name: "Авито — Семена трав",
    type: "avito",
    region: "ЮФО",
    tags: ["семена"],
    audience: null,
    owned: false,
  },
  {
    id: "ch-8",
    name: "Авито — Орех",
    type: "avito",
    region: "Федеральный",
    tags: ["орех"],
    audience: null,
    owned: false,
  },
  {
    id: "ch-9",
    name: "Max — Агро чат",
    type: "max",
    region: "ЮФО",
    tags: ["семена", "животноводство"],
    audience: 5000,
    owned: false,
  },
  {
    id: "ch-10",
    name: "Юла — С/х товары",
    type: "yula",
    region: "ЮФО",
    tags: ["семена", "орех"],
    audience: null,
    owned: false,
  },
];

/**
 * Подбор каналов под позицию: тег вида товара + гео-приоритет,
 * свои каналы первыми (автопостинг разрешён только в них).
 * Для семян — ЮФО и новые территории, для ореха — федеральные.
 */
export function suggestChannels(positionKindTag: string, limit = 5): Channel[] {
  return CHANNELS.filter((c) => c.tags.includes(positionKindTag))
    .sort((a, b) => {
      if (a.owned !== b.owned) return a.owned ? -1 : 1;
      return (b.audience ?? 0) - (a.audience ?? 0);
    })
    .slice(0, limit);
}
