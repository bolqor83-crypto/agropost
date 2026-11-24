/**
 * Ещё — карта разделов по этапам дорожной карты.
 * Этап 1 открыл «Поставщиков» и «Позиции и остатки»;
 * этап 2 — «Каналы» и «Аккаунты»; этап 5 — «Аналитику»
 * и чек-лист «Перед запуском». Этап 5.1 — кнопка «Выйти»:
 * уничтожение серверной сессии и очистка состояния устройства.
 */

import { useEffect, useState } from "react";
import {
  Bot,
  Check,
  ChevronRight,
  Copy,
  FileText,
  Github,
  IdCard,
  Inbox,
  ListChecks,
  Megaphone,
  Package,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  Sprout,
  TrendingUp,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import type { ReadinessDTO } from "@shared/types";
import type { MetaDTO } from "../api/client";
import * as api from "../api/client";
import { useToastStore } from "../stores/publish";
import { resetAllStores } from "../lib/logout";
import { buildLaunchPlan, copyText } from "../lib/tips";
import { Btn, Card, Chip, ScreenHeader, Skeleton } from "../components/ui";

const SECTIONS: {
  icon: typeof Users;
  name: string;
  stage: string;
  hint: string;
  to?: string;
}[] = [
  { icon: TrendingUp, name: "Аналитика", stage: "этап 5", hint: "Маржа, лиды, конверсия, топы — по запросу", to: "/analytics" },
  { icon: Inbox, name: "Инбокс", stage: "этап 3.2", hint: "Покупатели из Telegram-бота, ответы с AI-черновиком", to: "/inbox" },
  { icon: Bot, name: "Telegram-бот", stage: "этап 3.2", hint: "Приём вопросов и автопостинг в свои каналы", to: "/telegram" },
  { icon: Users, name: "Поставщики", stage: "этап 1", hint: "Справочник, режимы отгрузки, заметки", to: "/suppliers" },
  { icon: Package, name: "Позиции и остатки", stage: "этап 1", hint: "Шаблоны культур, атрибуты, медиа", to: "/positions" },
  { icon: Megaphone, name: "Каналы", stage: "этап 2", hint: "Каталог с тегами, охватом, подбор", to: "/channels" },
  { icon: Smartphone, name: "Аккаунты", stage: "этап 2", hint: "Мультиаккаунты и лимиты размещений", to: "/accounts" },
  { icon: TrendingUp, name: "Цены рынка", stage: "этап 2.5", hint: "Агросервер и Telegram, обезличенно" },
  { icon: Send, name: "ИИ-генератор и бот", stage: "этап 3", hint: "Тексты под площадку, white-label" },
  { icon: FileText, name: "Документы и логистика", stage: "этап 4", hint: "Счёт, договор, ТН, УПД, доставка", to: "/deals" },
  { icon: ShieldCheck, name: "Рекламации", stage: "этап 4", hint: "Претензии покупателя, переадресация", to: "/deals" },
  { icon: IdCard, name: "Реквизиты и налог", stage: "этап 4", hint: "Продавец в документах, режим по умолчанию", to: "/profile" },
  { icon: Bot, name: "«Что сделать сейчас?»", stage: "этап 5", hint: "Кнопка на Пульте: лиды, сделки, публикации" },
];

/** Чек-лист «Перед запуском»: прогресс, пункты и кнопка «Скопировать инструкцию». */
function ReadinessCard({ onNavigate }: { onNavigate: (to: string) => void }) {
  const showToast = useToastStore((s) => s.show);
  const [data, setData] = useState<ReadinessDTO | null>(null);

  useEffect(() => {
    api
      .getReadiness()
      .then(setData)
      .catch(() => setData(null));
  }, []);

  const NAV_BY_ITEM: Record<string, string> = {
    requisites: "/profile",
    supplier: "/suppliers",
    position: "/positions",
    channel: "/channels",
    bot: "/telegram",
    ai: "/more",
    r2: "/more",
  };

  /* ЭТАП 7: пошаговый план запуска — в буфер обмена (отправить помощнику
     или сохранить). Мягкий тост при успехе, честный — при отказе. */
  const copyInstruction = async () => {
    if (!data) return;
    const text = buildLaunchPlan(data);
    const ok = await copyText(text);
    showToast(ok ? "Инструкция скопирована — можно вставить в чат или заметки" : "Не удалось скопировать — попробуйте ещё раз", ok ? "success" : "error");
  };

  return (
    <Card className="mt-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListChecks size={18} className="text-accent" />
          <p className="text-[15px] font-semibold text-ink">Перед запуском</p>
        </div>
        {data && (
          <Chip tone={data.ready === data.total ? "green" : "neutral"}>
            {data.ready} из {data.total} готово
          </Chip>
        )}
      </div>

      {data === null ? (
        <div className="mt-3 flex flex-col gap-2">
          <Skeleton className="h-10 w-full rounded-[14px]" />
          <Skeleton className="h-10 w-full rounded-[14px]" />
          <Skeleton className="h-10 w-full rounded-[14px]" />
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          {data.items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(NAV_BY_ITEM[item.id] ?? "/more")}
              className="press flex items-start gap-2.5 rounded-[14px] px-2 py-2 text-left"
            >
              <span
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${
                  item.done ? "border-accent bg-accent text-white" : "border-line"
                }`}
                aria-hidden
              >
                {item.done && <Check size={12} strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5">
                  <span className="text-[13.5px] font-semibold text-ink">{item.label}</span>
                  {item.optional && (
                    <span className="shrink-0 text-[10px] font-semibold uppercase text-soft">
                      опц.
                    </span>
                  )}
                </span>
                {!item.done && (
                  <span className="mt-0.5 block text-[12px] font-medium leading-snug text-soft">
                    {item.hint}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ЭТАП 7: «Скопировать инструкцию» — план запуска в буфер обмена. */}
      {data !== null && (
        <div className="mt-3">
          <Btn full variant="secondary" onClick={() => void copyInstruction()}>
            <Copy size={15} />
            Скопировать инструкцию
          </Btn>
        </div>
      )}
    </Card>
  );
}

/* ---------- ЭТАП 7: «Версия и обновления» — текущая версия и ссылки. ---------- */

const GITHUB_URL = "https://github.com/bolqor83-crypto/agropost";
const README_URL = `${GITHUB_URL}#readme`;
const USER_GUIDE_URL = `${GITHUB_URL}/blob/main/docs/USER_GUIDE.md`;

function formatReleaseDate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

function VersionCard({ meta }: { meta: MetaDTO | null }) {
  return (
    <Card className="mt-4 p-4">
      <div className="flex items-center gap-2">
        <Sprout size={16} className="text-accent" />
        <p className="text-[15px] font-semibold text-ink">Версия и обновления</p>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[14px] font-semibold text-ink">
          АгроПост {meta?.version ?? "—"}
        </span>
        <span className="text-[12px] font-medium text-soft">
          обновление от {formatReleaseDate(meta?.releasedAt)}
        </span>
      </div>
      {meta && (
        <p className="mt-1 text-[12px] font-medium text-soft">
          Финальный этап — приложение готово к работе. Обновления — из того же
          репозитория GitHub.
        </p>
      )}
      <div className="mt-3 flex flex-col gap-2">
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="press flex items-center gap-2 rounded-[14px] border border-line bg-surface px-4 py-2.5 text-[13px] font-semibold text-ink"
        >
          <Github size={15} className="text-soft" />
          Репозиторий на GitHub
        </a>
        <a
          href={README_URL}
          target="_blank"
          rel="noreferrer"
          className="press flex items-center gap-2 rounded-[14px] border border-line bg-surface px-4 py-2.5 text-[13px] font-semibold text-ink"
        >
          <FileText size={15} className="text-soft" />
          Инструкция (README)
        </a>
        <a
          href={USER_GUIDE_URL}
          target="_blank"
          rel="noreferrer"
          className="press flex items-center gap-2 rounded-[14px] border border-line bg-surface px-4 py-2.5 text-[13px] font-semibold text-ink"
        >
          <IdCard size={15} className="text-soft" />
          Полное руководство пользователя
        </a>
      </div>
    </Card>
  );
}

export function MoreScreen() {
  const navigate = useNavigate();
  const showToast = useToastStore((s) => s.show);
  /* ЭТАП 7: версия и дата обновления — из /api/meta. */
  const [meta, setMeta] = useState<MetaDTO | null>(null);

  useEffect(() => {
    api
      .getMeta()
      .then(setMeta)
      .catch(() => setMeta(null));
  }, []);

  return (
    <div className="screen-rise">
      <ScreenHeader title="Ещё" caption="Разделы открываются по мере этапов" />
      <section className="px-5">
        <Card className="divide-y divide-line overflow-hidden">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const open = Boolean(s.to);
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => (s.to ? navigate(s.to) : showToast(`«${s.name}» появится на ${s.stage}`))}
                className="press flex w-full items-center gap-3 px-4 py-3.5 text-left"
              >
                <div
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${
                    open ? "bg-accent-soft text-accent" : "bg-subtle text-soft"
                  }`}
                >
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-ink">{s.name}</p>
                  <p className="truncate text-[12px] font-medium text-soft">{s.hint}</p>
                </div>
                <Chip tone={open ? "green" : "neutral"}>{open ? "открыт" : s.stage}</Chip>
                <ChevronRight size={16} className="shrink-0 text-soft" />
              </button>
            );
          })}
        </Card>

        {/* Этап 5: чек-лист «Перед запуском» — что заполнить перед работой. */}
        <ReadinessCard onNavigate={(to) => navigate(to)} />

        {/* ЭТАП 7: версия и обновления — из /api/meta. */}
        <VersionCard meta={meta} />

        <button
          type="button"
          onClick={() => navigate("/profile")}
          className="press mt-4 flex w-full items-center gap-3 rounded-[20px] border border-line bg-surface px-4 py-3.5 text-left"
        >
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-subtle text-soft">
            <Settings size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-ink">Настройки</p>
            <p className="text-[12px] font-medium text-soft">Реквизиты, налог, тёмная тема</p>
          </div>
          <ChevronRight size={16} className="shrink-0 text-soft" />
        </button>

        {/* Этап 5.1: выход — уничтожение серверной сессии + чистка сторов. */}
        <button
          type="button"
          onClick={() => {
            void api
              .logout()
              .catch(() => undefined)
              .finally(() => {
                resetAllStores();
                navigate("/login", { replace: true });
              });
          }}
          className="press mt-3 flex w-full items-center gap-3 rounded-[20px] border border-line bg-surface px-4 py-3.5 text-left"
        >
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-subtle text-soft">
            <LogOut size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-ink">Выйти</p>
            <p className="text-[12px] font-medium text-soft">Завершить сессию на этом устройстве</p>
          </div>
          <ChevronRight size={16} className="shrink-0 text-soft" />
        </button>

        <div className="flex items-center justify-center gap-1.5 pb-4 pt-6">
          <Sprout size={13} className="text-soft" />
          <p className="text-[12px] font-medium text-soft">
            АгроПост · {meta?.version ?? "1.0.0"} · Warm Utility
          </p>
        </div>
      </section>
    </div>
  );
}
