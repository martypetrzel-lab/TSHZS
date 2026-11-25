import { ModulePage } from "@/components/module-page";
import { requireSystemAdministrator } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { grantOperationalPermission } from "@/app/actions/operational-protocols";
export const dynamic = "force-dynamic";
export default async function Page() {
  const actor = await requireSystemAdministrator();
  const users = await prisma.user.findMany({ where: { organizationId: actor.organizationId }, include: { directPermissions: { include: { permission: true } } } });
  const permissions = { "protocol:read": "Číst provozní protokoly", "protocol:create": "Vytvářet protokoly", "protocol:edit_draft": "Upravovat vlastní návrhy", "protocol:issue": "Vystavovat dokumenty", "protocol:cancel": "Stornovat dokumenty", "protocol:download": "Stahovat PDF", "handover:confirm": "Potvrdit předání", "handover:return": "Potvrdit vrácení", "equipment:out_of_service": "Odstavit prostředek", "equipment:return_to_service": "Vrátit prostředek do provozu", "repair:create": "Vytvářet opravy", "repair:approve": "Schvalovat finanční výdaje na opravy", "repair:manage": "Řídit opravy", "repair:costs_read": "Číst náklady", "repair:costs_edit": "Upravovat náklady", "supplier:manage": "Spravovat servisní organizace" };
  return <ModulePage eyebrow="Administrace" title="Provozní oprávnění"><p>Finanční schvalování se přiděluje podle skutečných kompetencí. Systémové role ho automaticky neposkytují.</p><form action={grantOperationalPermission} className="card inspection-filters"><select name="userId" required>{users.map(u => <option key={u.id} value={u.id}>{u.displayName}</option>)}</select><select name="permission" required>{Object.entries(permissions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><label><input name="revoke" type="checkbox" /> Odebrat</label><button className="button">Uložit oprávnění</button></form>{users.map(u => <section className="card" key={u.id}><h2>{u.displayName}</h2>{u.directPermissions.map(p => <p key={p.permissionId}>{permissions[p.permission.code as keyof typeof permissions]}</p>)}</section>)}</ModulePage>;
}
