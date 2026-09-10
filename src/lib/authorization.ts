import "server-only";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canEditEquipment } from "@/lib/permissions";

export async function requireImportAdministrator() {
  const user = await requireUser();
  const roles = new Set(user.roles.map(({ role }) => role.code));
  if (!roles.has("ADMIN") && !roles.has("TS_ADMIN"))
    redirect("/administrace?chyba=opravneni");
  return user;
}

export async function requireEquipmentEditor() {
  const user = await requireUser();
  const roles = new Set(user.roles.map(({ role }) => role.code));
  if (!canEditEquipment([...roles]))
    redirect(
      "/prostredky?chyba=K%20editaci%20prost%C5%99edk%C5%AF%20nem%C3%A1te%20opr%C3%A1vn%C4%9Bn%C3%AD.",
    );
  return user;
}
