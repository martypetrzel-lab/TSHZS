import { notFound } from "next/navigation";
import { updateUser } from "@/app/actions/users";
import { ModulePage } from "@/components/module-page";
import { UserForm } from "@/components/user-form";
import { requireSystemAdministrator } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ chyba?: string }>;
}) {
  const administrator = await requireSystemAdministrator();
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const user = await prisma.user.findFirst({
    where: { id, organizationId: administrator.organizationId },
    select: {
      id: true,
      username: true,
      displayName: true,
      active: true,
      roles: { select: { role: { select: { code: true } } } },
      qualifications: {
        select: {
          validUntil: true,
          qualification: { select: { code: true, name: true } },
        },
        orderBy: { qualification: { name: "asc" } },
      },
    },
  });
  if (!user) notFound();
  const now = new Date();
  return (
    <ModulePage
      eyebrow="Administrace · uživatelé"
      title={`Upravit: ${user.displayName}`}
    >
      {q.chyba && <div className="error">{q.chyba}</div>}
      <UserForm
        action={updateUser}
        user={{
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          active: user.active,
          roleCodes: user.roles.map(({ role }) => role.code),
        }}
      />
      <section className="card qualification-panel">
        <h2>Kvalifikace</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Název</th>
                <th>Platnost do</th>
                <th>Stav</th>
              </tr>
            </thead>
            <tbody>
              {user.qualifications.map((entry) => {
                const expired = Boolean(
                  entry.validUntil && entry.validUntil < now,
                );
                return (
                  <tr key={entry.qualification.code}>
                    <td>{entry.qualification.name}</td>
                    <td>
                      {entry.validUntil?.toLocaleDateString("cs-CZ") ??
                        "Bez omezení"}
                    </td>
                    <td>{expired ? "Po platnosti" : "Platná"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!user.qualifications.length && (
            <div className="empty-state">
              Uživatel zatím nemá evidovanou žádnou kvalifikaci.
            </div>
          )}
        </div>
      </section>
    </ModulePage>
  );
}
