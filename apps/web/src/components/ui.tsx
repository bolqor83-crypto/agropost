/**
 * Базовые компоненты дизайн-системы "Warm Utility".
 * Карточки 20px, кнопки 999px (pill), поля 14px, модалки 24px.
 * Тени только мягкие. Spring 200ms, scale 0.97 (класс .press).
 */

import { Check, ChevronDown, X } from "lucide-react";
import type { ReactNode } from "react";

/* ---------------- Кнопка (pill) ---------------- */

type BtnVariant = "primary" | "secondary" | "ghost";

export function Btn({
  children,
  onClick,
  variant = "primary",
  disabled,
  full,
  size = "md",
  type = "button",
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  disabled?: boolean;
  full?: boolean;
  size?: "md" | "lg";
  type?: "button" | "submit";
  ariaLabel?: string;
}) {
  const base =
    "press inline-flex scroll-mb-[104px] items-center justify-center gap-2 rounded-full font-semibold select-none disabled:opacity-40 disabled:pointer-events-none";
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
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes} ${variants[variant]} ${full ? "w-full" : ""}`}
    >
      {children}
    </button>
  );
}

/* ---------------- Карточка ---------------- */

export function Card({
  children,
  className = "",
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const clickable = onClick ? "press cursor-pointer" : "";
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
      className={`scroll-mb-[104px] bg-surface rounded-[20px] shadow-soft ${clickable} ${className}`}
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

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[14px] bg-subtle ${className}`} aria-hidden />;
}

/* ---------------- Сегментированный переключатель ---------------- */

export function Segmented<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-full bg-subtle p-1" role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={`press flex-1 rounded-full py-2 text-[13px] font-semibold ${
            value === it.value ? "bg-surface text-ink shadow-soft" : "text-soft"
          }`}
        >
          {it.label}
        </button>
      ))}
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
    <div className="flex flex-col items-center gap-3 px-8 py-14 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-accent-soft text-accent">
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

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="fade-in absolute inset-0 bg-[rgba(44,42,39,0.35)]" onClick={onClose} />
      <div className="sheet-in absolute inset-x-0 bottom-0 mx-auto max-h-[82vh] w-full max-w-[480px] overflow-y-auto rounded-t-[24px] bg-surface pb-[max(24px,env(safe-area-inset-bottom))] soft-scroll">
        <div className="sticky top-0 z-10 bg-surface px-5 pt-3 pb-3">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line" />
          <div className="flex items-center justify-between">
            <h3 className="text-[20px] font-semibold text-ink">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="press grid h-9 w-9 place-items-center rounded-full bg-subtle text-soft"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="px-5">{children}</div>
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
  "w-full rounded-[14px] border border-line bg-surface px-3.5 py-3 text-[15px] font-medium text-ink placeholder:text-soft/60 outline-none transition-colors focus:border-accent";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input {...rest} className={`${inputBase} ${className}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return <textarea {...rest} className={`${inputBase} min-h-[88px] resize-none ${className}`} />;
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
