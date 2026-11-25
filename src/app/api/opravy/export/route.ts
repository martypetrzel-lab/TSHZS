import { getCurrentUser } from "@/lib/auth";
import { operationalPermissions } from "@/lib/operational-authorization";
import { repairStatistics } from "@/lib/repair-statistics";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Přihlaste se.", { status: 401 });
  if (!(await operationalPermissions(user.id)).has("repair:costs_read"))
    return new Response("Chybí oprávnění.", { status: 403 });
  const stats = await repairStatistics(
    user.organizationId,
    Object.fromEntries(new URL(request.url).searchParams),
  );
  const cell = (value: unknown) =>
    `"${String(value ?? "")
      .replace(/^[=+@-]/, "'$&")
      .replace(/"/g, '""')}"`;
  const rows = [
    [
      "Prostředek",
      "UID",
      "Servis",
      "Odhad",
      "Limit",
      "Skutečnost",
      "Měna",
      "Faktura",
      "Datum",
    ],
    ...stats.repairs.map((r) => {
      const e = stats.equipment.find((e) => e.id === r.equipmentId);
      return [
        e?.name,
        e?.uid,
        r.supplier?.name,
        r.estimatedCost?.toFixed(2),
        r.approvedLimit?.toFixed(2),
        r.actualCost?.toFixed(2),
        r.currency,
        r.invoiceNumber,
        r.invoiceDate?.toISOString().slice(0, 10),
      ];
    }),
  ];
  return new Response(
    "\uFEFF" + rows.map((row) => row.map(cell).join(";")).join("\r\n"),
    {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="naklady-oprav.csv"',
        "cache-control": "private, no-store",
      },
    },
  );
}
