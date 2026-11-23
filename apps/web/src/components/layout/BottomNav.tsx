/**
 * Нижняя навигация: Пульт · Разместить (главное действие, pill accent) ·
 * Сделки · Ещё. Safe-area, активный пункт — accent-soft.
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
            /* Главное действие — поднятая pill-кнопка accent */
            return (
              <div key={item.to} className="flex justify-center">
                <NavLink
                  to="/publish"
                  aria-label="Разместить товар"
                  className={({ isActive }) =>
                    `press -translate-y-3 inline-flex h-11 items-center gap-1.5 rounded-full bg-accent px-4 text-[13px] font-semibold text-white shadow-soft ${
                      isActive
                        ? "ring-2 ring-accent/25 ring-offset-2 ring-offset-surface"
                        : ""
                    }`
                  }
                >
                  <Send size={15} />
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
              className="press flex flex-col items-center gap-1 py-1"
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`grid h-9 w-9 place-items-center rounded-xl transition-colors ${
                      isActive ? "bg-accent-soft text-accent" : "text-soft"
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
