import "server-only";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function operationalAccess(code: string) {
  const user = await requireUser();
  const grant = await prisma.permission.findFirst({
    where: {
      code,
      OR: [
        { users: { some: { userId: user.id } } },
        { roles: { some: { role: { users: { some: { userId: user.id } } } } } },
      ],
    },
  });
  return { user, allowed: Boolean(grant) };
}

// Pages render an access notice; mutations must still reject unauthorized calls.
export const operationalPageAccess = operationalAccess;

export async function requireOperationalPermission(code: string) {
  const { user, allowed } = await operationalAccess(code);
  if (!allowed) throw new Error("K této operaci nemáte přidělené oprávnění.");
  return user;
}

export async function operationalPermissions(userId: string) {
  const entries = await prisma.permission.findMany({
    where: {
      OR: [
        { users: { some: { userId } } },
        { roles: { some: { role: { users: { some: { userId } } } } } },
      ],
    },
    select: { code: true },
  });
  return new Set(entries.map((entry) => entry.code));
}
