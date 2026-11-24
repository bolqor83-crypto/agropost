/**
 * Рекламация (этап 4): фиксация претензии покупателя по сделке.
 * Фиксирует проблему; переадресация поставщику — из карточки сделки.
 */

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import * as api from "../api/client";
import { useToastStore } from "../stores/publish";
import { Btn, Field, Sheet, TextArea } from "../components/ui";

export function ClaimSheet({
  dealId,
  onClose,
  onCreated,
}: {
  dealId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const showToast = useToastStore((s) => s.show);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = () => {
    if (description.trim().length < 5) {
      showToast("Опишите претензию подробнее");
      return;
    }
    setBusy(true);
    api
      .createClaim({ dealId, description: description.trim() })
      .then(() => {
        showToast("Рекламация зафиксирована");
        onCreated();
      })
      .catch((err) => showToast(err instanceof Error ? err.message : "Не удалось сохранить"))
      .finally(() => setBusy(false));
  };

  return (
    <Sheet title="Рекламация" onClose={onClose}>
      <Field
        label="Что случилось"
        required
        hint="фото — после R2"
      >
        <TextArea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Например: 2 мешка пришли со следами влаги, упаковка порвана"
          aria-label="Описание претензии"
        />
      </Field>

      <div className="mt-3 flex items-start gap-2 rounded-[14px] bg-subtle px-4 py-3">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-soft" />
        <p className="text-[11px] font-medium leading-relaxed text-soft">
          Вы отвечаете перед покупателем. Внутри приложения претензию можно переадресовать
          поставщику — покупатель его не увидит.
        </p>
      </div>

      <div className="mt-4 pb-2">
        <Btn full size="lg" disabled={busy} onClick={submit}>
          Зафиксировать претензию
        </Btn>
      </div>
    </Sheet>
  );
}
