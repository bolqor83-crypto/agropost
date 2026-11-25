/**
 * Аналитика (этап 5): простые факты по запросу — без графиков.
 * Три вкладки: Сводка (период неделя/месяц/всё время), Каналы, Позиции.
 * Если закрытых сделок < 3 — мягкое «данных пока мало».
 *
 * Этап 5.1: CSV собирается в браузере через lib/csv (защита от
 * formula injection), подписчики и охват — отдельные показатели,
 * дни наличия — от stockSince (null → «неизвестно»).
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Download, TrendingUp } from "lucide-react";
import type {
  AnalyticsChannelRow,
  AnalyticsPeriod,
  AnalyticsPositionRow,
  AnalyticsSummaryDTO,
} from "@shared/types";
import * as api from "../api/client";
import { fmtNum, fmtRub, CHANNEL_TYPE_LABEL } from "../lib/format";
import { downloadCsv, toCsv } from "../lib/csv";
import { Btn, Card, Chip, EmptyState, ScreenHeader, Segmented, Skeleton } from "../components/ui";
import { NumberAnimated } from "../components/NumberAnimated";

const PERIOD_ITEMS: { value: AnalyticsPeriod; label: string }[] = [
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "all", label: "Всё время" },
];

const PERIOD_CAPTION: Record<AnalyticsPeriod, string> = {
  week: "последние 7 дней",
  month: "последние 31 день",
  all: "за всё время",
};

/* ---------- CSV: с защитой от formula injection (lib/csv) ---------- */

/* ---------- Вкладка «Сводка» ---------- */

