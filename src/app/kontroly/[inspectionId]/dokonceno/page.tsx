import Link from "next/link";
import { notFound } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const results: Record<string, string> = {
  PASSED: "VYHOVUJE",
  FAILED: "NEVYHOVUJE",
  PASSED_WITH_LIMITATION: "VYHOVUJE S OMEZENÍM",
};

export default async function Page({
  params,
}: {
  params: Promise<{ inspectionId: string }>;
}) {
  const { inspectionId } = await params;
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    include: { equipment: true, requirement: true, protocol: true },
  });
  if (!inspection?.protocol || !inspection.completedAt) notFound();
  const snapshot = inspection.protocol.snapshot as {
    inspection?: { inspector?: string; nextDueAt?: string | null };
  };
  return (
    <ModulePage
      eyebrow="Kontrola dokončena"
      title="Kontrola byla úspěšně uzavřena"
    >
      <section className="card inspection-complete">
        <div
          className={
            inspection.result === "FAILED"
              ? "complete-symbol failed"
              : "complete-symbol"
          }
        >
          {inspection.result === "FAILED" ? "×" : "✓"}
        </div>
        <h2>{inspection.equipment.name}</h2>
        <dl>
          <div>
            <dt>Výsledek</dt>
            <dd>{results[inspection.result ?? ""] ?? "—"}</dd>
          </div>
          <div>
            <dt>Kontroloval</dt>
            <dd>{snapshot.inspection?.inspector ?? "—"}</dd>
          </div>
          <div>
            <dt>Datum provedení kontroly</dt>
            <dd>{(inspection.performedAt ?? inspection.completedAt).toLocaleDateString("cs-CZ")}</dd>
          </div>
          <div>
            <dt>Datum protokolu</dt>
            <dd>{(inspection.protocol.protocolDate ?? inspection.protocol.createdAt).toLocaleDateString("cs-CZ")}</dd>
          </div>
          <div>
            <dt>Protokol</dt>
            <dd>{inspection.protocol.number}</dd>
          </div>
          <div>
            <dt>Další kontrola</dt>
            <dd>
              {snapshot.inspection?.nextDueAt
                ? new Date(snapshot.inspection.nextDueAt).toLocaleDateString(
                    "cs-CZ",
                  )
                : inspection.result === "FAILED"
                  ? "Nevytvořena – kontrola nevyhověla"
                  : "Termín neurčen"}
            </dd>
          </div>
        </dl>
        <div className="complete-actions">
          <Link className="button" href={`/kontroly/${inspection.id}`}>
            Zobrazit protokol
          </Link>
          <a
            className="button secondary"
            href={`/api/kontroly/${inspection.id}/pdf`}
          >
            Stáhnout PDF
          </a>
          <Link
            className="button secondary"
            href={`/prostredky/${inspection.equipmentId}`}
          >
            Detail prostředku
          </Link>
          <Link className="button secondary" href="/kontroly">
            Zpět na kontroly
          </Link>
        </div>
      </section>
    </ModulePage>
  );
}
