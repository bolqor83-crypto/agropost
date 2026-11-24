import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  resolve: {
    alias: {
      /* shared/ — контракт API, общий с сервером и Next-превью */
      "@shared": fileURLToPath(new URL("../../shared", import.meta.url)),
    },
  },
  server: {
    proxy: {
      /* Относительный /api уходит на локальный Fastify (:3001).
         В проде база задаётся через VITE_API_URL при сборке. */
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    /* PWA-приватность (этап 5.1): SW кеширует ТОЛЬКО статическую
       оболочку (precache манифест: index.html, css, js, иконки).
       runtimeCaching НЕ настраивается — приватные ответы /api
       (профиль, реквизиты, сделки, лиды) в кеш SW не попадают:
       другой пользователь устройства их не прочтёт. Offline работает
       для оболочки (NavigationRoute → precache), данные — онлайн.
       Если появится офлайн-режим данных — кешировать только
       не-чувствительные эндпоинты и вычищать при logout. */
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "АгроПост",
        short_name: "АгроПост",
        description: "Тихий помощник для торговли семенами трав и грецким орехом",
        lang: "ru",
        theme_color: "#FAF8F5",
        background_color: "#FAF8F5",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
});
