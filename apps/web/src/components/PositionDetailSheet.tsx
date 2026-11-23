/**
 * Карточка позиции (этап 1): сетка атрибутов по шаблону культуры,
 * медиа-галерея, сертификаты, экономика с маржой и inline-правка остатка.
 * Поставщик виден только здесь — в объявлениях его не будет (white-label).
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  CalendarDays,
  Check,
  Image as ImageIcon,
  Pencil,
  Send,
  ShieldCheck,
  Truck,
  X,
} from "lucide-react";
import { formatAttrValue, positionName } from "@shared/attributes";
import { POSITION_STATUS_LABEL, SHIPPING_MODE_LABEL, SUPPLIER_LOCATION_LABEL } from "@shared/labels";
import { calcMargin } from "@shared/pricing";
import type { PositionDTO } from "@shared/types";
import * as api from "../api/client";
import { fmtNum, fmtRub } from "../lib/format";
import { taxRateOf, useCatalog } from "../stores/catalog";
import { usePublishStore, useToastStore } from "../stores/publish";
import { Btn, Chip, InfoRow, Sheet, TextInput } from "./ui";

function statusTone(status: PositionDTO["status"]): "green" | "warm" | "neutral" {
  if (status === "IN_STOCK") return "green";
  if (status === "ON_ORDER") return "warm";
  return "neutral";
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
  const resetFlow = usePublishStore((s) => s.reset);
  const choosePosition = usePublishStore((s) => s.choosePosition);

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
    onClose();
    navigate("/publish");
  };

  return (
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
        <InfoRow
          label="Цена продажи"
          value={`${fmtRub(position.salePrice)} / кг`}
          valueClass="text-accent text-[16px]"
        />
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
      <p className="flex items-center justify-center gap-1.5 px-1 pt-3 text-center text-[11px] font-medium text-soft">
        <ShieldCheck size={12} className="shrink-0" />
        В объявлениях и документах покупатель увидит только товар — поставщик скрыт
      </p>
    </Sheet>
  );
}
