/**
 * Разместить — главный поток приложения: Позиция → Каналы → Текст.
 * Этап 0: подбор каналов по тегам/гео и шаблонная сборка текста.
 * Этап 2 подключит полный каталог, этап 3 — ИИ и Telegram-бота.
 *
 * ANTI-BAN: свои каналы — «авто через бота», чужие — полуавтомат
 * (текст + deep link + отметка «размещено»). Реальная публикация
 * и deep links — этап 3.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  Copy,
  ExternalLink,
  Globe,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  Tag,
} from "lucide-react";
import { attrSummary, positionName } from "@shared/attributes";
import { SUPPLIER_LOCATION_REGION } from "@shared/labels";
import type { PositionDTO } from "@shared/types";
import { suggestChannels } from "../features/channels/channels.mock";
import { buildListing, LISTING_PLATFORMS, type ListingPlatform } from "../features/listings/listing";
import { CHANNEL_TYPE_LABEL, fmtNum, fmtRub } from "../lib/format";
import { useActivityStore, usePublishStore, useToastStore } from "../stores/publish";
import { useCatalog } from "../stores/catalog";
import { Btn, Card, Chip, ScreenHeader, SectionTitle, Skeleton } from "../components/ui";
import type { Channel, ChannelType } from "../api/types";

const CHANNEL_ICON: Record<ChannelType, typeof Send> = {
  telegram: Send,
  avito: Store,
  agroserver: Globe,
  max: Smartphone,
  yula: Tag,
};

function StepBar({ step, onStep }: { step: 1 | 2 | 3; onStep: (s: 1 | 2 | 3) => void }) {
  const labels = ["Позиция", "Каналы", "Текст"];
  return (
    <div className="flex items-center gap-1.5 px-5">
      {labels.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
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

function ChannelCard({
  c,
  checked,
  onToggle,
}: {
  c: Channel;
  checked: boolean;
  onToggle: () => void;
}) {
  const Icon = CHANNEL_ICON[c.type];
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
          <p className="truncate text-[14px] font-semibold text-ink">{c.name}</p>
          {c.owned && <Chip tone="green">свой</Chip>}
        </div>
        <p className="mt-0.5 truncate text-[12px] font-medium text-soft">
          {CHANNEL_TYPE_LABEL[c.type]} · {c.region}
          {c.audience !== null && ` · ${Intl.NumberFormat("ru-RU").format(c.audience)} охват`}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {c.tags.map((t) => (
            <Chip key={t} tone="outline">
              {t}
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

export function PublishScreen() {
  const navigate = useNavigate();
  const { step, positionId, channelIds, setStep, choosePosition, toggleChannel, reset } =
    usePublishStore();
  const addActivity = useActivityStore((s) => s.addItems);
  const showToast = useToastStore((s) => s.show);
  const { positions, loading, load } = useCatalog();
  const [platform, setPlatform] = useState<ListingPlatform>("avito");

  useEffect(() => {
    void load();
  }, [load]);

  const position = useMemo(
    () => positions.find((p) => p.id === positionId) ?? positions[0] ?? null,
    [positions, positionId],
  );

  const kindTag = position ? (position.culture.type === "NUT" ? "орех" : "семена") : "семена";
  const suggestions = useMemo(() => suggestChannels(kindTag), [kindTag]);

  const text = useMemo(() => {
    if (!position) return "";
    return buildListing(
      position,
      position.culture,
      SUPPLIER_LOCATION_REGION[position.supplier.location],
      position.salePrice,
      platform,
    );
  }, [position, platform]);

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Текст скопирован");
    } catch {
      showToast("Не удалось скопировать — выделите текст вручную");
    }
  };

  const markPublished = () => {
    if (!position) return;
    addActivity(
      channelIds.map((id) => {
        const ch = suggestions.find((c) => c.id === id);
        if (!ch) throw new Error(`Channel not found: ${id}`);
        return {
          positionName: positionName(position.culture.name, position.attributes),
          channelName: ch.name,
          channelType: ch.type,
          mode: ch.owned ? ("auto" as const) : ("semi" as const),
        };
      }),
    );
    reset();
    navigate("/");
    showToast(
      channelIds.length === 1 ? "Отмечено: размещено" : `Отмечено размещений: ${channelIds.length}`,
    );
  };

  return (
    <div className="screen-rise">
      <ScreenHeader title="Разместить" caption="Три шага: позиция, каналы, текст" />
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
      {step === 2 && (
        <section className="px-5 pt-5">
          <div className="mb-3 flex items-center gap-2 px-1">
            <Sparkles size={14} className="shrink-0 text-accent" />
            <p className="text-[13px] font-medium text-soft">
              Подобрано по тегам и гео: {kindTag}, ЮФО и новые территории
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {suggestions.map((c) => (
              <ChannelCard
                key={c.id}
                c={c}
                checked={channelIds.includes(c.id)}
                onToggle={() => toggleChannel(c.id)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => showToast("Полный каталог каналов — этап 2")}
            className="press mt-4 w-full text-center text-[13px] font-semibold text-accent"
          >
            Показать все каналы
          </button>
          <div className="flex gap-3 pt-4">
            <Btn variant="secondary" size="lg" onClick={() => setStep(1)} ariaLabel="Назад">
              <ChevronLeft size={17} />
            </Btn>
            <Btn full size="lg" disabled={channelIds.length === 0} onClick={() => setStep(3)}>
              Дальше — текст ({channelIds.length})
            </Btn>
          </div>
        </section>
      )}

      {/* -------- Шаг 3: текст -------- */}
      {step === 3 && position && (
        <section className="px-5 pt-5">
          <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
            {channelIds.map((id) => {
              const ch = suggestions.find((c) => c.id === id);
              if (!ch) return null;
              return (
                <Chip key={id} tone={ch.owned ? "green" : "neutral"}>
                  {ch.name}
                </Chip>
              );
            })}
          </div>

          <div className="flex gap-1 rounded-full bg-subtle p-1" role="tablist">
            {LISTING_PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={platform === p.id}
                onClick={() => setPlatform(p.id)}
                className={`press flex-1 rounded-full py-2 text-[13px] font-semibold ${
                  platform === p.id ? "bg-surface text-ink shadow-soft" : "text-soft"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <Card className="mt-4 p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-semibold text-soft">Черновик объявления</p>
              <p className="text-[12px] font-medium text-soft">{text.length} симв.</p>
            </div>
            <p className="whitespace-pre-line text-[14px] font-medium leading-relaxed text-ink">
              {text}
            </p>
          </Card>

          <div className="mt-3 flex items-center gap-2 rounded-[14px] bg-accent-soft px-4 py-3">
            <ShieldCheck size={16} className="shrink-0 text-accent" />
            <p className="text-[12px] font-semibold text-accent">
              White-label: имя поставщика не упоминается
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <Btn variant="secondary" size="lg" onClick={copyText} ariaLabel="Скопировать текст">
              <Copy size={16} />
            </Btn>
            <Btn
              variant="secondary"
              size="lg"
              onClick={() => showToast("Deep link откроет чат — этап 3")}
              ariaLabel="Открыть чат"
            >
              <ExternalLink size={16} />
            </Btn>
            <Btn full size="lg" onClick={markPublished}>
              <Check size={17} />
              Размещено
            </Btn>
          </div>
          <p className="px-1 pt-3 text-center text-[12px] font-medium text-soft">
            Свои каналы опубликует бот (этап 3), чужие — вставьте текст вручную
          </p>
        </section>
      )}
    </div>
  );
}
