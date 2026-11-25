import Link from "next/link";
import { ModulePage } from "@/components/module-page";

export function OperationalAccessDenied({
  title,
  permission,
  user,
}: {
  title: string;
  permission: string;
  user: { id: string; roles: { role: { code: string } }[] };
}) {
  const administrator = user.roles.some(({ role }) => role.code === "ADMIN");
  const label = {
    "protocol:create": "Vytvářet protokoly",
    "protocol:read": "Číst provozní protokoly",
    "supplier:manage": "Spravovat servisní organizace",
    "repair:costs_read": "Číst náklady",
  }[permission];
  return (
    <ModulePage eyebrow="Přístup" title={title}>
      <section className="card" role="status">
        <h2>Chybí provozní oprávnění</h2>
        {label && (
          <p>
            Požadované oprávnění: <strong>{label}</strong>.
          </p>
        )}
        <p>
          Pro tuto stránku nemáte přidělené oprávnění. Požádejte správce o jeho
          přidělení.
        </p>
        {administrator && (
          <>
            <p>
              Jako administrátor můžete oprávnění nastavit ve správě uživatelů.
              Provozní oprávnění se přidělují samostatně.
            </p>
            <Link
              className="button"
              href={`/administrace/opravneni?${new URLSearchParams({ userId: user.id, permission })}`}
            >
              Nastavit oprávnění pro můj účet
            </Link>
          </>
        )}
        <p>
          <Link href="/protokoly">Zpět na protokoly</Link>
        </p>
      </section>
    </ModulePage>
  );
}
