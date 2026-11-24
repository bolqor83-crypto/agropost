/**
 * Создание сделки (этап 4): шаг 1 — позиция, покупатель, объём и цены
 * (маржа считается на сервере, превью — по shared/pricing), шаг 2 —
 * способ доставки и калькулятор ТК (локальные приоритетнее).
 * После создания — статус DRAFT.
 */

import { useEffect, useMemo, useState } from "react";
import { Calculator, HandCoins, Truck } from "lucide-react";
import { positionName } from "@shared/attributes";
import { DEAL_TAX_MODE_LABEL } from "@shared/labels";
import { computeDealEconomics } from "@shared/pricing";
import type { DealDetailDTO, DealTaxMode, DeliveryCalculateDTO, DeliveryMethod, PositionDTO } from "@shared/types";
import * as api from "../api/client";
import { useToastStore } from "../stores/publish";
import { fmtRub } from "../lib/format";
import { Btn, Card, Chip, Field, Segmented, Select, Sheet, TextInput } from "../components/ui";
import { shouldShowFirstDealTip } from "../lib/tips";
import type { PendingDealPrefill } from "../stores/deal-create";

const TAX_MODES: DealTaxMode[] = ["IP_6", "SELF_EMPLOYED_4", "SELF_EMPLOYED_6"];

