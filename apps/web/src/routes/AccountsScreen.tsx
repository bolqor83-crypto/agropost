/**
 * Аккаунты (этап 2): мультиаккаунты площадок и лимиты размещений.
 * Пока это только учёт — сессии для автопостинга появятся на этапе 3.
 */

import { useEffect, useState } from "react";
import {
  HelpCircle,
  Info,
  Pencil,
  Plus,
  Send,
  Smartphone,
  Store,
  Tag,
  Trash2,
  Users,
} from "lucide-react";
import { ACCOUNT_PLATFORM_LABEL, ACCOUNT_STATUS_LABEL } from "@shared/labels";
import type { AccountDTO, AccountPlatform } from "@shared/types";
import * as api from "../api/client";
import { fmtNum } from "../lib/format";
import { useChannels } from "../stores/channels";
import { useToastStore } from "../stores/publish";
import {
  Btn,
  Card,
  Chip,
  EmptyState,
  InfoRow,
  ScreenHeader,
  Sheet,
  Skeleton,
} from "../components/ui";
import { AccountSheet } from "../components/AccountSheet";

const PLATFORM_ICON: Record<AccountPlatform, typeof Send> = {
  TELEGRAM: Send,
  AVITO: Store,
  MAX: Smartphone,
  YOULA: Tag,
  OTHER: HelpCircle,
};

function statusTone(status: AccountDTO["status"]): "green" | "warm" | "neutral" {
  if (status === "ACTIVE") return "green";
  if (status === "PAUSED") return "neutral";
  /* LIMITED и BLOCKED — тревожные */
  return "warm";
}

type DetailState =
  | { mode: "view"; account: AccountDTO }
  | { mode: "edit"; account: AccountDTO }
  | { mode: "create" }
  | null;

export function AccountsScreen() {
  const { accounts, loading, error, load } = useChannels();
  const showToast = useToastStore((s) => s.show);
  const [sheet, setSheet] = useState<DetailState>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const removeAccount = async (id: string) => {
    try {
      await api.deleteAccount(id);
      setConfirmDelete(null);
      setSheet(null);
      showToast("Аккаунт удалён");
      await load(true);
    } catch (err) {
      setConfirmDelete(null);
      showToast(err instanceof Error ? err.message : "Не удалось удалить");
    }
  };

  return (
    <div className="screen-rise">
      <ScreenHeader
        title="Аккаунты"
        caption={accounts.length > 0 ? `${accounts.length} аккаунтов` : "аккаунтов нет"}
        back="/more"
        action={
          <Btn onClick={() => setSheet({ mode: "create" })} ariaLabel="Добавить аккаунт">
            <Plus size={16} />
          </Btn>
        }
      />

      <section className="px-5 pt-4 pb-2">
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

        {loading && accounts.length === 0 ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[92px] w-full rounded-[20px]" />
            <Skeleton className="h-[92px] w-full rounded-[20px]" />
            <Skeleton className="h-[92px] w-full rounded-[20px]" />
          </div>
        ) : accounts.length === 0 && !error ? (
          <Card>
            <EmptyState
              icon={<Users size={26} />}
              title="Аккаунтов пока нет"
              caption="Заведите аккаунты площадок: платформа, телефон и лимит размещений в день"
            />
            <div className="px-5 pb-5">
              <Btn full size="lg" onClick={() => setSheet({ mode: "create" })}>
                <Plus size={17} />
                Добавить аккаунт
              </Btn>
            </div>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {accounts.map((a) => {
              const Icon = PLATFORM_ICON[a.platform];
              return (
                <Card key={a.id} onClick={() => setSheet({ mode: "view", account: a })} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
                      <Icon size={19} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-[15px] font-semibold text-ink">
                          {ACCOUNT_PLATFORM_LABEL[a.platform]}
                        </p>
                        <Chip tone={statusTone(a.status)}>{ACCOUNT_STATUS_LABEL[a.status]}</Chip>
                      </div>
                      <p className="mt-0.5 truncate text-[12px] font-medium text-soft">
                        {a.phone ?? "без телефона"}
                      </p>
                      <p className="mt-1 truncate text-[12px] font-medium text-soft">
                        сегодня: {a.usedToday} из {a.dailyLimit}
                      </p>
                      {a.notes && (
                        <p className="mt-1 line-clamp-2 text-[12px] font-medium leading-relaxed text-soft">
                          {a.notes}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2 rounded-[14px] bg-subtle px-4 py-3">
          <Info size={16} className="shrink-0 text-soft" />
          <p className="text-[12px] font-medium leading-relaxed text-soft">
            Пока это только учёт. Сессии для автопостинга появятся на этапе 3.
          </p>
        </div>
      </section>

      {/* Карточка аккаунта */}
      {sheet?.mode === "view" && (
        <Sheet title="Аккаунт" onClose={() => setSheet(null)}>
          <p className="text-[18px] font-semibold leading-snug text-ink">
            {ACCOUNT_PLATFORM_LABEL[sheet.account.platform]}
          </p>
          <div className="mt-2">
            <Chip tone={statusTone(sheet.account.status)}>
              {ACCOUNT_STATUS_LABEL[sheet.account.status]}
            </Chip>
          </div>
          <div className="mt-3">
            <Btn
              variant="secondary"
              onClick={() => setSheet({ mode: "edit", account: sheet.account })}
            >
              <Pencil size={15} />
              Изменить
            </Btn>
          </div>

          <div className="mt-4 rounded-[14px] bg-subtle px-4 py-1">
            <InfoRow label="Платформа" value={ACCOUNT_PLATFORM_LABEL[sheet.account.platform]} />
            <InfoRow
              label="Телефон"
              value={sheet.account.phone ?? "—"}
              valueClass={sheet.account.phone ? "text-ink" : "text-soft"}
            />
            <InfoRow label="Статус" value={ACCOUNT_STATUS_LABEL[sheet.account.status]} />
            <InfoRow
              label="Лимит в день"
              value={fmtNum(sheet.account.dailyLimit)}
              valueClass="text-soft"
            />
            <InfoRow
              label="Использовано сегодня"
              value={fmtNum(sheet.account.usedToday)}
              valueClass="text-soft"
            />
          </div>

          {sheet.account.notes && (
            <div className="mt-3 rounded-[14px] bg-subtle px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-soft">Заметки</p>
              <p className="mt-1 text-[13px] font-medium leading-relaxed text-ink">
                {sheet.account.notes}
              </p>
            </div>
          )}

          {confirmDelete === sheet.account.id ? (
            <div className="mt-4 rounded-[14px] bg-warm-soft px-4 py-3">
              <p className="text-[13px] font-semibold text-warm">Удалить аккаунт?</p>
              <div className="flex gap-2 pt-3">
                <Btn variant="ghost" onClick={() => setConfirmDelete(null)}>
                  Отмена
                </Btn>
                <Btn onClick={() => void removeAccount(sheet.account.id)}>Удалить</Btn>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(sheet.account.id)}
              className="press mt-4 inline-flex items-center gap-1.5 px-1 text-[13px] font-semibold text-warm"
            >
              <Trash2 size={14} />
              Удалить аккаунт
            </button>
          )}
        </Sheet>
      )}

      {/* Форма: создание/редактирование */}
      {sheet && sheet.mode !== "view" && (
        <AccountSheet
          account={sheet.mode === "edit" ? sheet.account : null}
          onClose={() => setSheet(null)}
          onSaved={() => void load(true)}
        />
      )}
    </div>
  );
}