function SummaryView({ data, period }: { data: AnalyticsSummaryDTO; period: AnalyticsPeriod }) {
  return (
    <div className="flex flex-col gap-3">
      {data.lowData && (
        <Card className="flex items-start gap-3 p-4">
          <TrendingUp size={18} className="mt-0.5 shrink-0 text-accent" />
          <div>
            <p className="text-[13px] font-semibold text-ink">
              Данных пока мало, аналитика появится после первых сделок
            </p>
            <p className="mt-0.5 text-[12px] font-medium leading-relaxed text-soft">
              Закрытых сделок за {PERIOD_CAPTION[period]} — {data.dealsClosed}. Числа ниже
              посчитаны честно, но выборка ещё маленькая.
            </p>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="grid grid-cols-2 gap-y-1">
          <SummaryCell label="Выручка" value={<NumberAnimated value={data.revenue} format={fmtRub} />} />
          <SummaryCell label="Маржа" value={<NumberAnimated value={data.margin} format={fmtRub} />} accent />
          {/* Полиш 26.11.2026: составная метрика — на всю ширину, иначе на 390px
              обрезалась многоточием «0 (0 закр. · 0…» в узкой колонке. */}
          <SummaryCell
            wide
            label="Сделок"
            value={`${data.dealsTotal} (${data.dealsClosed} закр. · ${data.dealsActive} акт.)`}
          />
          <SummaryCell label="Средний чек" value={data.averageCheck !== null ? <NumberAnimated value={data.averageCheck} format={fmtRub} /> : "—"} />
        </div>
      </Card>

      <Card className="p-4">
        <p className="text-[14px] font-semibold text-ink">Лиды и конверсия</p>
        <div className="grid grid-cols-2 gap-y-1">
          <SummaryCell label="Лидов за период" value={<NumberAnimated value={data.leadsTotal} />} />
          <SummaryCell label="Стали сделками" value={<NumberAnimated value={data.leadsConverted} />} />
          <SummaryCell
            label="Конверсия"
            value={
              data.conversion !== null ? (
                <NumberAnimated value={data.conversion} format={(n) => `${n}%`} duration={450} />
              ) : (
                "—"
              )
            }
            accent
          />
          <SummaryCell label="Новых сегодня" value={<NumberAnimated value={data.newLeadsToday} />} />
        </div>
      </Card>

      <Card className="p-4">
        <p className="text-[14px] font-semibold text-ink">Топ культур по марже</p>
        {data.topCultures.length === 0 ? (
          <p className="pt-1 text-[12px] font-medium text-soft">Пока нет закрытых сделок</p>
        ) : (
          <div className="flex flex-col gap-2 pt-2">
            {data.topCultures.map((c, i) => (
              <div key={c.name} className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                  {i + 1}. {c.name}
                </p>
                <Chip tone="green">{fmtRub(c.margin)}</Chip>
                <span className="shrink-0 text-[11px] font-medium text-soft">{c.dealsCount} сд.</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <p className="text-[14px] font-semibold text-ink">Топ каналов по лидам</p>
        {data.topChannels.length === 0 ? (
          <p className="pt-1 text-[12px] font-medium text-soft">Лидов с привязкой к каналу пока нет</p>
        ) : (
          <div className="flex flex-col gap-2 pt-2">
            {data.topChannels.map((c, i) => (
              <div key={c.name} className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                  {i + 1}. {c.name}
                </p>
                <Chip tone="neutral">{c.leads} лид.</Chip>
                <span className="shrink-0 text-[11px] font-medium text-soft">{c.deals} сд.</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function SummaryCell({
  label,
  value,
  accent = false,
  wide = false,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
  /** Занять обе колонки — для составных значений («Сделок (… закр. · … акт.)»). */
  wide?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 pr-2 ${wide ? "col-span-2" : ""}`}>
      <span className="shrink-0 text-[12px] font-medium text-soft">{label}</span>
      <span
        className={`truncate text-right text-[13px] font-semibold ${accent ? "text-accent" : "text-ink"}`}
      >
        {value}
      </span>
    </div>
  );
}

/* ---------- Вкладка «Каналы» ---------- */

function ChannelsView({
  rows,
  onExport,
}: {
  rows: AnalyticsChannelRow[];
  onExport: () => void;
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<TrendingUp size={26} />}
          title="Каналов пока нет"
          caption="Добавьте каналы в разделе «Каналы» — аналитика появится сразу"
        />
      </Card>
    );
  }
  return (
    <Card className="divide-y divide-line overflow-hidden">
      {rows.map((c) => (
        <div key={c.id} className="px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{c.name}</p>
            <Chip tone="neutral">{CHANNEL_TYPE_LABEL[c.type] ?? c.type}</Chip>
          </div>
          {/* Подписчики и фактический охват — разные показатели (этап 5.1). */}
          <p className="mt-0.5 truncate text-[12px] font-medium text-soft">
            {c.region}
            {c.city ? ` · ${c.city}` : ""} · подписчики{" "}
            {c.subscribersCount !== null ? fmtNum(c.subscribersCount) : "—"} · ср. охват{" "}
            {c.averageReach !== null ? fmtNum(c.averageReach) : "неизвестен"}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-medium text-soft">
            <span>
              Размещений <b className="font-semibold text-ink">{c.listings}</b> · выходов{" "}
              <b className="font-semibold text-ink">{c.publications}</b>
            </span>
            <span>
              Лидов <b className="font-semibold text-ink">{c.leads}</b> → сделок{" "}
              <b className="font-semibold text-ink">{c.deals}</b>
              {c.conversion !== null && ` · ${c.conversion}%`}
            </span>
            <span>
              Ср. маржа{" "}
              <b className="font-semibold text-accent">{c.avgMargin !== null ? fmtRub(c.avgMargin) : "—"}</b>
            </span>
            <span>
              {c.lastPublishedAt
                ? `последняя публикация ${c.daysSincePublication ?? 0} дн. назад`
                : "не публиковали"}
            </span>
          </div>
        </div>
      ))}
      <div className="px-4 py-3">
        <Btn variant="secondary" full onClick={onExport}>
          <Download size={16} />
          Экспорт в CSV
        </Btn>
      </div>
    </Card>
  );
}

/* ---------- Вкладка «Позиции» ---------- */

function PositionsView({
  rows,
  onExport,
}: {
  rows: AnalyticsPositionRow[];
  onExport: () => void;
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<TrendingUp size={26} />}
          title="Позиций пока нет"
          caption="Создайте позиции в «Позиции и остатки» — появятся метрики по товару"
        />
      </Card>
    );
  }
  return (
    <Card className="divide-y divide-line overflow-hidden">
      {rows.map((p) => (
        <div key={p.id} className="px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{p.title}</p>
            <Chip tone={p.status === "IN_STOCK" ? "green" : p.status === "ON_ORDER" ? "neutral" : "warm"}>
              {fmtNum(p.volumeKg)} кг
            </Chip>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-medium text-soft">
            <span>
              Сделок <b className="font-semibold text-ink">{p.dealsCount}</b>
            </span>
            <span>
              Выручка <b className="font-semibold text-ink">{fmtRub(p.revenue)}</b>
            </span>
            <span>
              Маржа <b className="font-semibold text-accent">{fmtRub(p.margin)}</b>
            </span>
            <span>
              Ср. цена{" "}
              <b className="font-semibold text-ink">
                {p.avgSalePrice !== null ? `${fmtNum(p.avgSalePrice)} ₽/кг` : "—"}
              </b>
            </span>
            <span>
              {p.daysInStock !== null
                ? `${p.daysInStock} дн. в наличии`
                : "дней в наличии — неизвестно"}{" "}
              · {p.lastPublishedAt ? "публиковалась" : "без публикаций"}
            </span>
          </div>
        </div>
      ))}
      <div className="px-4 py-3">
        <Btn variant="secondary" full onClick={onExport}>
          <Download size={16} />
          Экспорт в CSV
        </Btn>
      </div>
    </Card>
  );
}

/* ---------- Экран ---------- */

type Tab = "summary" | "channels" | "positions";

export function AnalyticsScreen() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("summary");
  const [period, setPeriod] = useState<AnalyticsPeriod>("week");
  const [summary, setSummary] = useState<AnalyticsSummaryDTO | null>(null);
  const [channels, setChannels] = useState<AnalyticsChannelRow[] | null>(null);
  const [positions, setPositions] = useState<AnalyticsPositionRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getAnalyticsSummary(period)
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : "Аналитика недоступна"))
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(() => {
    if (tab === "channels" && channels === null) {
      api
        .getAnalyticsChannels("margin")
        .then((r) => setChannels(r.items))
        .catch(() => setChannels([]));
    }
    if (tab === "positions" && positions === null) {
      api
        .getAnalyticsPositions("margin")
        .then((r) => setPositions(r.items))
        .catch(() => setPositions([]));
    }
  }, [tab, channels, positions]);

  const exportChannelsCsv = useCallback(() => {
    if (!channels) return;
    const csv = toCsv(
      ["Канал", "Тип", "Регион", "Город", "Подписчики", "Ср. факт. охват", "Размещений", "Выходов", "Лидов", "Сделок", "Конверсия %", "Ср. маржа ₽", "Последняя публикация", "Дней назад"],
      channels.map((c) => [
        c.name,
        CHANNEL_TYPE_LABEL[c.type] ?? c.type,
        c.region,
        c.city ?? "",
        c.subscribersCount ?? "—",
        c.averageReach ?? "неизвестен",
        c.listings,
        c.publications,
        c.leads,
        c.deals,
        c.conversion ?? "",
        c.avgMargin ?? "",
        c.lastPublishedAt ?? "не публиковали",
        c.daysSincePublication ?? "",
      ]),
    );
    downloadCsv("agropost-каналы.csv", csv);
  }, [channels]);

  const exportPositionsCsv = useCallback(() => {
    if (!positions) return;
    const csv = toCsv(
      ["Позиция", "Культура", "Остаток кг", "Статус", "Сделок", "Выручка ₽", "Маржа ₽", "Ср. цена ₽/кг (взвеш.)", "Дней в наличии", "Последняя публикация"],
      positions.map((p) => [
        p.title,
        p.cultureName,
        p.volumeKg,
        p.status,
        p.dealsCount,
        p.revenue,
        p.margin,
        p.avgSalePrice ?? "",
        p.daysInStock ?? "неизвестно",
        p.lastPublishedAt ?? "без публикаций",
      ]),
    );
    downloadCsv("agropost-позиции.csv", csv);
  }, [positions]);

  const exportSummaryCsv = useCallback(() => {
    if (!summary) return;
    const csv = toCsv(
      ["Показатель", `Значение (${PERIOD_CAPTION[period]})`],
      [
        ["Выручка, ₽", summary.revenue],
        ["Маржа, ₽", summary.margin],
        ["Сделок всего", summary.dealsTotal],
        ["Сделок закрытых", summary.dealsClosed],
        ["Сделок активных", summary.dealsActive],
        ["Средний чек, ₽", summary.averageCheck ?? "—"],
        ["Лидов за период", summary.leadsTotal],
        ["Лидов стало сделками", summary.leadsConverted],
        ["Конверсия, %", summary.conversion ?? "—"],
        ["Новых лидов сегодня", summary.newLeadsToday],
        ...summary.topCultures.map((c) => [`Топ культура: ${c.name}`, `${c.margin} ₽ · ${c.dealsCount} сд.`]),
        ...summary.topChannels.map((c) => [`Топ канал: ${c.name}`, `${c.leads} лид. · ${c.deals} сд.`]),
      ],
    );
    downloadCsv(`agropost-сводка-${period}.csv`, csv);
  }, [summary, period]);

  const tabItems = useMemo(
    () => [
      { value: "summary" as Tab, label: "Сводка" },
      { value: "channels" as Tab, label: "Каналы" },
      { value: "positions" as Tab, label: "Позиции" },
    ],
    [],
  );

  return (
    <div className="screen-rise">
      <ScreenHeader title="Аналитика" caption="Простые факты по запросу — без графиков" back="/more" />

      <section className="px-5 pb-6">
        <div className="flex flex-col gap-3">
          <Segmented items={PERIOD_ITEMS} value={period} onChange={setPeriod} />
          <Segmented items={tabItems} value={tab} onChange={setTab} />

          {loading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-[120px] w-full rounded-[20px]" />
              <Skeleton className="h-[92px] w-full rounded-[20px]" />
            </div>
          ) : error ? (
            <Card className="p-4">
              <p className="text-[13px] font-semibold text-warm">{error}</p>
              <div className="pt-3">
                <Btn variant="secondary" onClick={() => setPeriod("week")}>
                  Повторить
                </Btn>
              </div>
            </Card>
          ) : (
            /* ЭТАП 8: смена периода — мягкий fade контента 200ms (remount по key). */
            <div key={period} className="fade-in-soft flex flex-col gap-3">
              {tab === "summary" ? (
                summary && <SummaryView data={summary} period={period} />
              ) : tab === "channels" ? (
                channels !== null && (
                  <ChannelsView rows={channels} onExport={exportChannelsCsv} />
                )
              ) : positions !== null ? (
                <PositionsView rows={positions} onExport={exportPositionsCsv} />
              ) : (
                <Skeleton className="h-[92px] w-full rounded-[20px]" />
              )}

              {tab === "summary" && summary !== null && !loading && (
                <Btn variant="secondary" full onClick={exportSummaryCsv}>
                  <Download size={16} />
                  Экспорт в CSV
                </Btn>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => navigate("/more")}
            className="press mx-auto pt-1 text-[12px] font-semibold text-soft"
          >
            ← Назад в «Ещё»
          </button>
        </div>
      </section>
    </div>
  );
}
