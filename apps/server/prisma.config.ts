import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

/**
 * Конфиг Prisma CLI (замена deprecated package.json#prisma).
 * Явно грузим .env из apps/server — соседние .env выше по дереву
 * (например, в монорепо-песочнице) на нас не влияют.
 */

loadEnv();

export default defineConfig({
  schema: "src/prisma/schema.prisma",
  migrations: {
    path: "src/prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
