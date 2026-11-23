/**
 * Sheet поставщика: создание и редактирование (5 полей).
 * Телефон и заметки — только внутри приложения (white-label).
 */

import { useState } from "react";
import { SHIPPING_MODE_LABEL, SUPPLIER_LOCATION_LABEL } from "@shared/labels";
import type { ShippingMode, SupplierDTO, SupplierInput, SupplierLocation } from "@shared/types";
import * as api from "../api/client";
import { useToastStore } from "../stores/publish";
import { Btn, Field, Select, Sheet, TextArea, TextInput } from "./ui";

const LOCATIONS: SupplierLocation[] = ["PAVLOVSKAYA", "LENINGRADSKAYA", "TIHORETSK", "OTHER"];
const MODES: ShippingMode[] = ["SELF_LOADS", "FROM_WAREHOUSE", "BOTH"];

export function SupplierSheet({
  supplier,
  onClose,
  onSaved,
}: {
  supplier?: SupplierDTO | null;
  onClose: () => void;
  onSaved: (s: SupplierDTO) => void;
}) {
  const showToast = useToastStore((s) => s.show);
  const [name, setName] = useState(supplier?.name ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [location, setLocation] = useState<SupplierLocation>(supplier?.location ?? "PAVLOVSKAYA");
  const [shippingMode, setShippingMode] = useState<ShippingMode>(
    supplier?.shippingMode ?? "SELF_LOADS",
  );
  const [notes, setNotes] = useState(supplier?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return setError("Укажите название или ФИО");
    if (phone.trim().length < 7) return setError("Укажите телефон");
    setError(null);
    setSaving(true);
    const input: SupplierInput = {
      name: name.trim(),
      phone: phone.trim(),
      location,
      shippingMode,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    try {
      const saved = supplier
        ? await api.updateSupplier(supplier.id, input)
        : await api.createSupplier(input);
      showToast(supplier ? "Поставщик обновлён" : "Поставщик добавлен");
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title={supplier ? "Поставщик" : "Новый поставщик"} onClose={onClose}>
      <div className="flex flex-col gap-3.5 pb-2">
        <Field label="Название или ФИО" required>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="например, Агро-Юг"
            maxLength={120}
          />
        </Field>

        <Field label="Локация" required>
          <Select
            value={location}
            onChange={(v) => setLocation(v as SupplierLocation)}
            options={LOCATIONS.map((l) => ({ value: l, label: SUPPLIER_LOCATION_LABEL[l] }))}
            ariaLabel="Локация поставщика"
          />
        </Field>

        <Field label="Схема отгрузки" required>
          <Select
            value={shippingMode}
            onChange={(v) => setShippingMode(v as ShippingMode)}
            options={MODES.map((m) => ({ value: m, label: SHIPPING_MODE_LABEL[m] }))}
            ariaLabel="Схема отгрузки"
          />
        </Field>

        <Field label="Телефон" required>
          <TextInput
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+7 9XX XXX-XX-XX"
            inputMode="tel"
            maxLength={30}
          />
        </Field>

        <Field label="Заметки" hint="видны только вам">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Условия, доплаты, нюансы отгрузки…"
            maxLength={2000}
          />
        </Field>

        {error && (
          <p className="rounded-[14px] bg-warm-soft px-4 py-3 text-[13px] font-semibold text-warm">
            {error}
          </p>
        )}

        <Btn full size="lg" onClick={submit} disabled={saving}>
          {saving ? "Сохраняю…" : supplier ? "Сохранить" : "Добавить поставщика"}
        </Btn>
      </div>
    </Sheet>
  );
}
