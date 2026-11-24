import type { ActivityItem } from "../api/types";

/** Стартовая лента размещений на Пульте (демо, этап 2). */
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
