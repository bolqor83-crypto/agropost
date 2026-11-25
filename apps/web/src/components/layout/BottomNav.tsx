/**
 * Нижняя навигация: Пульт · Разместить (главное действие, pill accent) ·
 * Сделки · Ещё. Safe-area, активный пункт — accent-soft.
 *
 * ЭТАП 8: иконки «ожили» — активная пружинно подсвечивается
 * (scale 1.05 + bg accent-soft), нажатие — scale 0.92;
 * главная кнопка «Разместить» — градиент accent + тень accent,
 * нажатие глубже (0.94) и иконка проворачивается на 90°.
 * (Плавный translateX-pill невозможен: центральная кнопка
 * авто-ширины — грид неравномерный; иначе пришлось бы менять layout.)
 */

import { Handshake, MoreHorizontal, Send, Sprout } from "lucide-react";
import { NavLink } from "react-router-dom";

const NAV = [
  { to: "/", label: "Пульт", icon: Sprout, end: true },
  { to: "/publish", label: "Разместить", icon: Send, end: false },
  { to: "/deals", label: "Сделки", icon: Handshake, end: false },
  { to: "/more", label: "Ещё", icon: MoreHorizontal, end: false },
];

export function BottomNav() {
  return (
    <nav
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur"
    >
      <div className="mx-auto grid max-w-[480px] grid-cols-[1fr_auto_1fr_1fr] items-end gap-1 px-3 pt-2 pb-[max(10px,env(safe-area-inset-bottom))]">
        {NAV.map((item) => {
          const Icon = item.icon;

          if (item.to === "/publish") {
            /* Главное действие — поднятая pill-кнопка accent-градиент */
            return (
              <div key={item.to} className="flex justify-center">
                <NavLink
                  to="/publish"
                  aria-label="Разместить товар"
                  className={({ isActive }) =>
                    `press nav-fab btn-gradient -translate-y-3 inline-flex h-11 items-center gap-1.5 rounded-full bg-accent px-4 text-[13px] font-semibold text-white ${
                      isActive
                        ? "ring-2 ring-accent/25 ring-offset-2 ring-offset-surface"
                        : ""
                    }`
                  }
                >
                  <Send size={15} className="nav-fab-icon" />
                  Разместить
                </NavLink>
              </div>
            );
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              aria-label={item.label}
              className="press nav-btn flex flex-col items-center gap-1 py-1"
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`nav-icon grid h-9 w-9 place-items-center rounded-xl ${
                      isActive
                        ? "scale-105 bg-accent-soft text-accent"
                        : "scale-100 text-soft"
                    }`}
                  >
                    <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                  </span>
                  <span
                    className={`text-[11px] font-semibold ${isActive ? "text-accent" : "text-soft"}`}
                  >
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
