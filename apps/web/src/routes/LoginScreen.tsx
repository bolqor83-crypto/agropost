/**
 * Экран входа владельца (этап 5.1).
 * Одна пара логин/пароль из env сервера (OWNER_LOGIN/OWNER_PASSWORD_HASH);
 * пароль нигде не хранится, сессия — HttpOnly-cookie. Аккуратная
 * мобильная форма в существующем визуальном стиле.
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LogIn, ShieldCheck } from "lucide-react";
import * as api from "../api/client";
import { resetAllStores } from "../lib/logout";
import { Btn, Card, Field, TextInput } from "../components/ui";

export function LoginScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  /* Уже авторизован (сессия жива) — сразу внутрь. */
  useEffect(() => {
    api
      .getAuthSession()
      .then((s) => {
        if (s.authenticated) {
          navigate(params.get("redirect") ?? "/", { replace: true });
        }
      })
      .catch(() => undefined)
      .finally(() => setChecking(false));
  }, [navigate, params]);

  async function submit() {
    if (busy) return;
    setError(null);
    if (!login.trim() || !password) {
      setError("Укажите логин и пароль");
      return;
    }
    setBusy(true);
    /* Чувствительное состояние от прежней сессии — чистим. */
    resetAllStores();
    try {
      await api.login({ login: login.trim(), password });
      navigate(params.get("redirect") ?? "/", { replace: true });
    } catch (err) {
      const message = err instanceof api.ApiError ? err.message : "Не удалось войти";
      setError(
        err instanceof api.ApiError && err.code === "TOO_MANY_ATTEMPTS"
          ? message
          : "Неверный логин или пароль",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    /* main — семантический landmark (a11y): экран входа вне AppShell,
       у него нет <main>; визуально тег <main> вместо <div> ничего не меняет. */
    <main className="screen-rise flex min-h-screen flex-col justify-center bg-canvas px-5 py-10">
      <div className="mx-auto w-full max-w-[420px]">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="grid h-16 w-16 place-items-center rounded-[22px] bg-accent text-white shadow-soft">
            <ShieldCheck size={30} strokeWidth={2.2} />
          </div>
          <div className="text-center">
            <h1 className="text-[22px] font-bold tracking-tight text-ink">АгроПост</h1>
            <p className="mt-1 text-[13px] font-medium text-soft">
              Вход владельца — данные приложения закрыты
            </p>
          </div>
        </div>

        <Card className="p-5">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <Field label="Логин" required>
              <TextInput
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                autoComplete="username"
                inputMode="text"
                placeholder="логин владельца"
                autoFocus
                error={Boolean(error)}
              />
            </Field>
            <Field label="Пароль" required>
              <TextInput
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                error={Boolean(error)}
              />
            </Field>

            {error && <p className="fade-in-soft px-1 text-[13px] font-semibold text-warm">{error}</p>}

            <Btn type="submit" full size="lg" disabled={busy || checking} loading={busy}>
              <LogIn size={18} />
              Войти
            </Btn>
          </form>
        </Card>

        <p className="mt-6 text-center text-[12px] font-medium leading-relaxed text-soft">
          Учетные данные задаёт владелец на сервере
          <br />
          (OWNER_LOGIN + OWNER_PASSWORD_HASH в переменных окружения API).
          <br />
          Открытой регистрации в приложении нет.
        </p>
      </div>
    </main>
  );
}
