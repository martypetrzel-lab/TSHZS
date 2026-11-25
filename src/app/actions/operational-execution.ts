"use server";
export async function executeOperationalAction(
  action: (data: FormData) => Promise<void>,
  data: FormData,
) {
  try {
    await action(data);
    return { ok: true, message: "Uloženo" };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    const name = error instanceof Error ? error.name : "UnknownError";
    console.error("Provozní operace selhala", { name, code });
    if (code === "P2034")
      return {
        ok: false,
        message:
          "Záznam souběžně změnil jiný požadavek. Obnovte stránku a zkuste akci znovu.",
      };
    if (code === "P2002")
      return {
        ok: false,
        message:
          "Záznam již existuje nebo prostředek již má aktivní předání. Obnovte stránku.",
      };
    if (
      name.startsWith("Prisma") ||
      !(error instanceof Error) ||
      error.message.length > 500
    )
      return {
        ok: false,
        message:
          "Operaci se nepodařilo uložit kvůli chybě serveru. Zkuste to znovu nebo kontaktujte správce.",
      };
    return { ok: false, message: error.message };
  }
}
