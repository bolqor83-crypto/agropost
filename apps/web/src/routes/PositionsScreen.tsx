/**
 * Позиции и остатки (этап 1).
 * Фильтр «Семена/Орехи» и поиск уходят в API (?type=, ?q=),
 * мастер создаёт позицию за 4 шага, остаток правится inline в карточке.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bean, ChevronLeft, ChevronRight, Package, Plus, Search, ShieldCheck, Sprout } from "lucide-react";
import { attrSummary, positionName } from "@shared/attributes";
import { POSITION_STATUS_LABEL } from "@shared/labels";
import type { CultureType, PositionDTO } from "@shared/types";
import * as api from "../api/client";
import { fmtNum, fmtRub } from "../lib/format";
import { useCatalog } from "../stores/catalog";
import { useToastStore } from "../stores/publish";
import {
  Btn,
  Card,
  Chip,
  EmptyState,
  Segmented,
  Skeleton,
} from "../components/ui";
import { PositionDetailSheet } from "../components/PositionDetailSheet";
import { PositionWizard } from "../components/PositionWizard";

type TypeFilter = "all" | CultureType;

function statusTone(status: PositionDTO["status"]): "green" | "warm" | "neutral" {
  if (status === "IN_STOCK") return "green";
  if (status === "ON_ORDER") return "warm";
  return "neutral";
}

function CultureIcon({ type }: { type: CultureType }) {
  return type === "NUT" ? <Bean size={22} /> : <Sprout size={22} />;
}

function PositionCard({
  p,
  onOpen,
}: {
  p: PositionDTO;
  onOpen: () => void;
}) {
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
        <div className="mt-1.5 flex items-center gap-2">
          <Chip tone={statusTone(p.status)}>{POSITION_STATUS_LABEL[p.status]}</Chip>
          <span className="text-[11px] font-medium text-soft">{p.supplier.name}</span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="whitespace-nowrap text-[15px] font-semibold text-ink">{fmtRub(p.salePrice)}</p>
        <p className="whitespace-nowrap text-[11px] font-medium text-soft">за кг · {fmtNum(p.volumeKg)} кг</p>
      </div>
      <ChevronRight size={16} className="shrink-0 text-soft" />
    </Card>
  );
}

export function PositionsScreen() {
  const navigate = useNavigate();
  const refreshCatalog = useCatalog((s) => s.load);
  const showToast = useToastStore((s) => s.show);

  const [type, setType] = useState<TypeFilter>("all");
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [items, setItems] = useState<PositionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const reloadSeq = useRef(0);

  /* Поиск — с debounce 300 мс */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const fetchList = useCallback(async () => {
    const seq = ++reloadSeq.current;
    setLoading(true);
    setError(null);
    try {
      const rows = await api.listPositions({
        type: type === "all" ? undefined : type,
        ...(debouncedQ ? { q: debouncedQ } : {}),
      });
      if (seq === reloadSeq.current) setItems(rows);
    } catch (err) {
      if (seq === reloadSeq.current) {
        setError(err instanceof Error ? err.message : "Не удалось загрузить позиции");
      }
    } finally {
      if (seq === reloadSeq.current) setLoading(false);
    }
  }, [type, debouncedQ]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const opened = items.find((p) => p.id === openId) ?? null;

  const applyChange = (updated: PositionDTO | null) => {
    if (updated) {
      setItems((rows) => rows.map((p) => (p.id === updated.id ? updated : p)));
    }
  };

  return (
    <div className="screen-rise">
      <header className="flex items-center gap-3 px-5 pt-6 pb-2">
        <button
          type="button"
          aria-label="Назад"
          onClick={() => navigate("/more")}
          className="press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-subtle text-soft"
        >
          <ChevronLeft size={19} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-semibold leading-tight text-ink">Позиции и остатки</h1>
          <p className="text-[12px] font-medium text-soft">
            {loading ? "загружаю…" : `${items.length} позиций · остатки правятся вручную`}
          </p>
        </div>
        <Btn onClick={() => setWizardOpen(true)} ariaLabel="Добавить позицию">
          <Plus size={16} />
        </Btn>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        <Segmented<TypeFilter>
          items={[
            { value: "all", label: "Все" },
            { value: "SEED", label: "Семена" },
            { value: "NUT", label: "Орехи" },
          ]}
          value={type}
          onChange={setType}
        />

        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-soft" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск: культура или сорт"
            aria-label="Поиск позиций"
            className="w-full rounded-full border border-line bg-surface py-2.5 pl-10 pr-4 text-[14px] font-medium text-ink placeholder:text-soft/60 outline-none transition-colors focus:border-accent"
          />
        </div>
      </div>

      <section className="px-5 pt-4 pb-2">
        {error && (
          <Card className="mb-3 p-4">
            <p className="text-[13px] font-semibold text-warm">{error}</p>
            <div className="pt-3">
              <Btn variant="secondary" onClick={() => void fetchList()}>
                Повторить
              </Btn>
            </div>
          </Card>
        )}

        {loading && items.length === 0 ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[104px] w-full rounded-[20px]" />
            <Skeleton className="h-[104px] w-full rounded-[20px]" />
            <Skeleton className="h-[104px] w-full rounded-[20px]" />
          </div>
        ) : items.length === 0 && !error ? (
          <Card>
            <EmptyState
              icon={<Package size={26} />}
              title={debouncedQ ? "Ничего не нашлось" : "Позиций пока нет"}
              caption={
                debouncedQ
                  ? "Попробуйте другое слово: культура или сорт"
                  : "Создайте первую позицию: поставщик, культура, атрибуты и цена"
              }
            />
            {!debouncedQ && (
              <div className="px-5 pb-5">
                <Btn full size="lg" onClick={() => setWizardOpen(true)}>
                  <Plus size={17} />
                  Добавить позицию
                </Btn>
              </div>
            )}
          </Card>
        ) : (
          <div className="stagger-children flex flex-col gap-3">
            {items.map((p) => (
              <PositionCard key={p.id} p={p} onOpen={() => setOpenId(p.id)} />
            ))}
          </div>
        )}
      </section>

      {opened && (
        <PositionDetailSheet
          position={opened}
          onClose={() => setOpenId(null)}
          onChanged={applyChange}
        />
      )}

      {wizardOpen && (
        <PositionWizard
          onClose={() => setWizardOpen(false)}
          onCreated={(pos) => {
            void fetchList();
            void refreshCatalog(true);
            showToast(`Позиция «${positionName(pos.culture.name, pos.attributes)}» создана`);
          }}
        />
      )}
    </div>
  );
}
