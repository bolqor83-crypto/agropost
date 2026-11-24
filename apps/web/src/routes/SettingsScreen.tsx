/**
 * ЭТАП 9 — Настройки: автоматизация публикации и профиль.
 *
 * «Ещё» → «Настройки»: Авито API (ключи Автозагрузки), фиды площадкам
 * (YML-ссылка для кабинетов Зерно Он-Лайн / Своё Фермерство) и реквизиты
 * (профиль владельца, там же тёмная тема).
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, ChevronRight, Copy, Eye, FileCode2, IdCard, Megaphone, Upload } from "lucide-react";
import type { FeedsInfoDTO } from "@shared/types";
import * as api from "../api/client";
import { useToastStore } from "../stores/publish";
import { copyText } from "../lib/tips";
import { Btn, Card, Chip, ScreenHeader, Skeleton } from "../components/ui";

function FeedsCard() {
  const showToast = useToastStore((s) => s.show);
  const [info, setInfo] = useState<FeedsInfoDTO | null>(null);

  useEffect(() => {
    api
      .getFeedsInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  const copyFeedUrl = async (url: string) => {
    const ok = await copyText(url);
    showToast(ok ? "Ссылка скопирована — вставьте в кабинет площадки" : "Не удалось скопировать", ok ? "success" : "error");
  };

  if (info === null) {
    return (
      <Card className="p-4">
        <p className="text-[15px] font-semibold text-ink">Фиды площадкам</p>
        <div className="mt-3 flex flex-col gap-2">
          <Skeleton className="h-10 w-full rounded-[14px]" />
          <Skeleton className="h-10 w-full rounded-[14px]" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="mt-3 p-4">
      <div className="flex items-center gap-2">
        <FileCode2 size={16} className="text-accent" />
        <p className="text-[15px] font-semibold text-ink">Фиды площадкам</p>
        <Chip tone={info.configured ? "green" : "warm"} className="ml-auto">
          {info.configured ? `${info.offers} поз.` : "токен не задан"}
        </Chip>
      </div>
      <p className="mt-1.5 text-[12px] font-medium leading-relaxed text-soft">
        Площадки (Зерно Он-Лайн, Своё Фермерство) забирают объявления по
        YML-ссылке сами. Вставьте её в личный кабинет площадки один раз —
        дальше объявления обновляются автоматически.
      </p>
      {info.yml ? (
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
      ) : (
        <p className="mt-2 text-[11.5px] font-medium leading-relaxed text-warm">
          FEED_TOKEN не задан — фиды отключены. Сгенерируйте токен
          (openssl rand -hex 16) и добавьте в env на Render, затем
          скопируйте ссылку здесь. Подробно — README, «Как подключить YML-фид».
        </p>
      )}
    </Card>
  );
}

export function SettingsScreen() {
  const navigate = useNavigate();

  return (
    <div className="screen-rise">
      <ScreenHeader title="Настройки" caption="Автоматизация, реквизиты, тема" />
      <section className="px-5">
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

        <FeedsCard />

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
