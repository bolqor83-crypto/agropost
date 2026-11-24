/**
 * ЭТАП 10 — /api/userbot/*: статус сервиса чтения чужих Telegram-чатов
 * и управление списком чатов.
 *
 * Userbot — отдельный Python-сервис (services/userbot, Telethon), который
 * ТОЛЬКО ЧИТАЕТ сообщения в выбранных чатах и пишет Leads (source=
 * TELEGRAM_CHAT). Общается с этим API через общую БД (Neon):
 * - AppSetting "userbotChats" — какие чаты читать (env CHATS_TO_READ ⋁ UI);
 * - AppSetting "userbotStatus" — живой статус (connected, chats, leadsToday).
 *
 * env TELEGRAM_SESSION/TG_API_ID не задан → configured=false, честный
 * warning в UI, приложение работает как раньше (полуавто).
 */

import type { FastifyInstance } from "fastify";
import { badRequest } from "../errors.js";
import { parseOrThrow } from "../validation.js";
import { prisma } from "../prisma.js";
import { z } from "zod";
import type { UserbotStatusDTO } from "@shared/types";

/* Тесты: подмена хранилища (без Prisma). */
let storeOverride: {
  getStatus: (() => Promise<Record<string, unknown> | null>) | null;
  getChats: (() => Promise<string[]>) | null;
  saveChats: ((chats: string[]) => Promise<void>) | null;
} | null = null;

export function setUserbotStore(override: typeof storeOverride): void {
  storeOverride = override;
}

/* ---------- env-креды userbot (как у парсера: TELEGRAM_* / TG_*) ---------- */

function env(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function userbotEnvConfigured(): boolean {
  const sessionId = env("TELEGRAM_SESSION") ?? env("TG_SESSION");
  const apiId = env("TELEGRAM_API_ID") ?? env("TG_API_ID");
  const apiHash = env("TELEGRAM_API_HASH") ?? env("TG_API_HASH");
  return Boolean(sessionId && apiId && apiHash);
}

export function userbotEnvChats(): string[] {
  const raw = env("CHATS_TO_READ") ?? "";
  return raw
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

/* ---------- AppSetting (userbotChats / userbotStatus) ---------- */

async function readChats(): Promise<string[]> {
  if (storeOverride?.getChats) return storeOverride.getChats();
  const row = await prisma.appSetting.findUnique({ where: { key: "userbotChats" } });
  const value = row?.value as { chats?: unknown } | null | undefined;
  if (!value || !Array.isArray(value.chats)) return [];
  return value.chats.filter((c): c is string => typeof c === "string" && c.trim().length > 0);
}

async function writeChats(chats: string[]): Promise<void> {
  if (storeOverride?.saveChats) return storeOverride.saveChats(chats);
  await prisma.appSetting.upsert({
    where: { key: "userbotChats" },
    create: { key: "userbotChats", value: { chats } },
    update: { value: { chats } },
  });
}

async function readStatus(): Promise<Record<string, unknown> | null> {
  if (storeOverride?.getStatus) return storeOverride.getStatus();
  const row = await prisma.appSetting.findUnique({ where: { key: "userbotStatus" } });
  if (!row) return null;
  const value = row.value as Record<string, unknown> | null;
  return value && typeof value === "object" ? value : null;
}

/* ---------- Нормализация адреса чата ---------- */

export const userbotChatSchema = z.object({
  chat: z.string().trim().min(2, "Укажите @username, ссылку t.me/… или числовой ID чата"),
});

/** @username / t.me/… / числовой ID → строка для Telethon. */
export function normalizeChatAddress(input: string): string {
  const raw = input.trim();
  /* Числовой ID чата (в т.ч. -100…). */
  if (/^-?\d+$/.test(raw)) return raw;
  /* Уже @username. */
  if (raw.startsWith("@")) {
    const clean = raw.slice(1).replace(/[^A-Za-z0-9_]/g, "");
    return clean.length >= 2 ? `@${clean}` : raw;
  }
  /* Ссылка t.me/<username> или t.me/s/<username>. */
  const link = raw.match(/t\.me\/(?:s\/)?([A-Za-z0-9_]{4,})/i);
  if (link) return `@${link[1]}`;
  /* Инвайт-ссылка — отдаём как есть (Telethon сам разберёт). */
  if (/joinchat\//i.test(raw)) return raw;
  /* Голое имя без @. */
  const plain = raw.replace(/^https?:\/\//, "").replace(/\?.*$/, "").replace(/\/+$/, "");
  if (/^[A-Za-z0-9_]{4,}$/.test(plain)) return `@${plain}`;
  return raw;
}

export async function userbotRoutes(app: FastifyInstance): Promise<void> {
  /* Статус: креды env + живой сервис + список чатов. */
  app.get("/api/userbot/status", async () => {
    const configured = userbotEnvConfigured();
    const [status, dbChats] = await Promise.all([readStatus(), readChats()]);
    const envChats = userbotEnvChats();
    /* Список чатов: env-заготовка + добавленные из UI (без дублей). */
    const chats = [...new Set([...envChats, ...dbChats])];

    const service = status
      ? {
          connected: status.connected === true,
          chats: Number(status.chats ?? 0),
          lastMessageAt: typeof status.lastMessageAt === "string" ? status.lastMessageAt : null,
          leadsToday: Number(status.leadsToday ?? 0),
          version: typeof status.version === "string" ? status.version : null,
        }
      : null;

    const dto: UserbotStatusDTO = {
      ok: true,
      configured,
      configuredFrom: configured ? "env" : "none",
      service,
      chats,
    };
    return dto;
  });

  /* «Добавить чат» — нормализуем и сохраняем. */
  app.post("/api/userbot/chats", async (req) => {
    const input = parseOrThrow(userbotChatSchema, req.body ?? {});
    const normalized = normalizeChatAddress(input.chat);
    if (normalized.length < 2) throw badRequest("Не удалось разобрать адрес чата");
    const current = await readChats();
    if (!current.includes(normalized)) {
      await writeChats([...current, normalized]);
    }
    const chats = [...new Set([...userbotEnvChats(), ...(await readChats())])];
    return { ok: true, chat: normalized, chats };
  });

  /* Убрать чат (env-чаты убрать нельзя — правится env на Render). */
  app.delete("/api/userbot/chats", async (req) => {
    const input = parseOrThrow(userbotChatSchema, req.body ?? {});
    const normalized = normalizeChatAddress(input.chat);
    const current = await readChats();
    await writeChats(current.filter((c) => c !== normalized));
    const chats = [...new Set([...userbotEnvChats(), ...(await readChats())])];
    return { ok: true, chat: normalized, chats };
  });
}

