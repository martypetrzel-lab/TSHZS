import Link from "next/link";
import { ModulePage } from "@/components/module-page";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readNotification } from "@/app/actions/operational-settings";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireUser();
  const entries = await prisma.operationalNotification.findMany({
    where: { userId: user.id },
    orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  return (
    <ModulePage eyebrow="Technická služba" title="Upozornění">
      {entries.map((entry) => (
        <section className="card" key={entry.id}>
          <Link href={entry.href}>{entry.title}</Link>
          <p>{entry.createdAt.toLocaleString("cs-CZ")}</p>
          {!entry.readAt && (
            <form action={readNotification}>
              <input type="hidden" name="id" value={entry.id} />
              <button className="button secondary">
                Označit jako přečtené
              </button>
            </form>
          )}
        </section>
      ))}
      {!entries.length && <p>Žádná upozornění.</p>}
    </ModulePage>
  );
}
