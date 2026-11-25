/**
 * ЭТАП 10 — «Ещё» → «Настройки» → «Userbot (чтение)».
 *
 * Userbot — отдельный сервис (services/userbot, Telethon), который
 * ТОЛЬКО ЧИТАЕТ выбранные Telegram-чаты и создаёт лиды TELEGRAM_CHAT.
 * Здесь: статус (креды env, живой сервис), список читаемых чатов,
 * «Добавить чат» и удаление. Не настроен — честный warning,
 * приложение работает как раньше.
 */

import { useEffect, useState } from "react";
import {
  Activity,
  Eye,
  EyeOff,
  Plus,
  ShieldAlert,
  X,
} from "lucide-react";
import type { UserbotStatusDTO } from "@shared/types";
import * as api from "../api/client";
import { useToastStore } from "../stores/publish";
import { Btn, Card, Chip, Field, ScreenHeader, Skeleton, TextInput } from "../components/ui";

function fmtLast(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}

export function UserbotScreen() {
  const showToast = useToastStore((s) => s.show);
  const [status, setStatus] = useState<UserbotStatusDTO | null>(null);
  const [chat, setChat] = useState("");
  const [adding, setAdding] = useState(false);

  const load = () => {
    api
      .getUserbotStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  };

  useEffect(() => {
    load();
  }, []);

  const addChat = async () => {
    const value = chat.trim();
    if (!value || adding) return;
    setAdding(true);
    try {
      const res = await api.addUserbotChat(value);
      setChat("");
      showToast(`Чат ${res.chat} добавлен — сервис подхватит его в течение минуты`, "success");
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Не удалось добавить чат");
    } finally {
      setAdding(false);
    }
  };

  const removeChat = async (chatName: string) => {
    try {
      await api.removeUserbotChat(chatName);
      showToast(`Чат ${chatName} убран из чтения`);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Не удалось убрать чат");
    }
  };

  if (status === null) {
    return (
      <div className="screen-rise">
        <ScreenHeader title="Userbot (чтение)" caption="Чтение чужих Telegram-чатов — заказы не пропускаются" back="/settings" />
        <section className="px-5">
          <Skeleton className="h-[140px] w-full rounded-[20px]" />
          <Skeleton className="mt-3 h-[220px] w-full rounded-[20px]" />
        </section>
      </div>
    );
  }

  const service = status.service;

  return (
    <div className="screen-rise">
      <ScreenHeader title="Userbot (чтение)" caption="Чтение чужих Telegram-чатов — заказы не пропускаются" back="/settings" />
      <section className="px-5">

        {/* Статус. */}
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Eye size={16} className="text-accent" />
            <p className="text-[15px] font-semibold text-ink">Статус</p>
            <Chip tone={status.configured ? "green" : "warm"} className="ml-auto">
              {status.configured ? "креды заданы" : "не настроено"}
            </Chip>
          </div>
          <p className="mt-1.5 text-[12px] font-medium leading-relaxed text-soft">
            Отдельный Telegram-аккаунт читает НОВЫЕ сообщения в выбранных чатах
            (ключевые слова: люцерна, эспарцет, суданка, орех, семена, куплю, продам,
            цена) и создаёт лиды в инбоксе. Отправка — вручную или через бота:
            userbot ничего не пишет (анти-бан).
          </p>
          {service !== null && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Chip tone={service.connected ? "green" : "outline"}>
                {service.connected ? "подключён" : "не подключён"}
              </Chip>
              <Chip tone="outline">чатов: {service.chats}</Chip>
              <Chip tone="outline">лидов сегодня: {service.leadsToday}</Chip>
              <Chip tone="outline">последнее: {fmtLast(service.lastMessageAt)}</Chip>
            </div>
          )}
          {!status.configured && (
            <div className="mt-2.5 flex items-start gap-2 rounded-[14px] bg-warm-soft px-3.5 py-3">
              <ShieldAlert size={14} className="mt-0.5 shrink-0 text-warm" />
              <p className="text-[11.5px] font-semibold leading-relaxed text-warm">
                Userbot не настроен: задайте TELEGRAM_SESSION, TELEGRAM_API_ID/HASH и
                CHATS_TO_READ в env (README «Как настроить userbot»). Приложение
                работает как раньше — полуавто.
              </p>
            </div>
          )}
        </Card>

        {/* Чаты. */}
        <Card className="mt-3 p-4">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-accent" />
            <p className="text-[15px] font-semibold text-ink">Читаемые чаты</p>
            <Chip tone="outline" className="ml-auto">{status.chats.length}</Chip>
          </div>
          <div className="mt-2.5 flex flex-col gap-2">
            {status.chats.length === 0 ? (
              <p className="rounded-[14px] bg-subtle px-3.5 py-3 text-[12px] font-medium text-soft">
                Список пуст — добавьте чат ниже или задайте CHATS_TO_READ в env
              </p>
            ) : (
              status.chats.map((chatName) => (
                <div
                  key={chatName}
                  className="flex items-center gap-2 rounded-[14px] bg-subtle px-3.5 py-2.5"
                >
                  <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{chatName}</p>
                  <button
                    type="button"
                    onClick={() => void removeChat(chatName)}
                    className="press grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface text-soft"
                    aria-label={`Убрать ${chatName}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Добавить чат. */}
          <div className="mt-3">
            <Field label="Добавить чат" hint="@username, ссылка t.me/… или числовой ID">
              <div className="flex items-center gap-2">
                <TextInput
                  value={chat}
                  onChange={(e) => setChat(e.target.value)}
                  placeholder="@selhoz032"
                  aria-label="Чат для чтения"
                />
                <Btn
                  variant="secondary"
                  onClick={() => void addChat()}
                  disabled={adding || !chat.trim()}
                  loading={adding}
                  ariaLabel="Добавить чат"
                >
                  <Plus size={15} />
                </Btn>
              </div>
            </Field>
            <p className="mt-2 flex items-start gap-1.5 text-[11.5px] font-medium leading-relaxed text-soft">
              <EyeOff size={13} className="mt-0.5 shrink-0" />
              Читаем только выбранные чаты: личные переписки не трогаем,
              ничего не отправляем от имени userbot-аккаунта.
            </p>
          </div>
        </Card>
      </section>
    </div>
  );
}
