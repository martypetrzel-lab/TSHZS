import { notFound } from "next/navigation";
import { scheduleInspection } from "@/app/actions/inspection";
import { ModulePage } from "@/components/module-page";
import { requireUser } from "@/lib/auth";
import { canUserPerformInspection } from "@/lib/inspection-permissions";
import { todayDateKey } from "@/lib/inspection-lifecycle";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ equipmentId: string }> }) {
  const user = await requireUser();
  const { equipmentId } = await params;
  const equipment = await prisma.equipmentItem.findUnique({
    where: { id: equipmentId },
    include: { requirements: { where: { archivedAt: null, type: "INSPECTION" }, include: { ruleVersion: true } } },
  });
  if (!equipment) notFound();
  const requirements = equipment.requirements.filter((requirement) => canUserPerformInspection(user, requirement));
  return <ModulePage eyebrow="Kontroly" title={`Naplánovat kontrolu · ${equipment.name}`}>
    <form action={scheduleInspection} className="card inspection-filters">
      <label className="field"><span>Povinnost</span><select name="requirementId" required><option value="">Vyberte povinnost</option>{requirements.map((requirement) => <option key={requirement.id} value={requirement.id}>{requirement.name}</option>)}</select></label>
      <label className="field"><span>Plánované datum kontroly</span><input type="date" name="scheduledFor" required defaultValue={todayDateKey()} /></label>
      <label className="field"><span>Poznámka</span><textarea name="note" /></label>
      <button className="button" disabled={!requirements.length}>Naplánovat kontrolu</button>
      {!requirements.length && <p className="error">Nemáte oprávnění k žádné interně proveditelné povinnosti tohoto prostředku.</p>}
    </form>
  </ModulePage>;
}
