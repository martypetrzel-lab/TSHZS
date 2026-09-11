import Link from "next/link";
import { ModulePage } from "@/components/module-page";
import { requireSystemAdministrator } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ chyba?: string; hotovo?: string }>;
}) {
  const administrator = await requireSystemAdministrator();
  const q = await searchParams;
  const users = await prisma.user.findMany({
    where: { organizationId: administrator.organizationId },
    select: {
      id: true,
      username: true,
      displayName: true,
      active: true,
      roles: { select: { role: { select: { code: true, name: true } } } },
    },
    orderBy: [{ active: "desc" }, { displayName: "asc" }],
  });
  return (
    <ModulePage eyebrow="Administrace" title="Uživatelé a oprávnění">
      <div className="page-actions user-page-actions">
        <Link className="button" href="/administrace/uzivatele/novy">
          Nový uživatel
        </Link>
      </div>
      {q.chyba && <div className="error">{q.chyba}</div>}
      {q.hotovo && <div className="success">{q.hotovo}</div>}
      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Uživatelské jméno</th>
              <th>Zobrazované jméno</th>
              <th>Role</th>
              <th>Aktivní</th>
              <th>Akce</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.username}</td>
                <td>{user.displayName}</td>
                <td>
                  <div className="role-badges">
                    {user.roles.map(({ role }) => (
                      <span
                        className="role-badge"
                        key={role.code}
                        title={role.name}
                      >
                        {role.code}
                      </span>
                    ))}
                  </div>
                </td>
                <td>{user.active ? "Ano" : "Ne"}</td>
                <td>
                  <Link
                    className="button secondary"
                    href={`/administrace/uzivatele/${user.id}`}
                  >
                    Upravit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!users.length && (
          <div className="empty-state">
            Zatím nejsou založeni žádní uživatelé.
          </div>
        )}
      </div>
    </ModulePage>
  );
}
