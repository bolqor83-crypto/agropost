/**
 * ЭТАП 9/10 + «СЕКРЕТЫ» — Настройки: автоматизация публикации, фиды,
 * переменные окружения (Telegram, AI) и реквизиты.
 *
 * «Ещё» → «Настройки»: Авито API и MAX — отдельные экраны (внизу ссылки),
 * фиды — токен FEED_TOKEN + YML-ссылки, Telegram-бот и AI (OpenRouter) —
 * секретные поля с проверкой подключения. Значения хранятся на сервере
 * в шифрованном виде (AES-256-GCM), клиент видит только маски ••••1234.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bot,
  BrainCircuit,
  ChevronRight,
  Copy,
  Eye,
  FileCode2,
  History,
  IdCard,
  KeyRound,
  Megaphone,
  Send,
  ShieldAlert,
  Upload,
} from "lucide-react";
import type { FeedsInfoDTO, SecretItemDTO, SecretsStatusDTO } from "@shared/types";
import * as api from "../api/client";
import { useToastStore } from "../stores/publish";
import { copyText } from "../lib/tips";
import { formatSecretChange } from "../lib/secrets-ui";
import { Btn, Card, Chip, ScreenHeader, Skeleton } from "../components/ui";
import { SecretField } from "../components/SecretField";

function FeedsCard({ feedTokenItem, onSecretSaved }: { feedTokenItem: SecretItemDTO | null; onSecretSaved: () => void }) {
  const showToast = useToastStore((s) => s.show);
  const [info, setInfo] = useState<FeedsInfoDTO | null>(null);

  const loadInfo = useCallback(() => {
    api
      .getFeedsInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  useEffect(() => {
    loadInfo();
  }, [loadInfo]);

  const copyFeedUrl = async (url: string) => {
    const ok = await copyText(url);
    showToast(ok ? "Ссылка скопирована — вставьте в кабинет площадки" : "Не удалось скопировать", ok ? "success" : "error");
  };

  return (
    <Card className="mt-3 p-4">
      <div className="flex items-center gap-2">
        <FileCode2 size={16} className="text-accent" />
        <p className="text-[15px] font-semibold text-ink">Фиды площадкам</p>
        {info && (
          <Chip tone={info.configured ? "green" : "warm"} className="ml-auto">
            {info.configured ? `${info.offers} поз.` : "токен не задан"}
          </Chip>
        )}
      </div>
      <p className="mt-1.5 text-[12px] font-medium leading-relaxed text-soft">
        Площадки (Зерно Он-Лайн, Своё Фермерство) забирают объявления по
        YML-ссылке сами. Вставьте её в личный кабинет площадки один раз —
        дальше объявления обновляются автоматически.
      </p>

      {/* Токен фида: задаётся здесь (шифрованно) или через env. */}
      {feedTokenItem && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="mb-2 flex items-center gap-1.5">
            <KeyRound size={13} className="shrink-0 text-accent" />
            <p className="text-[12px] font-semibold text-soft">Токен доступа (FEED_TOKEN)</p>
          </div>
          <SecretField
            item={feedTokenItem}
            onSaved={() => {
              onSecretSaved();
              loadInfo();
            }}
          />
        </div>
      )}

      {info?.yml ? (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <p className="text-[12px] font-semibold text-soft">YML-фид</p>
            <Btn
              variant="secondary"
              onClick={() => void copyFeedUrl(info.yml as string)}
              ariaLabel="Скопировать YML-ссылку"
            >
              <Copy size={14} />
            </Btn>
          </div>
          <code className="mt-1 block overflow-x-auto rounded-[10px] bg-subtle px-3 py-2 text-[10.5px] leading-relaxed text-soft">
            {info.yml}
          </code>
        </div>
      ) : null}
      {info !== null && !info.yml && (
        <p className="mt-2 text-[11.5px] font-medium leading-relaxed text-warm">
          Токен не задан — фиды отключены. Задайте его выше (сохраняется
          зашифрованным в базе) или через env на Render, затем скопируйте
          ссылку. Подробно — README, «Как подключить YML-фид».
        </p>
      )}
    </Card>
  );
}

function TelegramCard({ items, onSecretSaved }: { items: SecretItemDTO[]; onSecretSaved: () => void }) {
  const token = items.find((i) => i.key === "TELEGRAM_BOT_TOKEN") ?? null;
  const userId = items.find((i) => i.key === "TELEGRAM_USER_ID") ?? null;
  if (!token || !userId) return null;
  return (
    <Card className="mt-3 p-4">
      <div className="flex items-center gap-2">
        <Send size={16} className="text-accent" />
        <p className="text-[15px] font-semibold text-ink">Telegram-бот</p>
      </div>
      <p className="mt-1.5 text-[12px] font-medium leading-relaxed text-soft">
        Токен бота из @BotFather и ваш Telegram ID (у @userinfobot) — бот
        принимает вопросы покупателей и шлёт вам уведомления о лидах.
        Сохраняется зашифрованным в базе; новые значения вступают в силу
        после перезапуска API.
      </p>
      <div className="mt-3 flex flex-col gap-4">
        <SecretField item={token} onSaved={onSecretSaved} />
        <SecretField item={userId} onSaved={onSecretSaved} />
      </div>
    </Card>
  );
}

