/**
 * ЭТАП 8 — NumberAnimated: числа «оживают» при появлении.
 * Mount → плавный count-up 0 → value (600ms ease-out);
 * изменение value → плавный переход от старого к новому;
 * prefers-reduced-motion → мгновенно, без rAF.
 * Формат — через проп (fmtRub / fmtNum / проценты), значения
 * во время анимации округляются — без «дрожащих» цифр.
 */

import { useEffect, useRef, useState } from "react";
import { countUpValue, easeOutCubic, numberDurationMs, prefersReducedMotion } from "../lib/motion";
import { fmtNum } from "../lib/format";

export function NumberAnimated({
  value,
  format = fmtNum,
  duration = 600,
  className,
}: {
  value: number;
  /** Готовая строка из промежуточного числа (по умолчанию fmtNum). */
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const reduced = prefersReducedMotion();
  const ms = numberDurationMs(reduced, duration);
  /* mount: счёт от 0; reduced-motion → сразу финальное значение */
  const [display, setDisplay] = useState(() => (ms === 0 ? value : 0));
  const fromRef = useRef(ms === 0 ? value : 0);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) {
      setDisplay(to);
      return;
    }
    if (ms === 0) {
      fromRef.current = to;
      setDisplay(to);
      return;
    }
    let raf = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / ms);
      setDisplay(countUpValue(from, to, easeOutCubic(t)));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
        setDisplay(to);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    /* format живёт рядом; в эффекте не нужен */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ms]);

  return (
    <span className={className} aria-live="off">
      {format(Math.round(display))}
    </span>
  );
}
