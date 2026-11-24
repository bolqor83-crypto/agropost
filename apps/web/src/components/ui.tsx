/**
 * Базовые компоненты дизайн-системы "Warm Utility".
 * Карточки 20px, кнопки 999px (pill), поля 14px, модалки 24px.
 * Тени только мягкие. Spring 200ms, scale 0.97 (класс .press).
 *
 * ЭТАП 8 (визуальный полиш): микро-интеракции без новых фич —
 * ripple на primary+lg, индикатор-pill в Segmented (translateX),
 * вход/выход Sheet + drag-to-close, stagger контента шита,
 * skeleton-shimmer, focus-ring, error-shake полей.
 */

import { Check, ChevronDown, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { prefersReducedMotion } from "../lib/motion";

/* ---------------- Кнопка (pill) ---------------- */

type BtnVariant = "primary" | "secondary" | "ghost";

/** Ripple — только для primary + lg: волна от точки клика, 500ms. */
function spawnRipple(e: React.MouseEvent<HTMLButtonElement>) {
  if (prefersReducedMotion()) return;
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const ripple = document.createElement("span");
  ripple.className = "ripple";
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
  el.appendChild(ripple);
  setTimeout(() => ripple.remove(), 500);
}

export function Btn({
  children,
  onClick,
  variant = "primary",
  disabled,
  loading,
  full,
  size = "md",
  type = "button",
  ariaLabel,
  className = "",
}: {
  children: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: BtnVariant;
  disabled?: boolean;
  /** Спиннер вместо контента, ширина сохраняется (этап 8). */
  loading?: boolean;
  full?: boolean;
  size?: "md" | "lg";
  type?: "button" | "submit";
  ariaLabel?: string;
  className?: string;
}) {
  const rippleEnabled = variant === "primary" && size === "lg";
  const base =
    `btn-${variant} press relative overflow-hidden inline-flex scroll-mb-[104px] items-center justify-center gap-2 rounded-full font-semibold select-none disabled:opacity-40 disabled:pointer-events-none`;
  const sizes = size === "lg" ? "h-14 px-6 text-[16px]" : "h-11 px-5 text-[14px]";
  const variants: Record<BtnVariant, string> = {
    primary: "bg-accent text-white shadow-soft",
    secondary: "bg-surface text-ink border border-line",
    ghost: "bg-subtle text-ink",
  };
  return (
    <button
      type={type}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      onClick={(e) => {
        if (rippleEnabled) spawnRipple(e);
        onClick?.(e);
      }}
      disabled={disabled || loading}
      className={`${base} ${sizes} ${variants[variant]} ${full ? "w-full" : ""} ${className}`}
    >
      {loading && <Loader2 size={16} className="absolute animate-spin" aria-hidden />}
      <span className={`inline-flex items-center gap-2 ${loading ? "invisible" : ""}`}>{children}</span>
    </button>
  );
}

/* ---------------- Карточка ---------------- */

export function Card({
  children,
  className = "",
  onClick,
  selected,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  /** Выбранная карточка (мастер «Разместить»): рамка акцентом. */
  selected?: boolean;
}) {
  const clickable = onClick ? "press card-interactive cursor-pointer" : "";
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      aria-pressed={onClick && selected ? true : undefined}
      className={`scroll-mb-[104px] bg-surface rounded-[20px] shadow-soft ${clickable} ${
        selected ? "border-[1.5px] border-solid border-accent bg-accent-soft/50" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

/* ---------------- Чип ---------------- */

type ChipTone = "neutral" | "green" | "warm" | "outline";

export function Chip({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: ChipTone;
  className?: string;
}) {
  const tones: Record<ChipTone, string> = {
    neutral: "bg-subtle text-soft",
    green: "bg-accent-soft text-accent",
    warm: "bg-warm-soft text-warm",
    outline: "bg-transparent text-soft border border-line",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ---------------- Заголовок секции ---------------- */

export function SectionTitle({
  children,
  action,
  onAction,
}: {
  children: ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-baseline justify-between px-1 pb-3">
      <h2 className="text-[18px] font-semibold text-ink">{children}</h2>
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="press text-[13px] font-semibold text-accent"
        >
          {action}
        </button>
      )}
    </div>
  );
}

/* ---------------- Заголовок экрана ---------------- */

export function ScreenHeader({ title, caption }: { title: string; caption?: string }) {
  return (
    <header className="px-5 pt-6 pb-4">
      <h1 className="text-[24px] font-semibold leading-tight text-ink">{title}</h1>
      {caption && <p className="mt-1 text-[13px] font-medium text-soft">{caption}</p>}
    </header>
  );
}

/* ---------------- Скелетон ---------------- */

/** ЭТАП 8: shimmer вместо статичного pulse (в тёмной теме — тусклее блик). */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-[14px] ${className}`} aria-hidden />;
}

/* ---------------- Сегментированный переключатель ---------------- */

/** ЭТАП 8: активный сегмент — pill, плавно переезжающий translateX
 * (transform-only, 260ms spring). Роль/tab-семантика сохранена. */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const activeIndex = Math.max(0, items.findIndex((it) => it.value === value));
  const n = items.length;
  return (
    <div
      className="relative grid rounded-full bg-subtle p-1"
      role="tablist"
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="seg-pill"
        style={{
          width: `calc((100% - 8px) / ${n})`,
          transform: `translateX(${activeIndex * 100}%)`,
        }}
      />
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={`press relative z-[1] flex items-center justify-center rounded-full py-2 text-[13px] font-semibold ${
              active ? "text-ink" : "text-soft"
            }`}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Пустое состояние ---------------- */

export function EmptyState({
  icon,
  title,
  caption,
}: {
  icon: ReactNode;
  title: string;
  caption: string;
}) {
  return (
    <div className="empty-state flex flex-col items-center gap-3 px-8 py-14 text-center">
      <div className="empty-icon grid h-16 w-16 place-items-center rounded-full bg-accent-soft text-accent">
        {icon}
      </div>
      <p className="text-[16px] font-semibold text-ink">{title}</p>
      <p className="max-w-[260px] text-[13px] font-medium leading-relaxed text-soft">
        {caption}
      </p>
    </div>
  );
}

/* ---------------- Нижний шит (модалка 24px) ---------------- */

/** Порог свайпа вниз для закрытия (px). */
const SHEET_CLOSE_THRESHOLD = 90;

/**
 * ЭТАП 8: шит «оживился» —
 * - вход 260ms spring (как было) + контент-стagger через 80ms;
 * - выход: обратная анимация 200ms при закрытии пользователем
 *   (backdrop, X, Esc); при закрытии из кода (после действия) — мгновенно;
 * - drag-to-close за шапку: следует за пальцем, резинка вверх,
 *   отпустил ниже 90px — закрылся, выше — пружинно вернулся.
 * prefers-reduced-motion: вход мгновенный, drag — без пружины.
 */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const [closing, setClosing] = useState(false);
  const [entered, setEntered] = useState(false);
  const [dragY, setDragY] = useState(0);
  const draggingRef = useRef(false);
  const y0Ref = useRef(0);

  const requestClose = () => {
    if (closing) return;
    if (prefersReducedMotion()) {
      onClose();
      return;
    }
    setClosing(true);
    setTimeout(onClose, 200);
  };

  /* Esc закрывает шит (клавиатурная доступность). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    y0Ref.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const dy = e.clientY - y0Ref.current;
    /* вверх — резинка (сопротивление), вниз — честно за пальцем */
    setDragY(dy > 0 ? dy : dy / 3);
  };
  const onHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const dy = e.clientY - y0Ref.current;
    setDragY(0);
    if (dy > SHEET_CLOSE_THRESHOLD) requestClose();
  };

  const animationEnd = (e: React.AnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (!closing) setEntered(true);
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div
        className={`fade-in absolute inset-0 bg-[rgba(44,42,39,0.35)] ${closing ? "backdrop-out" : ""}`}
        onClick={requestClose}
      />
      <div
        className={`absolute inset-x-0 bottom-0 mx-auto max-h-[82vh] w-full max-w-[480px] overflow-y-auto rounded-t-[24px] bg-surface pb-[max(24px,env(safe-area-inset-bottom))] soft-scroll ${
          entered ? "" : "sheet-in"
        } ${closing ? "sheet-out" : ""} ${draggingRef.current ? "sheet-dragging" : "sheet-settle"}`}
        style={dragY !== 0 ? { transform: `translateY(${dragY}px)` } : undefined}
        onAnimationEnd={animationEnd}
      >
        <div
          className="sticky top-0 z-10 bg-surface px-5 pt-3 pb-3"
          style={{ touchAction: "none" }}
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={() => {
            draggingRef.current = false;
            setDragY(0);
          }}
        >
          <div className="sheet-handle mx-auto mb-3 h-1.5 w-12 rounded-full bg-line" />
          <div className="flex items-center justify-between">
            <h3 className="text-[20px] font-semibold text-ink">{title}</h3>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Закрыть"
              className="press grid h-9 w-9 place-items-center rounded-full bg-subtle text-soft"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="sheet-content px-5">{children}</div>
      </div>
    </div>
  );
}

