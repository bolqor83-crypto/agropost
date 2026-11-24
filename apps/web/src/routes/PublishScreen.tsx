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
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { attrSummary, positionName } from "@shared/attributes";
import { CHANNEL_TAG_LABEL } from "@shared/channels";
import { CHANNEL_TYPE_LABEL, LISTING_STATUS_LABEL } from "@shared/labels";
import type { ChannelDTO, ListingDTO, PositionDTO } from "@shared/types";
import * as api from "../api/client";
import { fmtNum, fmtRub } from "../lib/format";
import { CHANNEL_ICON } from "../features/channels/icons";
import { useActivityStore, usePublishStore, useToastStore } from "../stores/publish";
import { useCatalog } from "../stores/catalog";
import { useChannels } from "../stores/channels";
import { Btn, Card, Chip, EmptyState, InfoRow, ScreenHeader, SectionTitle, Skeleton } from "../components/ui";

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

function ChannelPickCard({
  c,
  checked,
  onToggle,
}: {
  c: ChannelDTO;
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
        <p className="truncate text-[14px] font-semibold text-ink">{c.name}</p>
        <p className="mt-0.5 truncate text-[12px] font-medium text-soft">
          {CHANNEL_TYPE_LABEL[c.type]} · {c.region}
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

/** Черновик по каналу: listing | "pending" | "failed". */
type DraftState = Record<string, ListingDTO | "pending" | "failed">;

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
  const [suggested, setSuggested] = useState<ChannelDTO[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [drafts, setDrafts] = useState<DraftState>({});

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

  /* Шаг 2: умный подбор под выбранную позицию */
  useEffect(() => {
    if (step !== 2 || !position) return;
    setSuggestLoading(true);
    setShowAll(false);
    api
      .suggestChannels(position.id)
      .then((r) => setSuggested(r.channels))
      .catch((err) =>
        showToast(err instanceof Error ? err.message : "Не удалось подобрать каналы"),
      )
      .finally(() => setSuggestLoading(false));
    void loadChannels();
  }, [step, position?.id, showToast, loadChannels]);

  const visibleChannels = showAll ? channels : suggested;

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
      addActivity([
        {
          positionName: positionName(position.culture.name, position.attributes),
          channelName: null,
          channelType: null,
          channelsCount: publishedCount,
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

                  <div className="mt-3 rounded-[14px] bg-subtle px-4 py-3">
                    {draft === "pending" && (
                      <p className="text-[13px] font-medium text-soft">Собираю черновик…</p>
                    )}
                    {draft === "failed" && (
                      <p className="text-[13px] font-semibold text-warm">
                        Черновик не создан — вернитесь и снимите этот канал
                      </p>
                    )}
                    {isListing(draft) && (
                      <p className="whitespace-pre-line text-[13px] font-medium leading-relaxed text-ink">
                        {draft.text}
                      </p>
                    )}
                  </div>

                  {isListing(draft) && (
                    <div className="mt-3 flex items-center gap-2">
                      <Btn variant="secondary" onClick={() => void copyDraft(id)} ariaLabel="Скопировать текст">
                        <Copy size={15} />
                      </Btn>
                      <a
                        href={draft.channel.url}
                        target="_blank"
                        rel="noreferrer"
                        className="press inline-flex h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-[13px] font-semibold text-ink"
                      >
                        <ExternalLink size={14} />
                        Открыть канал
                      </a>
                      {published ? (
                        <div className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-accent-soft py-2.5 text-[13px] font-semibold text-accent">
                          <CheckCircle2 size={15} />
                          Размещено
                        </div>
                      ) : (
                        <Btn full onClick={() => void markListing(id, "PUBLISHED")}>
                          <Check size={15} />
                          Размещено
                        </Btn>
                      )}
                    </div>
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
