/**
 * Рекламация (этап 4): фиксация претензии покупателя по сделке.
 * Фиксирует проблему; переадресация поставщику — из карточки сделки.
 * ЭТАП 6: фото к претензии — «Прикрепить фото» → единое хранилище
 * (без R2 — base64 в БД; с R2 — файл в бакете, в БД URL).
 */

import { useRef, useState } from "react";
import { Camera, ShieldCheck, Trash2 } from "lucide-react";
import * as api from "../api/client";
import { useToastStore } from "../stores/publish";
import { Btn, Field, Sheet, TextArea } from "../components/ui";

interface PickedPhoto {
  file: File;
  preview: string;
}

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PHOTO_MAX_BYTES = 10 * 1024 * 1024; /* 10 МБ */
const PHOTOS_MAX = 12;

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
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onPhotosPicked = (list: FileList | null) => {
    if (!list) return;
    const picked: PickedPhoto[] = [];
    for (const file of Array.from(list)) {
      if (!PHOTO_TYPES.includes(file.type)) {
        showToast(`«${file.name}» — не JPEG/PNG/WebP, пропущено`);
        continue;
      }
      if (file.size > PHOTO_MAX_BYTES) {
        showToast(`«${file.name}» больше 10 МБ — пропущено`);
        continue;
      }
      picked.push({ file, preview: URL.createObjectURL(file) });
    }
    setPhotos((prev) => [...prev, ...picked].slice(0, PHOTOS_MAX));
  };

  const submit = async () => {
    if (description.trim().length < 5) {
      showToast("Опишите претензию подробнее");
      return;
    }
    setBusy(true);
    try {
      const claim = await api.createClaim({ dealId, description: description.trim() });
      /* Фото — к созданной претензии, по одному (устойчиво к ошибкам). */
      let failed = 0;
      for (const { file } of photos) {
        try {
          const dataUrl = await api.readFileAsDataUrl(file);
          await api.addClaimPhoto(claim.id, dataUrl);
        } catch (err) {
          failed += 1;
          showToast(err instanceof Error ? err.message : "Фото не загрузилось");
        }
      }
      showToast(
        photos.length === 0
          ? "Рекламация зафиксирована"
          : failed === 0
            ? `Рекламация зафиксирована (${photos.length} ${photos.length === 1 ? "фото" : "фото"})`
            : `Рекламация зафиксирована, ${failed} фото не загрузилось`,
      );
      onCreated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Рекламация" onClose={onClose}>
      <Field
        label="Что случилось"
        required
        hint="можно приложить фото"
      >
        <TextArea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Например: 2 мешка пришли со следами влаги, упаковка порвана"
          aria-label="Описание претензии"
        />
      </Field>

      {/* ЭТАП 6: фото претензии */}
      <div className="mt-3">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            onPhotosPicked(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={busy || photos.length >= PHOTOS_MAX}
          onClick={() => fileRef.current?.click()}
          className="press flex w-full items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-line bg-surface px-4 py-4 text-center disabled:opacity-50"
        >
          <Camera size={22} className="text-accent" />
          <span className="text-[13.5px] font-semibold text-ink">Прикрепить фото</span>
          <span className="text-[11.5px] font-medium text-soft">до 10 МБ, JPEG/PNG/WebP</span>
        </button>
      </div>

      {photos.length > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {photos.map((p, i) => (
            <div key={p.preview} className="relative">
              <img
                src={p.preview}
                alt={`Фото ${i + 1}`}
                className="aspect-square w-full rounded-[14px] border border-line object-cover"
              />
              <button
                type="button"
                aria-label={`Убрать фото ${i + 1}`}
                disabled={busy}
                onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                className="press absolute -right-1.5 -top-1.5 grid h-7 w-7 place-items-center rounded-full bg-ink text-white disabled:opacity-50"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-start gap-2 rounded-[14px] bg-subtle px-4 py-3">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-soft" />
        <p className="text-[11px] font-medium leading-relaxed text-soft">
          Вы отвечаете перед покупателем. Внутри приложения претензию можно переадресовать
          поставщику — покупатель его не увидит.
        </p>
      </div>

      <div className="mt-4 pb-2">
        <Btn full size="lg" disabled={busy} onClick={submit}>
          {busy ? "Сохраняю…" : "Зафиксировать претензию"}
        </Btn>
      </div>
    </Sheet>
  );
}
