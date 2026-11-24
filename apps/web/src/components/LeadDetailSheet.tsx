/**
 * Карточка лида (этап 3.2): переписка чатом, черновик AI по кнопке,
 * отправка текста ботом, статусы (закрыть/спам), заметка, позиция.
 */

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Ban,
  Check,
  Package,
  Send,
  Sparkles,
  XCircle,
} from "lucide-react";
import type { LeadDetailDTO, LeadMessageDTO } from "@shared/types";
import { positionName } from "@shared/attributes";
import * as api from "../api/client";
import { fmtRub } from "../lib/format";
import { useToastStore } from "../stores/publish";
import { useCatalog } from "../stores/catalog";
import { Btn, Card, Chip, Field, InfoRow, Sheet, Skeleton, TextArea } from "../components/ui";
import { fmtWhen, LEAD_STATUS_LABEL } from "../routes/InboxScreen";

function ChatBubble({ m }: { m: LeadMessageDTO }) {
  const inbound = m.direction === "INBOUND";
  return (
    <div className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] rounded-[16px] px-3.5 py-2.5 ${
          inbound ? "bg-subtle text-ink" : "bg-accent text-white"
        }`}
      >
        <p className="whitespace-pre-wrap break-words text-[13px] font-medium leading-relaxed">
          {m.text}
        </p>
        <p
          className={`mt-1 text-right text-[10px] font-medium ${
            inbound ? "text-soft" : "text-white/70"
          }`}
        >
          {fmtWhen(m.sentAt)}
          {m.aiGenerated ? " · AI" : ""}
        </p>
      </div>
    </div>
  );
}

export function LeadDetailSheet({
  leadId,
  onClose,
  onChanged,
}: {
  leadId: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const showToast = useToastStore((s) => s.show);
  const { positions, load: loadPositions } = useCatalog();
  const [lead, setLead] = useState<LeadDetailDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [draftText, setDraftText] = useState("");
  const [draftMeta, setDraftMeta] = useState<{ model: string; status: string; latencyMs: number } | null>(null);
  const [draftWarnings, setDraftWarnings] = useState<string[]>([]);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftAiCallId, setDraftAiCallId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [notes, setNotes] = useState("");
  const chatRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void loadPositions();
    let alive = true;
    api
      .getLead(leadId)
      .then((r) => {
        if (!alive) return;
        setLead(r);
        setNotes(r.notes ?? "");
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Не удалось открыть переписку"),
      );
    return () => {
      alive = false;
    };
  }, [leadId, loadPositions]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [lead?.messages.length]);

  const reload = async () => {
    try {
      const r = await api.getLead(leadId);
      setLead(r);
      setNotes(r.notes ?? "");
      onChanged?.();
    } catch {
      /* молча — список обновится при закрытии */
    }
  };

  const makeDraft = async () => {
    if (draftLoading) return;
    setDraftLoading(true);
    setDraftWarnings([]);
    try {
      const res = await api.replyLeadDraft(leadId);
      setDraftText(res.draft);
      setDraftMeta(res.meta);
      setDraftWarnings(res.warnings ?? []);
      setDraftAiCallId(null); /* сервер не возвращает id AiCall — отправим текст как есть */
      showToast(
        res.meta.provider === "fallback" ? "Черновик по шаблону — AI недоступен" : "Черновик готов",
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Не удалось собрать черновик");
    } finally {
      setDraftLoading(false);
    }
  };

  const sendReply = async () => {
    const text = draftText.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await api.sendLeadReply(leadId, {
        text,
        ...(draftAiCallId ? { aiCallId: draftAiCallId } : {}),
      });
      setDraftText("");
      setDraftMeta(null);
      setDraftAiCallId(null);
      showToast("Ответ отправлен покупателю");
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Не удалось отправить ответ");
    } finally {
      setSending(false);
    }
  };

  const setStatus = async (status: "CLOSED" | "SPAM" | "IN_PROGRESS") => {
    try {
      await api.updateLead(leadId, { status });
      showToast(
        status === "CLOSED" ? "Лид закрыт" : status === "SPAM" ? "Помечен спамом" : "Лид в работе",
      );
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Не удалось обновить статус");
    }
  };

  const saveNotes = async () => {
    const value = notes.trim();
    if (!lead || value === (lead.notes ?? "")) return;
    try {
      await api.updateLead(leadId, { notes: value });
      showToast("Заметка сохранена");
      onChanged?.();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Не удалось сохранить заметку");
    }
  };

  const position = lead?.positionId ? positions.find((p) => p.id === lead.positionId) ?? null : null;

  return (
    <Sheet title={lead ? "Переписка" : "Лид"} onClose={onClose}>
      {error ? (
        <p className="py-3 text-[13px] font-semibold text-warm">{error}</p>
      ) : !lead ? (
        <div className="flex flex-col gap-3 py-2">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-[64px] w-full rounded-[16px]" />
          <Skeleton className="h-[64px] w-2/3 rounded-[16px]" />
        </div>
      ) : (
        <>
          {/* Шапка лида */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[16px] font-semibold text-ink">
                {lead.name ?? (lead.externalUsername ? `@${lead.externalUsername}` : "Покупатель")}
              </p>
              <p className="mt-0.5 text-[12px] font-medium text-soft">
                {lead.externalUsername && lead.name ? `@${lead.externalUsername} · ` : ""}
                {LEAD_STATUS_LABEL[lead.status]}
                {lead.interest ? ` · интерес: ${lead.interest}` : ""}
              </p>
            </div>
            <Chip tone={lead.status === "NEW" ? "warm" : lead.status === "ANSWERED" ? "green" : "neutral"}>
              {LEAD_STATUS_LABEL[lead.status]}
            </Chip>
          </div>

          {/* Позиция */}
          {position ? (
            <Card className="mt-3 flex items-center gap-3 p-3.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <Package size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-ink">
                  {positionName(position.culture.name, position.attributes)}
                </p>
                <p className="truncate text-[12px] font-medium text-soft">
                  {fmtRub(position.salePrice)} за кг · {position.volumeKg} кг
                </p>
              </div>
            </Card>
          ) : (
            <p className="mt-2 text-[11px] font-medium text-soft">
              Позиция не привязана — укажите в «Позиции и остатки», чтобы AI собрал ответ с ценой
            </p>
          )}

          {/* Чат */}
          <div
            ref={chatRef}
            className="soft-scroll mt-3 flex max-h-[38vh] flex-col gap-2 overflow-y-auto rounded-[14px] bg-canvas p-3"
          >
            {lead.messages.length === 0 ? (
              <p className="py-4 text-center text-[12px] font-medium text-soft">
                Сообщений пока нет
              </p>
            ) : (
              lead.messages.map((m) => <ChatBubble key={m.id} m={m} />)
            )}
          </div>

          {/* Черновик и отправка */}
          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-soft">Ответ покупателю</span>
              <button
                type="button"
                onClick={() => void makeDraft()}
                disabled={draftLoading}
                className="press inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[12px] font-semibold text-white shadow-soft disabled:opacity-40"
              >
                <Sparkles size={13} className={draftLoading ? "animate-spin" : ""} />
                {draftLoading ? "Думаю…" : "Черновик AI"}
              </button>
            </div>

            <TextArea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              rows={4}
              placeholder="Напишите ответ или соберите черновик AI"
              aria-label="Ответ покупателю"
            />
            {draftMeta && (
              <p className="mt-1 text-[11px] font-medium text-soft">
                {draftMeta.status === "fallback"
                  ? "Шаблон · AI недоступен"
                  : `AI · ${draftMeta.model} · ${(draftMeta.latencyMs / 1000).toFixed(1)} с`}
              </p>
            )}
            {draftWarnings[0] ? (
              <p className="mt-1 flex items-start gap-1 text-[11px] font-medium text-soft">
                <AlertCircle size={12} className="mt-0.5 shrink-0" />
                {draftWarnings[0]}
              </p>
            ) : null}

            <div className="mt-2 flex gap-2">
              <Btn
                full
                disabled={!draftText.trim() || sending}
                onClick={() => void sendReply()}
                ariaLabel="Отправить ответ покупателю"
              >
                <Send size={15} />
                {sending ? "Отправляю…" : "Отправить"}
              </Btn>
            </div>
          </div>

          {/* Статусы */}
          <div className="mt-4 flex gap-2">
            {lead.status !== "SPAM" && (
              <Btn variant="ghost" onClick={() => void setStatus("SPAM")} ariaLabel="Пометить спамом">
                <Ban size={14} />
                Спам
              </Btn>
            )}
            {lead.status !== "CLOSED" && (
              <Btn variant="ghost" onClick={() => void setStatus("CLOSED")} ariaLabel="Закрыть лид">
                <XCircle size={14} />
                Закрыть
              </Btn>
            )}
            {lead.status === "NEW" && (
              <Btn variant="ghost" onClick={() => void setStatus("IN_PROGRESS")} ariaLabel="Взять в работу">
                <Check size={14} />
                В работу
              </Btn>
            )}
          </div>

          {/* Заметка */}
          <div className="mt-4">
            <Field label="Заметка (видна только вам)" hint="сохр. по blur">
              <TextArea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => void saveNotes()}
                rows={2}
                placeholder="Например: просит доставку в Казань до 5 числа"
                aria-label="Заметка по лиду"
              />
            </Field>
          </div>

          {/* Служебная карточка */}
          <Card className="mt-4 px-4 py-1">
            <InfoRow label="Источник" value="Telegram-бот" valueClass="text-soft" />
            <InfoRow
              label="Первое сообщение"
              value={fmtWhen(lead.createdAt)}
              valueClass="text-soft"
            />
          </Card>
        </>
      )}
    </Sheet>
  );
}
