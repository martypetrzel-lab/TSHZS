import { createUser } from "@/app/actions/users";
import { ModulePage } from "@/components/module-page";
import { UserForm } from "@/components/user-form";
import { requireSystemAdministrator } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ chyba?: string }>;
}) {
  await requireSystemAdministrator();
  const q = await searchParams;
  return (
    <ModulePage eyebrow="Administrace · uživatelé" title="Nový uživatel">
      {q.chyba && <div className="error">{q.chyba}</div>}
      <UserForm action={createUser} />
    </ModulePage>
  );
}
