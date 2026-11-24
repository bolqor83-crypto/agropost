/**
 * Разместить — главный поток приложения (этап 2):
 * Позиция → Каналы (умный подбор + полный каталог) → Черновики → Итог.
 * Черновик текста собирает сервер (шаблон, white-label — поставщик
 * не упоминается). «Отметить размещено» ставит PUBLISHED и растит
 * счётчик аккаунта канала. Автопостинг через бота — этап 3.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  Copy,
  ExternalLink,
  Lightbulb,
  MapPin,
  Send,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { attrSummary, positionName } from "@shared/attributes";
import { listingPlatformForChannel } from "@shared/listing-text";
import { CHANNEL_TAG_LABEL, submissionTarget } from "@shared/channels";
import { CHANNEL_TYPE_LABEL, LISTING_STATUS_LABEL, SUBMISSION_METHOD_LABEL } from "@shared/labels";
import type {
  ChannelDTO,
  ListingDTO,
  PositionDTO,
  RotationDTO,
  SuggestedChannelDTO,
  TelegramStatusDTO,
} from "@shared/types";
import type { AiListingData, AiMeta } from "@shared/ai";
import * as api from "../api/client";
import { fmtNum, fmtRub } from "../lib/format";
import { CHANNEL_ICON } from "../features/channels/icons";
import { useActivityStore, usePublishStore, useToastStore } from "../stores/publish";
import { useCatalog } from "../stores/catalog";
import { useChannels } from "../stores/channels";
import { dismissTip, shouldShowGeoRotationTip, tipDismissed } from "../lib/tips";
import { Btn, Card, Chip, EmptyState, InfoRow, ScreenHeader, SectionTitle, Skeleton, TextArea } from "../components/ui";

function StepBar({ step, onStep }: { step: 1 | 2 | 3 | 4; onStep: (s: 1 | 2 | 3 | 4) => void }) {
  const labels = ["Позиция", "Каналы", "Текст", "Итог"];
  return (
    <div className="flex items-center gap-1.5 px-5">
      {labels.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3 | 4;
        const active = step === n;
        const done = step > n;
        return (
          <button
            key={label}
            type="button"
            onClick={() => n < step && onStep(n)}
            className={`press flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[12px] font-semibold ${
              active
                ? "bg-accent-soft text-accent"
                : done
                  ? "bg-subtle text-ink"
                  : "bg-subtle/60 text-soft"
            }`}
            aria-current={active ? "step" : undefined}
          >
            {done ? <CheckCircle2 size={13} /> : <span>{n}.</span>}
            {label}
          </button>
        );
      })}
    </div>
  );
}

function PositionPickCard({
  p,
  selected,
  onPick,
}: {
  p: PositionDTO;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <Card
      onClick={onPick}
      className={`flex items-center gap-3 p-4 ${selected ? "ring-2 ring-accent/40" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-ink">
          {positionName(p.culture.name, p.attributes)}
        </p>
        <p className="mt-1 truncate text-[12px] font-medium text-soft">
          {attrSummary(p.culture.attributesSchema, p.attributes)} · {fmtNum(p.volumeKg)} кг в наличии
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="whitespace-nowrap text-[13px] font-semibold text-ink">{fmtRub(p.salePrice)}</p>
        <p className="whitespace-nowrap text-[11px] font-medium text-soft">за кг</p>
      </div>
      <div
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${
          selected ? "border-accent bg-accent text-white" : "border-line"
        }`}
        aria-hidden
      >
        {selected && <Check size={13} strokeWidth={3} />}
      </div>
    </Card>
  );
}

/** Канал в списке шага 2: cooldown-поля приходят из подборки (этап 2.1). */
type PickChannel = ChannelDTO & { cooldown?: boolean; daysSince?: number | null };

