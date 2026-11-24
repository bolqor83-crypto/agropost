/**
 * Telegram-бот (этап 3.2): статус подключения, webhook, свои каналы.
 * Бот-приёмщик вопросов покупателей + автопостинг в каналы, где он админ.
 */

import { useCallback, useEffect, useState } from "react";
import { Bot, CheckCircle2, ExternalLink, Inbox, RefreshCw, Send } from "lucide-react";
import type { TelegramStatusDTO } from "@shared/types";
import * as api from "../api/client";
import { useToastStore } from "../stores/publish";
import { Btn, Card, Chip, EmptyState, InfoRow, ScreenHeader, Skeleton } from "../components/ui";

function StatusCard({ status }: { status: TelegramStatusDTO }) {
  return (
    <Card className="px-4 py-1">
      <InfoRow
        label="Бот"
        value={
          status.bot ? (
            <a
              href={status.bot.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-accent"
            >
              @{status.bot.username}
              <ExternalLink size={12} />
            </a>
          ) : (
            "не настроен"
          )
        }
        valueClass={status.bot ? "text-accent" : "text-soft"}
      />
      <InfoRow
        label="Webhook"
        value={status.webhook ? "установлен" : "не установлен"}
        valueClass={status.webhook ? "text-accent" : "text-soft"}
      />
      {status.webhook && (
        <InfoRow
          label="В очереди"
          value={String(status.webhook.pendingUpdateCount)}
          valueClass="text-soft"
        />
      )}
      {status.webhook?.lastErrorMessage && (
        <InfoRow label="Последняя ошибка" value={status.webhook.lastErrorMessage} valueClass="text-warm" />
      )}
      <InfoRow label="Новых сообщений" value={String(status.newLeads)} />
      <InfoRow label="Лидов за сегодня" value={String(status.leadsToday)} />
    </Card>
  );
}

export function TelegramBotScreen() {
  const showToast = useToastStore((s) => s.show);
  const [status, setStatus] = useState<TelegramStatusDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingHook, setSettingHook] = useState(false);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    api
      .getTelegramStatus()
      .then((r) => {
        setStatus(r);
        setError(null);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Не удалось получить статус бота"),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setupWebhook = async () => {
    if (settingHook) return;
    setSettingHook(true);
    try {
      const res = await api.setupTelegramWebhook();
      showToast("Webhook установлен");
      void load(true);
      if (res.webhook.pendingUpdateCount > 0) {
        showToast(`В очереди ${res.webhook.pendingUpdateCount} апдейтов`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Не удалось установить webhook");
    } finally {
      setSettingHook(false);
    }
  };

  return (
    <div className="screen-rise">
      <ScreenHeader
        title="Telegram-бот"
        caption="Покупатели спрашивают бота — вы отвечаете из инбокса"
      />

      <section className="px-5">
        {loading ? (
          <Skeleton className="h-[220px] w-full rounded-[20px]" />
        ) : error ? (
          <Card className="p-4">
            <p className="text-[13px] font-semibold text-warm">{error}</p>
            <div className="pt-3">
              <Btn variant="secondary" onClick={() => void load(true)}>
                Повторить
              </Btn>
            </div>
          </Card>
        ) : status ? (
          <>
            <StatusCard status={status} />

            {status.configured ? (
              <div className="mt-3 flex items-center gap-2 rounded-[14px] bg-accent-soft px-4 py-3">
                <CheckCircle2 size={16} className="shrink-0 text-accent" />
                <p className="text-[12px] font-semibold text-accent">
                  Бот подключён — сообщения покупателей приходят в инбокс
                </p>
              </div>
            ) : (
              <div className="mt-3 rounded-[14px] bg-subtle px-4 py-3">
                <p className="text-[12px] font-medium text-soft">
                  Задайте TELEGRAM_BOT_TOKEN в переменных окружения сервиса на Render
                </p>
              </div>
            )}

            {!status.webhook && status.configured && (
              <Card className="mt-3 p-4">
                <p className="text-[13px] font-semibold text-ink">Webhook не установлен</p>
                <p className="mt-1 text-[12px] font-medium text-soft">
                  Сообщения могут не приходить. Переустановите вручную — адрес подставится сам
                </p>
                <div className="pt-3">
                  <Btn onClick={() => void setupWebhook()} disabled={settingHook}>
                    <RefreshCw size={15} className={settingHook ? "animate-spin" : ""} />
                    {settingHook ? "Ставлю…" : "Установить webhook"}
                  </Btn>
                </div>
              </Card>
            )}

            {/* Свои каналы (бот — админ, автопостинг) */}
            <div className="pt-7">
              <h2 className="px-1 pb-3 text-[18px] font-semibold text-ink">
                Каналы для автопостинга
              </h2>
              {status.channels.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={<Send size={24} />}
                    title="Пока ни одного канала"
                    caption="Опубликуйте объявление через бота в свой канал — он запомнит его для следующих публикаций"
                  />
                </Card>
              ) : (
                <Card className="divide-y divide-line overflow-hidden">
                  {status.channels.map((c) => (
                    <a
                      key={c.channelId}
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 px-4 py-3.5"
                    >
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
                        <Send size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-ink">{c.name}</p>
                        <p className="truncate text-[12px] font-medium text-soft">{c.url}</p>
                      </div>
                      <Chip tone="green">бот</Chip>
                    </a>
                  ))}
                </Card>
              )}
            </div>
          </>
        ) : null}

        <div className="mt-4 flex items-center gap-2 rounded-[14px] bg-subtle px-4 py-3">
          <Bot size={16} className="shrink-0 text-soft" />
          <p className="text-[12px] font-medium text-soft">
            В чужие чаты бот не пишет: объявления только в ваши каналы, где он администратор
          </p>
        </div>

        <div className="pb-4 pt-3">
          <Btn full variant="secondary" onClick={() => void load(true)}>
            <RefreshCw size={15} />
            Обновить статус
          </Btn>
        </div>
      </section>

      {/* Подсказка про инбокс */}
      <section className="px-5 pb-2">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Inbox size={16} className="shrink-0 text-accent" />
            <p className="text-[13px] font-semibold text-ink">Как это работает</p>
          </div>
          <p className="mt-2 text-[12px] font-medium leading-relaxed text-soft">
            1. Покупатель нажимает «Задать вопрос продавцу» под объявлением и пишет боту.
            2. Сообщение попадает в инбокс, вы получаете уведомление в Telegram.
            3. «Черновик AI» собирает ответ с ценой и условиями — вы правите и отправляете.
          </p>
        </Card>
      </section>
    </div>
  );
}
