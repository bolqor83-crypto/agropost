/**
 * Sheet канала: создание и редактирование (этап 2).
 * lastActivityAt не редактируем — сервер хранит его как есть.
 * Теги — чипы-переключатели, минимум один активный.
 */

import { useState } from "react";
import { CHANNEL_TAGS, CHANNEL_TAG_LABEL } from "@shared/channels";
import {
  AUDIENCE_TYPE_LABEL,
  AUTOMATION_LEVEL_LABEL,
  CHANNEL_TYPE_LABEL,
  CONFIRMATION_STATUS_LABEL,
  SUBMISSION_METHOD_LABEL,
} from "@shared/labels";
import type {
  AudienceType,
  AutomationLevel,
  ChannelDTO,
  ChannelInput,
  ChannelTag,
  ChannelType,
  ConfirmationStatus,
  SubmissionMethod,
} from "@shared/types";
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

/* Этап 2.5: способ подачи и профиль (значения — union-типы). */
const SUBMISSION_METHODS: SubmissionMethod[] = [
  "ADMIN_CONTACT",
  "BOT",
  "SITE_FORM",
  "CABINET",
  "NONE",
];
const CONFIRMATION_STATUSES: ConfirmationStatus[] = ["CONFIRMED", "REQUIRES_CHECK"];
const AUDIENCE_TYPES: AudienceType[] = ["B2B", "REGIONAL", "GENERAL", "B2C"];
/* ЭТАП 9: уровни автоматизации (бейдж в мастере «Разместить»). */
const AUTOMATION_LEVELS: AutomationLevel[] = ["AUTO", "SEMI", "MANUAL"];

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
  const [city, setCity] = useState(channel?.city ?? "");
  const [tags, setTags] = useState<ChannelTag[]>(channel ? [...channel.tags] : []);
  const [subscribers, setSubscribers] = useState(
    channel?.subscribersCount != null ? String(channel.subscribersCount) : "",
  );
  const [reach, setReach] = useState(channel?.averageReach != null ? String(channel.averageReach) : "");
  const [notes, setNotes] = useState(channel?.notes ?? "");
  /* Этап 2.5: подача и профиль. */
  const [submissionMethod, setSubmissionMethod] = useState<SubmissionMethod>(
    channel?.submissionMethod ?? "NONE",
  );
  const [submissionBotUsername, setSubmissionBotUsername] = useState(
    channel?.submissionBotUsername ?? "",
  );
  const [adminContact, setAdminContact] = useState(channel?.adminContact ?? "");
  const [frequencyLimit, setFrequencyLimit] = useState(channel?.frequencyLimit ?? "");
  const [confirmationStatus, setConfirmationStatus] = useState<ConfirmationStatus>(
    channel?.confirmationStatus ?? "CONFIRMED",
  );
  const [audienceType, setAudienceType] = useState<AudienceType | "NONE">(
    channel?.audienceType ?? "NONE",
  );
  /* ЭТАП 9: уровень автоматизации канала. */
  const [automationLevel, setAutomationLevel] = useState<AutomationLevel>(
    channel?.automationLevel ?? "SEMI",
  );
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
      ...(city.trim() ? { city: city.trim() } : { city: null }),
      tags,
      ...(subscribersCount !== undefined ? { subscribersCount } : {}),
      ...(averageReach !== undefined ? { averageReach } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      /* Этап 2.5: подача и профиль. */
      submissionMethod,
      ...(submissionBotUsername.trim() ? { submissionBotUsername: submissionBotUsername.trim() } : { submissionBotUsername: null }),
      ...(adminContact.trim() ? { adminContact: adminContact.trim() } : { adminContact: null }),
      ...(frequencyLimit.trim() ? { frequencyLimit: frequencyLimit.trim() } : { frequencyLimit: null }),
      confirmationStatus,
      ...(audienceType !== "NONE" ? { audienceType } : { audienceType: null }),
      /* ЭТАП 9: уровень автоматизации. */
      automationLevel,
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

        <Field label="Город" hint="для ротации внутри региона; пусто — весь регион">
          <TextInput
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="например: Таганрог"
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

        {/* Этап 2.5: способ подачи — открываем нужную точку входа в мастере */}
        <Field label="Способ подачи" hint="как подавать объявление">
          <Select
            value={submissionMethod}
            onChange={(v) => setSubmissionMethod(v as SubmissionMethod)}
            options={SUBMISSION_METHODS.map((m) => ({ value: m, label: SUBMISSION_METHOD_LABEL[m] }))}
            ariaLabel="Способ подачи"
          />
        </Field>

        {/* ЭТАП 9: бейдж автоматизации в мастере «Разместить». */}
        <Field label="Автоматизация" hint="кто публикует">
          <Select
            value={automationLevel}
            onChange={(v) => setAutomationLevel(v as AutomationLevel)}
            options={AUTOMATION_LEVELS.map((l) => ({
              value: l,
              label: AUTOMATION_LEVEL_LABEL[l],
            }))}
            ariaLabel="Автоматизация"
          />
        </Field>

        {submissionMethod === "BOT" && (
          <Field label="Бот-приёмщик" hint="например, @Taganrog_Predlozhka_bot">
            <TextInput
              value={submissionBotUsername}
              onChange={(e) => setSubmissionBotUsername(e.target.value)}
              placeholder="@Taganrog_Predlozhka_bot"
              maxLength={60}
            />
          </Field>
        )}

        {submissionMethod === "ADMIN_CONTACT" && (
          <Field label="Контакт админа" hint="например, @admn_013">
            <TextInput
              value={adminContact}
              onChange={(e) => setAdminContact(e.target.value)}
              placeholder="@admn_013"
              maxLength={60}
            />
          </Field>
        )}

        <Field label="Лимит подач" hint="необязательно; например: 2 раза в день">
          <TextInput
            value={frequencyLimit}
            onChange={(e) => setFrequencyLimit(e.target.value)}
            placeholder="2 раза в день"
            maxLength={60}
          />
        </Field>

        <Field label="Статус проверки" hint="проверен ли канал для подачи">
          <Select
            value={confirmationStatus}
            onChange={(v) => setConfirmationStatus(v as ConfirmationStatus)}
            options={CONFIRMATION_STATUSES.map((s) => ({
              value: s,
              label: CONFIRMATION_STATUS_LABEL[s],
            }))}
            ariaLabel="Статус проверки"
          />
        </Field>

        <Field label="Аудитория" hint="профиль канала — для подбора">
          <Select
            value={audienceType}
            onChange={(v) => setAudienceType(v as AudienceType | "NONE")}
            options={[
              { value: "NONE", label: "не указана" },
              ...AUDIENCE_TYPES.map((a) => ({ value: a, label: AUDIENCE_TYPE_LABEL[a] })),
            ]}
            ariaLabel="Аудитория канала"
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
