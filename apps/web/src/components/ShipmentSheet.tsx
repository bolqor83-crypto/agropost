/**
 * Отгрузка (этап 4): способ, ТК из справочника, города, стоимость
 * (платит покупатель), трек-номер. Создаёт Shipment и переводит
 * сделку в SHIPPED.
 */

import { useEffect, useState } from "react";
import { Truck } from "lucide-react";
import type { CarrierDTO, DealDetailDTO } from "@shared/types";
import * as api from "../api/client";
import { useToastStore } from "../stores/publish";
import { fmtRub } from "../lib/format";
import { Btn, Field, Select, Sheet, TextInput, ToggleRow } from "../components/ui";

const DEFAULT_CARRIERS_FALLBACK = ["ПЭК", "СДЭК", "Деловые Линии"];

export function ShipmentSheet({
  deal,
  onClose,
  onShipped,
}: {
  deal: DealDetailDTO;
  onClose: () => void;
  onShipped: () => void;
}) {
  const showToast = useToastStore((s) => s.show);
  const [carriers, setCarriers] = useState<CarrierDTO[]>([]);
  const [carrierId, setCarrierId] = useState<string>("");
  const [method, setMethod] = useState<"TK" | "FELLOW_TRAVELER">("TK");
  const [fromCity, setFromCity] = useState("Павловская");
  const [toCity, setToCity] = useState(deal.buyerRegion);
  const [cost, setCost] = useState("");
  const [days, setDays] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .listCarriers()
      .then((r) => {
        setCarriers(r.items);
        if (r.items.length > 0) setCarrierId(r.items[0].id);
      })
      .catch(() => setCarriers([]));
  }, []);

  const submit = () => {
    const costNum = Number(cost.replace(",", "."));
    if (!fromCity.trim() || !toCity.trim()) {
      showToast("Укажите город отправления и доставки");
      return;
    }
    if (!Number.isFinite(costNum) || costNum < 0) {
      showToast("Стоимость доставки — число");
      return;
    }
    setBusy(true);
    api
      .shipDeal(deal.id, {
        method,
        ...(method === "TK" && carrierId ? { carrierId } : {}),
        ...(method === "FELLOW_TRAVELER" ? { carrierName: "Попутный транспорт" } : {}),
        fromCity: fromCity.trim(),
        toCity: toCity.trim(),
        cost: costNum,
        ...(days.trim() ? { days: Number(days) } : {}),
        ...(trackingNumber.trim() ? { trackingNumber: trackingNumber.trim() } : {}),
      })
      .then(() => {
        showToast("Отгружено — сделка в доставке");
        onShipped();
      })
      .catch((err) => showToast(err instanceof Error ? err.message : "Не удалось отгрузить"))
      .finally(() => setBusy(false));
  };

  return (
    <Sheet title="Отгрузка" onClose={onClose}>
      <p className="text-[13px] font-medium text-soft">
        Сделка {deal.number} · {deal.buyerName}. Доставку оплачивает покупатель — она не входит
        в маржу.
      </p>

      <div className="mt-3">
        <ToggleRow
          checked={method === "TK"}
          onToggle={() => setMethod(method === "TK" ? "FELLOW_TRAVELER" : "TK")}
          label={method === "TK" ? "Транспортная компания" : "Попутный транспорт"}
          hint="Переключите, если везёт не ТК, а попутным транспортом"
        />
      </div>

      {method === "TK" && (
        <div className="mt-3">
          <Field label="Транспортная компания" required>
            <Select
              value={carrierId}
              onChange={setCarrierId}
              ariaLabel="Транспортная компания"
              options={[
                ...carriers.map((c) => ({
                  value: c.id,
                  label: `${c.name} · ${c.city}${c.isLocal ? " · рядом" : ""}`,
                })),
                ...(carriers.length === 0
                  ? DEFAULT_CARRIERS_FALLBACK.map((n) => ({ value: n, label: n }))
                  : []),
              ]}
            />
          </Field>
        </div>
      )}

      <div className="mt-3 flex gap-3">
        <div className="flex-1">
          <Field label="Откуда" required>
            <TextInput value={fromCity} onChange={(e) => setFromCity(e.target.value)} aria-label="Город отправления" />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Куда" required>
            <TextInput value={toCity} onChange={(e) => setToCity(e.target.value)} aria-label="Город доставки" />
          </Field>
        </div>
      </div>

      <div className="mt-3 flex gap-3">
        <div className="flex-1">
          <Field label="Стоимость доставки, ₽" required hint="платит покупатель">
            <TextInput
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              inputMode="decimal"
              placeholder="например, 7500"
              aria-label="Стоимость доставки"
            />
          </Field>
        </div>
        <div className="w-28">
          <Field label="Дней" hint="~">
            <TextInput value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" aria-label="Дней в пути" />
          </Field>
        </div>
      </div>

      <div className="mt-3">
        <Field label="Трек-номер" hint="если есть">
          <TextInput
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="PEK-771023"
            aria-label="Трек-номер"
          />
        </Field>
      </div>

      <div className="mt-5 pb-2">
        <Btn full size="lg" disabled={busy} onClick={submit}>
          <Truck size={16} />
          Отгрузить товар
        </Btn>
        {cost.trim() && (
          <p className="pt-2 text-center text-[11px] font-medium text-soft">
            {fmtRub(Number(cost.replace(",", ".")) || 0)} за счёт покупателя — в маржу не входит
          </p>
        )}
      </div>
    </Sheet>
  );
}
