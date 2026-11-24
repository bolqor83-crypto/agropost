/**
 * Мастер создания позиции — 4 шага:
 * поставщик и культура → атрибуты по шаблону → цена и объём → медиа.
 *
 * Позиция создаётся одним POST после шага 3. Файлы с шага 4 — через
 * единое хранилище (ЭТАП 6): R2 настроен → напрямую из браузера по
 * presigned-ссылке; без R2 → JSON-загрузкой через сервер, фото
 * сохраняются в базе (медленно, но работает). Видео требует R2.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Bean,
  Check,
  ChevronLeft,
  CloudUpload,
  Image as ImageIcon,
  Sprout,
  Trash2,
} from "lucide-react";
import { computeSalePrice } from "@shared/pricing";
import { normalizeAttributes } from "@shared/attributes";
import type {
  AttributeField,
  CultureType,
  MediaDTO,
  PositionDTO,
  PositionStatus,
} from "@shared/types";
import * as api from "../api/client";
import { useCatalog } from "../stores/catalog";
import { useToastStore } from "../stores/publish";
import { Btn, Chip, Field, Segmented, Sheet, TextInput, ToggleRow } from "./ui";

const STEPS = ["Поставщик", "Атрибуты", "Цена", "Медиа"] as const;

interface PickedFile {
  file: File;
  preview: string;
}

function StepBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1.5 px-1 pb-1">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const active = step === n;
        const done = step > n;
        return (
          <div
            key={label}
            aria-current={active ? "step" : undefined}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[12px] font-semibold ${
              active ? "bg-accent-soft text-accent" : done ? "bg-subtle text-ink" : "bg-subtle/60 text-soft"
            }`}
          >
            {done ? <Check size={13} /> : <span>{n}.</span>}
            {label}
          </div>
        );
      })}
    </div>
  );
}

function num(value: string): number {
  return Number(value.replace(",", ".").replace(/\s/g, ""));
}

export function PositionWizard({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (p: PositionDTO) => void;
}) {
  const showToast = useToastStore((s) => s.show);
  const { suppliers, cultures, load } = useCatalog();

  /* Шаг 1 */
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [cultureId, setCultureId] = useState<string | null>(null);

  /* Шаг 2: значения атрибутов — строки, в числа превращает normalizeAttributes */
  const [attrs, setAttrs] = useState<Record<string, string>>({});
  const [attrsError, setAttrsError] = useState<string | null>(null);

  /* Шаг 3 */
  const [supplierPrice, setSupplierPrice] = useState("");
  const [markupPercent, setMarkupPercent] = useState("15");
  const [volumeKg, setVolumeKg] = useState("");
  const [bagWeightKg, setBagWeightKg] = useState("25");
  const [minLotKg, setMinLotKg] = useState("");
  const [status, setStatus] = useState<PositionStatus>("IN_STOCK");
  const [hasCertificate, setHasCertificate] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  /* Шаг 4 */
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [creating, setCreating] = useState(false);
  /* ЭТАП 6: режим хранилища — R2 (presigned) или base64 (JSON через сервер). */
  const [storageMode, setStorageMode] = useState<"base64" | "r2" | null>(null);

  useEffect(() => {
    /* ЭТАП 6: холодный старт/диплинк на /positions — каталог мог не
    загрузиться (его грузит Пульт). Загружаем сами: load() идемпотентен. */
    void load();
    api
      .getMeta()
      .then((meta) => setStorageMode(meta.storage.mode))
      .catch(() => setStorageMode("base64"));
  }, [load]);

  const culture = useMemo(
    () => cultures.find((c) => c.id === cultureId) ?? null,
    [cultures, cultureId],
  );
  const salePricePreview = useMemo(() => {
    const price = num(supplierPrice);
    const markup = num(markupPercent);
    if (!Number.isFinite(price) || !Number.isFinite(markup)) return null;
    return computeSalePrice(price, markup);
  }, [supplierPrice, markupPercent]);

  const seedCultures = (type: CultureType) => cultures.filter((c) => c.type === type);

  const pickCulture = (id: string) => {
    setCultureId(id);
    setAttrs({});
    setAttrsError(null);
  };

  const toNextFromStep2 = () => {
    if (!culture) return;
    try {
      normalizeAttributes(culture.attributesSchema, attrs);
      setAttrsError(null);
      setStep(3);
    } catch (err) {
      setAttrsError(err instanceof Error ? err.message : "Проверьте атрибуты");
    }
  };

  const toNextFromStep3 = () => {
    const price = num(supplierPrice);
    const markup = num(markupPercent);
    const volume = num(volumeKg);
    const bag = num(bagWeightKg);
    const lot = num(minLotKg);
    if (!Number.isFinite(price) || price <= 0) return setPriceError("Укажите цену закупа, ₽/кг");
    if (!Number.isFinite(markup) || markup < 0) return setPriceError("Укажите наценку, %");
    if (!Number.isFinite(volume) || volume < 0) return setPriceError("Укажите остаток, кг");
    if (!Number.isInteger(bag) || bag < 1) return setPriceError("Мешок — целое число от 1 кг");
    if (!Number.isFinite(lot) || lot < 0) return setPriceError("Укажите минимальную партию, кг");
    setPriceError(null);
    setStep(4);
  };

  const onFilesPicked = (list: FileList | null) => {
    if (!list) return;
    const picked: PickedFile[] = [];
    for (const file of Array.from(list)) {
      if (file.size > 25 * 1024 * 1024) {
        showToast(`«${file.name}» больше 25 МБ — пропущен`);
        continue;
      }
      picked.push({ file, preview: URL.createObjectURL(file) });
    }
    setFiles((prev) => [...prev, ...picked].slice(0, 12));
  };

  const create = async () => {
    if (!supplierId || !culture) return;
    setCreating(true);
    try {
      const attributes = normalizeAttributes(culture.attributesSchema, attrs);
      let created = await api.createPosition({
        supplierId,
        cultureId: culture.id,
        attributes,
        volumeKg: Math.round(num(volumeKg)),
        bagWeightKg: Math.round(num(bagWeightKg)),
        supplierPrice: num(supplierPrice),
        markupPercent: num(markupPercent),
        minLotKg: Math.round(num(minLotKg)),
        hasCertificate,
        status,
      });

      /* ЭТАП 6: медиа — через единое хранилище. R2 → presigned из браузера;
      base64 → JSON через сервер (фото; видео в этом режиме не грузим). */
      if (files.length > 0) {
        const uploaded: MediaDTO[] = [];
        for (const { file } of files) {
          try {
            const isVideo = file.type.startsWith("video/");
            if (storageMode !== "r2") {
              if (isVideo) {
                showToast("Видео можно добавить после настройки R2 — позиция сохранена без него");
                continue;
              }
              if (file.size > 8 * 1024 * 1024) {
                showToast(`«${file.name}» больше 8 МБ — без R2 не сохранится, пропущено`);
                continue;
              }
              const dataUrl = await api.readFileAsDataUrl(file);
              const res = await api.uploadPositionMedia(created.id, { dataUrl, type: "PHOTO" });
              uploaded.push(res.media);
            } else {
              const res = await api.requestMediaUpload(created.id, {
                type: isVideo ? "VIDEO" : "PHOTO",
                contentType: file.type,
              });
              await api.putFile(res.uploadUrl, file, res.headers);
              uploaded.push(res.media);
            }
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Файл не загрузился");
          }
        }
        if (uploaded.length > 0) {
          created = { ...created, media: [...created.media, ...uploaded] };
        }
      }

      await load(true);
      showToast("Позиция создана");
      onCreated(created);
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Не удалось создать позицию");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Sheet title="Новая позиция" onClose={onClose}>
      <StepBar step={step} />

      {/* -------- Шаг 1: поставщик и культура -------- */}
      {step === 1 && (
        <div className="flex flex-col gap-4 pt-3">
          <div>
            <p className="mb-2 px-1 text-[13px] font-semibold text-ink">Поставщик</p>
            <div className="flex flex-col gap-2">
              {suppliers.length === 0 && (
                <p className="rounded-[14px] bg-subtle px-4 py-3 text-[13px] font-medium text-soft">
                  Поставщиков пока нет — добавьте первого в разделе «Поставщики»
                </p>
              )}
              {suppliers.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSupplierId(s.id)}
                  className={`press flex items-center gap-3 rounded-[14px] border bg-surface px-3.5 py-3 text-left ${
                    supplierId === s.id ? "border-accent" : "border-line"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-ink">{s.name}</span>
                    <span className="block truncate text-[12px] font-medium text-soft">
                      {s.positionCount} позиций
                    </span>
                  </span>
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${
                      supplierId === s.id ? "border-accent bg-accent text-white" : "border-line"
                    }`}
                    aria-hidden
                  >
                    {supplierId === s.id && <Check size={13} strokeWidth={3} />}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {(["SEED", "NUT"] as CultureType[]).map((type) => (
            <div key={type}>
              <p className="mb-2 flex items-center gap-1.5 px-1 text-[13px] font-semibold text-ink">
                {type === "SEED" ? <Sprout size={14} className="text-accent" /> : <Bean size={14} className="text-warm" />}
                {type === "SEED" ? "Семена трав" : "Орехи"}
              </p>
              <div className="flex flex-wrap gap-2">
                {seedCultures(type).map((c) => {
                  const selected = cultureId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => pickCulture(c.id)}
                      className={`press rounded-full border px-3.5 py-2 text-[13px] font-semibold ${
                        selected
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-line bg-surface text-ink"
                      }`}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <Btn
            full
            size="lg"
            disabled={!supplierId || !cultureId}
            onClick={() => setStep(2)}
          >
            Дальше — атрибуты
          </Btn>
        </div>
      )}

      {/* -------- Шаг 2: атрибуты по шаблону культуры -------- */}
      {step === 2 && culture && (
        <div className="flex flex-col gap-3.5 pt-3">
          <p className="px-1 text-[13px] font-medium text-soft">
            {culture.name} · поля по шаблону культуры
          </p>
          {culture.attributesSchema.map((f: AttributeField) => (
            <Field
              key={f.key}
              label={`${f.label}${f.unit ? `, ${f.unit}` : ""}`}
              required={f.required}
            >
              <TextInput
                value={attrs[f.key] ?? ""}
                onChange={(e) => setAttrs((a) => ({ ...a, [f.key]: e.target.value }))}
                inputMode={f.type === "text" ? "text" : "numeric"}
                placeholder={
                  f.displayType === "RANGE"
                    ? "45–50 или 32+"
                    : f.displayType === "MIN"
                      ? "не менее 45"
                      : f.type === "percent"
                        ? "0–100"
                        : f.type === "year"
                          ? "2025"
                          : "—"
                }
              />
            </Field>
          ))}
          {attrsError && (
            <p className="rounded-[14px] bg-warm-soft px-4 py-3 text-[13px] font-semibold text-warm">
              {attrsError}
            </p>
          )}
          <div className="flex gap-3 pt-1">
            <Btn variant="secondary" size="lg" onClick={() => setStep(1)} ariaLabel="Назад">
              <ChevronLeft size={17} />
            </Btn>
            <Btn full size="lg" onClick={toNextFromStep2}>
              Дальше — цена и объём
            </Btn>
          </div>
        </div>
      )}

      {/* -------- Шаг 3: цена и объём -------- */}
      {step === 3 && (
        <div className="flex flex-col gap-3.5 pt-3">
          <Field label="Цена закупа, ₽/кг" required>
            <TextInput
              value={supplierPrice}
              onChange={(e) => setSupplierPrice(e.target.value)}
              inputMode="decimal"
              placeholder="например, 185"
            />
          </Field>
          <Field label="Наценка, %" required hint="обычно 15–20">
            <TextInput
              value={markupPercent}
              onChange={(e) => setMarkupPercent(e.target.value)}
              inputMode="decimal"
              placeholder="15"
            />
          </Field>
          {salePricePreview !== null && (
            <div className="flex items-center justify-between rounded-[14px] bg-accent-soft px-4 py-3">
              <span className="text-[13px] font-semibold text-accent">Цена продажи</span>
              <span className="text-[16px] font-semibold text-accent">
                {new Intl.NumberFormat("ru-RU").format(salePricePreview)} ₽ / кг
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Остаток, кг" required>
              <TextInput
                value={volumeKg}
                onChange={(e) => setVolumeKg(e.target.value)}
                inputMode="numeric"
                placeholder="3000"
              />
            </Field>
            <Field label="Мешок, кг" required>
              <TextInput
                value={bagWeightKg}
                onChange={(e) => setBagWeightKg(e.target.value)}
                inputMode="numeric"
                placeholder="25"
              />
            </Field>
          </div>
          <Field label="Минимальная партия, кг" required>
            <TextInput
              value={minLotKg}
              onChange={(e) => setMinLotKg(e.target.value)}
              inputMode="numeric"
              placeholder="1500"
            />
          </Field>
          <Field label="Статус">
            <Segmented<PositionStatus>
              items={[
                { value: "IN_STOCK", label: "В наличии" },
                { value: "ON_ORDER", label: "Под заказ" },
                { value: "OUT_OF_STOCK", label: "Нет в наличии" },
              ]}
              value={status}
              onChange={setStatus}
            />
          </Field>
          <ToggleRow
            checked={hasCertificate}
            onToggle={() => setHasCertificate((v) => !v)}
            label="Есть сертификат"
            hint="файл можно приложить позже"
          />
          {priceError && (
            <p className="rounded-[14px] bg-warm-soft px-4 py-3 text-[13px] font-semibold text-warm">
              {priceError}
            </p>
          )}
          <div className="flex gap-3 pt-1">
            <Btn variant="secondary" size="lg" onClick={() => setStep(2)} ariaLabel="Назад">
              <ChevronLeft size={17} />
            </Btn>
            <Btn full size="lg" onClick={toNextFromStep3}>
              Дальше — медиа
            </Btn>
          </div>
        </div>
      )}

      {/* -------- Шаг 4: медиа -------- */}
      {step === 4 && (
        <div className="flex flex-col gap-3.5 pt-3">
          <label className="press flex cursor-pointer flex-col items-center gap-2 rounded-[20px] border-2 border-dashed border-line bg-surface px-6 py-7 text-center">
            <CloudUpload size={26} className="text-accent" />
            <span className="text-[14px] font-semibold text-ink">Добавить фото или видео</span>
            <span className="text-[12px] font-medium text-soft">
              JPEG, PNG, WebP, MP4 — до 25 МБ, можно несколько
            </span>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
              className="hidden"
              onChange={(e) => {
                onFilesPicked(e.target.files);
                e.target.value = "";
              }}
            />
          </label>

          {files.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {files.map((f, i) => (
                <div key={f.preview} className="relative">
                  {f.file.type.startsWith("video/") ? (
                    <div className="grid aspect-square place-items-center rounded-[14px] bg-subtle text-soft">
                      <ImageIcon size={20} />
                    </div>
                  ) : (
                    <img
                      src={f.preview}
                      alt={f.file.name}
                      className="aspect-square w-full rounded-[14px] border border-line object-cover"
                    />
                  )}
                  <button
                    type="button"
                    aria-label={`Убрать файл ${i + 1}`}
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="press absolute -right-1.5 -top-1.5 grid h-7 w-7 place-items-center rounded-full bg-ink text-white"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 rounded-[14px] bg-subtle px-4 py-3">
            <Chip tone={storageMode === "r2" ? "green" : "outline"}>{storageMode === "r2" ? "R2" : "БД"}</Chip>
            <p className="text-[12px] font-medium leading-relaxed text-soft">
              {storageMode === "r2"
                ? "Файлы уйдут напрямую в Cloudflare R2 по ссылке на 15 минут."
                : "R2 не настроен: фото будут сохранены в базе (медленно), рекомендуем настроить R2. Видео — только после настройки R2."}
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <Btn variant="secondary" size="lg" onClick={() => setStep(3)} ariaLabel="Назад">
              <ChevronLeft size={17} />
            </Btn>
            <Btn full size="lg" onClick={create} disabled={creating}>
              {creating ? "Создаю…" : "Создать позицию"}
            </Btn>
          </div>
        </div>
      )}
    </Sheet>
  );
}
