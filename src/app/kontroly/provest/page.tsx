import Link from "next/link";
import { ModulePage } from "@/components/module-page";
import { prisma } from "@/lib/prisma";
import { isExternalInspection } from "@/lib/checklist-matching";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ hledat?: string }>;
}) {
  const { hledat = "" } = await searchParams;
  const user = await requireUser();
  const roles = new Set(user.roles.map((entry) => entry.role.code));
  const canPerform = (performedBy: string | null) =>
    !isExternalInspection(performedBy) &&
    (performedBy?.toLocaleLowerCase("cs").includes("uživatel") ||
      roles.has("TECHNICIAN") ||
      roles.has("TS_ADMIN"));
  const equipment = await prisma.equipmentItem.findMany({
    where: {
      archivedAt: null,
      ...(hledat
        ? {
            OR: [
              { name: { contains: hledat, mode: "insensitive" } },
              { uid: { contains: hledat, mode: "insensitive" } },
              { serialNumber: { contains: hledat, mode: "insensitive" } },
              { legacyId: { contains: hledat, mode: "insensitive" } },
            ],
          }
        : {}),
      requirements: { some: { archivedAt: null, type: "INSPECTION" } },
    },
    include: {
      vehicle: true,
      location: true,
      requirements: {
        where: { archivedAt: null, type: "INSPECTION" },
        include: { ruleVersion: true },
        orderBy: { nextDueAt: "asc" },
      },
    },
    orderBy: { name: "asc" },
    take: 100,
  });
  const availableEquipment = equipment.filter((item) =>
    item.requirements.some((requirement) =>
      canPerform(requirement.performedBy),
    ),
  );
  return (
    <ModulePage eyebrow="Kontroly · nový záznam" title="Provést kontrolu">
      <div className="inspection-step">
        <span>1</span>
        <strong>Vyberte prostředek a povinnost</strong>
      </div>
      <form className="card inspection-search">
        <input
          name="hledat"
          defaultValue={hledat}
          placeholder="Název, UID, výrobní číslo, původní ID nebo údaj z QR kódu"
          autoFocus
        />
        <button className="button">Hledat</button>
      </form>
      <div className="inspection-picker">
        {availableEquipment.map((e) => (
          <article className="card" key={e.id}>
            <div>
              <h2>{e.name}</h2>
              <p>
                {e.uid} ·{" "}
                {e.serialNumber ?? e.legacyId ?? "bez výrobního čísla"}
              </p>
              <small>
                {e.vehicle?.name ?? e.location?.name ?? "Bez umístění"}
              </small>
            </div>
            <div className="requirement-buttons">
              {e.requirements
                .filter((r) => canPerform(r.performedBy))
                .map((r) => {
                  return (
                    <Link
                      className="requirement-choice"
                      href={`/kontroly/provest/${r.id}`}
                      key={r.id}
                    >
                      <strong>{r.name}</strong>
                      <span>
                        {r.intervalValue ?? "—"} {r.intervalUnit ?? ""} ·{" "}
                        {r.performedBy ?? "oprávněná osoba"}
                      </span>
                      <small>
                        Další termín:{" "}
                        {r.nextDueAt?.toLocaleDateString("cs-CZ") ?? "neurčen"}
                      </small>
                    </Link>
                  );
                })}
            </div>
          </article>
        ))}
      </div>
      {!availableEquipment.length && (
        <div className="card empty-state">
          Nebyl nalezen prostředek s aktivní kontrolní povinností.
        </div>
      )}
    </ModulePage>
  );
}
