/**
 * Оболочка приложения: колонка 480px по центру, bottom nav, тосты.
 * Mobile-first, safe-area, скролл уходит под навигацию с отступом.
 *
 * ЭТАП 8: тост ожил — вход translateY(-20→0) + прогресс жизни
 * (scaleX 2.4s), успешные/ошибочные с точкой и иконкой,
 * выход — обратная анимация 180ms. text-canvas вместо text-white —
 * тост читаем и в тёмной теме (bg-ink там светлый).
 */

import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AlertCircle, Check } from "lucide-react";
import { BottomNav } from "./BottomNav";
import { useToastStore, type ToastKind } from "../../stores/publish";

interface ToastSnapshot {
  message: string;
  kind: ToastKind;
}

/** Тост с точкой/иконкой и прогрессом жизни. kind=info — как раньше. */
function ToastView({ toast, exiting }: { toast: ToastSnapshot; exiting: boolean }) {
  const { message, kind } = toast;
  return (
    <div
      role="status"
      /* Центрование через inset-x-0+mx-auto (без transform — чтобы
         вход/выход могли анимировать transform свободно). */
      className={`fixed inset-x-0 bottom-28 z-50 mx-auto w-fit ${exiting ? "toast-out" : "toast-in"}`}
    >
      <div
        key={`${message}`}
        className="relative flex items-center gap-2 overflow-hidden rounded-full bg-ink px-4 py-2.5 text-[13px] font-semibold text-canvas shadow-3"
      >
        {kind !== "info" && (
          <span
            aria-hidden
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              kind === "success" ? "bg-accent" : "bg-warm"
            }`}
          />
        )}
        {kind === "success" && <Check size={14} className="shrink-0" aria-hidden />}
        {kind === "error" && <AlertCircle size={14} className="shrink-0 text-warm" aria-hidden />}
        <span className="min-w-0">{message}</span>
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-white/15">
          <span className="toast-progress block h-full w-full bg-white/70" />
        </span>
      </div>
    </div>
  );
}

/** Хост тостов: держит «уходящий» тост 180ms для анимации выхода. */
function ToastHost() {
  const message = useToastStore((s) => s.message);
  const kind = useToastStore((s) => s.kind);
  const [leaving, setLeaving] = useState<ToastSnapshot | null>(null);
  const prevRef = useRef<ToastSnapshot | null>(null);

  useEffect(() => {
    if (message) {
      prevRef.current = { message, kind };
      setLeaving(null);
      return;
    }
    if (prevRef.current && !leaving) {
      const snap = prevRef.current;
      setLeaving(snap);
      const t = setTimeout(() => {
        setLeaving(null);
        prevRef.current = null;
      }, 180);
      return () => clearTimeout(t);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [message, kind]);

  const active = message ? { message, kind } : leaving;
  if (!active) return null;
  return <ToastView toast={active} exiting={!message && !!leaving} />;
}

export function AppShell() {
  const location = useLocation();

  /* Полиш 26.11.2026: смена экрана — скролл наверх. Как в нативных
     приложениях: новый экран всегда открывается с начала, а не на
     «прошлой» высоте прокрутки. */
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-canvas">
      <div className="relative mx-auto min-h-screen w-full max-w-[480px] border-line/70 bg-canvas md:border-x">
        <main className="pb-32" key={location.pathname}>
          <Outlet />
        </main>

        <BottomNav />

        <ToastHost />
      </div>
    </div>
  );
}
