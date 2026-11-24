/**
 * Sheet аккаунта: создание и редактирование (этап 2).
 * Пока это учёт: платформа, телефон, статус и лимит размещений в день.
 */

import { useState } from "react";
import { ACCOUNT_PLATFORM_LABEL, ACCOUNT_STATUS_LABEL } from "@shared/labels";
import type { AccountDTO, AccountInput, AccountPlatform, AccountStatus } from "@shared/types";
import * as api from "../api/client";
import { useToastStore } from "../stores/publish";
import { Btn, Field, Select, Sheet, TextArea, TextInput } from "./ui";

const PLATFORMS: AccountPlatform[] = ["TELEGRAM", "AVITO", "MAX", "YOULA", "OTHER"];
const STATUSES: AccountStatus[] = ["ACTIVE", "LIMITED", "PAUSED", "BLOCKED"];

export function AccountSheet({
  account,
  onClose,
  onSaved,
}: {
  account: AccountDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const showToast = useToastStore((s) => s.show);
  const [platform, setPlatform] = useState<AccountPlatform>(account?.platform ?? "TELEGRAM");
  const [phone, setPhone] = useState(account?.phone ?? "");
  const [status, setStatus] = useState<AccountStatus>(account?.status ?? "ACTIVE");
  const [limit, setLimit] = useState(String(account?.dailyLimit ?? 20));
  const [notes, setNotes] = useState(account?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const dailyLimit = limit.trim() === "" ? undefined : Number(limit.trim());
    if (dailyLimit !== undefined && !Number.isFinite(dailyLimit)) {
      showToast("Лимит в день — число");
      return;
    }
    setSaving(true);
    const input: AccountInput = {
      platform,
      /* Пустой телефон при редактировании очищает поле (null) */
      ...(phone.trim() ? { phone: phone.trim() } : account ? { phone: null } : {}),
      status,
      ...(dailyLimit !== undefined ? { dailyLimit: Math.trunc(dailyLimit) } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    try {
      if (account) {
        await api.updateAccount(account.id, input);
      } else {
        await api.createAccount(input);
      }
      showToast("Аккаунт сохранён");
      onSaved();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title={account ? "Аккаунт" : "Новый аккаунт"} onClose={onClose}>
      <div className="flex flex-col gap-3.5 pb-2">
        <Field label="Платформа" required>
          <Select
            value={platform}
            onChange={(v) => setPlatform(v as AccountPlatform)}
            options={PLATFORMS.map((p) => ({ value: p, label: ACCOUNT_PLATFORM_LABEL[p] }))}
            ariaLabel="Платформа аккаунта"
          />
        </Field>

        <Field label="Телефон" hint="необязательно">
          <TextInput
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+7 9XX XXX-XX-XX"
            inputMode="tel"
            maxLength={30}
          />
        </Field>

        <Field label="Статус" required>
          <Select
            value={status}
            onChange={(v) => setStatus(v as AccountStatus)}
            options={STATUSES.map((s) => ({ value: s, label: ACCOUNT_STATUS_LABEL[s] }))}
            ariaLabel="Статус аккаунта"
          />
        </Field>

        <Field label="Лимит в день" hint="размещений" required>
          <TextInput
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            placeholder="20"
            inputMode="numeric"
            maxLength={4}
          />
        </Field>

        <Field label="Заметки" hint="видны только вам">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Например, аккаунт для семян, второй — для ореха…"
            maxLength={2000}
          />
        </Field>

        <Btn full size="lg" onClick={submit} disabled={saving}>
          {saving ? "Сохраняю…" : account ? "Сохранить" : "Добавить аккаунт"}
        </Btn>
      </div>
    </Sheet>
  );
}
