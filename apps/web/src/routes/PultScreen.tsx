/**
 * Пульт — главный экран «тихого помощника».
 * Не дашборд: приветствие, главное действие «Разместить», позиции, лента.
 * Позиции — из API этапа 1; остатки обновляются вручную и молчат.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bean, ChevronRight, Inbox, Send, ShieldCheck, Sparkles, Sprout, Wheat } from "lucide-react";
import { attrSummary, positionName } from "@shared/attributes";
import type { PositionDTO } from "@shared/types";
import type { AiAdviceData, AiMeta } from "@shared/ai";
import * as api from "../api/client";
import { useCatalog } from "../stores/catalog";
import { useActivityStore } from "../stores/publish";
import { fmtNum, fmtRub, CHANNEL_TYPE_LABEL } from "../lib/format";
import type { ActivityItem } from "../api/types";
import { Btn, Card, Chip, EmptyState, SectionTitle, Sheet, Skeleton } from "../components/ui";
import { PositionDetailSheet } from "../components/PositionDetailSheet";

function CultureIcon({ type }: { type: "SEED" | "NUT" }) {
  return type === "NUT" ? <Bean size={22} /> : <Sprout size={22} />;
}

function PositionCard({ p, onOpen }: { p: PositionDTO; onOpen: () => void }) {
  return (
    <Card onClick={onOpen} className="flex items-center gap-3 p-4">
      <div
        className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${
          p.culture.type === "NUT" ? "bg-warm-soft text-warm" : "bg-accent-soft text-accent"
        }`}
      >
        <CultureIcon type={p.culture.type} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">
            {positionName(p.culture.name, p.attributes)}
          </p>
          {p.hasCertificate && (
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-accent" aria-label="Есть сертификат" />
          )}
        </div>
        <p className="mt-1 truncate text-[12px] font-medium text-soft">
          {attrSummary(p.culture.attributesSchema, p.attributes)} · мешок {fmtNum(p.bagWeightKg)} кг
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="whitespace-nowrap text-[15px] font-semibold text-ink">{fmtRub(p.salePrice)}</p>
        <p className="whitespace-nowrap text-[11px] font-medium text-soft">
          за кг · {fmtNum(p.volumeKg)} кг
        </p>
      </div>
      <ChevronRight size={16} className="shrink-0 text-soft" />
    </Card>
  );
}

function channelsWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "канал";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "канала";
  return "каналов";
}

function ActivityRow({ a }: { a: ActivityItem }) {
  const title = a.channelsCount
    ? `${a.positionName} — размещено в ${a.channelsCount} ${channelsWord(a.channelsCount)}`
    : `${a.positionName} → ${a.channelName}`;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
          a.mode === "auto" ? "bg-accent-soft text-accent" : "bg-subtle text-soft"
        }`}
      >
        {a.mode === "auto" ? <Send size={15} /> : <Wheat size={15} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-ink">{title}</p>
        <p className="text-[12px] font-medium text-soft">
          {a.channelType ? CHANNEL_TYPE_LABEL[a.channelType] : "размещение"} · {a.when} ·{" "}
          {a.mode === "auto" ? "авто через бота" : "полуавтомат"}
          {a.cities && a.cities.length > 0 && ` · Города: ${a.cities.join(", ")}`}
        </p>
      </div>
    </div>
  );
}

export function PultScreen() {
  const navigate = useNavigate();
  const activity = useActivityStore((s) => s.items);
  const { positions, loading, error, load } = useCatalog();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adviceOpen, setAdviceOpen] = useState(false);
  const [newLeads, setNewLeads] = useState<number | null>(null);
  const [advice, setAdvice] = useState<{
    loading: boolean;
    data?: AiAdviceData;
    warnings?: string[];
    meta?: AiMeta;
    error?: string;
  }>({ loading: true });

  const loadAdvice = () => {
    setAdviceOpen(true);
    setAdvice({ loading: true });
    api
      .getAiAdvice()
      .then((res) => {
        setAdvice({
          loading: false,
          data: res.data,
          warnings: res.warnings,
          meta: res.meta,
        });
      })
      .catch((err) => {
        setAdvice({
          loading: false,
          error: err instanceof Error ? err.message : "Не удалось получить подсказку",
        });
      });
  };

  useEffect(() => {
    void load();
    /* Этап 3.2: бейдж новых сообщений в шапке Пульта. */
    api
      .getTelegramStatus()
      .then((r) => setNewLeads(r.newLeads))
      .catch(() => setNewLeads(null));
  }, [load]);

  const dateStr = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(new Date());

  const opened = positions.find((p) => p.id === openId) ?? null;

  return (
    <div className="screen-rise">
      <header className="flex items-center justify-between gap-3 px-5 pt-6">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-accent-soft text-accent">
            <Sprout size={19} />
          </div>
          <span className="text-[16px] font-semibold text-ink">АгроПост</span>
        </div>
        <button
          type="button"
          onClick={() => navigate("/inbox")}
          aria-label={newLeads ? `Новых сообщений: ${newLeads}` : "Инбокс"}
          className="press relative inline-flex items-center gap-1.5 rounded-full bg-subtle px-3.5 py-2 text-[12px] font-semibold text-ink"
        >
          <Inbox size={14} />
          {newLeads !== null && newLeads > 0 ? (
            <>
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-warm px-1 text-[10px] font-bold text-white">
                {newLeads}
              </span>
              Новые: {newLeads}
            </>
          ) : null}
        </button>
        <button
          type="button"
          onClick={loadAdvice}
          className="press inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-2 text-[12px] font-semibold text-white shadow-soft"
        >
          <Sparkles size={13} />
          Что сделать?
        </button>
      </header>

      <section className="px-5 pt-5">
        <h1 className="text-[24px] font-semibold leading-snug text-ink">
          Что разместим сегодня?
        </h1>
        <p className="mt-1 text-[13px] font-medium text-soft">
          {dateStr} · позиции на складе обновлены вручную, без напоминаний
        </p>
        <div className="pt-4">
          <Btn full size="lg" onClick={() => navigate("/publish")} ariaLabel="Разместить товар">
            <Send size={18} />
            Разместить товар
          </Btn>
        </div>
      </section>

      {loading && positions.length === 0 ? (
        <section className="px-5 pt-7">
          <Skeleton className="mb-4 h-5 w-32" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[76px] w-full rounded-[20px]" />
            <Skeleton className="h-[76px] w-full rounded-[20px]" />
            <Skeleton className="h-[76px] w-full rounded-[20px]" />
          </div>
        </section>
      ) : error && positions.length === 0 ? (
        <section className="px-5 pt-7">
          <Card className="p-4">
            <p className="text-[13px] font-semibold text-warm">{error}</p>
            <div className="pt-3">
              <Btn variant="secondary" onClick={() => void load(true)}>
                Повторить
              </Btn>
            </div>
          </Card>
        </section>
      ) : (
        <section className="px-5 pt-7">
          <SectionTitle
            action={`Все (${positions.length})`}
            onAction={() => navigate("/positions")}
          >
            Позиции
          </SectionTitle>
          <div className="flex flex-col gap-3">
            {positions.slice(0, 4).map((p) => (
              <PositionCard key={p.id} p={p} onOpen={() => setOpenId(p.id)} />
            ))}
          </div>
        </section>
      )}

      {!loading && positions.length > 0 && (
        <section className="px-5 pt-7 pb-2">
          <SectionTitle>Последние размещения</SectionTitle>
          <Card className="divide-y divide-line overflow-hidden">
            {activity.map((a) => (
              <ActivityRow key={a.id} a={a} />
            ))}
          </Card>
        </section>
      )}

      {opened && (
        <PositionDetailSheet
          position={opened}
          onClose={() => setOpenId(null)}
          onChanged={() => void load(true)}
        />
      )}

      {adviceOpen && (
        <Sheet title="Что сделать?" onClose={() => setAdviceOpen(false)}>
          {advice.loading ? (
            <div className="flex flex-col gap-3 py-2">
              <Skeleton className="h-[86px] w-full rounded-[18px]" />
              <Skeleton className="h-[86px] w-full rounded-[18px]" />
            </div>
          ) : advice.error ? (
            <p className="py-3 text-[13px] font-semibold text-warm">{advice.error}</p>
          ) : advice.data && advice.data.actions.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck size={26} />}
              title="Сейчас всё под контролем"
              caption="Новых действий нет — можно отдохнуть или проверить остатки"
            />
          ) : (
            advice.data && (
              <div className="flex flex-col gap-3">
                {advice.data.actions.map((action, index) => (
                  <Card
                    key={`${action.link}-${index}`}
                    onClick={() => {
                      setAdviceOpen(false);
                      navigate(action.link);
                    }}
                    className="p-4"
                  >
                    <div className="flex items-center gap-2">
                      <Chip tone={action.priority === "high" ? "warm" : "outline"}>
                        {action.priority === "high" ? "Срочно" : "Сегодня"}
                      </Chip>
                    </div>
                    <p className="mt-2 text-[14px] font-semibold leading-snug text-ink">
                      {action.action}
                    </p>
                    <p className="mt-1 text-[12px] font-medium leading-relaxed text-soft">
                      {action.reason}
                    </p>
                    <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-accent">
                      Перейти
                      <ChevronRight size={13} />
                    </span>
                  </Card>
                ))}
                {advice.warnings && advice.warnings.length > 0 && (
                  <p className="px-1 text-[11px] font-medium text-soft">{advice.warnings[0]}</p>
                )}
                <p className="px-1 text-[11px] font-medium text-soft">
                  {advice.meta?.status === "fallback"
                    ? "Подсказка по правилам — AI недоступен"
                    : `AI · ${advice.meta?.model ?? "—"} · ${((advice.meta?.latencyMs ?? 0) / 1000).toFixed(1)} с`}
                </p>
              </div>
            )
          )}
        </Sheet>
      )}
    </div>
  );
}
