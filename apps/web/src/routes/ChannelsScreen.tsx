/**
 * Каналы — каталог этапа 2 (+ гео-ротация 2.1): теги, охват, город,
 * история «когда здесь размещали последний раз».
 * Фильтры и поиск работают локально по загруженному списку из store;
 * умный подбор для потока «Разместить» живёт на сервере (rankForRotation).
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  Copy,
  ExternalLink,
  History,
  Info,
  Megaphone,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { CHANNEL_TAGS, CHANNEL_TAG_LABEL } from "@shared/channels";
import { CHANNEL_TYPE_LABEL } from "@shared/labels";
import { channelHistory, daysSince } from "@shared/rotation";
import type { ChannelDTO, ChannelTag } from "@shared/types";
import * as api from "../api/client";
import { CHANNEL_ICON } from "../features/channels/icons";
import { fmtNum } from "../lib/format";
import { useChannels } from "../stores/channels";
import { useToastStore } from "../stores/publish";
import {
  Btn,
  Card,
  Chip,
  EmptyState,
  InfoRow,
  Segmented,
  Sheet,
  Skeleton,
  TextInput,
} from "../components/ui";
import { ChannelSheet } from "../components/ChannelSheet";

type TypeGroup = "all" | "telegram" | "marketplace";
type TagFilter = "all" | ChannelTag;

type DetailState =
  | { mode: "view"; channel: ChannelDTO }
  | { mode: "edit"; channel: ChannelDTO }
  | { mode: "create" }
  | null;

const TELEGRAM_TYPES: ChannelDTO["type"][] = ["TELEGRAM_CHAT", "TELEGRAM_CHANNEL"];

/** История размещений канала (этап 2.1): когда и сколько раз. */
interface ChannelHistoryInfo {
  lastPublishedAt: string | null;
  timesPublished: number;
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** «Последнее размещение: 3 дня назад (здесь размещали 2 раза)». */
function lastPlacementLabel(h: ChannelHistoryInfo | undefined): string {
  if (!h || !h.lastPublishedAt) return "Никогда не размещали";
  const d = daysSince(h.lastPublishedAt) ?? 0;
  const when =
    d === 0 ? "сегодня" : d === 1 ? "вчера" : `${d} ${pluralRu(d, "день", "дня", "дней")} назад`;
  const times = h.timesPublished > 0
    ? ` (здесь размещали ${h.timesPublished} ${pluralRu(h.timesPublished, "раз", "раза", "раз")})`
    : "";
  return `Последнее размещение: ${when}${times}`;
}

function ChannelCard({
  c,
  history,
  onOpen,
}: {
  c: ChannelDTO;
  history?: ChannelHistoryInfo;
  onOpen: () => void;
}) {
  const Icon = CHANNEL_ICON[c.type];
  return (
    <Card onClick={onOpen} className="p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Icon size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink">{c.name}</p>
          <p className="mt-0.5 truncate text-[12px] font-medium text-soft">
            {CHANNEL_TYPE_LABEL[c.type]} · {c.region}
            {c.city && ` · ${c.city}`}
            {c.averageReach != null ? ` · ${fmtNum(c.averageReach)} охват` : ""}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {c.tags.map((t) => (
              <Chip key={t} tone="outline">
                {CHANNEL_TAG_LABEL[t]}
              </Chip>
            ))}
            {c.listingCount > 0 && <Chip tone="green">размещений: {c.listingCount}</Chip>}
          </div>
          {history?.lastPublishedAt && (
            <p className="mt-1.5 text-[12px] font-medium text-soft">
              {lastPlacementLabel(history)}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

export function ChannelsScreen() {
  const navigate = useNavigate();
  const { channels, loading, error, load } = useChannels();
  const showToast = useToastStore((s) => s.show);
  const [group, setGroup] = useState<TypeGroup>("all");
  const [tag, setTag] = useState<TagFilter>("all");
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<DetailState>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  /* История размещений по каналам — для строки «Последнее размещение» */
  const [histories, setHistories] = useState<Record<string, ChannelHistoryInfo>>({});

  useEffect(() => {
    void load();
    api
      .listListings()
      .then((rows) => {
        const acc: Record<string, ChannelHistoryInfo> = {};
        for (const id of new Set(rows.map((r) => r.channelId))) {
          acc[id] = channelHistory(id, rows);
        }
        setHistories(acc);
      })
      .catch(() => undefined); /* история не критична для списка */
  }, [load]);

  /* Фильтрация локальная: группа типа + тег + подстрока имени */
  const q = query.trim().toLowerCase();
  const visible = channels.filter((c) => {
    const isTelegram = TELEGRAM_TYPES.includes(c.type);
    if (group === "telegram" && !isTelegram) return false;
    if (group === "marketplace" && isTelegram) return false;
    if (tag !== "all" && !c.tags.includes(tag)) return false;
    if (q && !c.name.toLowerCase().includes(q)) return false;
    return true;
  });

  const removeChannel = async (id: string) => {
    try {
      await api.deleteChannel(id);
      setConfirmDelete(null);
      setSheet(null);
      showToast("Канал удалён");
      await load(true);
    } catch (err) {
      /* 409 и другие ошибки сервера приходят с человеческим сообщением */
      setConfirmDelete(null);
      showToast(err instanceof Error ? err.message : "Не удалось удалить");
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      showToast("Ссылка скопирована");
    } catch {
      showToast("Не удалось скопировать ссылку");
    }
  };

  return (
    <div className="screen-rise">
      <header className="flex items-center gap-3 px-5 pt-6 pb-2">
        <button
          type="button"
          aria-label="Назад"
          onClick={() => navigate("/more")}
          className="press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-subtle text-soft"
        >
          <ChevronLeft size={19} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-semibold leading-tight text-ink">Каналы</h1>
          <p className="text-[12px] font-medium text-soft">
            {channels.length > 0 ? `${channels.length} в каталоге` : "каталог пуст"}
          </p>
        </div>
        <Btn onClick={() => setSheet({ mode: "create" })} ariaLabel="Добавить канал">
          <Plus size={16} />
        </Btn>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        <Segmented<TypeGroup>
          items={[
            { value: "all", label: "Все" },
            { value: "telegram", label: "Telegram" },
            { value: "marketplace", label: "Площадки" },
          ]}
          value={group}
          onChange={setGroup}
        />

        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по названию"
          aria-label="Поиск каналов"
          maxLength={120}
        />

        <div className="-mx-5 overflow-x-auto px-5 soft-scroll">
          <div className="flex w-max gap-2 pb-1">
            {(["all", ...CHANNEL_TAGS] as TagFilter[]).map((t) => {
              const active = tag === t;
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTag(t)}
                  className={`press shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold ${
                    active
                      ? "bg-accent-soft text-accent"
                      : "border border-line bg-surface text-soft"
                  }`}
                >
                  {t === "all" ? "Все" : CHANNEL_TAG_LABEL[t]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <section className="px-5 pt-3 pb-2">
        {error && (
          <Card className="mb-3 p-4">
            <p className="text-[13px] font-semibold text-warm">{error}</p>
            <div className="pt-3">
              <Btn variant="secondary" onClick={() => void load(true)}>
                Повторить
              </Btn>
            </div>
          </Card>
        )}

        {loading && channels.length === 0 ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[104px] w-full rounded-[20px]" />
            <Skeleton className="h-[104px] w-full rounded-[20px]" />
            <Skeleton className="h-[104px] w-full rounded-[20px]" />
          </div>
        ) : channels.length === 0 && !error ? (
          <Card>
            <EmptyState
              icon={<Megaphone size={26} />}
              title="Каналов пока нет"
              caption="Добавьте первый: тип, ссылка, регион и теги — по ним работает умный подбор"
            />
            <div className="px-5 pb-5">
              <Btn full size="lg" onClick={() => setSheet({ mode: "create" })}>
                <Plus size={17} />
                Добавить канал
              </Btn>
            </div>
          </Card>
        ) : visible.length === 0 && !error ? (
          <Card>
            <EmptyState
              icon={<Megaphone size={26} />}
              title="Ничего не нашлось"
              caption="Попробуйте изменить фильтры или поиск по названию"
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {visible.map((c) => (
              <ChannelCard
                key={c.id}
                c={c}
                history={histories[c.id]}
                onOpen={() => setSheet({ mode: "view", channel: c })}
              />
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2 rounded-[14px] bg-subtle px-4 py-3">
          <Info size={16} className="shrink-0 text-soft" />
          <p className="text-[12px] font-medium leading-relaxed text-soft">
            Охват заполняется вручную. Автопостинг — этап 3, сейчас размещение полуавтоматическое.
          </p>
        </div>
      </section>

      {/* Карточка канала */}
      {sheet?.mode === "view" && (
        <Sheet title="Канал" onClose={() => setSheet(null)}>
          <p className="text-[18px] font-semibold leading-snug text-ink">{sheet.channel.name}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href={sheet.channel.url}
              target="_blank"
              rel="noreferrer"
              className="press inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-5 text-[14px] font-semibold text-ink"
            >
              <ExternalLink size={15} />
              Открыть
            </a>
            <Btn variant="secondary" onClick={() => void copyUrl(sheet.channel.url)}>
              <Copy size={15} />
              Скопировать URL
            </Btn>
            <Btn
              variant="secondary"
              onClick={() => setSheet({ mode: "edit", channel: sheet.channel })}
            >
              <Pencil size={15} />
              Изменить
            </Btn>
          </div>

          <div className="mt-4 rounded-[14px] bg-subtle px-4 py-1">
            <InfoRow label="Тип" value={CHANNEL_TYPE_LABEL[sheet.channel.type]} />
            <InfoRow label="Регион" value={sheet.channel.region} />
            <InfoRow
              label="Город"
              value={sheet.channel.city ?? "— (весь регион)"}
              valueClass={sheet.channel.city ? "text-ink" : "text-soft"}
            />
            <InfoRow
              label="Средний охват"
              value={sheet.channel.averageReach != null ? fmtNum(sheet.channel.averageReach) : "—"}
              valueClass={sheet.channel.averageReach != null ? "text-ink" : "text-soft"}
            />
            <InfoRow
              label="Подписчики"
              value={
                sheet.channel.subscribersCount != null ? fmtNum(sheet.channel.subscribersCount) : "—"
              }
              valueClass={sheet.channel.subscribersCount != null ? "text-ink" : "text-soft"}
            />
            <InfoRow
              label="Размещений"
              value={String(sheet.channel.listingCount)}
              valueClass="text-soft"
            />
          </div>

          <div className="mt-3 rounded-[14px] bg-subtle px-4 py-3">
            <div className="flex items-center gap-1.5">
              <History size={13} className="shrink-0 text-soft" />
              <p className="text-[11px] font-semibold uppercase tracking-wide text-soft">
                Ротация
              </p>
            </div>
            <p className="mt-1 text-[13px] font-medium leading-relaxed text-ink">
              {lastPlacementLabel(histories[sheet.channel.id])}
            </p>
          </div>

          {sheet.channel.notes && (
            <div className="mt-3 rounded-[14px] bg-subtle px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-soft">Заметки</p>
              <p className="mt-1 text-[13px] font-medium leading-relaxed text-ink">
                {sheet.channel.notes}
              </p>
            </div>
          )}

          {confirmDelete === sheet.channel.id ? (
            <div className="mt-4 rounded-[14px] bg-warm-soft px-4 py-3">
              <p className="text-[13px] font-semibold text-warm">Удалить канал?</p>
              <div className="flex gap-2 pt-3">
                <Btn variant="ghost" onClick={() => setConfirmDelete(null)}>
                  Отмена
                </Btn>
                <Btn onClick={() => void removeChannel(sheet.channel.id)}>Удалить</Btn>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(sheet.channel.id)}
              className="press mt-4 inline-flex items-center gap-1.5 px-1 text-[13px] font-semibold text-warm"
            >
              <Trash2 size={14} />
              Удалить канал
            </button>
          )}
        </Sheet>
      )}

      {/* Форма: создание/редактирование */}
      {sheet && sheet.mode !== "view" && (
        <ChannelSheet
          channel={sheet.mode === "edit" ? sheet.channel : null}
          onClose={() => setSheet(null)}
          onSaved={() => void load(true)}
        />
      )}
    </div>
  );
}
