import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./app/App";
import { applyTheme, loadTheme } from "./lib/theme";
import "./app/globals.css";
/* ЭТАП 8: слой микро-интеракций — ПОСЛЕ базовых стилей (токены уже объявлены). */
import "./styles/interactions.css";

/* Тема применяется до первого кадра — без вспышки светлого фона. */
applyTheme(loadTheme());

/* Полиш 26.11.2026: PWA-обновления стали бесшовными. Регистрация через
   виртуальный модуль плагина (registerType: autoUpdate): когда выходит
   новая версия, сервис-воркер обновляется в фоне (skipWaiting), и как
   только он активируется — страница ОДИН раз перезагружается сама.
   Пользователь всегда на свежей версии, без Ctrl+Shift+R и «старого
   кэша». В dev-режиме вызов безвреден (SW там отключён). */
registerSW();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
