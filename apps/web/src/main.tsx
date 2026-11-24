import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { applyTheme, loadTheme } from "./lib/theme";
import "./app/globals.css";
/* ЭТАП 8: слой микро-интеракций — ПОСЛЕ базовых стилей (токены уже объявлены). */
import "./styles/interactions.css";

/* Тема применяется до первого кадра — без вспышки светлого фона. */
applyTheme(loadTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
