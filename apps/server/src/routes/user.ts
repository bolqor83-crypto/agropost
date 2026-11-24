import type { FastifyInstance } from "fastify";

/**
 * /api/user — профиль единственного пользователя.
 * Этап 1: налоговый режим для расчёта маржи «после налога».
 * Этап 4: реквизиты (ИНН, ОГРНИП, адрес, банк, БИК, р/с) для документов
 * и налоговый режим по умолчанию для новых сделок.
 */

import { deriveDealTaxMode, dealTaxModeToProfile } from "@shared/pricing";
import type { DealTaxMode, UserProfileDTO, UserProfileInput } from "@shared/types";
import { badRequest } from "../errors.js";
import { parseOrThrow } from "../validation.js";
import { userProfileSchema } from "../validation.js";
import { prisma } from "../prisma.js";
import type { UserDTO } from "@shared/types";

type PrismaUser = {
  id: string;
  name: string;
  inn: string | null;
  ogrnip: string | null;
  address: string | null;
  bank: string | null;
  bik: string | null;
  account: string | null;
  taxMode: string;
  taxRate: unknown;
};

function toUserDTO(row: PrismaUser): UserDTO {
  return {
    id: row.id,
    name: row.name,
    inn: row.inn,
    taxMode: row.taxMode as UserDTO["taxMode"],
    taxRate: Number(row.taxRate ?? 0),
  };
}

function toProfileDTO(row: PrismaUser): UserProfileDTO {
  const base = toUserDTO(row);
  return {
    ...base,
    ogrnip: row.ogrnip,
    address: row.address,
    bank: row.bank,
    bik: row.bik,
    account: row.account,
    dealTaxMode: deriveDealTaxMode(base.taxMode, base.taxRate),
  };
}

export async function userRoutes(app: FastifyInstance): Promise<void> {
  /* Совместимость с этапом 1: краткий профиль. */
  app.get("/api/user", async (): Promise<UserDTO | null> => {
    const row = await prisma.user.findFirst();
    return row ? toUserDTO(row as unknown as PrismaUser) : null;
  });

  app.get("/api/user/profile", async (): Promise<UserProfileDTO | null> => {
    const row = await prisma.user.findFirst();
    return row ? toProfileDTO(row as unknown as PrismaUser) : null;
  });

  app.patch("/api/user/profile", async (req): Promise<UserProfileDTO | null> => {
    const input = parseOrThrow(userProfileSchema, req.body ?? {}) as UserProfileInput;
    const row = await prisma.user.findFirst();
    if (!row) {
      throw badRequest("Профиль не инициализирован — запустите сид базы");
    }

    /* Смена режима по умолчанию обновляет и пару taxMode/taxRate. */
    let taxMode: string | undefined;
    let taxRate: number | undefined;
    if (input.dealTaxMode) {
      const profile = dealTaxModeToProfile(input.dealTaxMode as DealTaxMode);
      taxMode = profile.taxMode;
      taxRate = profile.taxRate;
    }

    const updated = await prisma.user.update({
      where: { id: row.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.inn !== undefined ? { inn: input.inn } : {}),
        ...(input.ogrnip !== undefined ? { ogrnip: input.ogrnip } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.bank !== undefined ? { bank: input.bank } : {}),
        ...(input.bik !== undefined ? { bik: input.bik } : {}),
        ...(input.account !== undefined ? { account: input.account } : {}),
        ...(taxMode !== undefined ? { taxMode: taxMode as "IP" | "SELF_EMPLOYED" } : {}),
        ...(taxRate !== undefined ? { taxRate } : {}),
      },
    });
    return toProfileDTO(updated as unknown as PrismaUser);
  });
}
