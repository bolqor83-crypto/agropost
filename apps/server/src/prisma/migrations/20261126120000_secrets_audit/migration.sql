-- Этап «секреты»: журнал изменений переменных окружения (AuditLog).
-- Идемпотентно (IF NOT EXISTS) — безопасно на продах этапов 9-10.
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL DEFAULT 'owner',
    "action" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- Последние изменения на экране «Переменные» — читаем по убыванию даты.
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