function ChannelPickCard({
  c,
  checked,
  onToggle,
}: {
  c: PickChannel;
  checked: boolean;
  onToggle: () => void;
}) {
  const Icon = CHANNEL_ICON[c.type];
  const reach = c.averageReach ?? c.subscribersCount;
  return (
    <Card onClick={onToggle} className="flex items-center gap-3 p-4">
      <div
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
          checked ? "bg-accent-soft text-accent" : "bg-subtle text-soft"
        }`}
      >
        <Icon size={19} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="min-w-0 truncate text-[14px] font-semibold text-ink">{c.name}</p>
          {c.cooldown && (
            <Chip tone="warm" className="shrink-0">
              ⏳ {c.daysSince} дн
            </Chip>
          )}
        </div>
        <p className="mt-0.5 truncate text-[12px] font-medium text-soft">
          {CHANNEL_TYPE_LABEL[c.type]} · {c.region}
          {c.city && ` · ${c.city}`}
          {reach !== null && ` · ${fmtNum(reach)} охват`}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {c.tags.map((t) => (
            <Chip key={t} tone="outline">
              {CHANNEL_TAG_LABEL[t]}
            </Chip>
          ))}
        </div>
      </div>
      <div
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${
          checked ? "border-accent bg-accent text-white" : "border-line"
        }`}
        aria-hidden
      >
        {checked && <Check size={13} strokeWidth={3} />}
      </div>
    </Card>
  );
}

/** «3 дня» / «никогда» — подпись города в виджете ротации. */
function rotationCityLabel(days: number | null): string {
  if (days === null) return "никогда";
  if (days === 0) return "сегодня";
  if (days === 1) return "1 день";
  if (days < 5) return `${days} дня`;
  return `${days} дн`;
}

