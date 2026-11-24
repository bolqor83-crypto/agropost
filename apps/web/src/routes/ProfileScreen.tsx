/**
 * Реквизиты (этап 4) — из «Ещё». Нужны для генерации документов:
 * счёт, договор, ТН, УПД подписываются пользователем как продавцом
 * (white-label: поставщик не упоминается). Здесь же налоговый режим
 * по умолчанию для новых сделок.
 */

import { useEffect, useState } from "react";
import { Moon, Save, ShieldCheck } from "lucide-react";
import { DEAL_TAX_MODE_LABEL } from "@shared/labels";
import { dealTaxModeToProfile } from "@shared/pricing";
import type { DealTaxMode, UserProfileDTO } from "@shared/types";
import * as api from "../api/client";
import { useToastStore } from "../stores/publish";
import { loadTheme, setTheme, type Theme } from "../lib/theme";
import { Btn, Card, Chip, Field, ScreenHeader, Select, Skeleton, TextInput, ToggleRow } from "../components/ui";

const TAX_MODES: DealTaxMode[] = ["IP_6", "SELF_EMPLOYED_4", "SELF_EMPLOYED_6"];

export function ProfileScreen() {
  const showToast = useToastStore((s) => s.show);
  const [profile, setProfile] = useState<UserProfileDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [inn, setInn] = useState("");
  const [ogrnip, setOgrnip] = useState("");
  const [address, setAddress] = useState("");
  const [bank, setBank] = useState("");
  const [bik, setBik] = useState("");
  const [account, setAccount] = useState("");
  const [taxMode, setTaxMode] = useState<DealTaxMode>("IP_6");
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    setThemeState(loadTheme());
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setThemeState(next);
    setTheme(next);
  };

  useEffect(() => {
    api
      .getUserProfile()
      .then((p) => {
        setProfile(p);
        if (p) {
          setName(p.name ?? "");
          setInn(p.inn ?? "");
          setOgrnip(p.ogrnip ?? "");
          setAddress(p.address ?? "");
          setBank(p.bank ?? "");
          setBik(p.bik ?? "");
          setAccount(p.account ?? "");
          /* ЭТАП 6: guard от неожидаемого значения — экран не падает. */
          setTaxMode(p.dealTaxMode ?? "IP_6");
        }
      })
      .catch((err) => showToast(err instanceof Error ? err.message : "Профиль не загрузился"))
      .finally(() => setLoading(false));
  }, [showToast]);

  const save = () => {
    setBusy(true);
    api
      .updateUserProfile({
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(inn.trim() ? { inn: inn.trim() } : {}),
        ...(ogrnip.trim() ? { ogrnip: ogrnip.trim() } : {}),
        ...(address.trim() ? { address: address.trim() } : {}),
        ...(bank.trim() ? { bank: bank.trim() } : {}),
        ...(bik.trim() ? { bik: bik.trim() } : {}),
        ...(account.trim() ? { account: account.trim() } : {}),
        dealTaxMode: taxMode,
      })
      .then((p) => {
        setProfile(p);
        const prof = dealTaxModeToProfile(taxMode);
        showToast(`Сохранено · налог по умолчанию ${DEAL_TAX_MODE_LABEL[taxMode]} (${Math.round(prof.taxRate * 100)}%)`);
      })
      .catch((err) => showToast(err instanceof Error ? err.message : "Не удалось сохранить"))
      .finally(() => setBusy(false));
  };

  const missing = !profile?.inn || !profile?.address || !profile?.account || !profile?.bank || !profile?.bik;

  return (
    <div className="screen-rise">
      <ScreenHeader
        title="Реквизиты"
        caption="Подпись документов: вы — продавец, поставщик не упоминается"
      />

      <section className="px-5 pb-6">
        {loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[68px] w-full rounded-[20px]" />
            <Skeleton className="h-[68px] w-full rounded-[20px]" />
            <Skeleton className="h-[68px] w-full rounded-[20px]" />
          </div>
        ) : (
          <>
            {missing && (
              <Card className="mb-3 flex items-start gap-3 p-4">
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-warm" />
                <div>
                  <p className="text-[13px] font-semibold text-ink">
                    Документы не сгенерируются без реквизитов
                  </p>
                  <p className="mt-0.5 text-[12px] font-medium text-soft">
                    Заполните ИНН, адрес, банк, БИК и счёт — счёт и УПД без них не создать
                  </p>
                </div>
              </Card>
            )}

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-[15px] font-semibold text-ink">Продавец</p>
                <Chip tone={missing ? "warm" : "green"}>{missing ? "не заполнено" : "готово"}</Chip>
              </div>

              <div className="mt-3">
                <Field label="ФИО / название" required>
                  <TextInput value={name} onChange={(e) => setName(e.target.value)} aria-label="ФИО или название" />
                </Field>
              </div>

              <div className="mt-3 flex gap-3">
                <div className="flex-1">
                  <Field label="ИНН" required>
                    <TextInput value={inn} onChange={(e) => setInn(e.target.value)} inputMode="numeric" aria-label="ИНН" />
                  </Field>
                </div>
                <div className="flex-1">
                  <Field label="ОГРНИП" hint="для ИП">
                    <TextInput value={ogrnip} onChange={(e) => setOgrnip(e.target.value)} inputMode="numeric" aria-label="ОГРНИП" />
                  </Field>
                </div>
              </div>

              <div className="mt-3">
                <Field label="Адрес" required>
                  <TextInput value={address} onChange={(e) => setAddress(e.target.value)} aria-label="Адрес" />
                </Field>
              </div>

              <div className="mt-3">
                <Field label="Банк" required>
                  <TextInput value={bank} onChange={(e) => setBank(e.target.value)} placeholder="АО «Банк»" aria-label="Банк" />
                </Field>
              </div>

              <div className="mt-3 flex gap-3">
                <div className="w-28">
                  <Field label="БИК" required>
                    <TextInput value={bik} onChange={(e) => setBik(e.target.value)} inputMode="numeric" aria-label="БИК" />
                  </Field>
                </div>
                <div className="flex-1">
                  <Field label="Расчётный счёт" required>
                    <TextInput
                      value={account}
                      onChange={(e) => setAccount(e.target.value)}
                      inputMode="numeric"
                      placeholder="40802810…"
                      aria-label="Расчётный счёт"
                    />
                  </Field>
                </div>
              </div>
            </Card>

            <Card className="mt-3 p-4">
              <div className="flex items-center gap-2">
                <Moon size={16} className="text-accent" />
                <p className="text-[15px] font-semibold text-ink">Настройки вида</p>
              </div>
              <p className="mt-1 text-[12px] font-medium text-soft">
                Тёмная тема — для вечером, глаза скажут спасибо
              </p>
              <div className="mt-3">
                <ToggleRow
                  checked={theme === "dark"}
                  onToggle={toggleTheme}
                  label="Тёмная тема"
                  hint={theme === "dark" ? "Включена — фон #1E1C1A" : "Выключена — светлая, как в дизайне"}
                />
              </div>
            </Card>

            <Card className="mt-3 p-4">
              <p className="text-[15px] font-semibold text-ink">Налог по умолчанию</p>
              <p className="mt-1 text-[12px] font-medium text-soft">
                В каждой сделке можно переопределить режим
              </p>
              <div className="mt-3">
                <Select
                  value={taxMode}
                  onChange={(v) => setTaxMode(v as DealTaxMode)}
                  ariaLabel="Налоговый режим по умолчанию"
                  options={TAX_MODES.map((m) => ({ value: m, label: DEAL_TAX_MODE_LABEL[m] }))}
                />
              </div>
              <p className="mt-2 text-[11px] font-medium text-soft">
                Ставка {Math.round(dealTaxModeToProfile(taxMode).taxRate * 100)}% от выручки —
                вычитается из маржи на сервере
              </p>
            </Card>

            <div className="mt-4">
              <Btn full size="lg" disabled={busy} onClick={save}>
                <Save size={16} />
                {busy ? "Сохраняем…" : "Сохранить реквизиты"}
              </Btn>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
