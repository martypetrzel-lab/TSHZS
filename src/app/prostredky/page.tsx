import Link from "next/link";
import { Eye, Pencil, Plus } from "lucide-react";
import { bulkUpdateEquipment } from "@/app/actions/equipment-review";
import type { Prisma } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEditEquipment } from "@/lib/permissions";
import { isExternalInspection } from "@/lib/checklist-matching";
const labels: Record<string, string> = {
  IN_SERVICE: "V provozu",
  OUT_OF_SERVICE: "Mimo provoz",
  IN_REPAIR: "V opravě",
  AWAITING_INSPECTION: "Čeká na kontrolu",
  AWAITING_REVISION: "Čeká na revizi",
  LOANED: "Zapůjčeno",
  IN_STOCK: "Sklad",
  RETIRED: "Vyřazeno",
  LOST: "Ztraceno",
  WINTERIZED: "Zazimováno",
};
export const dynamic = "force-dynamic";
type Query = {
  q?: string;
  uid?: string;
  legacyId?: string;
  vehicleId?: string;
  categoryId?: string;
  status?: string;
  requirementType?: string;
  term?: string;
  review?: string;
  sort?: string;
  page?: string;
  chyba?: string;
  hotovo?: string;
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const user = await requireUser(),
    q = await searchParams,
    page = Math.max(1, Number((await searchParams).page) || 1),
    now = new Date(),
    in30 = new Date(now.getTime() + 30 * 86400000);
  const where: Prisma.EquipmentItemWhereInput = {
    archivedAt: null,
    ...(q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: "insensitive" } },
            { uid: { contains: q.q, mode: "insensitive" } },
            { legacyId: { contains: q.q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(q.uid ? { uid: { contains: q.uid, mode: "insensitive" } } : {}),
    ...(q.legacyId
      ? { legacyId: { contains: q.legacyId, mode: "insensitive" } }
      : {}),
    ...(q.vehicleId ? { vehicleId: q.vehicleId } : {}),
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    ...(q.status ? { status: q.status as never } : {}),
    ...(q.requirementType
      ? { requirements: { some: { type: q.requirementType as never } } }
      : {}),
    ...(q.term === "overdue"
      ? { requirements: { some: { nextDueAt: { lt: now } } } }
      : {}),
    ...(q.term === "30"
      ? { requirements: { some: { nextDueAt: { gte: now, lte: in30 } } } }
      : {}),
    ...(q.review === "1" ? { needsReview: true } : {}),
  };
  const orderBy: Prisma.EquipmentItemOrderByWithRelationInput =
    q.sort === "name"
      ? { name: "asc" }
      : q.sort === "uid"
        ? { uid: "asc" }
        : { updatedAt: "desc" };
  const [items, total, vehicles, categories, locations] = await Promise.all([
      prisma.equipmentItem.findMany({
        where,
        include: {
          category: true,
          location: true,
          vehicle: true,
          requirements: {
            where: { archivedAt: null },
            orderBy: { nextDueAt: "asc" },
          },
        },
        orderBy,
        skip: (page - 1) * 25,
        take: 25,
      }),
      prisma.equipmentItem.count({ where }),
      prisma.vehicle.findMany({
        where: { archivedAt: null },
        orderBy: { name: "asc" },
      }),
      prisma.equipmentCategory.findMany({
        where: { archivedAt: null },
        orderBy: { name: "asc" },
      }),
      prisma.location.findMany({
        where: { archivedAt: null },
        orderBy: { name: "asc" },
      }),
    ]),
    pages = Math.max(1, Math.ceil(total / 25)),
    base = Object.fromEntries(Object.entries(q).filter(([, v]) => v));
  const canEdit = canEditEquipment(user.roles.map(({ role }) => role.code));
  const roleCodes = new Set(user.roles.map(({ role }) => role.code));
  const canPerformRequirement = (performedBy: string | null) =>
    !isExternalInspection(performedBy) &&
    (performedBy?.toLocaleLowerCase("cs").includes("uživatel") ||
      roleCodes.has("TECHNICIAN") ||
      roleCodes.has("TS_ADMIN"));
  return (
    <AppShell userName={user.displayName}>
      <div className="content">
        <div className="page-head">
          <div>
            <p className="eyebrow">Evidence</p>
            <h1>Technické prostředky</h1>
            <p className="muted">{total} položek odpovídá filtru</p>
          </div>
          <Link className="button" href="/prostredky/novy">
            <Plus size={18} />
            Nový prostředek
          </Link>
        </div>
        {q.chyba && <div className="error import-error">{q.chyba}</div>}
        {q.hotovo && (
          <div className="result-banner success">
            Všechny prostředky vyžadující doplnění byly zpracovány.
          </div>
        )}
        <form className="card filter-grid">
          <input
            name="q"
            defaultValue={q.q}
            placeholder="Název, UID nebo původní ID"
          />
          <input name="uid" defaultValue={q.uid} placeholder="UID" />
          <input
            name="legacyId"
            defaultValue={q.legacyId}
            placeholder="Původní ID"
          />
          <select name="vehicleId" defaultValue={q.vehicleId ?? ""}>
            <option value="">Všechna vozidla</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <select name="categoryId" defaultValue={q.categoryId ?? ""}>
            <option value="">Všechny kategorie</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={q.status ?? ""}>
            <option value="">Všechny stavy</option>
            {Object.entries(labels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select name="requirementType" defaultValue={q.requirementType ?? ""}>
            <option value="">Všechny povinnosti</option>
            <option value="INSPECTION">Kontrola</option>
            <option value="REVISION">Revize</option>
            <option value="CALIBRATION">Kalibrace</option>
          </select>
          <select name="term" defaultValue={q.term ?? ""}>
            <option value="">Všechny termíny</option>
            <option value="overdue">Po termínu</option>
            <option value="30">Do 30 dní</option>
          </select>
          <select name="sort" defaultValue={q.sort ?? "updated"}>
            <option value="updated">Naposledy upravené</option>
            <option value="name">Název</option>
            <option value="uid">UID</option>
          </select>
          <label className="review-filter">
            <input
              type="checkbox"
              name="review"
              value="1"
              defaultChecked={q.review === "1"}
            />{" "}
            Vyžaduje doplnění
          </label>
          <button className="button">Použít filtry</button>
        </form>
        <form action={bulkUpdateEquipment}>
          {canEdit && (
            <div className="card bulk-editor">
              <strong>Hromadná úprava označených</strong>
              <label>
                <input type="checkbox" name="applyCategory" /> Kategorie
              </label>
              <select name="bulkCategoryId">
                {categories.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <label>
                <input type="checkbox" name="applyPlacement" /> Umístění
              </label>
              <select name="bulkPlacement">
                <option value="none">Neurčeno</option>
                {vehicles.map((v) => (
                  <option value={`vehicle:${v.id}`} key={v.id}>
                    Vozidlo: {v.name}
                  </option>
                ))}
                {locations.map((location) => (
                  <option value={`location:${location.id}`} key={location.id}>
                    Stanice: {location.name}
                  </option>
                ))}
              </select>
              <label>
                <input type="checkbox" name="applyStatus" /> Stav
              </label>
              <select name="bulkStatus">
                {Object.entries(labels).map(([v, l]) => (
                  <option value={v} key={v}>
                    {l}
                  </option>
                ))}
              </select>
              <label>
                <input type="checkbox" name="applyReview" /> Příznak doplnění
              </label>
              <select name="bulkReview">
                <option value="true">Označit</option>
                <option value="false">Odznačit</option>
              </select>
              <button className="button" type="submit">
                Hromadně upravit
              </button>
            </div>
          )}
          <div className="card table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {canEdit && (
                    <th>
                      <span className="sr-only">Vybrat</span>
                    </th>
                  )}
                  <th>Prostředek</th>
                  <th>UID</th>
                  <th>Původní ID</th>
                  <th>Kategorie</th>
                  <th>Umístění</th>
                  <th>Stav</th>
                  <th>Nejbližší termín</th>
                  <th>Akce</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    {canEdit && (
                      <td>
                        <input
                          type="checkbox"
                          name="selected"
                          value={i.id}
                          aria-label={`Vybrat ${i.name}`}
                        />
                      </td>
                    )}
                    <td>
                      <Link href={`/prostredky/${i.id}`}>{i.name}</Link>
                      {i.needsReview && (
                        <span className="badge warn review-badge">
                          Vyžaduje doplnění
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link href={`/prostredky/${i.id}`}>
                          <Eye size={16} />
                          Detail
                        </Link>
                        {canEdit && (
                          <Link href={`/prostredky/${i.id}/upravit`}>
                            <Pencil size={16} />
                            Upravit
                          </Link>
                        )}
                        {i.requirements.some(
                          (r) =>
                            r.type === "INSPECTION" &&
                            canPerformRequirement(r.performedBy),
                        ) && (
                          <Link
                            href={`/kontroly/provest/${i.requirements.find((r) => r.type === "INSPECTION" && canPerformRequirement(r.performedBy))!.id}`}
                          >
                            Provést kontrolu
                          </Link>
                        )}
                      </div>
                    </td>
                    <td>{i.uid}</td>
                    <td>
                      <span
                        className="legacy-cell"
                        title={i.legacyId ?? undefined}
                      >
                        {i.legacyId ?? "—"}
                      </span>
                    </td>
                    <td>{i.category.name}</td>
                    <td>{i.vehicle?.name ?? i.location?.name ?? "Neurčeno"}</td>
                    <td>
                      <span
                        className={`badge ${i.complianceStatus === "OVERDUE_BLOCKED" ? "danger" : i.complianceStatus === "DUE_SOON" ? "warn" : ""}`}
                      >
                        {i.complianceStatus === "OVERDUE_BLOCKED"
                          ? "Po termínu"
                          : labels[i.status]}
                      </span>
                    </td>
                    <td>
                      {i.requirements
                        .find((r) => r.nextDueAt)
                        ?.nextDueAt?.toLocaleDateString("cs-CZ") ??
                        "Nedefinováno"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!items.length && (
              <div className="empty-state">
                <strong>Filtru neodpovídají žádné prostředky.</strong>
              </div>
            )}
          </div>
        </form>
        <div className="pagination">
          <Link
            className="button secondary"
            aria-disabled={page <= 1}
            href={`?${new URLSearchParams({ ...base, page: String(Math.max(1, page - 1)) })}`}
          >
            Předchozí
          </Link>
          <span>
            Strana {page} z {pages}
          </span>
          <Link
            className="button secondary"
            aria-disabled={page >= pages}
            href={`?${new URLSearchParams({ ...base, page: String(Math.min(pages, page + 1)) })}`}
          >
            Další
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
