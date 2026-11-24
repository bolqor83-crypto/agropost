/**
 * Карточка позиции (этап 1): сетка атрибутов по шаблону культуры,
 * медиа-галерея, сертификаты, экономика с маржой и inline-правка остатка.
 * Поставщик виден только здесь — в объявлениях его не будет (white-label).
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  CalendarDays,
  Check,
  Handshake,
  Image as ImageIcon,
  Pencil,
  Send,
  ShieldCheck,
  TrendingUp,
  Truck,
  X,
} from "lucide-react";
import { formatAttrValue, positionName } from "@shared/attributes";
import { POSITION_STATUS_LABEL, SHIPPING_MODE_LABEL, SUPPLIER_LOCATION_LABEL } from "@shared/labels";
import { calcMargin } from "@shared/pricing";
import type { MarketDTO, PositionDTO } from "@shared/types";
import type { AiMeta, AiPriceAnalysisData } from "@shared/ai";
import * as api from "../api/client";
import { fmtNum, fmtRub } from "../lib/format";
import { taxRateOf, useCatalog } from "../stores/catalog";
import { usePublishStore, useToastStore } from "../stores/publish";
import { useDealCreateStore } from "../stores/deal-create";
import { Btn, Chip, InfoRow, Sheet, Skeleton, TextInput } from "./ui";

function statusTone(status: PositionDTO["status"]): "green" | "warm" | "neutral" {
  if (status === "IN_STOCK") return "green";
  if (status === "ON_ORDER") return "warm";
  return "neutral";
}

/* Этап 2.5: строка «Рынок: 180–240 ₽/кг (средняя 205)» — агрегаты цен
 * конкурентов по культуре позиции. Данные обновляет парсер (раз в день);
 * до его первого запуска — честное «данных пока нет». */
function MarketRow({ positionId }: { positionId: string }) {
  const [market, setMarket] = useState<MarketDTO | null>(null);
  const [failed, setFailed] = useState(false);
  /* Этап 5.1: парсер не настроен — честная подпись вместо пустоты. */
  const [notConfigured, setNotConfigured] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .getPositionMarket(positionId)
      .then((m) => {
        if (alive) setMarket(m);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        if (err instanceof api.ApiError && err.code === "PARSER_NOT_CONFIGURED") {
          setNotConfigured(true); /* парсер не настроен — честная подпись */
        } else {
          setFailed(true); /* сеть/сервер — не спекулируем */
        }
      });
    return () => {
      alive = false;
    };
  }, [positionId]);

  if (failed) return null;
  if (notConfigured) {
    return (
      <div className="py-2">
        <div className="flex items-center justify-between gap-3">
          <span className="flex shrink-0 items-center gap-1 text-[13px] font-medium text-soft">
            <TrendingUp size={13} className="text-accent" />
            Рынок
          </span>
          <span className="text-[12px] font-medium text-soft">
            парсер цен не настроен (PARSER_URL)
          </span>
        </div>
      </div>
    );
  }

  const hasData = market !== null && market.count > 0;
  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="flex shrink-0 items-center gap-1 text-[13px] font-medium text-soft">
          <TrendingUp size={13} className="text-accent" />
          Рынок
        </span>
        {market === null ? (
          <span className="text-[13px] font-medium text-soft">…</span>
        ) : hasData ? (
          <span className="whitespace-nowrap text-[14px] font-semibold text-ink">
            {fmtRub(market.min!)}–{fmtRub(market.max!)} / кг
          </span>
        ) : (
          <span className="text-[12px] font-medium text-soft">данных пока нет</span>
        )}
      </div>
      {hasData && (
        <p className="mt-0.5 text-right text-[11px] font-medium text-soft">
          средняя {fmtRub(market.avg!)} · {market.count} цен ·{" "}
          {market.sources
            .map((s) => (s === "AGROSERVER" ? "Агросервер" : "Telegram"))
            .join(" + ")}
        </p>
      )}
    </div>
  );
}

function updatedLabel(iso: string): string {
  const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diffDays <= 0) return "сегодня, вручную";
  if (diffDays === 1) return "вчера";
  return `${diffDays} дн. назад`;
}

