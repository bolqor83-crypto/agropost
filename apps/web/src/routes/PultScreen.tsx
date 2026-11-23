/**
 * Пульт — главный экран «тихого помощника».
 * Не дашборд: приветствие, главное действие «Разместить», позиции, лента.
 * Позиции — из API этапа 1; остатки обновляются вручную и молчат.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bean, ChevronRight, Send, ShieldCheck, Sprout, Wheat } from "lucide-react";
import { attrSummary, positionName } from "@shared/attributes";
import type { PositionDTO } from "@shared/types";
import { useCatalog } from "../stores/catalog";
import { useActivityStore } from "../stores/publish";
import { fmtNum, fmtRub } from "../lib/format";
import type { ActivityItem } from "../api/types";
import { Btn, Card, Chip, SectionTitle, Skeleton } from "../components/ui";
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

function ActivityRow({ a }: { a: ActivityItem }) {
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
        <p className="truncate text-[14px] font-semibold text-ink">
          {a.positionName} → {a.channelName}
        </p>
        <p className="text-[12px] font-medium text-soft">
          {a.channelType === "telegram" ? "Telegram" : a.channelName} · {a.when} ·{" "}
          {a.mode === "auto" ? "авто через бота" : "полуавтомат"}
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

  useEffect(() => {
    void load();
  }, [load]);

  const dateStr = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(new Date());

  const opened = positions.find((p) => p.id === openId) ?? null;

  return (
    <div className="screen-rise">
      <header className="flex items-center justify-between px-5 pt-6">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-accent-soft text-accent">
            <Sprout size={19} />
          </div>
          <span className="text-[16px] font-semibold text-ink">АгроПост</span>
        </div>
        <Chip tone="outline">{dateStr}</Chip>
      </header>

      <section className="px-5 pt-5">
        <h1 className="text-[24px] font-semibold leading-snug text-ink">
          Что разместим сегодня?
        </h1>
        <p className="mt-1 text-[13px] font-medium text-soft">
          Позиции на складе обновлены вручную, без напоминаний
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
    </div>
  );
}
