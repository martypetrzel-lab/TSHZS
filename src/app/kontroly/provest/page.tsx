import Link from "next/link";
import { ModulePage } from "@/components/module-page";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { isExternalInspection } from "@/lib/checklist-matching";
import {
  canUserPerformInspection,
  inspectionPerformedBy,
} from "@/lib/inspection-permissions";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ hledat?: string }>;
}) {
  const { hledat = "" } = await searchParams;
  const user = await requireUser();
  const equipment = await prisma.equipmentItem.findMany({
    where: {
      archivedAt: null,
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
  });
  const internalRequirements = equipment.flatMap((item) =>
    item.requirements.filter(
      (requirement) =>
        !isExternalInspection(inspectionPerformedBy(requirement)),
    ),
  );
  const authorizedEquipment = equipment
    .map((item) => ({
      ...item,
      requirements: item.requirements.filter((requirement) =>
        canUserPerformInspection(user, requirement),
      ),
    }))
    .filter((item) => item.requirements.length > 0);
  const authorizedRequirementCount = authorizedEquipment.reduce(
    (count, item) => count + item.requirements.length,
    0,
  );
  const needle = hledat.trim().toLocaleLowerCase("cs");
  const availableEquipment = authorizedEquipment.filter((item) =>
    needle
      ? `${item.name} ${item.uid} ${item.serialNumber ?? ""} ${item.legacyId ?? ""}`
          .toLocaleLowerCase("cs")
          .includes(needle)
      : true,
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
              {e.requirements.map((r) => {
                return (
                  <Link
                    className="requirement-choice"
                    href={`/kontroly/provest/${r.id}`}
                    key={r.id}
                  >
                    <strong>{r.name}</strong>
                    <span>
                      {r.intervalValue ?? "—"} {r.intervalUnit ?? ""} ·{" "}
                      {inspectionPerformedBy(r) ??
                        "kvalifikace v původní evidenci neurčena"}
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
      {!internalRequirements.length && (
        <div className="card empty-state">
          Momentálně nejsou žádné interně proveditelné kontroly.
        </div>
      )}
      {internalRequirements.length > authorizedRequirementCount && (
        <div className="card empty-state">
          Existují kontrolní povinnosti, ke kterým nemáte oprávnění.
        </div>
      )}
      {authorizedEquipment.length > 0 && !availableEquipment.length && (
        <div className="card empty-state">
          Žádná dostupná kontrola neodpovídá zadanému hledání.
        </div>
      )}
    </ModulePage>
  );
}
