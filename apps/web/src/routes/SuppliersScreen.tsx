/**
 * Поставщики — справочник этапа 1.
 * Список → карточка (Sheet) → форма из 5 полей. WHITE-LABEL:
 * всё, что видно здесь, никогда не попадает в объявления и документы.
 */

import { useEffect, useState } from "react";
import {
  MapPin,
  Package,
  Pencil,
  Phone,
  Plus,
  Trash2,
  Truck,
  Users,
} from "lucide-react";
import { SHIPPING_MODE_LABEL, SUPPLIER_LOCATION_LABEL } from "@shared/labels";
import type { SupplierDTO } from "@shared/types";
import * as api from "../api/client";
import { useCatalog } from "../stores/catalog";
import { useToastStore } from "../stores/publish";
import {
  Btn,
  Card,
  EmptyState,
  InfoRow,
  ScreenHeader,
  Sheet,
  Skeleton,
} from "../components/ui";
import { SupplierSheet } from "../components/SupplierSheet";

type DetailState = { mode: "view"; supplier: SupplierDTO } | { mode: "edit"; supplier: SupplierDTO } | { mode: "create" } | null;

export function SuppliersScreen() {
  const { suppliers, loading, error, load } = useCatalog();
  const showToast = useToastStore((s) => s.show);
  const [sheet, setSheet] = useState<DetailState>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const removeSupplier = async (id: string) => {
    try {
      await api.deleteSupplier(id);
      setConfirmDelete(null);
      setSheet(null);
      showToast("Поставщик удалён");
      await load(true);
    } catch (err) {
      setConfirmDelete(null);
      showToast(err instanceof Error ? err.message : "Не удалось удалить");
    }
  };

  return (
    <div className="screen-rise">
      <ScreenHeader
        title="Поставщики"
        caption={suppliers.length > 0 ? `${suppliers.length} в справочнике` : "справочник пуст"}
        back="/more"
        action={
          <Btn onClick={() => setSheet({ mode: "create" })} ariaLabel="Добавить поставщика">
            <Plus size={16} />
          </Btn>
        }
      />

      <section className="px-5 pt-3 pb-2">
        {error && (
          <Card className="mb-3 p-4">
            <p className="text-[13px] font-semibold text-warm">{error}</p>
            <div className="pt-3">
              <Btn variant="secondary" onClick={() => void load(true)}>
                Повторить
              </Btn>
            </div>
          </Card>
        )}

        {loading && suppliers.length === 0 ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[92px] w-full rounded-[20px]" />
            <Skeleton className="h-[92px] w-full rounded-[20px]" />
            <Skeleton className="h-[92px] w-full rounded-[20px]" />
          </div>
        ) : suppliers.length === 0 && !error ? (
          <Card>
            <EmptyState
              icon={<Users size={26} />}
              title="Поставщиков пока нет"
              caption="Добавьте первого: название, локация, схема отгрузки, телефон и заметки"
            />
            <div className="px-5 pb-5">
              <Btn full size="lg" onClick={() => setSheet({ mode: "create" })}>
                <Plus size={17} />
                Добавить поставщика
              </Btn>
            </div>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {suppliers.map((s) => (
              <Card key={s.id} onClick={() => setSheet({ mode: "view", supplier: s })} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
                    <Users size={19} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-ink">{s.name}</p>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-[12px] font-medium text-soft">
                      <MapPin size={12} className="shrink-0" />
                      {SUPPLIER_LOCATION_LABEL[s.location]} · {SHIPPING_MODE_LABEL[s.shippingMode]}
                    </p>
                    <p className="mt-1 flex items-center gap-1 truncate text-[12px] font-medium text-soft">
                      <Phone size={12} className="shrink-0" />
                      {s.phone} ·{" "}
                      <span className="inline-flex items-center gap-1">
                        <Package size={12} />
                        {s.positionCount} поз.
                      </span>
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 rounded-[14px] bg-subtle px-4 py-3 mt-4">
          <Truck size={16} className="shrink-0 text-soft" />
          <p className="text-[12px] font-medium leading-relaxed text-soft">
            Поставщик виден только вам. В объявлениях, документах и переписке с покупателем его не будет.
          </p>
        </div>
      </section>

      {/* Карточка поставщика */}
      {sheet?.mode === "view" && (
        <Sheet title="Поставщик" onClose={() => setSheet(null)}>
          <p className="text-[18px] font-semibold leading-snug text-ink">{sheet.supplier.name}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Btn variant="secondary" onClick={() => setSheet({ mode: "edit", supplier: sheet.supplier })}>
              <Pencil size={15} />
              Изменить
            </Btn>
            <a
              href={`tel:${sheet.supplier.phone.replace(/[^+\d]/g, "")}`}
              className="press inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[14px] font-semibold text-white shadow-soft"
            >
              <Phone size={15} />
              Позвонить
            </a>
          </div>

          <div className="mt-4 rounded-[14px] bg-subtle px-4 py-1">
            <InfoRow label="Локация" value={SUPPLIER_LOCATION_LABEL[sheet.supplier.location]} />
            <InfoRow
              label="Отгрузка"
              value={SHIPPING_MODE_LABEL[sheet.supplier.shippingMode]}
              valueClass="text-soft"
            />
            <InfoRow label="Телефон" value={sheet.supplier.phone} />
            <InfoRow label="Позиций" value={String(sheet.supplier.positionCount)} valueClass="text-soft" />
          </div>

          {sheet.supplier.notes && (
            <div className="mt-3 rounded-[14px] bg-subtle px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-soft">Заметки</p>
              <p className="mt-1 text-[13px] font-medium leading-relaxed text-ink">
                {sheet.supplier.notes}
              </p>
            </div>
          )}

          {confirmDelete === sheet.supplier.id ? (
            <div className="mt-4 rounded-[14px] bg-warm-soft px-4 py-3">
              <p className="text-[13px] font-semibold text-warm">Удалить поставщика?</p>
              <div className="flex gap-2 pt-3">
                <Btn variant="ghost" onClick={() => setConfirmDelete(null)}>
                  Отмена
                </Btn>
                <Btn onClick={() => void removeSupplier(sheet.supplier.id)}>Удалить</Btn>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(sheet.supplier.id)}
              className="press mt-4 inline-flex items-center gap-1.5 px-1 text-[13px] font-semibold text-warm"
            >
              <Trash2 size={14} />
              Удалить поставщика
            </button>
          )}
        </Sheet>
      )}

      {/* Форма: создание/редактирование */}
      {sheet && sheet.mode !== "view" && (
        <SupplierSheet
          supplier={sheet.mode === "edit" ? sheet.supplier : null}
          onClose={() => setSheet(null)}
          onSaved={() => void load(true)}
        />
      )}
    </div>
  );
}