/** Остаток с inline-редактированием: карандаш → ввод → сохранение. */
function VolumeRow({
  position,
  onSaved,
}: {
  position: PositionDTO;
  onSaved: (p: PositionDTO) => void;
}) {
  const showToast = useToastStore((s) => s.show);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(position.volumeKg));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const value = Number(draft.replace(",", "."));
    if (!Number.isInteger(value) || value < 0) {
      showToast("Остаток — целое число от 0");
      return;
    }
    if (value === position.volumeKg) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const updated = await api.updatePosition(position.id, { volumeKg: value });
      onSaved(updated);
      setEditing(false);
      showToast("Остаток обновлён");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Не удалось обновить остаток");
      setDraft(String(position.volumeKg));
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="py-2">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[13px] font-medium text-soft">Остаток, кг</span>
          <TextInput
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            inputMode="numeric"
            className="h-10 py-0 text-right"
            aria-label="Новый остаток, кг"
          />
          <button
            type="button"
            aria-label="Сохранить остаток"
            onClick={save}
            disabled={saving}
            className="press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-white"
          >
            <Check size={17} />
          </button>
          <button
            type="button"
            aria-label="Отменить"
            onClick={() => {
              setDraft(String(position.volumeKg));
              setEditing(false);
            }}
            className="press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-subtle text-soft"
          >
            <X size={17} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="shrink-0 text-[13px] font-medium text-soft">Остаток</span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="press inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[14px] font-semibold text-accent"
        aria-label="Изменить остаток"
      >
        {fmtNum(position.volumeKg)} кг
        <Pencil size={12} />
      </button>
    </div>
  );
}

