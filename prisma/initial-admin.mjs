import { hash } from "bcryptjs";

export const INITIAL_ADMIN_ROLE_CODES = ["ADMIN", "TS_ADMIN"];

export function missingInitialAdminRoles(existingCodes) {
  const existing = new Set(existingCodes);
  return INITIAL_ADMIN_ROLE_CODES.filter((code) => !existing.has(code));
}

export async function seedInitialAdmin(db, organizationId, options = {}) {
  const username = (
    options.username ??
    process.env.INITIAL_ADMIN_USERNAME ??
    ""
  ).trim();
  const password = options.password ?? process.env.INITIAL_ADMIN_PASSWORD;
  const hashPassword = options.hashPassword ?? hash;
  if (!username || !password) {
    console.info(
      "Počáteční administrátor se nevytváří; inicializační proměnné nejsou nastavené.",
    );
    return { created: false, skipped: true, addedRoles: [] };
  }

  const roles = await db.role.findMany({
    where: { code: { in: INITIAL_ADMIN_ROLE_CODES } },
    select: { id: true, code: true },
  });
  if (roles.length !== INITIAL_ADMIN_ROLE_CODES.length)
    throw new Error("Inicializační role ADMIN a TS_ADMIN nejsou připravené.");

  const ensureRoles = async (user) => {
    const missing = missingInitialAdminRoles(
      user.roles.map(({ role }) => role.code),
    );
    if (missing.length) {
      await db.userRole.createMany({
        data: roles
          .filter((role) => missing.includes(role.code))
          .map((role) => ({ userId: user.id, roleId: role.id })),
        skipDuplicates: true,
      });
    }
    return missing;
  };

  const existing = await db.user.findUnique({
    where: { username },
    select: {
      id: true,
      roles: { select: { role: { select: { code: true } } } },
    },
  });
  if (existing) {
    const addedRoles = await ensureRoles(existing);
    console.info(
      addedRoles.length
        ? `Počátečnímu administrátorovi byly doplněny role: ${addedRoles.join(", ")}. Heslo se nemění.`
        : "Počáteční administrátor již má požadované role; heslo se nemění.",
    );
    return { created: false, skipped: false, addedRoles };
  }

  const passwordHash = await hashPassword(password, 12);
  try {
    await db.user.create({
      data: {
        username,
        displayName: "Administrátor",
        passwordHash,
        organizationId,
        roles: {
          create: roles.map((role) => ({ roleId: role.id })),
        },
      },
    });
    console.info(
      "Počáteční administrátor byl vytvořen s rolemi ADMIN a TS_ADMIN.",
    );
    return {
      created: true,
      skipped: false,
      addedRoles: INITIAL_ADMIN_ROLE_CODES,
    };
  } catch (error) {
    if (error?.code !== "P2002") throw error;
    const concurrentlyCreated = await db.user.findUniqueOrThrow({
      where: { username },
      select: {
        id: true,
        roles: { select: { role: { select: { code: true } } } },
      },
    });
    const addedRoles = await ensureRoles(concurrentlyCreated);
    console.info("Počáteční administrátor již existuje; heslo se nemění.");
    return { created: false, skipped: false, addedRoles };
  }
}
