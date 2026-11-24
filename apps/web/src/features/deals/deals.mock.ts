import type { ActivityItem, Deal } from "../../api/types";

/** Демо-сделки этапа 0. Этап 4 — создание сделки, стадии, документы. */
export const DEALS: Deal[] = [
  {
    id: "deal-1",
    positionId: "pos-1",
    buyer: "КФХ «Рассвет», Волгоградская обл.",
    bags: 60,
    stage: "paid",
    delivery: { mode: "carrier", carrier: "ПЭК", costRub: 4200, paidByBuyer: true, track: "PEK-8241193" },
  },
  {
    id: "deal-2",
    positionId: "pos-3",
    buyer: "ИП Волков А.С., Воронеж",
    bags: 40,
    stage: "shipping",
    delivery: { mode: "carrier", carrier: "СДЭК", costRub: 3800, paidByBuyer: true, track: "SDEK-114055" },
  },
  {
    id: "deal-3",
    positionId: "pos-4",
    buyer: "КФХ «Заря», Ростовская обл.",
    bags: 80,
    stage: "talks",
    delivery: { mode: "carrier", carrier: "ПЭК", costRub: 5100, paidByBuyer: true },
  },
];

export const INITIAL_ACTIVITY: ActivityItem[] = [
  {
    id: "act-1",
    positionName: "Люцерна «Вега 87»",
    channelName: "Семена Кубани",
    channelType: "TELEGRAM_CHANNEL",
    mode: "auto",
    when: "2 ч назад",
  },
  {
    id: "act-2",
    positionName: "Суданская трава «Донская 5»",
    channelName: "Животноводство ЮГА",
    channelType: "TELEGRAM_CHAT",
    mode: "semi",
    when: "вчера, 19:40",
  },
  {
    id: "act-3",
    positionName: "Грецкий орех «Идеал»",
    channelName: "Орех оптом РФ",
    channelType: "TELEGRAM_CHANNEL",
    mode: "semi",
    when: "3 дня назад",
  },
];