export function PositionDetailSheet({
  position,
  onClose,
  onChanged,
}: {
  position: PositionDTO;
  onClose: () => void;
  /** Новый DTO после inline-правки (остаток и др.). */
  onChanged: (p: PositionDTO | null) => void;
}) {
  const navigate = useNavigate();
  const user = useCatalog((s) => s.user);
  const refreshCatalog = useCatalog((s) => s.load);
  const setPendingDeal = useDealCreateStore((s) => s.setPending);
  const resetFlow = usePublishStore((s) => s.reset);
  const choosePosition = usePublishStore((s) => s.choosePosition);
  const setStep = usePublishStore((s) => s.setStep);
  const [priceOpen, setPriceOpen] = useState(false);

  const margin = calcMargin(
    position.salePrice,
    position.supplierPrice,
    position.volumeKg,
    taxRateOf(user),
  );
  const taxPercent = Math.round(taxRateOf(user) * 100);

  const startPublish = () => {
    resetFlow();
    choosePosition(position.id);
    setStep(2);
    onClose();
    navigate("/publish");
  };

  return (
    <>
      <Sheet title="Позиция" onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[18px] font-semibold leading-snug text-ink">
            {positionName(position.culture.name, position.attributes)}
          </p>
          <p className="mt-1 text-[13px] font-medium text-soft">
            {position.supplier.name} · {SUPPLIER_LOCATION_LABEL[position.supplier.location]}
          </p>
        </div>
        <Chip tone={statusTone(position.status)}>
          {POSITION_STATUS_LABEL[position.status]}
        </Chip>
      </div>

      {/* Медиа-галерея */}
      <div className="mt-4 flex gap-2 overflow-x-auto soft-scroll" aria-label="Медиа позиции">
        {position.media.length === 0 && (
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-[14px] border border-dashed border-line text-soft">
            <ImageIcon size={20} />
          </div>
        )}
        {position.media.map((m) => (
          <img
            key={m.id}
            src={m.url}
            alt={m.type === "PHOTO" ? "Фото позиции" : "Видео позиции"}
            className="h-20 w-20 shrink-0 rounded-[14px] border border-line object-cover"
            loading="lazy"
          />
        ))}
      </div>
      <p className="mt-1.5 px-1 text-[11px] font-medium text-soft">
        Фото и видео от поставщика · загрузка в R2 (до 15 мин на ссылку)
      </p>

      {/* Сертификаты */}
      {position.certificates.length > 0 && (
        <div className="mt-3 rounded-[14px] bg-subtle px-4 py-2">
          {position.certificates.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 py-1.5">
              <span className="flex min-w-0 items-center gap-2">
                <BadgeCheck size={15} className="shrink-0 text-accent" />
                <span className="truncate text-[13px] font-semibold text-ink">{c.name}</span>
              </span>
              {c.issuedAt && (
                <span className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-soft">
                  <CalendarDays size={12} />
                  {new Date(c.issuedAt).toLocaleDateString("ru-RU")}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Сетка атрибутов по шаблону культуры */}
      <div className="mt-3 rounded-[14px] bg-subtle px-4 py-1">
        {position.culture.attributesSchema.map((f) => (
          <InfoRow
            key={f.key}
            label={f.label}
            value={formatAttrValue(f, position.attributes[f.key])}
          />
        ))}
      </div>

      {/* Экономика */}
      <div className="mt-3 rounded-[14px] bg-subtle px-4 py-1">
        <InfoRow label="Закуп поставщика" value={`${fmtRub(position.supplierPrice)} / кг`} />
        <InfoRow label="Наценка" value={`+${fmtNum(position.markupPercent)}%`} />
        <div className="flex items-center justify-between gap-3 py-2">
          <span className="shrink-0 text-[13px] font-medium text-soft">Цена продажи</span>
          <span className="flex items-center gap-2">
            <span className="text-[16px] font-semibold text-accent">
              {fmtRub(position.salePrice)} / кг
            </span>
            <button
              type="button"
              onClick={() => setPriceOpen(true)}
              className="press inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent"
            >
              <TrendingUp size={12} />
              Проверить цену
            </button>
          </span>
        </div>
        {/* Этап 2.5: рынок конкурентов по этой культуре (парсер). */}
        <MarketRow positionId={position.id} />
        <div className="my-2 h-px bg-line" />
        <VolumeRow
          position={position}
          onSaved={(p) => {
            onChanged(p);
            void refreshCatalog(true);
          }}
        />
        <InfoRow
          label="Мешки"
          value={`${fmtNum(position.bagWeightKg)} кг`}
          valueClass="text-soft"
        />
        <InfoRow
          label="Мин. партия"
          value={`от ${fmtNum(position.minLotKg)} кг`}
          valueClass="text-soft"
        />
        <div className="my-2 h-px bg-line" />
        <InfoRow label="Выручка с остатка" value={fmtRub(margin.revenue)} />
        <InfoRow label={`Налог (${taxPercent}%)`} value={`− ${fmtRub(margin.tax)}`} />
        <InfoRow
          label="Маржа после налога"
          value={fmtRub(margin.net)}
          valueClass="text-accent text-[16px]"
        />
        <InfoRow
          label="Обновлено"
          value={updatedLabel(position.updatedAt)}
          valueClass="text-soft"
        />
      </div>

      {/* Поставщик — только внутри приложения */}
      <div className="mt-3 rounded-[14px] bg-subtle px-4 py-1">
        <InfoRow label="Поставщик" value={position.supplier.name} />
        <InfoRow
          label="Локация"
          value={
            <span className="inline-flex items-center gap-1">
              <Truck size={13} className="text-soft" />
              {SUPPLIER_LOCATION_LABEL[position.supplier.location]}
            </span>
          }
        />
        <InfoRow
          label="Отгрузка"
          value={SHIPPING_MODE_LABEL[position.supplier.shippingMode]}
          valueClass="text-soft"
        />
        {position.supplier.notes && (
          <p className="py-2 text-[11px] font-medium leading-relaxed text-soft">
            {position.supplier.notes}
          </p>
        )}
      </div>

      <div className="pt-4">
        <Btn full size="lg" onClick={startPublish}>
          <Send size={17} />
          Разместить эту позицию
        </Btn>
      </div>

      {/* Этап 4: сделка из позиции (товар и цены подставятся) */}
      <div className="pt-2">
        <Btn
          full
          variant="secondary"
          onClick={() => {
            setPendingDeal({ positionId: position.id });
            onClose();
            navigate("/deals");
          }}
          ariaLabel="Создать сделку из позиции"
        >
          <Handshake size={15} />
          Создать сделку
        </Btn>
      </div>
        <p className="flex items-center justify-center gap-1.5 px-1 pt-3 text-center text-[11px] font-medium text-soft">
          <ShieldCheck size={12} className="shrink-0" />
          В объявлениях и документах покупатель увидит только товар — поставщик скрыт
        </p>
      </Sheet>

      {priceOpen && (
        <PriceAnalysisSheet position={position} onClose={() => setPriceOpen(false)} />
      )}
    </>
  );
}

/** Этап 3.0: проверка цены относительно рынка — в отдельном шите. */
function PriceAnalysisSheet({
  position,
  onClose,
}: {
  position: PositionDTO;
  onClose: () => void;
}) {
  const [state, setState] = useState<{
    loading: boolean;
    data?: AiPriceAnalysisData;
    warnings?: string[];
    meta?: AiMeta;
    error?: string;
  }>({ loading: true });

  useEffect(() => {
    let alive = true;
    api
      .analyzeAiPrice({ positionId: position.id })
      .then((res) => {
        if (alive) {
          setState({
            loading: false,
            data: res.data,
            warnings: res.warnings,
            meta: res.meta,
          });
        }
      })
      .catch((err) => {
        if (alive) {
          setState({
            loading: false,
            error: err instanceof Error ? err.message : "Не удалось проверить цену",
          });
        }
      });
    return () => {
      alive = false;
    };
  }, [position.id]);

  const data = state.data;
  const positionLabel =
    data?.marketPosition === "below"
      ? "Ниже рынка"
      : data?.marketPosition === "above"
        ? "Выше рынка"
        : "В рынке";
  const positionTone =
    data?.marketPosition === "below" ? "green" : data?.marketPosition === "above" ? "warm" : "neutral";

  return (
    <Sheet title="Проверка цены" onClose={onClose}>
      {state.loading ? (
        <div className="flex flex-col gap-2 py-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : state.error ? (
        <p className="py-3 text-[13px] font-semibold text-warm">{state.error}</p>
      ) : data ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[12px] font-medium text-soft">Наша цена</p>
              <p className="text-[20px] font-semibold text-ink">{fmtRub(data.ourPrice)} / кг</p>
            </div>
            <Chip tone={positionTone}>{positionLabel}</Chip>
          </div>

          <div className="mt-3 rounded-[14px] bg-subtle px-4 py-1">
            <InfoRow
              label="Средняя по рынку"
              value={data.marketAvg === null ? "нет данных" : `${fmtRub(data.marketAvg)} / кг`}
            />
            <InfoRow
              label="Разница"
              value={
                data.delta === null
                  ? "—"
                  : `${data.delta > 0 ? "+" : ""}${fmtRub(Math.abs(data.delta))} / кг`
              }
              valueClass={data.delta !== null && data.delta < 0 ? "text-accent" : "text-ink"}
            />
          </div>

          <div className="mt-3 rounded-[14px] border border-line px-4 py-3">
            <p className="text-[12px] font-semibold text-soft">Рекомендация</p>
            <p className="mt-1 text-[14px] font-medium leading-relaxed text-ink">
              {data.recommendation}
            </p>
          </div>

          {state.warnings && state.warnings.length > 0 && (
            <div className="mt-3 rounded-[14px] bg-warm-soft px-4 py-2">
              {state.warnings.map((w) => (
                <p key={w} className="py-0.5 text-[11px] font-medium leading-relaxed text-warm">
                  {w}
                </p>
              ))}
            </div>
          )}

          <p className="pt-2 text-[11px] font-medium text-soft">
            {state.meta?.status === "fallback"
              ? "Шаблонная рекомендация — AI недоступен"
              : `AI · ${state.meta?.model ?? "—"} · ${((state.meta?.latencyMs ?? 0) / 1000).toFixed(1)} с`}
          </p>
        </>
      ) : null}
    </Sheet>
  );
}
