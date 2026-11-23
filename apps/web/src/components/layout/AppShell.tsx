/**
 * Оболочка приложения: колонка 480px по центру, bottom nav, тосты.
 * Mobile-first, safe-area, скролл уходит под навигацию с отступом.
 */

import { Outlet, useLocation } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { useToastStore } from "../../stores/publish";

export function AppShell() {
  const location = useLocation();
  const toast = useToastStore((s) => s.message);

  return (
    <div className="min-h-screen bg-canvas">
      <div className="relative mx-auto min-h-screen w-full max-w-[480px] border-line/70 bg-canvas md:border-x">
        <main className="pb-32" key={location.pathname}>
          <Outlet />
        </main>

        <BottomNav />

        {toast && (
          <div
            role="status"
            className="fade-in fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2.5 text-[13px] font-semibold text-white shadow-soft"
          >
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
