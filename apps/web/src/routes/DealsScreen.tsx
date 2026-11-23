/**
 * Сделки — карточки сделок с маржой и стадиями.
 * Маржа = (продажа − закуп) × кол-во − налог; доставка за счёт покупателя
 * и в маржу не входит. Этап 4 добавит создание сделки и документы.
 */

import { useEffect, useState } from "react";
import { Handshake, Package, Truck } from "lucide-react";
import { positionName } from "@shared/attributes";
import { calcMargin } from "@shared/pricing";
import { SHIPPING_MODE_LABEL, SUPPLIER_LOCATION_LABEL } from "@shared/labels";
import type { PositionDTO } from "@shared/types";
import { DEALS } from "../features/deals/deals.mock";
import { DEAL_STAGE_LABEL, DEAL_STAGE_ORDER, fmtNum, fmtRub } from "../lib/format";
import { taxRateOf, useCatalog } from "../stores/catalog";
import type { Deal, DealStage } from "../api/types";
import { Card, Chip, EmptyState, InfoRow, ScreenHeader, Segmented, Sheet } from "../components/ui";

type DealFilter = "all" | "active" | "done";

const ACTIVE_STAGES: DealStage[] = ["talks", "awaiting_payment", "paid", "shipping"];

function stageTone(stage: DealStage): "neutral" | "green" | "warm" {
  if (stage === "awaiting_payment") return "warm";
  if (stage === "done") return "neutral";
  return "green";
}

function StageTimeline({ stage }: { stage: DealStage }) {
  const idx = DEAL_STAGE_ORDER.indexOf(stage);
  return (
    <div className="flex items-center gap-1" aria-label="Стадии сделки">
      {DEAL_STAGE_ORDER.map((s, i) => (
        <div
          key={s}
          className={`h-1.5 flex-1 rounded-full ${i <= idx ? "bg-accent" : "bg-line"}`}
          title={DEAL_STAGE_LABEL[s]}
        />
      ))}
    </div>
  );
}

