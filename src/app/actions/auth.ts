"use server";

import { compare } from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type LoginState = { error?: string } | undefined;
const loginSchema = z.object({
  username: z.string().trim().min(1, "Zadejte uživatelské jméno."),
  password: z.string().min(1, "Zadejte heslo."),
});

export async function login(
  _: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  let authenticated = false;
  try {
    const user = await prisma.user.findUnique({
      where: { username: parsed.data.username },
    });
    if (
      !user ||
      !user.active ||
      !(await compare(parsed.data.password, user.passwordHash))
    ) {
      try {
        await prisma.auditLog.create({
          data: {
            action: "LOGIN_FAILED",
            entityType: "User",
            entityId: user?.id ?? "unknown",
          },
        });
      } catch (auditError) {
        logServerError(
          "Audit neúspěšného přihlášení se nepodařilo uložit.",
          auditError,
        );
      }
      return { error: "Uživatelské jméno nebo heslo není správné." };
    }
    await createSession(user.id);
    authenticated = true;
    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "LOGIN",
          entityType: "User",
          entityId: user.id,
        },
      });
    } catch (auditError) {
      logServerError(
        "Audit úspěšného přihlášení se nepodařilo uložit.",
        auditError,
      );
    }
  } catch (error) {
    logServerError("Přihlášení selhalo kvůli chybě serveru.", error);
    return {
      error:
        "Přihlášení se nepodařilo kvůli chybě serveru. Zkuste to znovu nebo kontaktujte správce.",
    };
  }
  if (authenticated) redirect("/");
  return { error: "Přihlášení se nepodařilo." };
}

function logServerError(message: string, error: unknown) {
  const detail =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { type: typeof error };
  console.error(message, detail);
}

export async function logout() {
  await destroySession();
  redirect("/prihlaseni");
}
