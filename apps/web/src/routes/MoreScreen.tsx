/**
 * Ещё — карта разделов по этапам дорожной карты.
 * Этап 1 открыл «Поставщиков» и «Позиции и остатки»;
 * остальное появится по мере готовности.
 */

import {
  Bot,
  ChevronRight,
  FileText,
  Megaphone,
  Package,
  Send,
  Settings,
  ShieldCheck,
  Sprout,
  TrendingUp,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToastStore } from "../stores/publish";
import { Card, Chip, ScreenHeader } from "../components/ui";

const SECTIONS: {
  icon: typeof Users;
  name: string;
  stage: string;
  hint: string;
  to?: string;
}[] = [
  { icon: Users, name: "Поставщики", stage: "этап 1", hint: "Справочник, режимы отгрузки, заметки", to: "/suppliers" },
  { icon: Package, name: "Позиции и остатки", stage: "этап 1", hint: "Шаблоны культур, атрибуты, медиа", to: "/positions" },
  { icon: Megaphone, name: "Каналы", stage: "этап 2", hint: "Каталог с тегами, охватом, мультиаккаунты" },
  { icon: TrendingUp, name: "Цены рынка", stage: "этап 2.5", hint: "Агросервер и Telegram, обезличенно" },
  { icon: Send, name: "ИИ-генератор и бот", stage: "этап 3", hint: "Тексты под площадку, white-label" },
  { icon: FileText, name: "Документы и логистика", stage: "этап 4", hint: "Счёт, договор, ТН, УПД, доставка" },
  { icon: ShieldCheck, name: "Рекламации", stage: "этап 4", hint: "Претензии покупателя, переадресация" },
  { icon: Bot, name: "«Что сделать сейчас?»", stage: "этап 5", hint: "Совет по кнопке, не проактивно" },
];

export function MoreScreen() {
  const navigate = useNavigate();
  const showToast = useToastStore((s) => s.show);

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

        <button
          type="button"
          onClick={() => showToast("Настройки — с этапа 4 (аккаунты, налог, наценка)")}
          className="press mt-4 flex w-full items-center gap-3 rounded-[20px] border border-line bg-surface px-4 py-3.5 text-left"
        >
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-subtle text-soft">
            <Settings size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-ink">Настройки</p>
            <p className="text-[12px] font-medium text-soft">Аккаунты, налог, наценка</p>
          </div>
          <ChevronRight size={16} className="shrink-0 text-soft" />
        </button>

        <div className="flex items-center justify-center gap-1.5 pb-4 pt-6">
          <Sprout size={13} className="text-soft" />
          <p className="text-[12px] font-medium text-soft">
            АгроПост · этап 1 из 6 · Warm Utility
          </p>
        </div>
      </section>
    </div>
  );
}
