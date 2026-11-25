/**
 * ЭТАП 9 — «Ещё» → «Настройки» → «Авито API».
 *
 * Ключи официального API Авито (бесплатно: Авито → «Для бизнеса» →
 * «Интеграции» → API): client_id/client_secret/user_id + телефон для
 * объявлений. «Проверить подключение» — реально получает OAuth-токен.
 * Ключи можно задать env-переменными на Render (env сильнее — поля
 * закрыты, только просмотр).
 */

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  FileCode2,
  KeyRound,
  ShieldCheck,
  Upload,
} from "lucide-react";
import type { AvitoCheckDTO, AvitoSettingsDTO, AvitoStatusDTO } from "@shared/types";
import * as api from "../api/client";
import { useToastStore } from "../stores/publish";
import { copyText } from "../lib/tips";
import { Btn, Card, Chip, Field, ScreenHeader, Skeleton, TextInput } from "../components/ui";

export function AvitoApiScreen() {
  const showToast = useToastStore((s) => s.show);
  const [settings, setSettings] = useState<AvitoSettingsDTO | null>(null);
  const [status, setStatus] = useState<AvitoStatusDTO | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [userId, setUserId] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [check, setCheck] = useState<AvitoCheckDTO | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    api
      .getAvitoSettings()
      .then((s) => setSettings(s))
      .catch(() => setSettings(null));
    api
      .getAvitoStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const fromEnv = settings?.fromEnv === true;

  const save = async () => {
    setSaving(true);
    try {
      /* ЭТАП «СЕКРЕТЫ»: сервер возвращает маски — поле не тронули,
         значит не отправляем (иначе затёрли бы сохранённое значение). */
      const updated = await api.saveAvitoSettings({
        ...(clientId.trim() ? { clientId: clientId.trim() } : {}),
        ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
        ...(userId.trim() ? { userId: userId.trim() } : {}),
        ...(phone.trim() ? { contactPhone: phone.trim() } : {}),
      });
      setSettings(updated);
      setClientId("");
      setClientSecret("");
      setUserId("");
      setPhone("");
      showToast("Ключи Авито сохранены (зашифрованно в базе)", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Не удалось сохранить ключи");
    } finally {
      setSaving(false);
    }
  };

  const runCheck = async () => {
    setChecking(true);
    try {
      const result = await api.checkAvitoConnection();
      setCheck(result);
      showToast(result.tokenOk ? "Подключение работает" : "Авито отклонил ключи — проверьте client_id/secret");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Не удалось проверить подключение");
    } finally {
      setChecking(false);
    }
  };

  if (settings === null) {
    return (
      <div className="screen-rise">
        <ScreenHeader title="Авито API" caption="Автозагрузка объявлений по официальному API" back="/settings" />
        <section className="px-5">
          <Skeleton className="h-[120px] w-full rounded-[20px]" />
          <Skeleton className="mt-3 h-[260px] w-full rounded-[20px]" />
        </section>
      </div>
    );
  }

  return (
    <div className="screen-rise">
      <ScreenHeader title="Авито API" caption="Автозагрузка объявлений по официальному API" back="/settings" />
      <section className="px-5">

        {/* Статус подключения. */}
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <KeyRound size={16} className="text-accent" />
            <p className="text-[15px] font-semibold text-ink">Подключение</p>
            <Chip
              tone={status?.configured ? "green" : "warm"}
              className="ml-auto"
            >
              {status?.configured ? "активно" : "не настроено"}
            </Chip>
          </div>
          <p className="mt-1.5 text-[12px] font-medium leading-relaxed text-soft">
            Ключи бесплатны: Авито → «Для бизнеса» → «Интеграции» → API
            (нужен профиль ИП/юрлица). После подключения публикация на Авито —
            кнопкой «Опубликовать на Авито» в мастере «Разместить»:
            dry-run, превью XML, подтверждение.
          </p>
          {fromEnv && (
            <div className="mt-2 flex items-center gap-1.5 rounded-[14px] bg-accent-soft px-3.5 py-2">
              <ShieldCheck size={14} className="shrink-0 text-accent" />
              <p className="text-[11.5px] font-semibold text-accent">
                Ключи заданы переменными окружения (Render, AVITO_*) — правка здесь недоступна
              </p>
            </div>
          )}
          {status?.feedUrl && (
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <p className="text-[12px] font-semibold text-soft">Адрес фида Автозагрузки</p>
                <Btn
                  variant="secondary"
                  onClick={async () => {
                    const ok = await copyText(status.feedUrl ?? "");
                    showToast(ok ? "Ссылка скопирована" : "Не удалось скопировать", ok ? "success" : "error");
                  }}
                  ariaLabel="Скопировать адрес фида"
                >
                  <FileCode2 size={14} />
                </Btn>
              </div>
              <code className="mt-1 block overflow-x-auto rounded-[10px] bg-subtle px-3 py-2 text-[10.5px] leading-relaxed text-soft">
                {status.feedUrl}
              </code>
            </div>
          )}
        </Card>

        {/* Ключи (в БД — только шифротекст; поля пустые: заполняйте, чтобы заменить). */}
        <Card className="mt-3 p-4">
          <p className="text-[15px] font-semibold text-ink">Ключи клиента</p>
          <p className="mt-1 text-[11.5px] font-medium text-soft">
            Сохранённые значения показываются масками ••••1234 и хранятся
            в базе зашифрованными. Заполните поле, чтобы заменить значение.
          </p>
          <div className="mt-3 flex flex-col gap-3.5">
            <Field
              label="client_id"
              hint={settings.clientId ? `задан (${settings.clientId})` : "из кабинета Авито"}
            >
              <TextInput
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                disabled={fromEnv}
                placeholder={settings.clientId ?? "1234567890"}
                aria-label="client_id"
              />
            </Field>
            <Field
              label="client_secret"
              hint={settings.clientSecretSet ? "задан — не показываем" : "из кабинета Авито"}
            >
              <TextInput
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                disabled={fromEnv}
                placeholder={settings.clientSecretSet ? "••••••••" : "секретная строка"}
                aria-label="client_secret"
              />
            </Field>
            <Field
              label="ID профиля Авито"
              hint={settings.userId ? `задан (${settings.userId})` : "число из профиля"}
            >
              <TextInput
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                disabled={fromEnv}
                inputMode="numeric"
                placeholder={settings.userId ?? "123456789"}
                aria-label="ID профиля Авито"
              />
            </Field>
            <Field
              label="Телефон для объявлений"
              hint={settings.contactPhone ? `задан (${settings.contactPhone})` : "ContactPhone в XML"}
            >
              <TextInput
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={fromEnv}
                placeholder={settings.contactPhone ?? "+7 900 000-00-00"}
                aria-label="Телефон для объявлений"
              />
            </Field>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Btn
              variant="secondary"
              onClick={() => void runCheck()}
              disabled={checking || !settings.clientSecretSet}
              loading={checking}
              ariaLabel="Проверить подключение"
            >
              <Upload size={15} className={checking ? "animate-pulse" : ""} />
              {checking ? "Проверяю…" : "Проверить подключение"}
            </Btn>
            <Btn full onClick={() => void save()} disabled={saving || fromEnv} loading={saving} ariaLabel="Сохранить ключи">
              Сохранить
            </Btn>
          </div>

          {check !== null && (
            <div
              className={`mt-3 rounded-[14px] px-3.5 py-3 ${
                check.tokenOk ? "bg-accent-soft" : "bg-warm-soft"
              }`}
            >
              <div className="flex items-center gap-1.5">
                {check.tokenOk ? (
                  <CheckCircle2 size={14} className="shrink-0 text-accent" />
                ) : (
                  <ShieldCheck size={14} className="shrink-0 text-warm" />
                )}
                <p className={`text-[12px] font-semibold ${check.tokenOk ? "text-accent" : "text-warm"}`}>
                  {check.tokenOk
                    ? "Подключение работает — OAuth-токен получен"
                    : "Авито отклонил ключи"}
                </p>
              </div>
              {check.error && (
                <p className="mt-1 text-[11.5px] font-medium leading-relaxed text-soft">{check.error}</p>
              )}
              {check.tokenOk && (
                <p className="mt-1 text-[11.5px] font-medium text-soft">
                  {check.uploadStatus
                    ? `Состояние автозагрузки: ${check.uploadStatus}`
                    : "Автозагрузка пока не запускалась — отправьте фид из мастера «Разместить»"}
                </p>
              )}
            </div>
          )}
        </Card>

        <a
          href="https://www.avito.ru/business/tools/autoload"
          target="_blank"
          rel="noreferrer"
          className="press mt-3 flex items-center gap-2 rounded-[14px] border border-line bg-surface px-4 py-2.5 text-[13px] font-semibold text-ink"
        >
          <ExternalLink size={15} className="shrink-0 text-soft" />
          Автозагрузка на Авито — как это работает
        </a>
      </section>
    </div>
  );
}
