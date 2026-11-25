/**
 * ЭТАП «СЕКРЕТЫ» — поле переменной окружения для экранов настроек.
 *
 * Показывает статус (маска ••••1234 / через env / не настроено), поле
 * ввода (паролем), «Сохранить» (шифруется на сервере, в БД — только
 * шифротекст) и «Проверить подключение» (реальный запрос к сервису).
 * Значение переменной клиенту недоступно — только маска.
 */

import { useState } from "react";
import { CheckCircle2, FlaskConical, ShieldCheck } from "lucide-react";
import type { SecretItemDTO, SecretTestDTO } from "@shared/types";
import * as api from "../api/client";
import { useToastStore } from "../stores/publish";
import { secretHint, secretPlaceholder, secretStatusChip, secretTestToast } from "../lib/secrets-ui";
import { Btn, Chip, Field, TextInput } from "./ui";

export function SecretField({
  item,
  label,
  onSaved,
}: {
  item: SecretItemDTO;
  /** Подпись поля (по умолчанию — label из реестра). */
  label?: string;
  /** Колбэк после успешного сохранения (обновить статусы экрана). */
  onSaved?: (item: SecretItemDTO) => void;
}) {
  const showToast = useToastStore((s) => s.show);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState<SecretTestDTO | null>(null);
  const [testing, setTesting] = useState(false);

  const chip = secretStatusChip(item);
  const locked = item.source === "env";

  const save = async () => {
    setSaving(true);
    try {
      const result = await api.saveSecret(item.key, value.trim() || null);
      setValue("");
      setTest(null);
      showToast(`${item.label}: значение ${result.item.configured ? "сохранено" : "убрано"}`, "success");
      onSaved?.(result.item);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    try {
      const result = await api.testSecretConnection(item.key);
      setTest(result);
      showToast(secretTestToast(result.pass), result.pass ? "success" : "error");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Не удалось проверить подключение");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Field label={label ?? item.label} hint={secretHint(item)}>
        <div className="flex items-center gap-2">
          <TextInput
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={locked}
            placeholder={secretPlaceholder(item)}
            aria-label={`${item.label} (${item.key})`}
            className="min-w-0 flex-1"
          />
          <Chip tone={chip.tone} className="shrink-0">
            {chip.label}
          </Chip>
        </div>
      </Field>
      <div className="flex items-center gap-2">
        {item.test !== null && (
          <Btn
            variant="secondary"
            onClick={() => void runTest()}
            disabled={testing || !item.configured}
            loading={testing}
            ariaLabel={`Проверить подключение: ${item.label}`}
          >
            <FlaskConical size={15} className={testing ? "animate-pulse" : ""} />
            {testing ? "Проверяю…" : "Проверить подключение"}
          </Btn>
        )}
        <Btn
          full
          onClick={() => void save()}
          disabled={saving || locked || value.trim().length === 0}
          loading={saving}
          ariaLabel={`Сохранить: ${item.label}`}
        >
          Сохранить
        </Btn>
      </div>
      {test !== null && (
        <div className={`rounded-[14px] px-3.5 py-2.5 ${test.pass ? "bg-accent-soft" : "bg-warm-soft"}`}>
          <div className="flex items-center gap-1.5">
            {test.pass ? (
              <CheckCircle2 size={14} className="shrink-0 text-accent" />
            ) : (
              <ShieldCheck size={14} className="shrink-0 text-warm" />
            )}
            <p className={`text-[11.5px] font-semibold ${test.pass ? "text-accent" : "text-warm"}`}>{test.message}</p>
          </div>
        </div>
      )}
    </div>
  );
}
