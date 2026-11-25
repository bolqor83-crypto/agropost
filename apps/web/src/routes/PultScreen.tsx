/**
 * Пульт — главный экран «тихого помощника».
 * Не дашборд: приветствие, главное действие «Разместить», позиции, лента.
 * Позиции — из API этапа 1; остатки обновляются вручную и молчат.
 */

import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Bean, ChevronRight, Handshake, Inbox, IdCard, Send, ShieldCheck, Sparkles, Sprout, TrendingUp, Wheat } from "lucide-react";
import { attrSummary, positionName } from "@shared/attributes";
import type { PositionDTO } from "@shared/types";
import type { AiAdviceData, AiMeta } from "@shared/ai";
import type { AnalyticsSummaryDTO } from "@shared/types";
import * as api from "../api/client";
import { useCatalog } from "../stores/catalog";
import { useActivityStore } from "../stores/publish";
import { fmtNum, fmtRub, CHANNEL_TYPE_LABEL } from "../lib/format";
import type { ActivityItem } from "../api/types";
import { Btn, Card, Chip, EmptyState, SectionTitle, Sheet, Skeleton } from "../components/ui";
import { NumberAnimated } from "../components/NumberAnimated";
import { PositionDetailSheet } from "../components/PositionDetailSheet";
import { dismissTip, shouldShowWelcomeTip, tipDismissed, type RequisitesLike } from "../lib/tips";

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

/** Карточка-показатель аналитики (этап 5): клик → экран «Аналитика».
 *  ЭТАП 8: значение — NumberAnimated (count-up) + вспышка при появлении. */
function StatCard({
  icon,
  label,
  value,
  hint,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <Card onClick={onClick} className="min-w-0 flex-1 p-3.5">
      <div className="flex items-center gap-1.5 text-soft">
        {icon}
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide">{label}</p>
      </div>
      <p className="value-flash mt-1.5 truncate rounded-[8px] text-[17px] font-bold text-ink">{value}</p>
      {/* Полиш 26.11.2026: сноска переносится, а не режется «после первых…»
          на узких карточках (390px, три в ряд). */}
      {hint && <p className="text-[11px] font-medium leading-snug text-soft">{hint}</p>}
    </Card>
  );
}