export function DealFormSheet({
  prefill,
  onClose,
  onCreated,
}: {
  prefill?: PendingDealPrefill;
  onClose: () => void;
  onCreated: (deal: DealDetailDTO) => void;
}) {
  const showToast = useToastStore((s) => s.show);
  const [step, setStep] = useState<1 | 2>(1);
  const [positions, setPositions] = useState<PositionDTO[]>([]);
  const [profileTaxMode, setProfileTaxMode] = useState<DealTaxMode>("IP_6");
  /* ЭТАП 7: подсказка «Отправка после полной оплаты» — только для ПЕРВОЙ сделки. */
  const [firstDeal, setFirstDeal] = useState(false);

  const [positionId, setPositionId] = useState(prefill?.positionId ?? "");
  const [buyerName, setBuyerName] = useState(prefill?.buyerName ?? "");
  const [buyerPhone, setBuyerPhone] = useState(prefill?.buyerPhone ?? "");
  const [buyerRegion, setBuyerRegion] = useState(prefill?.buyerRegion ?? "");
  const [buyerInn, setBuyerInn] = useState("");
  const [volumeKg, setVolumeKg] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [supplierPrice, setSupplierPrice] = useState("");
  const [taxMode, setTaxMode] = useState<DealTaxMode>("IP_6");
  const [notes, setNotes] = useState("");

  /* Этап 5.1: доп. затраты на доставку до терминала (в себестоимости). */
  const [terminalCost, setTerminalCost] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("PICKUP");
  const [toCity, setToCity] = useState(prefill?.buyerRegion ?? "");
  const [deliveryCost, setDeliveryCost] = useState("");
  const [options, setOptions] = useState<DeliveryCalculateDTO | null>(null);
  const [calcBusy, setCalcBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .listPositions()
      .then((items) => setPositions(items))
      .catch(() => showToast("Не удалось загрузить позиции"));
    api
      .getUserProfile()
      .then((p) => setProfileTaxMode(p?.dealTaxMode ?? "IP_6"))
      .catch(() => undefined);
    /* ЭТАП 7: первая ли это сделка — решает, показывать подсказку. */
    api
      .listDeals()
      .then((r) => setFirstDeal(shouldShowFirstDealTip(r.items.length)))
      .catch(() => setFirstDeal(false));
  }, [showToast]);

  useEffect(() => {
    setTaxMode(profileTaxMode);
  }, [profileTaxMode]);

  const position = positions.find((p) => p.id === positionId) ?? null;
  void position;

  const onPickPosition = (id: string) => {
    setPositionId(id);
    const p = positions.find((x) => x.id === id);
    if (p) {
      setSupplierPrice(String(p.supplierPrice));
      setSalePrice(String(p.salePrice));
    }
  };

  const econ = useMemo(() => {
    const sale = Number(salePrice.replace(",", "."));
    const supp = Number(supplierPrice.replace(",", "."));
    const vol = Number(volumeKg.replace(",", "."));
    if (!Number.isFinite(sale) || !Number.isFinite(supp) || !Number.isFinite(vol) || vol <= 0) {
      return null;
    }
    const extra = Number(terminalCost.replace(",", "."));
    return computeDealEconomics({
      salePrice: sale,
      supplierPrice: supp,
      volumeKg: vol,
      taxMode,
      deliveryToTerminalCost: Number.isFinite(extra) && extra > 0 ? extra : undefined,
    });
  }, [salePrice, supplierPrice, volumeKg, taxMode, terminalCost]);

  const calculate = () => {
    const vol = Number(volumeKg.replace(",", "."));
    if (!toCity.trim() || !Number.isFinite(vol) || vol <= 0) {
      showToast("Сначала объём и город доставки");
      return;
    }
    setCalcBusy(true);
    api
      .calculateDelivery({ positionId: positionId || undefined, toCity: toCity.trim(), volumeKg: vol })
      .then((res) => {
        setOptions(res);
        if (res.options.length > 0) {
          const best = res.options[res.recommendedIndex] ?? res.options[0];
          setDeliveryCost(String(best.cost));
        }
      })
      .catch((err) => showToast(err instanceof Error ? err.message : "Калькулятор недоступен"))
      .finally(() => setCalcBusy(false));
  };

  const submit = () => {
    const vol = Number(volumeKg.replace(",", "."));
    if (!buyerName.trim() || !buyerPhone.trim() || !buyerRegion.trim()) {
      setStep(1);
      showToast("Укажите имя, телефон и регион покупателя");
      return;
    }
    if (!Number.isFinite(vol) || vol <= 0) {
      setStep(1);
      showToast("Объём — килограммы, больше нуля");
      return;
    }
    setBusy(true);
    api
      .createDeal({
        ...(prefill?.leadId ? { leadId: prefill.leadId } : {}),
        ...(positionId ? { positionId } : {}),
        buyerName: buyerName.trim(),
        buyerPhone: buyerPhone.trim(),
        buyerRegion: buyerRegion.trim(),
        ...(buyerInn.trim() ? { buyerInn: buyerInn.trim() } : {}),
        volumeKg: vol,
        ...(salePrice.trim() ? { salePrice: Number(salePrice.replace(",", ".")) } : {}),
        ...(supplierPrice.trim() ? { supplierPrice: Number(supplierPrice.replace(",", ".")) } : {}),
        taxMode,
        deliveryMethod,
        ...(deliveryMethod !== "PICKUP" && deliveryCost.trim()
          ? { deliveryCost: Number(deliveryCost.replace(",", ".")) }
          : {}),
        ...(terminalCost.trim()
          ? { deliveryToTerminalCost: Number(terminalCost.replace(",", ".")) }
          : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      })
      .then((deal) => {
        onCreated(deal);
      })
      .catch((err) => showToast(err instanceof Error ? err.message : "Не удалось создать"))
      .finally(() => setBusy(false));
  };

  return (
    <Sheet title={step === 1 ? "Новая сделка · товар" : "Новая сделка · доставка"} onClose={onClose}>
      {/* ЭТАП 7: подсказка для первой сделки — правило предоплаты. */}
      {step === 1 && firstDeal && (
        <Card className="flex items-start gap-3 p-4">
          <HandCoins size={18} className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-ink">Отправка — после полной оплаты</p>
            <p className="mt-0.5 text-[12px] font-medium leading-relaxed text-soft">
              Предоплату и частичную оплату не берём: сделка создаётся черновиком,
              после полной оплаты — «Оплата получена», отгрузка — из карточки сделки
            </p>
          </div>
        </Card>
      )}
      {step === 1 ? (
        <>
          <Field label="Позиция" hint="цены подставятся">
            <Select
              value={positionId}
              onChange={onPickPosition}
              ariaLabel="Позиция из каталога"
              options={[
                { value: "", label: "— выбрать позицию —" },
                ...positions.map((p) => ({
                  value: p.id,
                  label: `${positionName(p.culture.name, p.attributes)} · ${fmtRub(p.salePrice)}/кг`,
                })),
              ]}
            />
          </Field>

          <div className="mt-3 flex gap-3">
            <div className="flex-1">
              <Field label="Покупатель" required>
                <TextInput
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  placeholder="Имя или компания"
                  aria-label="Имя покупателя"
                />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Телефон" required>
                <TextInput
                  value={buyerPhone}
                  onChange={(e) => setBuyerPhone(e.target.value)}
                  placeholder="+7 (___) ___-__-__"
                  aria-label="Телефон покупателя"
                />
              </Field>
            </div>
          </div>

          <div className="mt-3 flex gap-3">
            <div className="flex-1">
              <Field label="Регион" required>
                <TextInput
                  value={buyerRegion}
                  onChange={(e) => setBuyerRegion(e.target.value)}
                  placeholder="Ростовская область"
                  aria-label="Регион покупателя"
                />
              </Field>
            </div>
            <div className="w-36">
              <Field label="ИНН" hint="если есть">
                <TextInput
                  value={buyerInn}
                  onChange={(e) => setBuyerInn(e.target.value)}
                  inputMode="numeric"
                  aria-label="ИНН покупателя"
                />
              </Field>
            </div>
          </div>

          <div className="mt-3 flex gap-3">
            <div className="w-32">
              <Field label="Объём, кг" required>
                <TextInput
                  value={volumeKg}
                  onChange={(e) => setVolumeKg(e.target.value)}
                  inputMode="decimal"
                  placeholder="1000"
                  aria-label="Объём в килограммах"
                />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Продажа, ₽/кг" required>
                <TextInput
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  inputMode="decimal"
                  aria-label="Цена продажи за килограмм"
                />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Закуп, ₽/кг" required>
                <TextInput
                  value={supplierPrice}
                  onChange={(e) => setSupplierPrice(e.target.value)}
                  inputMode="decimal"
                  aria-label="Закупная цена за килограмм"
                />
              </Field>
            </div>
          </div>

          {/* Этап 5.1: доп. затраты на доставку до терминала ТК — входят
              в себестоимость (вычитаются из маржи). Пусто = поставщик
              привозит сам / расходов нет. */}
          <div className="mt-3">
            <Field
              label="Доставка до терминала, ₽"
              hint="если платите поставщику"
            >
              <TextInput
                value={terminalCost}
                onChange={(e) => setTerminalCost(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                aria-label="Дополнительные затраты на доставку до терминала"
              />
            </Field>
          </div>

          <div className="mt-3">
            <Field label="Налоговый режим" hint="по умолчанию из профиля">
              <Select
                value={taxMode}
                onChange={(v) => setTaxMode(v as DealTaxMode)}
                ariaLabel="Налоговый режим"
                options={TAX_MODES.map((m) => ({ value: m, label: DEAL_TAX_MODE_LABEL[m] }))}
              />
            </Field>
          </div>

          {econ && (
            <Card className="mt-3 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-medium text-soft">Выручка</span>
                <span className="text-[14px] font-semibold text-ink">{fmtRub(econ.revenue)}</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-[13px] font-medium text-soft">Налог</span>
                <span className="text-[14px] font-semibold text-soft">− {fmtRub(econ.taxAmount)}</span>
              </div>
              {econ.deliveryToTerminalCost > 0 && (
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-[13px] font-medium text-soft">Терминал (доставка)</span>
                  <span className="text-[14px] font-semibold text-soft">
                    − {fmtRub(econ.deliveryToTerminalCost)}
                  </span>
                </div>
              )}
              <div className="mt-2 flex items-baseline justify-between border-t border-line pt-2">
                <span className="text-[13px] font-medium text-soft">Маржа после налога</span>
                <span className={`text-[17px] font-semibold ${econ.margin > 0 ? "text-accent" : "text-warm"}`}>
                  {fmtRub(econ.margin)}
                </span>
              </div>
            </Card>
          )}

          <div className="mt-4 pb-2">
            <Btn full size="lg" onClick={() => setStep(2)}>
              <Truck size={16} />
              Далее · доставка
            </Btn>
          </div>
        </>
      ) : (
        <>
          <Segmented<DeliveryMethod>
            items={[
              { value: "PICKUP", label: "Самовывоз" },
              { value: "TK", label: "ТК" },
              { value: "FELLOW_TRAVELER", label: "Попутчик" },
            ]}
            value={deliveryMethod}
            onChange={setDeliveryMethod}
          />

          {deliveryMethod === "PICKUP" && (
            <p className="mt-3 rounded-[14px] bg-subtle px-4 py-3 text-[12px] font-medium text-soft">
              Покупатель забирает товар сам. Стоимость доставки — 0, покупателю ничего не
              начисляем.
            </p>
          )}

          {deliveryMethod === "TK" && (
            <>
              <div className="mt-3 flex gap-3">
                <div className="flex-1">
                  <Field label="Город доставки" required>
                    <TextInput
                      value={toCity}
                      onChange={(e) => setToCity(e.target.value)}
                      placeholder={buyerRegion || "Москва"}
                      aria-label="Город доставки"
                    />
                  </Field>
                </div>
                <div className="w-32">
                  <Field label="Объём, кг">
                    <TextInput value={volumeKg} onChange={(e) => setVolumeKg(e.target.value)} inputMode="decimal" aria-label="Объём" />
                  </Field>
                </div>
              </div>

              <div className="mt-3">
                <Btn variant="secondary" full disabled={calcBusy} onClick={calculate}>
                  <Calculator size={15} />
                  {calcBusy ? "Считаем…" : "Рассчитать доставку"}
                </Btn>
              </div>

              {options && (
                <div className="mt-3 flex flex-col gap-2">
                  {options.options.map((o, i) => (
                    <button
                      key={o.carrierId ?? o.carrier}
                      type="button"
                      onClick={() => setDeliveryCost(String(o.cost))}
                      className={`press rounded-[14px] border px-4 py-3 text-left ${
                        String(o.cost) === deliveryCost ? "border-accent bg-accent-soft" : "border-line bg-surface"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[14px] font-semibold text-ink">{o.carrier}</span>
                        {i === options.recommendedIndex && <Chip tone="green">рекомендуем</Chip>}
                        {o.isLocal && <Chip tone="outline">рядом со складом</Chip>}
                      </div>
                      <p className="mt-0.5 text-[12px] font-medium text-soft">
                        {fmtRub(o.cost)} · ~{o.days} дн. · {o.note}
                      </p>
                    </button>
                  ))}
                  <p className="px-1 text-[11px] font-medium text-soft">
                    {options.meta.ai
                      ? `Оценки уточнены AI · ${options.meta.model ?? "GLM"}`
                      : options.meta.note}
                  </p>
                  {/* Этап 5.1: оценки ПРЕДВАРИТЕЛЬНЫЕ — не тариф ТК. */}
                  <p className="px-1 text-[11px] font-semibold text-warm">
                    ⚠ Ориентировочно, не является тарифом перевозчика — итоговую стоимость
                    подтверждает ТК при заявке.
                  </p>
                </div>
              )}

              <div className="mt-3">
                <Field label="Стоимость доставки, ₽" hint="платит покупатель">
                  <TextInput
                    value={deliveryCost}
                    onChange={(e) => setDeliveryCost(e.target.value)}
                    inputMode="decimal"
                    placeholder="из калькулятора или вручную"
                    aria-label="Стоимость доставки"
                  />
                </Field>
              </div>
            </>
          )}

          {deliveryMethod === "FELLOW_TRAVELER" && (
            <div className="mt-3">
              <Field label="Стоимость доставки, ₽" required hint="платит покупатель">
                <TextInput
                  value={deliveryCost}
                  onChange={(e) => setDeliveryCost(e.target.value)}
                  inputMode="decimal"
                  placeholder="договорились с водителем"
                  aria-label="Стоимость доставки попутчиком"
                />
              </Field>
            </div>
          )}

          <div className="mt-3">
            <Field label="Заметка" hint="внутренняя">
              <TextInput
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="не попадает в документы покупателю"
                aria-label="Заметка по сделке"
              />
            </Field>
          </div>

          <div className="mt-4 flex flex-col gap-2 pb-2">
            <Btn full size="lg" disabled={busy} onClick={submit}>
              Создать сделку
            </Btn>
            <Btn full variant="ghost" onClick={() => setStep(1)}>
              Назад · товар
            </Btn>
            <p className="text-center text-[11px] font-medium text-soft">
              Создастся черновиком · отгрузка только после полной оплаты
              {econ ? ` · маржа ${fmtRub(econ.margin)}` : ""}
              {deliveryMethod !== "PICKUP" && deliveryCost.trim()
                ? ` · доставка ${fmtRub(Number(deliveryCost.replace(",", ".")) || 0)} за счёт покупателя`
                : ""}
            </p>
          </div>
        </>
      )}
    </Sheet>
  );
}
