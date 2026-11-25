import { ModulePage } from "@/components/module-page";
import { OperationalActionForm } from "@/components/operational-action-form";
import { requireSystemAdministrator } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { saveOperationalSettings } from "@/app/actions/operational-settings";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireSystemAdministrator();
  const days = await prisma.systemSetting.findUnique({
      where: { key: "operational.reminderDays" },
    }),
    stamp = await prisma.systemSetting.findUnique({
      where: { key: "operational.stampEnabled" },
    });
  return (
    <ModulePage eyebrow="Administrace" title="Provozní nastavení">
      <OperationalActionForm action={saveOperationalSettings}>
        <label className="field">
          Upozornění – počet dní před termínem (oddělené čárkou)
          <input
            name="reminderDays"
            defaultValue={
              Array.isArray(days?.value)
                ? days.value.join(", ")
                : "30, 14, 7, 3, 1, 0"
            }
          />
        </label>
        <label>
          <input
            name="stampEnabled"
            type="checkbox"
            defaultChecked={stamp?.value !== false}
          />{" "}
          Grafické označení Technické služby na vystavených protokolech
        </label>
        <p>Grafické razítko není osobní podpis ani finanční schválení.</p>
        <button className="button">Uložit nastavení</button>
      </OperationalActionForm>
    </ModulePage>
  );
}