/* ---------------- Строка "показатель: значение" ---------------- */

export function InfoRow({
  label,
  value,
  valueClass = "text-ink",
}: {
  label: string;
  value: ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="shrink-0 text-[13px] font-medium text-soft">{label}</span>
      <span className={`text-right text-[14px] font-semibold ${valueClass}`}>{value}</span>
    </div>
  );
}

/* ---------------- Поля форм (этап 1) ---------------- */

/** Обёртка поля: подпись + контрол + подсказка/ошибка. */
export function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-1 px-1">
        <span className="text-[13px] font-semibold text-ink">{label}</span>
        {required && <span className="text-[13px] font-semibold text-warm">*</span>}
        {hint && <span className="ml-auto text-[11px] font-medium text-soft">{hint}</span>}
      </span>
      {children}
      {error && <span className="mt-1 block px-1 text-[12px] font-semibold text-warm">{error}</span>}
    </label>
  );
}

const inputBase =
  "input-base w-full rounded-[14px] border border-line bg-surface px-3.5 py-3 text-[15px] font-medium text-ink placeholder:text-soft/60 outline-none";

export function TextInput(
  props: React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean },
) {
  const { className = "", error, ...rest } = props;
  return <input {...rest} className={`${inputBase} ${error ? "input-error" : ""} ${className}`} />;
}

export function TextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean },
) {
  const { className = "", error, ...rest } = props;
  return (
    <textarea
      {...rest}
      className={`${inputBase} ${error ? "input-error" : ""} min-h-[88px] resize-none ${className}`}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputBase} appearance-none pr-9`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-soft"
      />
    </div>
  );
}

/** Кнопка-переключатель (да/нет, чекбокс-строка). */
export function ToggleRow({
  checked,
  onToggle,
  label,
  hint,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className="press flex w-full items-center gap-3 rounded-[14px] border border-line bg-surface px-3.5 py-3 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-ink">{label}</span>
        {hint && <span className="block text-[12px] font-medium text-soft">{hint}</span>}
      </span>
      <span
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${
          checked ? "border-accent bg-accent text-white" : "border-line"
        }`}
        aria-hidden
      >
        {checked && <Check size={13} strokeWidth={3} />}
      </span>
    </button>
  );
}
