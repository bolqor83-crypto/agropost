/**
 * ЭТАП 10 — «Ещё» → «Настройки» → «MAX».
 *
 * Токен бота MAX (бесплатно: max.ru → dev.max.ru → «Чат-боты»), ID
 * владельца, «Проверить подключение» (GET /me), привязки каналов chat_id
 * и чаты, найденные ботом (bot_added). env MAX_BOT_TOKEN сильнее —
 * поля закрыты.
 */

import { useEffect, useState } from "react";
import {
  Bot,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Link2,
  ShieldCheck,
} from "lucide-react";
import type { MaxCheckDTO, MaxSettingsDTO, MaxStatusDTO } from "@shared/types";
import * as api from "../api/client";
import { useToastStore } from "../stores/publish";
import { Btn, Card, Chip, Field, ScreenHeader, Skeleton, TextInput } from "../components/ui";

export function MaxApiScreen() {
  const showToast = useToastStore((s) => s.show);
  const [settings, setSettings] = useState<MaxSettingsDTO | null>(null);
  const [status, setStatus] = useState<MaxStatusDTO | null>(null);
  const [token, setToken] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [saving, setSaving] = useState(false);
  const [check, setCheck] = useState<MaxCheckDTO | null>(null);
  const [checking, setChecking] = useState(false);

  const load = () => {
    api
      .getMaxSettings()
      .then((s) => {
        setSettings(s);
        setOwnerId(s.ownerId !== null ? String(s.ownerId) : "");
      })
      .catch(() => setSettings(null));
    api
      .getMaxStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  };

  useEffect(() => {
    load();
  }, []);

  const fromEnv = settings?.fromEnv === true;

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.saveMaxSettings({
        token: token.trim() || null,
        ...(ownerId.trim() && /^\d+$/.test(ownerId.trim()) ? { ownerId: Number(ownerId.trim()) } : {}),
      });
      setSettings(updated);
      setToken("");
      showToast("Настройки MAX сохранены", "success");
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Не удалось сохранить настройки");
    } finally {
      setSaving(false);
    }
  };

  const runCheck = async () => {
    setChecking(true);
    try {
      const result = await api.checkMaxConnection();
      setCheck(result);
      showToast(result.botOk ? "MAX-бот отвечает — подключение работает" : "MAX отклонил токен");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Не удалось проверить подключение");
    } finally {
      setChecking(false);
    }
  };

  if (settings === null) {
    return (
      <div className="screen-rise">
        <ScreenHeader title="MAX" caption="Бот MAX: вопросы покупателей и автопостинг в свои каналы" />
        <section className="px-5">
          <Skeleton className="h-[120px] w-full rounded-[20px]" />
          <Skeleton className="mt-3 h-[260px] w-full rounded-[20px]" />
        </section>
      </div>
    );
  }

  return (
    <div className="screen-rise">
      <ScreenHeader title="MAX" caption="Бот MAX: вопросы покупателей и автопостинг в свои каналы" />
      <section className="px-5">

        {/* Статус подключения. */}
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <KeyRound size={16} className="text-accent" />
            <p className="text-[15px] font-semibold text-ink">Подключение</p>
            <Chip tone={status?.configured ? "green" : "warm"} className="ml-auto">
              {status?.configured ? "активно" : "не настроено"}
            </Chip>
          </div>
          <p className="mt-1.5 text-[12px] font-medium leading-relaxed text-soft">
            Токен бесплатный: max.ru → для разработчиков (dev.max.ru) → «Чат-боты» →
            создать бота. Приём вопросов покупателей работает автоматически
            (long polling); публикация — кнопкой в мастере «Разместить»
            в MAX-каналах, где бот — админ.
          </p>
          {status?.configured && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {status.bot?.url ? (
                <a
                  href={status.bot.url}
                  target="_blank"
                  rel="noreferrer"
                  className="press inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-[12px] font-semibold text-accent"
                >
                  <Bot size={13} className="shrink-0" />
                  @{status.bot.username}
                </a>
              ) : null}
              <Chip tone="outline">long polling</Chip>
              <Chip tone="outline">{status.newLeads} новых</Chip>
              <Chip tone="outline">сегодня {status.leadsToday}</Chip>
            </div>
          )}
          {fromEnv && (
            <div className="mt-2 flex items-center gap-1.5 rounded-[14px] bg-accent-soft px-3.5 py-2">
              <ShieldCheck size={14} className="shrink-0 text-accent" />
              <p className="text-[11.5px] font-semibold text-accent">
                Токен задан переменной окружения (MAX_BOT_TOKEN) — правка здесь недоступна
              </p>
            </div>
          )}
        </Card>

        {/* Токен и ID владельца. */}
        <Card className="mt-3 p-4">
          <p className="text-[15px] font-semibold text-ink">Токен бота</p>
          <div className="mt-3 flex flex-col gap-3.5">
            <Field
              label="access_token"
              hint={settings.tokenSet ? "задан — не показываем" : "из dev.max.ru, раздел «Чат-боты»"}
            >
              <TextInput
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                disabled={fromEnv}
                placeholder={settings.tokenSet ? "••••••••" : "строка токена"}
                aria-label="Токен MAX-бота"
              />
            </Field>
            <Field label="Ваш ID в MAX" hint="придёт апдейтом, когда напишете боту">
              <TextInput
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                disabled={fromEnv}
                inputMode="numeric"
                placeholder="123456789"
                aria-label="ID владельца в MAX"
              />
            </Field>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Btn
              variant="secondary"
              onClick={() => void runCheck()}
              disabled={checking || !settings.tokenSet}
              loading={checking}
              ariaLabel="Проверить подключение MAX"
            >
              <ExternalLink size={15} className={checking ? "animate-pulse" : ""} />
              {checking ? "Проверяю…" : "Проверить подключение"}
            </Btn>
            <Btn full onClick={() => void save()} disabled={saving || fromEnv} loading={saving} ariaLabel="Сохранить настройки MAX">
              Сохранить
            </Btn>
          </div>

          {check !== null && (
            <div
              className={`mt-3 rounded-[14px] px-3.5 py-3 ${
                check.botOk ? "bg-accent-soft" : "bg-warm-soft"
              }`}
            >
              <div className="flex items-center gap-1.5">
                {check.botOk ? (
                  <CheckCircle2 size={14} className="shrink-0 text-accent" />
                ) : (
                  <ShieldCheck size={14} className="shrink-0 text-warm" />
                )}
                <p className={`text-[12px] font-semibold ${check.botOk ? "text-accent" : "text-warm"}`}>
                  {check.botOk
                    ? `Бот «${check.firstName}» отвечает — подключение работает`
                    : "MAX отклонил токен"}
                </p>
              </div>
              {check.error && (
                <p className="mt-1 text-[11.5px] font-medium leading-relaxed text-soft">{check.error}</p>
              )}
            </div>
          )}
        </Card>

        {/* Каналы и найденные чаты. */}
        {status !== null && (
          <Card className="mt-3 p-4">
            <div className="flex items-center gap-2">
              <Link2 size={16} className="text-accent" />
              <p className="text-[15px] font-semibold text-ink">MAX-каналы и chat_id</p>
            </div>
            <p className="mt-1 text-[12px] font-medium leading-relaxed text-soft">
              Добавьте бота админом в канал — ID придёт автоматически и появится
              здесь; или укажите числовой chat_id при публикации в мастере.
            </p>
            <div className="mt-2.5 flex flex-col gap-2">
              {status.channels.map((c) => (
                <div
                  key={c.channelId}
                  className="flex items-center gap-2 rounded-[14px] bg-subtle px-3.5 py-2.5"
                >
                  <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{c.name}</p>
                  <Chip tone={c.chatId !== null ? "green" : "outline"}>
                    {c.chatId !== null ? `ID ${c.chatId}` : "не привязан"}
                  </Chip>
                </div>
              ))}
              {status.discovered.length > 0 && (
                <div className="rounded-[14px] bg-accent-soft px-3.5 py-2.5">
                  <p className="text-[12px] font-semibold text-accent">
                    Бот добавлен в чаты: {status.discovered.map((d) => `«${d.title ?? d.chatId}» (ID ${d.chatId})`).join(", ")}
                  </p>
                </div>
              )}
            </div>
          </Card>
        )}

        <a
          href="https://dev.max.ru/docs-api"
          target="_blank"
          rel="noreferrer"
          className="press mt-3 flex items-center gap-2 rounded-[14px] border border-line bg-surface px-4 py-2.5 text-[13px] font-semibold text-ink"
        >
          <ExternalLink size={15} className="shrink-0 text-soft" />
          Документация MAX Bot API (dev.max.ru)
        </a>
      </section>
    </div>
  );
}
