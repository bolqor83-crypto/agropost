/**
 * Иконки типов каналов (этап 2) — общий модуль для экранов
 * «Каналы» и «Разместить».
 */

import { Globe, HelpCircle, MessageSquare, Send, Smartphone, Store, Tag } from "lucide-react";
import type { ChannelType } from "@shared/types";

export const CHANNEL_ICON: Record<ChannelType, typeof Send> = {
  TELEGRAM_CHAT: MessageSquare,
  TELEGRAM_CHANNEL: Send,
  AVITO: Store,
  AGROSERVER: Globe,
  MAX: Smartphone,
  YOULA: Tag,
  OTHER: HelpCircle,
};
