import { createBrowserRouter, type NavigateOptions, type To } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { LoginScreen } from "../routes/LoginScreen";
import { PultScreen } from "../routes/PultScreen";
import { PublishScreen } from "../routes/PublishScreen";
import { DealsScreen } from "../routes/DealsScreen";
import { InboxScreen } from "../routes/InboxScreen";
import { TelegramBotScreen } from "../routes/TelegramBotScreen";
import { MoreScreen } from "../routes/MoreScreen";
import { SettingsScreen } from "../routes/SettingsScreen";
import { AvitoApiScreen } from "../routes/AvitoApiScreen";
import { AnalyticsScreen } from "../routes/AnalyticsScreen";
import { ProfileScreen } from "../routes/ProfileScreen";
import { SuppliersScreen } from "../routes/SuppliersScreen";
import { PositionsScreen } from "../routes/PositionsScreen";
import { ChannelsScreen } from "../routes/ChannelsScreen";
import { AccountsScreen } from "../routes/AccountsScreen";
import { withViewTransition } from "../lib/motion";

/**
 * Маршруты приложения. Поставщики и позиции (этап 1), каналы и аккаунты
 * (этап 2) открываются из «Ещё»; инбокс и бот (этап 3.2) — из шапки Пульта.
 * Этап 5.1: /login — экран входа владельца (вне оболочки с навигацией),
 * остальные экраны за авторизацией на сервере (HttpOnly-cookie).
 */
export const router = createBrowserRouter([
  /* Экран входа — до авторизации, без нижней навигации. */
  { path: "/login", element: <LoginScreen /> },
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <PultScreen /> },
      { path: "publish", element: <PublishScreen /> },
      { path: "deals", element: <DealsScreen /> },
      { path: "inbox", element: <InboxScreen /> },
      { path: "telegram", element: <TelegramBotScreen /> },
      { path: "more", element: <MoreScreen /> },
      { path: "settings", element: <SettingsScreen /> },
      { path: "settings/avito", element: <AvitoApiScreen /> },
      { path: "analytics", element: <AnalyticsScreen /> },
      { path: "profile", element: <ProfileScreen /> },
      { path: "suppliers", element: <SuppliersScreen /> },
      { path: "positions", element: <PositionsScreen /> },
      { path: "channels", element: <ChannelsScreen /> },
      { path: "accounts", element: <AccountsScreen /> },
    ],
  },
]);

/**
 * ЭТАП 8 — переходы между экранами через View Transitions API.
 * useNavigate/Link/NavLink в data-router в итоге вызывают метод
 * router.navigate ЭТОГО экземпляра (проверено по исходникам
 * react-router 7.18: useNavigateStable → await router.navigate(...)).
 * Оборачиваем его один раз здесь — и вся навигация приложения
 * получает мягкий кросс-фейд 200–220ms (::view-transition- в globals.css).
 * Браузеры без API (Safari) и prefers-reduced-motion — мгновенно
 * (withViewTransition сам проверяет и деградирует тихо).
 */
const originalNavigate = router.navigate.bind(router);
router.navigate = ((to: To, opts?: NavigateOptions) =>
  withViewTransition(() => originalNavigate(to, opts))) as typeof router.navigate;