/** Виджет «Ротация по региону»: города региона и где размещать сегодня. */
function RotationWidget({ rotation }: { rotation: RotationDTO }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <MapPin size={14} className="shrink-0 text-accent" />
        <p className="text-[13px] font-semibold text-ink">Ротация по региону</p>
        <Chip tone="outline">{rotation.region}</Chip>
      </div>
      <p className="mt-1 text-[12px] font-medium text-soft">
        Каждый день — новый город; канал видит объявление раз в 1–2 недели
      </p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {rotation.cities.map((c) => {
          const recommended = rotation.recommendedCity === c.city;
          return (
            <span
              key={c.city}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                recommended
                  ? "bg-accent-soft text-accent"
                  : c.available
                    ? "border border-accent/30 bg-transparent text-accent"
                    : "bg-subtle text-soft"
              }`}
            >
              {c.city} — {rotationCityLabel(c.daysSince)}
              {!c.available && c.cooldownDaysLeft > 0 && ` (ждать ${c.cooldownDaysLeft} дн)`}
            </span>
          );
        })}
      </div>
      {rotation.recommendedCity && (
        <p className="mt-2 text-[12px] font-semibold text-accent">
          Сегодня размещаем в: {rotation.recommendedCity}
        </p>
      )}
    </Card>
  );
}

/** Черновик по каналу: listing | "pending" | "failed". */
type DraftState = Record<string, ListingDTO | "pending" | "failed">;

/** ЭТАП 7: совет про гео-ротацию в шаге «Каналы» — один раз, мягко. */
function GeoRotationTip({ onDismiss }: { onDismiss: () => void }) {
  return (
    <Card className="flex items-start gap-3 p-4">
      <Lightbulb size={18} className="mt-0.5 shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-ink">Совет</p>
        <p className="mt-0.5 text-[12px] font-medium leading-relaxed text-soft">
          Используйте гео-ротацию — размещайтесь по городам региона,
          чтобы не спамить в один канал и не попасть под бан
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="press mt-1 text-[12px] font-semibold text-accent"
        >
          Понятно
        </button>
      </div>
    </Card>
  );
}

function isListing(d: ListingDTO | "pending" | "failed" | undefined): d is ListingDTO {
  return Boolean(d) && typeof d === "object";
}

export function PublishScreen() {
  const navigate = useNavigate();
  const { step, positionId, channelIds, setStep, choosePosition, toggleChannel, reset } =
    usePublishStore();
  const addActivity = useActivityStore((s) => s.addItems);
  const showToast = useToastStore((s) => s.show);
  const { positions, loading, load } = useCatalog();
  const { channels, load: loadChannels } = useChannels();
  const [suggested, setSuggested] = useState<SuggestedChannelDTO[]>([]);
  const [rotation, setRotation] = useState<RotationDTO | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [drafts, setDrafts] = useState<DraftState>({});

  /* ЭТАП 7: совет про гео-ротацию — один раз, закрывается навсегда. */
  const [geoTipDismissed, setGeoTipDismissed] = useState(() => tipDismissed("geo-rotation"));

  /* Этап 3.0: AI-текст по каждому каналу. Пока AI думает — skeleton;
   * при ошибке остаётся шаблон и мягкий тост. */
  type AiDraft = {
    status: "idle" | "loading" | "done" | "error";
    data?: AiListingData;
    warnings?: string[];
    meta?: AiMeta;
  };
  const [aiDrafts, setAiDrafts] = useState<Record<string, AiDraft>>({});
  const [textOverrides, setTextOverrides] = useState<Record<string, string>>({});
  const [savingText, setSavingText] = useState<Record<string, boolean>>({});

  /* Этап 3.2: бот-постинг в свои каналы (там, где наш бот — админ). */
  const [botStatus, setBotStatus] = useState<TelegramStatusDTO | null>(null);
  const [publishing, setPublishing] = useState<Record<string, boolean>>({});
  const [confirm24h, setConfirm24h] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (step !== 3) return;
    api
      .getTelegramStatus()
      .then(setBotStatus)
      .catch(() => setBotStatus(null));
  }, [step]);

  useEffect(() => {
    void load();
  }, [load]);

  const position = useMemo(
    () => positions.find((p) => p.id === positionId) ?? null,
    [positions, positionId],
  );

  /* Без позиции шаги 2–4 не имеют смысла */
  useEffect(() => {
    if (!position && step > 1) setStep(1);
  }, [position, step, setStep]);

  /* Шаг 2: умный подбор под выбранную позицию + ротация по городам */
  useEffect(() => {
    if (step !== 2 || !position) return;
    setSuggestLoading(true);
    setShowAll(false);
    api
      .suggestChannels(position.id)
      .then((r) => {
        setSuggested(r.channels);
        setRotation(r.rotation ?? null);
      })
      .catch((err) =>
        showToast(err instanceof Error ? err.message : "Не удалось подобрать каналы"),
      )
      .finally(() => setSuggestLoading(false));
    void loadChannels();
  }, [step, position?.id, showToast, loadChannels]);

  const visibleChannels: PickChannel[] = showAll ? channels : suggested;

  /* Шаг 3: черновики для выбранных каналов — создаёт сервер */
  useEffect(() => {
    if (step !== 3 || !position) return;
    const missing = channelIds.filter((id) => drafts[id] === undefined);
    if (missing.length === 0) return;
    setDrafts((d) => ({
      ...d,
      ...Object.fromEntries(missing.map((id) => [id, "pending" as const])),
    }));
    void (async () => {
      for (const id of missing) {
        try {
          const listing = await api.createListing({ positionId: position.id, channelId: id });
          setDrafts((d) => ({ ...d, [id]: listing }));
        } catch {
          setDrafts((d) => ({ ...d, [id]: "failed" }));
        }
      }
    })();
  }, [step, position, channelIds, drafts]);

  const generateAi = async (channelId: string, channel: ChannelDTO) => {
    if (!position || aiDrafts[channelId]?.status === "loading") return;
    const platform = listingPlatformForChannel(channel.type);
    setAiDrafts((s) => ({ ...s, [channelId]: { status: "loading" } }));
    try {
      const res = await api.generateAiListing({ positionId: position.id, platform });
      setTextOverrides((s) => ({ ...s, [channelId]: res.data.body }));
      setAiDrafts((s) => ({
        ...s,
        [channelId]: { status: "done", data: res.data, warnings: res.warnings, meta: res.meta },
      }));
      /* Сразу сохраняем в черновик, чтобы «Скопировать» взяло AI-текст. */
      const draft = drafts[channelId];
      if (isListing(draft)) {
        try {
          const updated = await api.updateListing(draft.id, { text: res.data.body });
          setDrafts((d) => ({ ...d, [channelId]: updated }));
        } catch {
          /* текст остаётся в поле; сохранится по blur */
        }
      }
      showToast(
        res.meta.status === "fallback"
          ? "AI недоступен, использован шаблон"
          : "Текст сгенерирован",
      );
    } catch {
      setAiDrafts((s) => ({ ...s, [channelId]: { status: "error" } }));
      showToast("AI недоступен, использован шаблон");
    }
  };

  const saveText = async (channelId: string) => {
    const text = textOverrides[channelId];
    const draft = drafts[channelId];
    if (text === undefined || !text.trim() || !isListing(draft) || text === draft.text) return;
    setSavingText((s) => ({ ...s, [channelId]: true }));
    try {
      const updated = await api.updateListing(draft.id, { text });
      setDrafts((d) => ({ ...d, [channelId]: updated }));
      showToast("Текст сохранён");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Не удалось сохранить текст");
    } finally {
      setSavingText((s) => ({ ...s, [channelId]: false }));
    }
  };

  const markListing = async (channelId: string, status: "COPIED" | "PUBLISHED") => {
    const draft = drafts[channelId];
    if (!isListing(draft) || draft.status === "PUBLISHED") return;
    try {
      const updated = await api.updateListing(draft.id, { status });
      setDrafts((d) => ({ ...d, [channelId]: updated }));
      if (status === "PUBLISHED") showToast("Отмечено: размещено");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Не удалось обновить статус");
    }
  };

  const copyDraft = async (channelId: string) => {
    const draft = drafts[channelId];
    if (!isListing(draft)) return;
    try {
      await navigator.clipboard.writeText(draft.text);
      showToast("Текст скопирован");
    } catch {
      showToast("Не удалось скопировать — выделите текст вручную");
      return;
    }
    if (draft.status === "DRAFT") void markListing(channelId, "COPIED");
  };

  /* Этап 3.2: канал своего типа с нашим ботом — публикация одной кнопкой. */
  const botEligible = (c: ChannelDTO | null): boolean => {
    if (!c || c.submissionMethod !== "BOT" || !c.submissionBotUsername || !botStatus?.bot) return false;
    return (
      c.submissionBotUsername.replace(/^@/, "").toLowerCase() ===
      botStatus.bot.username.toLowerCase()
    );
  };

  const publishViaBot = async (channelId: string) => {
    const draft = drafts[channelId];
    if (!isListing(draft) || draft.status === "PUBLISHED" || publishing[channelId]) return;
    setPublishing((s) => ({ ...s, [channelId]: true }));
    try {
      const res = await api.publishViaBot(draft.id, confirm24h[channelId] === true);
      /* Обновляем черновик до PUBLISHED с реальной ссылкой. */
      const updated = await api.updateListing(draft.id, { status: "PUBLISHED" }).catch(() => null);
      setDrafts((d) => ({
        ...d,
        [channelId]: updated ?? { ...draft, status: "PUBLISHED" as const, url: res.url },
      }));
      showToast(res.warning ?? "Опубликовано через бота — ссылка под текстом");
    } catch (err) {
      if (err instanceof api.ApiError && err.status === 409) {
        setConfirm24h((s) => ({ ...s, [channelId]: true }));
        showToast("Уже была публикация за 24 ч — нажмите ещё раз для подтверждения");
      } else {
        showToast(err instanceof Error ? err.message : "Не удалось опубликовать через бота");
      }
    } finally {
      setPublishing((s) => ({ ...s, [channelId]: false }));
    }
  };

  const publishedCount = channelIds.filter((id) => {
    const d = drafts[id];
    return isListing(d) && d.status === "PUBLISHED";
  }).length;
  const copiedCount = channelIds.filter((id) => {
    const d = drafts[id];
    return isListing(d) && d.status === "COPIED";
  }).length;

  const finish = () => {
    if (position && publishedCount > 0) {
      /* Города каналов с гео-ротацией — в подпись ленты Пульта */
      const publishedChannels = channelIds
        .map((id) => channels.find((c) => c.id === id) ?? suggested.find((c) => c.id === id))
        .filter((c): c is ChannelDTO => c !== undefined);
      const cities = publishedChannels
        .map((c) => c.city)
        .filter((city): city is string => city !== null && city !== undefined);
      addActivity([
        {
          positionName: positionName(position.culture.name, position.attributes),
          channelName: null,
          channelType: null,
          channelsCount: publishedCount,
          ...(cities.length > 0 ? { cities: [...new Set(cities)] } : {}),
          mode: "semi",
        },
      ]);
    }
    reset();
    navigate("/");
    showToast(
      publishedCount > 0
        ? `Размещено в каналов: ${publishedCount}`
        : "Завершено без размещений",
    );
  };

  return (
    <div className="screen-rise">
      <ScreenHeader title="Разместить" caption="Позиция, каналы, черновики — и готово" />
      <StepBar step={step} onStep={setStep} />

      {/* -------- Шаг 1: позиция -------- */}
      {step === 1 && (
        <section className="px-5 pt-5">
          <SectionTitle>Что размещаем?</SectionTitle>
          {loading && positions.length === 0 ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-[72px] w-full rounded-[20px]" />
              <Skeleton className="h-[72px] w-full rounded-[20px]" />
            </div>
          ) : positions.length === 0 ? (
            <Card className="p-4">
              <p className="text-[13px] font-medium text-soft">
                Позиций пока нет — создайте первую в разделе «Позиции и остатки»
              </p>
              <div className="pt-3">
                <Btn variant="secondary" onClick={() => navigate("/positions")}>
                  К позициям
                </Btn>
              </div>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {positions.map((p) => (
                <PositionPickCard
                  key={p.id}
                  p={p}
                  selected={position?.id === p.id}
                  onPick={() => choosePosition(p.id)}
                />
              ))}
            </div>
          )}
          <div className="pt-4">
            <Btn full size="lg" disabled={!position} onClick={() => setStep(2)}>
              Дальше — подобрать каналы
            </Btn>
          </div>
        </section>
      )}

      {/* -------- Шаг 2: каналы -------- */}
      {step === 2 && position && (
        <section className="px-5 pt-5">
          <div className="mb-3 flex items-center gap-2 px-1">
            <Sparkles size={14} className="shrink-0 text-accent" />
            <p className="text-[13px] font-medium text-soft">
              Подобрано по типу позиции, тегам и гео
            </p>
          </div>
          {rotation && (
            <div className="mb-3">
              <RotationWidget rotation={rotation} />
            </div>
          )}
          {/* ЭТАП 7: совет про гео-ротацию — мягкий, один раз. */}
          {shouldShowGeoRotationTip(geoTipDismissed) && (
            <div className="mb-3">
              <GeoRotationTip
                onDismiss={() => {
                  dismissTip("geo-rotation");
                  setGeoTipDismissed(true);
                }}
              />
            </div>
          )}
          {suggestLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-[96px] w-full rounded-[20px]" />
              <Skeleton className="h-[96px] w-full rounded-[20px]" />
              <Skeleton className="h-[96px] w-full rounded-[20px]" />
            </div>
          ) : visibleChannels.length === 0 ? (
            <Card className="p-4">
              <EmptyState
                icon={<Send size={24} />}
                title="Каналов не нашлось"
                caption="Для этого типа товара пока нет каналов — добавьте их в каталог"
              />
              <div className="px-5 pb-5">
                <Btn full size="lg" variant="secondary" onClick={() => navigate("/channels")}>
                  К каталогу каналов
                </Btn>
              </div>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleChannels.map((c) => (
                <ChannelPickCard
                  key={c.id}
                  c={c}
                  checked={channelIds.includes(c.id)}
                  onToggle={() => toggleChannel(c.id)}
                />
              ))}
            </div>
          )}
          {!suggestLoading && (showAll || suggested.length > 0) && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="press mt-4 w-full text-center text-[13px] font-semibold text-accent"
            >
              {showAll ? "Скрыть полный каталог" : "Показать все каналы"}
            </button>
          )}
          <div className="flex gap-3 pt-4">
            <Btn variant="secondary" size="lg" onClick={() => setStep(1)} ariaLabel="Назад">
              <ChevronLeft size={17} />
            </Btn>
            <Btn full size="lg" disabled={channelIds.length === 0} onClick={() => setStep(3)}>
              Дальше — черновики ({channelIds.length})
            </Btn>
          </div>
        </section>
      )}

      {/* -------- Шаг 3: черновики текста -------- */}
      {step === 3 && position && (
        <section className="px-5 pt-5">
          <SectionTitle>Черновики под каждый канал</SectionTitle>
          <div className="flex flex-col gap-3">
            {channelIds.map((id) => {
              const ch =
                channels.find((c) => c.id === id) ?? suggested.find((c) => c.id === id) ?? null;
              const draft = drafts[id];
              const Icon = ch ? CHANNEL_ICON[ch.type] : Send;
              const published = isListing(draft) && draft.status === "PUBLISHED";
              const ai = aiDrafts[id];
              const draftText = textOverrides[id] ?? (isListing(draft) ? draft.text : "");
              return (
                <Card key={id} className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-subtle text-soft">
                      <Icon size={17} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-ink">
                        {ch?.name ?? "Канал"}
                      </p>
                      {ch && (
                        <p className="truncate text-[12px] font-medium text-soft">
                          {CHANNEL_TYPE_LABEL[ch.type]} · {ch.region}
                        </p>
                      )}
                    </div>
                    {isListing(draft) && (
                      <Chip tone={published ? "green" : draft.status === "COPIED" ? "neutral" : "outline"}>
                        {LISTING_STATUS_LABEL[draft.status]}
                      </Chip>
                    )}
                  </div>

                  {/* Этап 2.5: способ подачи и лимит — подсказка под каналом */}
                  {ch && ch.submissionMethod !== "NONE" && (
                    <p className="mt-1 text-[12px] font-medium text-soft">
                      Подача: {SUBMISSION_METHOD_LABEL[ch.submissionMethod]}
                      {ch.submissionMethod === "BOT" && ch.submissionBotUsername
                        ? ` ${ch.submissionBotUsername}`
                        : ""}
                      {ch.submissionMethod === "ADMIN_CONTACT" && ch.adminContact
                        ? ` ${ch.adminContact}`
                        : ""}
                      {ch.frequencyLimit ? ` · лимит: ${ch.frequencyLimit}` : ""}
                    </p>
                  )}

                  <div className="mt-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[12px] font-semibold text-soft">Текст объявления</span>
                      <button
                        type="button"
                        onClick={() => ch && void generateAi(id, ch)}
                        disabled={!ch || ai?.status === "loading"}
                        className="press inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[12px] font-semibold text-white shadow-soft disabled:opacity-40"
                      >
                        <Sparkles size={13} className={ai?.status === "loading" ? "animate-spin" : ""} />
                        {ai?.status === "loading" ? "Думаю…" : "Сгенерировать с AI"}
                      </button>
                    </div>

                    {ai?.status === "loading" ? (
                      <div className="rounded-[14px] bg-subtle px-4 py-3">
                        <div className="flex flex-col gap-2">
                          <Skeleton className="h-3.5 w-4/5" />
                          <Skeleton className="h-3.5 w-full" />
                          <Skeleton className="h-3.5 w-3/5" />
                        </div>
                        <p className="mt-2 text-[11px] font-medium text-soft">
                          AI собирает текст — 2–3 секунды
                        </p>
                      </div>
                    ) : draft === "pending" ? (
                      <div className="rounded-[14px] bg-subtle px-4 py-3">
                        <p className="text-[13px] font-medium text-soft">Собираю черновик…</p>
                      </div>
                    ) : draft === "failed" ? (
                      <div className="rounded-[14px] bg-subtle px-4 py-3">
                        <p className="text-[13px] font-semibold text-warm">
                          Черновик не создан — вернитесь и снимите этот канал
                        </p>
                      </div>
                    ) : isListing(draft) ? (
                      <>
                        <TextArea
                          value={draftText}
                          onChange={(e) =>
                            setTextOverrides((s) => ({ ...s, [id]: e.target.value }))
                          }
                          onBlur={() => void saveText(id)}
                          rows={8}
                          className="min-h-[160px] resize-y text-[13px] leading-relaxed"
                          aria-label="Текст объявления"
                        />
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-soft">
                            {ai?.status === "done" && ai.meta && ai.meta.status !== "fallback"
                              ? `AI · ${ai.meta.model} · ${(ai.meta.latencyMs / 1000).toFixed(1)} с`
                              : ai?.status === "done"
                                ? "Шаблон · AI недоступен"
                                : "Шаблон · можно отредактировать"}
                          </span>
                          <span className="text-[11px] font-medium text-soft">
                            {savingText[id] ? "Сохраняю…" : `${draftText.length} симв.`}
                          </span>
                        </div>
                        {ai?.warnings?.[0] ? (
                          <p className="mt-1 text-[11px] font-medium text-soft">{ai.warnings[0]}</p>
                        ) : null}
                      </>
                    ) : null}
                  </div>

                  {isListing(draft) && (
                    <div className="mt-3 flex items-center gap-2">
                      <Btn variant="secondary" onClick={() => void copyDraft(id)} ariaLabel="Скопировать текст">
                        <Copy size={15} />
                      </Btn>
                      {/* Этап 2.5: кнопка ведёт в правильную точку входа —
                       * бот-приёмщик / админ / страницу подачи, а не просто в канал */}
                      {(() => {
                        const target = submissionTarget(draft.channel);
                        return (
                          <a
                            href={target.url}
                            target="_blank"
                            rel="noreferrer"
                            title={target.label}
                            className="press inline-flex h-11 max-w-[180px] items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-[13px] font-semibold text-ink"
                          >
                            <ExternalLink size={14} className="shrink-0" />
                            <span className="truncate">{target.label}</span>
                          </a>
                        );
                      })()}
                      {published ? (
                        <div className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-accent-soft py-2.5 text-[13px] font-semibold text-accent">
                          <CheckCircle2 size={15} />
                          Размещено
                        </div>
                      ) : botEligible(ch ?? draft.channel) ? (
                        <Btn
                          full
                          variant={confirm24h[id] ? "secondary" : "primary"}
                          onClick={() => void publishViaBot(id)}
                          disabled={publishing[id]}
                          ariaLabel="Опубликовать через бота"
                        >
                          <Zap size={15} className={publishing[id] ? "animate-pulse" : ""} />
                          {publishing[id]
                            ? "Публикую…"
                            : confirm24h[id]
                              ? "Подтвердить публикацию"
                              : "Через бота"}
                        </Btn>
                      ) : (
                        <Btn full onClick={() => void markListing(id, "PUBLISHED")}>
                          <Check size={15} />
                          Размещено
                        </Btn>
                      )}
                    </div>
                  )}

                  {/* Этап 3.2: ссылка на пост, опубликованный ботом. */}
                  {isListing(draft) && draft.url && (
                    <a
                      href={draft.url}
                      target="_blank"
                      rel="noreferrer"
                      className="press mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-accent"
                    >
                      <ExternalLink size={13} className="shrink-0" />
                      Открыть в Telegram
                    </a>
                  )}
                  {isListing(draft) && !published && botEligible(ch ?? draft.channel) && (
                    <p className="mt-2 text-[11px] font-medium text-soft">
                      Бот — админ канала: опубликует сам и вернёт ссылку на пост
                    </p>
                  )}
                </Card>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-[14px] bg-accent-soft px-4 py-3">
            <ShieldCheck size={16} className="shrink-0 text-accent" />
            <p className="text-[12px] font-semibold text-accent">
              White-label: имя поставщика не упоминается
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <Btn variant="secondary" size="lg" onClick={() => setStep(2)} ariaLabel="Назад">
              <ChevronLeft size={17} />
            </Btn>
            <Btn full size="lg" onClick={() => setStep(4)}>
              Далее — итог
            </Btn>
          </div>
        </section>
      )}

      {/* -------- Шаг 4: итог -------- */}
      {step === 4 && position && (
        <section className="px-5 pt-5">
          <SectionTitle>Сводка</SectionTitle>
          <Card className="px-4 py-1">
            <InfoRow label="Позиция" value={positionName(position.culture.name, position.attributes)} />
            <InfoRow label="Каналов выбрано" value={String(channelIds.length)} />
            <InfoRow
              label="Размещено"
              value={String(publishedCount)}
              valueClass={publishedCount > 0 ? "text-accent" : "text-soft"}
            />
            <InfoRow label="Скопировано" value={String(copiedCount)} valueClass="text-soft" />
          </Card>
          {publishedCount < channelIds.length && (
            <p className="mt-3 px-1 text-[12px] font-medium text-soft">
              Неотмеченные каналы останутся черновиками
            </p>
          )}
          <div className="flex gap-3 pt-4">
            <Btn variant="secondary" size="lg" onClick={() => setStep(3)} ariaLabel="Назад">
              <ChevronLeft size={17} />
            </Btn>
            <Btn full size="lg" onClick={finish}>
              Готово
            </Btn>
          </div>
        </section>
      )}
    </div>
  );
}
