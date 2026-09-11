"use server";

import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { requireSystemAdministrator } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import {
  MANAGED_ROLE_CODES,
  wouldRemoveLastActiveAdmin,
} from "@/lib/user-management";

function rolesFrom(formData: FormData) {
  const allowed = new Set<string>(MANAGED_ROLE_CODES);
  return [
    ...new Set(
      formData
        .getAll("roles")
        .map(String)
        .filter((code) => allowed.has(code)),
    ),
  ];
}

function fail(path: string, message: string): never {
  redirect(`${path}?chyba=${encodeURIComponent(message)}`);
}

export async function createUser(formData: FormData) {
  const actor = await requireSystemAdministrator();
  const username = String(formData.get("username") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const roleCodes = rolesFrom(formData);
  const path = "/administrace/uzivatele/novy";
  if (!username || !displayName)
    fail(path, "Vyplňte uživatelské i zobrazované jméno.");
  if (password.length < 10) fail(path, "Heslo musí mít alespoň 10 znaků.");
  if (!roleCodes.length) fail(path, "Vyberte alespoň jednu roli.");

  try {
    const passwordHash = await hash(password, 12);
    await prisma.$transaction(async (tx) => {
      const roles = await tx.role.findMany({
        where: { code: { in: roleCodes } },
      });
      if (roles.length !== roleCodes.length)
        throw new Error("Některá vybraná role v systému neexistuje.");
      const created = await tx.user.create({
        data: {
          username,
          displayName,
          passwordHash,
          organizationId: actor.organizationId,
          roles: { create: roles.map((role) => ({ roleId: role.id })) },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: "USER_CREATED",
          entityType: "User",
          entityId: created.id,
          newValue: { username, displayName, roleCodes, active: true },
        },
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      fail(path, "Uživatel s tímto uživatelským jménem již existuje.");
    console.error("Vytvoření uživatele selhalo.", { actorId: actor.id, error });
    fail(
      path,
      error instanceof Error
        ? error.message
        : "Uživatele se nepodařilo vytvořit.",
    );
  }
  redirect("/administrace/uzivatele?hotovo=Uživatel byl vytvořen.");
}

export async function updateUser(formData: FormData) {
  const actor = await requireSystemAdministrator();
  const userId = String(formData.get("userId") ?? "");
  const path = `/administrace/uzivatele/${userId}`;
  const displayName = String(formData.get("displayName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const active = formData.get("active") === "on";
  const roleCodes = rolesFrom(formData);
  if (!displayName) fail(path, "Zobrazované jméno je povinné.");
  if (password && password.length < 10)
    fail(path, "Nové heslo musí mít alespoň 10 znaků.");
  if (!roleCodes.length) fail(path, "Vyberte alespoň jednu roli.");

  try {
    const passwordHash = password ? await hash(password, 12) : undefined;
    await prisma.$transaction(
      async (tx) => {
        const target = await tx.user.findFirst({
          where: { id: userId, organizationId: actor.organizationId },
          include: { roles: { include: { role: true } } },
        });
        if (!target) throw new Error("Uživatel neexistuje.");
        const targetIsActiveAdmin =
          target.active &&
          target.roles.some(({ role }) => role.code === "ADMIN");
        const otherActiveAdminCount = targetIsActiveAdmin
          ? await tx.user.count({
              where: {
                id: { not: target.id },
                organizationId: actor.organizationId,
                active: true,
                roles: { some: { role: { code: "ADMIN" } } },
              },
            })
          : 0;
        if (
          wouldRemoveLastActiveAdmin({
            targetIsActiveAdmin,
            nextActive: active,
            nextRoleCodes: roleCodes,
            otherActiveAdminCount,
          })
        )
          throw new Error(
            "Nelze odebrat nebo deaktivovat posledního aktivního administrátora.",
          );
        const roles = await tx.role.findMany({
          where: { code: { in: roleCodes } },
        });
        if (roles.length !== roleCodes.length)
          throw new Error("Některá vybraná role v systému neexistuje.");
        await tx.user.update({
          where: { id: target.id },
          data: {
            displayName,
            active,
            ...(passwordHash ? { passwordHash } : {}),
            roles: {
              deleteMany: {},
              create: roles.map((role) => ({ roleId: role.id })),
            },
          },
        });
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: "USER_UPDATED",
            entityType: "User",
            entityId: target.id,
            previousValue: {
              displayName: target.displayName,
              active: target.active,
              roleCodes: target.roles.map(({ role }) => role.code),
            },
            newValue: {
              displayName,
              active,
              roleCodes,
              passwordChanged: Boolean(password),
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    console.error("Úprava uživatele selhala.", {
      actorId: actor.id,
      userId,
      error,
    });
    fail(
      path,
      error instanceof Error
        ? error.message
        : "Uživatele se nepodařilo upravit.",
    );
  }
  redirect("/administrace/uzivatele?hotovo=Uživatel byl upraven.");
}
