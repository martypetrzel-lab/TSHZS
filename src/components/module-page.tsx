import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";

export async function ModulePage({
  eyebrow,
  title,
  empty,
  children,
}: {
  eyebrow: string;
  title: string;
  empty?: string;
  children?: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <AppShell userName={user.displayName}>
      <div className="content">
        <div className="page-head">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
          </div>
        </div>
        {children ?? (
          <div className="card empty-state">
            <strong>{empty}</strong>
            <p className="muted">
              Záznamy se zde zobrazí, jakmile budou založeny v evidenci.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
