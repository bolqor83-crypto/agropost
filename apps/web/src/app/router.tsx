import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { PultScreen } from "../routes/PultScreen";
import { PublishScreen } from "../routes/PublishScreen";
import { DealsScreen } from "../routes/DealsScreen";
import { MoreScreen } from "../routes/MoreScreen";
import { SuppliersScreen } from "../routes/SuppliersScreen";
import { PositionsScreen } from "../routes/PositionsScreen";
import { ChannelsScreen } from "../routes/ChannelsScreen";
import { AccountsScreen } from "../routes/AccountsScreen";

/**
 * Маршруты приложения. Поставщики и позиции (этап 1), каналы и аккаунты
 * (этап 2) открываются из «Ещё»; из шапки этих экранов — назад к разделам.
 */
export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <PultScreen /> },
      { path: "publish", element: <PublishScreen /> },
      { path: "deals", element: <DealsScreen /> },
      { path: "more", element: <MoreScreen /> },
      { path: "suppliers", element: <SuppliersScreen /> },
      { path: "positions", element: <PositionsScreen /> },
      { path: "channels", element: <ChannelsScreen /> },
      { path: "accounts", element: <AccountsScreen /> },
    ],
  },
]);