export function DealsScreen() {
  const [filter, setFilter] = useState<DealFilter>("all");
  const [openDeal, setOpenDeal] = useState<string | null>(null);
  const { positions, load } = useCatalog();
  const user = useCatalog((s) => s.user);

  useEffect(() => {
    void load();
  }, [load]);

  const byId = new Map(positions.map((p) => [p.id, p]));

  const visible = DEALS.filter((d) => byId.has(d.positionId));
  const filtered = visible.filter((d) =>
    filter === "all"
      ? true
      : filter === "active"
        ? ACTIVE_STAGES.includes(d.stage)
        : d.stage === "done",
  );
  const deal = openDeal ? visible.find((d) => d.id === openDeal) ?? null : null;

  const marginOf = (d: Deal, p: PositionDTO) =>
    calcMargin(p.salePrice, p.supplierPrice, d.bags * p.bagWeightKg, taxRateOf(user));

  return (
    <div className="screen-rise">
      <ScreenHeader title="Сделки" caption="Отправка — только после полной оплаты" />
      <div className="px-5">
        <Segmented<DealFilter>
          items={[
            { value: "all", label: `Все · ${visible.length}` },
            { value: "active", label: "В работе" },
            { value: "done", label: "Завершены" },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>

      <section className="px-5 pt-5 pb-2">
        {filtered.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Handshake size={26} />}
              title="Завершённых сделок пока нет"
              caption="Когда покупатель получит товар и сделка закроется, она появится здесь"
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((d) => {
              const p = byId.get(d.positionId)!;
              const m = marginOf(d, p);
              return (
                <Card key={d.id} onClick={() => setOpenDeal(d.id)} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-ink">
                        {positionName(p.culture.name, p.attributes)}
                      </p>
                      <p className="mt-0.5 truncate text-[12px] font-medium text-soft">{d.buyer}</p>
                    </div>
                    <Chip tone={stageTone(d.stage)}>{DEAL_STAGE_LABEL[d.stage]}</Chip>
                  </div>
                  <div className="mt-3">
                    <StageTimeline stage={d.stage} />
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <p className="text-[12px] font-medium text-soft">
                        {fmtNum(d.bags)} меш. × {fmtNum(p.bagWeightKg)} кг = {fmtNum(m.qtyKg)} кг
                      </p>
                      <p className="text-[15px] font-semibold text-ink">{fmtRub(m.revenue)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-medium text-soft">маржа после налога</p>
                      <p className="text-[15px] font-semibold text-accent">{fmtRub(m.net)}</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <div className="px-5 pt-1">
        <div className="flex items-center gap-2 rounded-[14px] bg-subtle px-4 py-3">
          <Truck size={16} className="shrink-0 text-soft" />
          <p className="text-[12px] font-medium text-soft">
            Доставку всегда оплачивает покупатель — она фиксируется в сделке, но не влияет на маржу
          </p>
        </div>
      </div>

      {deal && (() => {
        const p = byId.get(deal.positionId)!;
        const m = marginOf(deal, p);
        return (
          <Sheet title="Сделка" onClose={() => setOpenDeal(null)}>
            <p className="text-[16px] font-semibold text-ink">
              {positionName(p.culture.name, p.attributes)}
            </p>
            <p className="mt-0.5 text-[13px] font-medium text-soft">{deal.buyer}</p>
            <div className="mt-2">
              <Chip tone={stageTone(deal.stage)}>{DEAL_STAGE_LABEL[deal.stage]}</Chip>
            </div>

            <div className="mt-4 rounded-[14px] bg-subtle px-4 py-1">
              <InfoRow label="Количество" value={`${fmtNum(deal.bags)} меш. × ${fmtNum(p.bagWeightKg)} кг`} />
              <InfoRow label="Цена продажи" value={`${fmtRub(p.salePrice)} / кг`} />
              <InfoRow label="Выручка" value={fmtRub(m.revenue)} />
              <div className="my-2 h-px bg-line" />
              <InfoRow label="Закуп у поставщика" value={`− ${fmtRub(m.cost)}`} />
              <InfoRow label="Разница" value={fmtRub(m.gross)} />
              <InfoRow label={`Налог (${Math.round(taxRateOf(user) * 100)}%)`} value={`− ${fmtRub(m.tax)}`} />
              <div className="my-2 h-px bg-line" />
              <InfoRow label="Чистая маржа" value={fmtRub(m.net)} valueClass="text-accent text-[16px]" />
            </div>

            <div className="mt-3 rounded-[14px] bg-subtle px-4 py-1">
              <InfoRow
                label="Доставка"
                value={
                  deal.delivery.mode === "carrier"
                    ? `${deal.delivery.carrier}, за счёт покупателя`
                    : deal.delivery.mode === "pickup"
                      ? "самовывоз"
                      : "попутчик, за счёт покупателя"
                }
                valueClass="text-soft"
              />
              {deal.delivery.costRub > 0 && (
                <InfoRow
                  label="Стоимость доставки"
                  value={`${fmtRub(deal.delivery.costRub)} · не входит в маржу`}
                  valueClass="text-soft"
                />
              )}
              {deal.delivery.track && (
                <InfoRow label="Трек-номер" value={deal.delivery.track} valueClass="text-soft" />
              )}
            </div>

            <div className="mt-3 rounded-[14px] bg-subtle px-4 py-1">
              <InfoRow
                label="Отгрузка"
                value={`${SUPPLIER_LOCATION_LABEL[p.supplier.location]} · ${
                  SHIPPING_MODE_LABEL[p.supplier.shippingMode]
                }`}
                valueClass="text-soft"
              />
              <p className="py-2 text-[11px] font-medium leading-relaxed text-soft">
                Поставщик виден только вам. В документах и переписке с покупателем его не будет.
              </p>
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-[14px] border border-dashed border-line px-4 py-3">
              <Package size={16} className="shrink-0 text-soft" />
              <p className="text-[12px] font-medium text-soft">
                Счёт, договор, ТН и УПД сформируются из данных сделки — этап 4
              </p>
            </div>
          </Sheet>
        );
      })()}
    </div>
  );
}
