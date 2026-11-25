/**
 * Инбокс (этап 3.2) — все сообщения покупателей из Telegram-бота.
 * Фильтры: все / новые / в работе / спам + поиск по имени и тексту.
 * Статусы: NEW (жёлтый), ANSWERED (зелёный), SPAM (серый).
 */

import { useCallback, useEffect, useState } from "react";
import { Bot, Inbox as InboxIcon, Search, Send } from "lucide-react";
import type { LeadDTO, LeadStatus } from "@shared/types";
import * as api from "../api/client";
import { useToastStore } from "../stores/publish";
import { Btn, Card, Chip, EmptyState, ScreenHeader, Segmented, Skeleton, TextInput } from "../components/ui";
import { LeadDetailSheet } from "../components/LeadDetailSheet";
import { leadSourceBadge } from "../lib/lead-source";

type InboxFilter = "all" | "new" | "progress" | "answered" | "spam";

/** Сервер фильтрует по одному статусу; «спам» — точечно SPAM (закрытые видны в «Все»). */
const FILTER_STATUS: Record<Exclude<InboxFilter, "all">, LeadStatus> = {
  new: "NEW",
  progress: "IN_PROGRESS",
  answered: "ANSWERED",
  spam: "SPAM",
};

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "новый",
  IN_PROGRESS: "в работе",
  ANSWERED: "отвечен",
  CLOSED: "закрыт",
  SPAM: "спам",
};

export function statusTone(status: LeadStatus): "neutral" | "green" | "warm" | "outline" {
  if (status === "NEW") return "warm";
  if (status === "ANSWERED") return "green";
  return "neutral";
}

/** Короткая подпись времени: «14:32», «вчера», «12 ноя». */
export function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(d);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "вчера";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(d);
}

function leadTitle(l: LeadDTO): string {
  if (l.name) return l.name;
  if (l.externalUsername) return `@${l.externalUsername}`;
  return l.phone ? l.phone : "Покупатель";
}

function leadSubtitle(l: LeadDTO): string {
  const parts: string[] = [];
  if (l.name && l.externalUsername) parts.push(`@${l.externalUsername}`);
  if (l.interest) parts.push(l.interest);
  return parts.length > 0 ? parts.join(" · ") : "вопрос по товару";
}

function LeadRow({ lead, onOpen }: { lead: LeadDTO; onOpen: () => void }) {
  const last = lead.lastMessage;
  return (
    <Card onClick={onOpen} className="flex items-center gap-3 px-4 py-3.5">
      <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft text-[15px] font-semibold uppercase text-accent">
        {leadTitle(lead).slice(0, 1)}
        {lead.status === "NEW" && (
          <span className="pulse-soft absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-surface bg-warm" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="min-w-0 truncate text-[14px] font-semibold text-ink">{leadTitle(lead)}</p>
          {/* ЭТАП 10: бейдж источника — TG-чат (userbot) / MAX / Авито. */}
          {(() => {
            const badge = leadSourceBadge(lead.source);
            return badge.hidden ? null : (
              <Chip tone={badge.tone} className="shrink-0">{badge.label}</Chip>
            );
          })()}
          {lead.status === "NEW" && (
            <span className="shrink-0 rounded-full bg-warm-soft px-2 py-0.5 text-[11px] font-semibold text-warm">
              новый
            </span>
          )}
          {lead.status === "ANSWERED" && (
            <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
              отвечен
            </span>
          )}
          {lead.status === "SPAM" && (
            <span className="shrink-0 rounded-full bg-subtle px-2 py-0.5 text-[11px] font-semibold text-soft">
              спам
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[12px] font-medium text-soft">
          {last
            ? `${last.direction === "OUTBOUND" ? "Вы: " : ""}${last.text}`
            : leadSubtitle(lead)}
        </p>
      </div>
      <span className="shrink-0 text-[11px] font-medium text-soft">
        {fmtWhen(lead.updatedAt)}
      </span>
    </Card>
  );
}

export function InboxScreen() {
  const showToast = useToastStore((s) => s.show);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [query, setQuery] = useState("");
  const [leads, setLeads] = useState<LeadDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      const status = filter === "all" ? undefined : FILTER_STATUS[filter];
      api
        .listLeads({ ...(status ? { status } : {}) })
        .then((r) => {
          setLeads(r.items);
          setError(null);
        })
        .catch((err) =>
          setError(err instanceof Error ? err.message : "Не удалось загрузить инбокс"),
        )
        .finally(() => setLoading(false));
    },
    [filter],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? leads.filter(
        (l) =>
          leadTitle(l).toLowerCase().includes(q) ||
          (l.interest ?? "").toLowerCase().includes(q) ||
          (l.lastMessage?.text ?? "").toLowerCase().includes(q),
      )
    : leads;

  const newCount = leads.filter((l) => l.status === "NEW").length;

  return (
    <div className="screen-rise">
      <ScreenHeader title="Инбокс" caption="Покупатели из Telegram-бота и MAX — отвечаетесь здесь" back="/" />

      <div className="px-5">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-soft" />
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по имени, интересу, тексту"
            aria-label="Поиск в инбоксе"
            className="pl-9"
          />
        </div>
        <div className="pt-3">
          <Segmented<InboxFilter>
            items={[
              { value: "all", label: `Все · ${leads.length}` },
              { value: "new", label: newCount > 0 ? `Новые · ${newCount}` : "Новые" },
              { value: "progress", label: "В работе" },
              { value: "answered", label: "Отвечен" },
              { value: "spam", label: "Спам" },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </div>
      </div>

      <section className="px-5 pt-4 pb-2">
        {loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[68px] w-full rounded-[20px]" />
            <Skeleton className="h-[68px] w-full rounded-[20px]" />
            <Skeleton className="h-[68px] w-full rounded-[20px]" />
          </div>
        ) : error ? (
          <Card className="p-4">
            <p className="text-[13px] font-semibold text-warm">{error}</p>
            <div className="pt-3">
              <Btn variant="secondary" onClick={() => void load(true)}>
                Повторить
              </Btn>
            </div>
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <EmptyState
              icon={<InboxIcon size={26} />}
              title={q || filter !== "all" ? "Ничего не нашлось" : "Пока нет сообщений от покупателей"}
              caption={
                q || filter !== "all"
                  ? "Попробуйте другой фильтр или очистите поиск"
                  : "Добавьте своего бота в канал, чтобы покупатели могли задавать вопросы — переписка появится здесь"
              }
            />
            <div className="px-5 pb-5">
              <Btn
                full
                size="lg"
                variant="secondary"
                onClick={() => showToast("Бот принимает вопросы покупателей в Telegram")}
              >
                <Bot size={16} />
                Как покупатель находит бота
              </Btn>
            </div>
          </Card>
        ) : (
          <div className="stagger-children flex flex-col gap-3">
            {filtered.map((l) => (
              <LeadRow key={l.id} lead={l} onOpen={() => setOpenId(l.id)} />
            ))}
          </div>
        )}
      </section>

      <div className="px-5 pt-1">
        <div className="flex items-center gap-2 rounded-[14px] bg-subtle px-4 py-3">
          <Send size={16} className="shrink-0 text-soft" />
          <p className="text-[12px] font-medium text-soft">
            Ответ уходит покупателю в Telegram от имени бота — видно как переписка
          </p>
        </div>
      </div>

      {openId && (
        <LeadDetailSheet
          leadId={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => void load(true)}
        />
      )}
    </div>
  );
}