function AiCard({ item, onSecretSaved }: { item: SecretItemDTO | null; onSecretSaved: () => void }) {
  if (!item) return null;
  return (
    <Card className="mt-3 p-4">
      <div className="flex items-center gap-2">
        <BrainCircuit size={16} className="text-accent" />
        <p className="text-[15px] font-semibold text-ink">AI (OpenRouter)</p>
      </div>
      <p className="mt-1.5 text-[12px] font-medium leading-relaxed text-soft">
        Ключ openrouter.ai — тексты объявлений, ответы покупателям и
        подсказки по ценам. Сохраняется зашифрованным в базе; применяется
        после перезапуска API.
      </p>
      <div className="mt-3">
        <SecretField item={item} onSaved={onSecretSaved} />
      </div>
    </Card>
  );
}

function ChangesCard({ status }: { status: SecretsStatusDTO }) {
  if (status.recentChanges.length === 0) return null;
  return (
    <Card className="mt-3 p-4">
      <div className="flex items-center gap-2">
        <History size={16} className="text-accent" />
        <p className="text-[15px] font-semibold text-ink">История переменных</p>
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        {status.recentChanges.slice(0, 5).map((change) => (
          <p key={change.id} className="text-[11.5px] font-medium leading-relaxed text-soft">
            {formatSecretChange(change)}
          </p>
        ))}
      </div>
    </Card>
  );
}

export function SettingsScreen() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SecretsStatusDTO | null>(null);

  const load = useCallback(() => {
    api
      .getSecretsStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const items = status?.items ?? [];
  const feedTokenItem = items.find((i) => i.key === "FEED_TOKEN") ?? null;
  const aiItem = items.find((i) => i.key === "OPENROUTER_API_KEY") ?? null;

  return (
    <div className="screen-rise">
      <ScreenHeader title="Настройки" caption="Автоматизация, переменные, реквизиты" back="/more" />
      {/* Полиш 26.11.2026: каскадное появление карточек (stagger). */}
      <section className="px-5 stagger-children">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Megaphone size={16} className="text-accent" />
            <p className="text-[15px] font-semibold text-ink">Автоматизация публикации</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/settings/avito")}
            className="press mt-2 flex w-full items-center gap-3 rounded-[14px] bg-subtle px-3.5 py-3 text-left"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-surface text-accent">
              <Upload size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-ink">Авито API</p>
              <p className="text-[12px] font-medium text-soft">
                Ключи Автозагрузки — публикация без браузера
              </p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-soft" />
          </button>

          {/* ЭТАП 10: MAX Bot API — токен, проверка, chat_id каналов. */}
          <button
            type="button"
            onClick={() => navigate("/settings/max")}
            className="press mt-2 flex w-full items-center gap-3 rounded-[14px] bg-subtle px-3.5 py-3 text-left"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-surface text-accent">
              <Bot size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-ink">MAX</p>
              <p className="text-[12px] font-medium text-soft">
                Бот MAX — вопросы покупателей и автопостинг в свои каналы
              </p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-soft" />
          </button>

          {/* ЭТАП 10: userbot — чтение чужих TG-чатов (только чтение). */}
          <button
            type="button"
            onClick={() => navigate("/settings/userbot")}
            className="press mt-2 flex w-full items-center gap-3 rounded-[14px] bg-subtle px-3.5 py-3 text-left"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-surface text-accent">
              <Eye size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-ink">Userbot (чтение)</p>
              <p className="text-[12px] font-medium text-soft">
                Чтение чужих Telegram-чатов — заказы не пропускаются
              </p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-soft" />
          </button>
        </Card>

        {/* Честное предупреждение: без ключа шифрования сохранение недоступно. */}
        {status !== null && !status.encryptionEnabled && status.warning && (
          <div className="mt-3 flex items-start gap-2 rounded-[16px] bg-warm-soft px-3.5 py-3">
            <ShieldAlert size={15} className="mt-0.5 shrink-0 text-warm" />
            <p className="text-[11.5px] font-semibold leading-relaxed text-warm">{status.warning}</p>
          </div>
        )}

        {status === null ? (
          <>
            <Skeleton className="mt-3 h-[180px] w-full rounded-[20px]" />
            <Skeleton className="mt-3 h-[120px] w-full rounded-[20px]" />
          </>
        ) : (
          <>
            <FeedsCard feedTokenItem={feedTokenItem} onSecretSaved={load} />
            <TelegramCard items={items} onSecretSaved={load} />
            <AiCard item={aiItem} onSecretSaved={load} />
            <ChangesCard status={status} />
          </>
        )}

        <button
          type="button"
          onClick={() => navigate("/profile")}
          className="press mt-3 flex w-full items-center gap-3 rounded-[20px] border border-line bg-surface px-4 py-3.5 text-left"
        >
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-subtle text-soft">
            <IdCard size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-ink">Реквизиты и налог</p>
            <p className="text-[12px] font-medium text-soft">Профиль продавца, документы, тёмная тема</p>
          </div>
          <ChevronRight size={16} className="shrink-0 text-soft" />
        </button>
      </section>
    </div>
  );
}
