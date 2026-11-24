/**
 * Сделки (этап 4) — список с фильтрами и экономикой на каждой карточке:
 * номер, покупатель, культура, объём, статус, выручка и маржа (мелко,
 * зелёным если > 0). Кнопки «создать сделку» из лида/позиции открывают
 * сюда форму с предзаполнением (stores/deal-create).
 */

import { useCallback, useEffect, useState } from "react";
import { Handshake, Plus, Search } from "lucide-react";
import { DEAL_STATUS_LABEL } from "@shared/labels";
import type { DealDetailDTO } from "@shared/types";
import * as api from "../api/client";
import { useDealCreateStore } from "../stores/deal-create";
import { useToastStore } from "../stores/publish";
import { dealStatusTone, fmtNum, fmtRub, fmtWhen } from "../lib/format";
import { Btn, Card, Chip, EmptyState, ScreenHeader, Segmented, Skeleton, TextInput } from "../components/ui";
import { DealDetailSheet } from "../components/DealDetailSheet";
import { DealFormSheet } from "../components/DealFormSheet";

type DealFilter = "all" | "active" | "finished" | "cancelled";

const FILTER_STATUS: Record<Exclude<DealFilter, "all">, api.DealListStatus> = {
  active: "ACTIVE",
  finished: "FINISHED",
  cancelled: "CANCELLED",
};

function DealCard({ deal, onOpen }: { deal: DealDetailDTO; onOpen: () => void }) {
  return (
    <Card onClick={onOpen} className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-ink">
            {deal.positionName ?? "Товар без позиции"}
          </p>
          <p className="mt-0.5 truncate text-[12px] font-medium text-soft">
            {deal.buyerName} · {deal.buyerRegion}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Chip tone={dealStatusTone(deal.status)}>{DEAL_STATUS_LABEL[deal.status]}</Chip>
          <span className="text-[11px] font-medium text-soft">{deal.number}</span>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="text-[12px] font-medium text-soft">
            {fmtNum(deal.volumeKg)} кг · {fmtRub(deal.salePrice)} / кг
          </p>
          <p className="text-[15px] font-semibold text-ink">{fmtRub(deal.revenue)}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-medium text-soft">маржа после налога</p>
          <p
            className={`text-[15px] font-semibold ${deal.margin > 0 ? "text-accent" : deal.margin < 0 ? "text-warm" : "text-soft"}`}
          >
            {fmtRub(deal.margin)}
          </p>
        </div>
      </div>
      <p className="mt-2 text-[11px] font-medium text-soft">обновлена {fmtWhen(deal.updatedAt)}</p>
    </Card>
  );
}

export function DealsScreen() {
  const showToast = useToastStore((s) => s.show);
  const pending = useDealCreateStore((s) => s.pending);
  const clearPending = useDealCreateStore((s) => s.clear);
  const [filter, setFilter] = useState<DealFilter>("all");
  const [query, setQuery] = useState("");
  const [deals, setDeals] = useState<DealDetailDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      const status = filter === "all" ? undefined : FILTER_STATUS[filter];
      api
        .listDeals({ status, q: query })
        .then((r) => {
          setDeals(r.items);
          setError(null);
        })
        .catch((err) =>
          setError(err instanceof Error ? err.message : "Не удалось загрузить сделки"),
        )
        .finally(() => setLoading(false));
    },
    [filter, query],
  );

  useEffect(() => {
    void load();
  }, [load]);

  /* Предзаполнение из лида/позиции: открываем форму один раз. */
  useEffect(() => {
    if (pending) setFormOpen(true);
  }, [pending]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? deals.filter(
        (d) =>
          d.number.toLowerCase().includes(q) ||
          d.buyerName.toLowerCase().includes(q) ||
          (d.positionName ?? "").toLowerCase().includes(q),
      )
    : deals;

  const activeCount = deals.filter(
    (d) => !["CLOSED", "CANCELLED"].includes(d.status),
  ).length;

  const opened = openId ? deals.find((d) => d.id === openId) ?? null : null;

  return (
    <div className="screen-rise">
      <ScreenHeader
        title="Сделки"
        caption="Отправка — после полной оплаты · доставку оплачивает покупатель"
      />

      <div className="px-5">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-soft" />
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по номеру, покупателю, товару"
            aria-label="Поиск в сделках"
            className="pl-9"
          />
        </div>
        <div className="pt-3">
          <Segmented<DealFilter>
            items={[
              { value: "all", label: `Все · ${deals.length}` },
              { value: "active", label: activeCount > 0 ? `В работе · ${activeCount}` : "В работе" },
              { value: "finished", label: "Завершены" },
              { value: "cancelled", label: "Отменены" },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </div>
      </div>

      <section className="px-5 pt-4 pb-2">
        {loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[124px] w-full rounded-[20px]" />
            <Skeleton className="h-[124px] w-full rounded-[20px]" />
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
              icon={<Handshake size={26} />}
              title={q || filter !== "all" ? "Ничего не нашлось" : "Сделок пока нет"}
              caption={
                q || filter !== "all"
                  ? "Попробуйте другой фильтр или очистите поиск"
                  : "Создайте первую сделку из лида или позиции — экономика посчитается автоматически"
              }
            />
            {!q && filter === "all" && (
              <div className="px-5 pb-5">
                <Btn full size="lg" onClick={() => setFormOpen(true)}>
                  <Plus size={17} />
                  Создать сделку
                </Btn>
              </div>
            )}
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((d) => (
              <DealCard key={d.id} deal={d} onOpen={() => setOpenId(d.id)} />
            ))}
          </div>
        )}
      </section>

      {/* FAB: новая сделка */}
      <button
        type="button"
        aria-label="Новая сделка"
        onClick={() => setFormOpen(true)}
        className="press fixed right-5 bottom-[calc(env(safe-area-inset-bottom)+88px)] z-40 inline-flex h-14 items-center gap-2 rounded-full bg-accent px-5 text-[15px] font-semibold text-white shadow-soft"
      >
        <Plus size={18} />
        Новая сделка
      </button>

      {opened && (
        <DealDetailSheet
          deal={opened}
          onClose={() => setOpenId(null)}
          onChanged={() => void load(true)}
          onNeedProfile={() => showToast("Сначала заполните реквизиты в «Ещё» → «Реквизиты»")}
        />
      )}

      {formOpen && (
        <DealFormSheet
          prefill={pending ?? undefined}
          onClose={() => {
            setFormOpen(false);
            clearPending();
          }}
          onCreated={() => {
            setFormOpen(false);
            clearPending();
            void load(true);
            showToast("Сделка создана — это черновик");
          }}
        />
      )}
    </div>
  );
}
