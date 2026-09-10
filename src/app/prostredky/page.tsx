import Link from "next/link";
import { Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
  sort?: string;
  page?: string;
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
  };
  const orderBy: Prisma.EquipmentItemOrderByWithRelationInput =
    q.sort === "name"
      ? { name: "asc" }
      : q.sort === "uid"
        ? { uid: "asc" }
        : { updatedAt: "desc" };
  const [items, total, vehicles, categories] = await Promise.all([
      prisma.equipmentItem.findMany({
        where,
        include: {
          category: true,
          location: true,
          vehicle: true,
          requirements: { orderBy: { nextDueAt: "asc" }, take: 1 },
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
    ]),
    pages = Math.max(1, Math.ceil(total / 25)),
    base = Object.fromEntries(Object.entries(q).filter(([, v]) => v));
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
          <button className="button">Použít filtry</button>
        </form>
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Prostředek</th>
                <th>UID</th>
                <th>Původní ID</th>
                <th>Kategorie</th>
                <th>Umístění</th>
                <th>Stav</th>
                <th>Nejbližší termín</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link href={`/prostredky/${i.id}`}>{i.name}</Link>
                  </td>
                  <td>{i.uid}</td>
                  <td>{i.legacyId ?? "—"}</td>
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
                    {i.requirements[0]?.nextDueAt?.toLocaleDateString(
                      "cs-CZ",
                    ) ?? "Nedefinováno"}
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
