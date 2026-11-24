/**
 * Sheet канала: создание и редактирование (этап 2).
 * lastActivityAt не редактируем — сервер хранит его как есть.
 * Теги — чипы-переключатели, минимум один активный.
 */

import { useState } from "react";
import { CHANNEL_TAGS, CHANNEL_TAG_LABEL } from "@shared/channels";
import { CHANNEL_TYPE_LABEL } from "@shared/labels";
import type { ChannelDTO, ChannelInput, ChannelTag, ChannelType } from "@shared/types";
import * as api from "../api/client";
import { useToastStore } from "../stores/publish";
import { Btn, Field, Select, Sheet, TextArea, TextInput } from "./ui";

/* Сначала Telegram-типы, потом площадки */
const TYPES: ChannelType[] = [
  "TELEGRAM_CHAT",
  "TELEGRAM_CHANNEL",
  "AVITO",
  "AGROSERVER",
  "MAX",
  "YOULA",
  "OTHER",
];

/** Пустая строка → undefined (поле не отправляется на сервер). */
function toNum(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export function ChannelSheet({
  channel,
  onClose,
  onSaved,
}: {
  channel: ChannelDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const showToast = useToastStore((s) => s.show);
  const [name, setName] = useState(channel?.name ?? "");
  const [type, setType] = useState<ChannelType>(channel?.type ?? "TELEGRAM_CHANNEL");
  const [url, setUrl] = useState(channel?.url ?? "");
  const [region, setRegion] = useState(channel?.region ?? "");
  const [tags, setTags] = useState<ChannelTag[]>(channel ? [...channel.tags] : []);
  const [subscribers, setSubscribers] = useState(
    channel?.subscribersCount != null ? String(channel.subscribersCount) : "",
  );
  const [reach, setReach] = useState(channel?.averageReach != null ? String(channel.averageReach) : "");
  const [notes, setNotes] = useState(channel?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const toggleTag = (tag: ChannelTag) => {
    setTags((cur) => (cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]));
  };

  const submit = async () => {
    if (!name.trim() || !url.trim() || !region.trim() || tags.length === 0) {
      showToast("Заполните название, ссылку, регион и хотя бы один тег");
      return;
    }
    setSaving(true);
    const subscribersCount = toNum(subscribers);
    const averageReach = toNum(reach);
    const input: ChannelInput = {
      name: name.trim(),
      type,
      url: url.trim(),
      region: region.trim(),
      tags,
      ...(subscribersCount !== undefined ? { subscribersCount } : {}),
      ...(averageReach !== undefined ? { averageReach } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    try {
      if (channel) {
        await api.updateChannel(channel.id, input);
      } else {
        await api.createChannel(input);
      }
      showToast("Канал сохранён");
      onSaved();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title={channel ? "Канал" : "Новый канал"} onClose={onClose}>
      <div className="flex flex-col gap-3.5 pb-2">
        <Field label="Название" required>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="например, Семена Кубани"
            maxLength={120}
          />
        </Field>

        <Field label="Тип" required>
          <Select
            value={type}
            onChange={(v) => setType(v as ChannelType)}
            options={TYPES.map((t) => ({ value: t, label: CHANNEL_TYPE_LABEL[t] }))}
            ariaLabel="Тип канала"
          />
        </Field>

        <Field label="Ссылка" required hint="t.me/username или URL подачи">
          <TextInput
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="t.me/username"
            inputMode="url"
            maxLength={300}
          />
        </Field>

        <Field label="Регион" required hint="например: ЮФО, Краснодарский край, Федеральный">
          <TextInput
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="ЮФО"
            maxLength={60}
          />
        </Field>

        {/* Теги: чипы-переключатели, минимум один активный */}
        <div>
          <div className="mb-1.5 flex items-baseline gap-1 px-1">
            <span className="text-[13px] font-semibold text-ink">Теги</span>
            <span className="text-[13px] font-semibold text-warm">*</span>
            <span className="ml-auto text-[11px] font-medium text-soft">минимум один</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {CHANNEL_TAGS.map((t) => {
              const active = tags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleTag(t)}
                  className={`press rounded-full px-3.5 py-2 text-[13px] font-semibold ${
                    active
                      ? "bg-accent-soft text-accent"
                      : "border border-line bg-surface text-soft"
                  }`}
                >
                  {CHANNEL_TAG_LABEL[t]}
                </button>
              );
            })}
          </div>
        </div>

        <Field label="Подписчики" hint="необязательно">
          <TextInput
            value={subscribers}
            onChange={(e) => setSubscribers(e.target.value)}
            placeholder="например, 3500"
            inputMode="numeric"
            maxLength={9}
          />
        </Field>

        <Field label="Средний охват" hint="необязательно">
          <TextInput
            value={reach}
            onChange={(e) => setReach(e.target.value)}
            placeholder="например, 1200"
            inputMode="numeric"
            maxLength={9}
          />
        </Field>

        <Field label="Заметки" hint="видны только вам">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Условия подачи, контакты администратора…"
            maxLength={2000}
          />
        </Field>

        <Btn full size="lg" onClick={submit} disabled={saving}>
          {saving ? "Сохраняю…" : channel ? "Сохранить" : "Добавить канал"}
        </Btn>
      </div>
    </Sheet>
  );
}
