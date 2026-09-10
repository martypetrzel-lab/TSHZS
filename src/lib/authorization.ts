import "server-only";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export async function requireImportAdministrator() {
  const user = await requireUser();
  const roles = new Set(user.roles.map(({ role }) => role.code));
  if (!roles.has("ADMIN") && !roles.has("TS_ADMIN"))
    redirect("/administrace?chyba=opravneni");
  return user;
}