function AnalyticsCards({
  summary,
  loading,
  activeDeals,
  onOpen,
}: {
  summary: AnalyticsSummaryDTO | null;
  loading: boolean;
  activeDeals: number | null;
  onOpen: () => void;
}) {
  if (loading) {
    return (
      <div className="flex gap-3">
        <Skeleton className="h-[86px] flex-1 rounded-[20px]" />
        <Skeleton className="h-[86px] flex-1 rounded-[20px]" />
        <Skeleton className="h-[86px] flex-1 rounded-[20px]" />
      </div>
    );
  }
  const margin = summary ? <NumberAnimated value={summary.margin} format={fmtRub} /> : "—";
  const marginHint =
    summary && summary.dealsClosed > 0 ? `${summary.dealsClosed} закр. за неделю` : "после первых сделок";
  return (
    <div className="flex gap-3">
      <StatCard
        icon={<TrendingUp size={13} />}
        label="Маржа · неделя"
        value={margin}
        hint={marginHint}
        onClick={onOpen}
      />
      <StatCard
        icon={<Handshake size={13} />}
        label="Активные"
        value={
          activeDeals !== null ? (
            <NumberAnimated value={activeDeals} duration={400} />
          ) : (
            "—"
          )
        }
        hint="сделок в работе"
        onClick={onOpen}
      />
      <StatCard
        icon={<Inbox size={13} />}
        label="Лиды"
        value={
          summary ? (
            <NumberAnimated value={summary.newLeadsToday} duration={400} />
          ) : (
            "—"
          )
        }
        hint="новых сегодня"
        onClick={onOpen}
      />
    </div>
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

/** ЭТАП 7: мягкий приветственный баннер при пустых реквизитах. */
function WelcomeBanner({
  onFill,
  onLater,
}: {
  onFill: () => void;
  onLater: () => void;
}) {
  return (
    <Card className="fade-in-soft flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <Sparkles size={18} className="mt-0.5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-ink">Добро пожаловать!</p>
          <p className="mt-0.5 text-[12px] font-medium leading-relaxed text-soft">
            Начните с заполнения реквизитов — без них не сформировать счёт,
            договор и УПД для покупателя
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <Btn full size="lg" onClick={onFill}>
            <IdCard size={16} />
            Заполнить реквизиты
          </Btn>
        </div>
        <Btn size="lg" variant="ghost" onClick={onLater}>
          Позже
        </Btn>
      </div>
    </Card>
  );
}

export function PultScreen() {
  const navigate = useNavigate();
  const activity = useActivityStore((s) => s.items);
  const { positions, loading, error, load } = useCatalog();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adviceOpen, setAdviceOpen] = useState(false);
  const [newLeads, setNewLeads] = useState<number | null>(null);
  const [activeDeals, setActiveDeals] = useState<number | null>(null);
  const [weekSummary, setWeekSummary] = useState<AnalyticsSummaryDTO | null>(null);
  const [weekLoading, setWeekLoading] = useState(true);
  const [advice, setAdvice] = useState<{
    loading: boolean;
    data?: AiAdviceData;
    warnings?: string[];
    meta?: AiMeta;
    error?: string;
  }>({ loading: true });

  /* ЭТАП 7: реквизиты для приветственного баннера (пустые → подсказка). */
  const [requisites, setRequisites] = useState<RequisitesLike | null | undefined>(undefined);
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => tipDismissed("welcome"));

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
    /* Этап 4: счётчик активных сделок в шапке. */
    api
      .listDeals({ status: "ACTIVE" })
      .then((r) => setActiveDeals(r.items.length))
      .catch(() => setActiveDeals(null));
    /* Этап 5: карточки аналитики за неделю (тихо, без блокировки). */
    api
      .getAnalyticsSummary("week")
      .then((r) => setWeekSummary(r))
      .catch(() => setWeekSummary(null))
      .finally(() => setWeekLoading(false));
    /* ЭТАП 7: реквизиты — показать баннер, только если пустые. */
    api
      .getUserProfile()
      .then((p) => setRequisites(p ?? null))
      .catch(() => setRequisites(null));
  }, [load]);

  const dateStr = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(new Date());

  const opened = positions.find((p) => p.id === openId) ?? null;

  const showWelcome =
    requisites !== undefined &&
    shouldShowWelcomeTip(requisites, welcomeDismissed);

  return (
    <div className="screen-rise">
      {/* Шапка: на 375px кнопки переносятся на вторую строку — без обрезки. */}
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 pt-6">
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
          onClick={() => navigate("/deals")}
          aria-label={activeDeals !== null ? `Активные сделки: ${activeDeals}` : "Сделки"}
          className="press inline-flex items-center gap-1.5 rounded-full bg-subtle px-3.5 py-2 text-[12px] font-semibold text-ink"
        >
          <Handshake size={14} />
          {activeDeals !== null ? `Сделки: ${activeDeals}` : "Сделки"}
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
          <Btn full size="lg" className="btn-gradient" onClick={() => navigate("/publish")} ariaLabel="Разместить товар">
            <Send size={18} />
            Разместить товар
          </Btn>
        </div>
      </section>

      {/* ЭТАП 7: приветственный баннер — только при пустых реквизитах. */}
      {showWelcome && (
        <section className="px-5 pt-4" aria-label="Приветственная подсказка">
          <WelcomeBanner
            onFill={() => navigate("/profile")}
            onLater={() => {
              dismissTip("welcome");
              setWelcomeDismissed(true);
            }}
          />
        </section>
      )}

      {/* Этап 5: карточки аналитики → экран «Аналитика». */}
      <section className="px-5 pt-6">
        <AnalyticsCards
          summary={weekSummary}
          loading={weekLoading}
          activeDeals={activeDeals}
          onOpen={() => navigate("/analytics")}
        />
        {weekSummary === null && !weekLoading && (
          <button
            type="button"
            onClick={() => navigate("/analytics")}
            className="press mt-2 flex w-full items-center justify-center gap-1 text-[12px] font-semibold text-accent"
          >
            <TrendingUp size={13} />
            Аналитика
            <ChevronRight size={12} />
          </button>
        )}
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
          <div className="stagger-children flex flex-col gap-3">
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
