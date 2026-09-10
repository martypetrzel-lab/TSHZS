import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ClipboardCheck,
  MapPin,
  QrCode,
  Wrench,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
const statuses: Record<string, string> = {
  IN_SERVICE: "V PROVOZU",
  OUT_OF_SERVICE: "MIMO PROVOZ",
  IN_REPAIR: "V OPRAVĚ",
  AWAITING_INSPECTION: "ČEKÁ NA KONTROLU",
  AWAITING_REVISION: "ČEKÁ NA REVIZI",
  LOANED: "ZAPŮJČENO",
  IN_STOCK: "SKLAD",
  RETIRED: "VYŘAZENO",
  LOST: "ZTRACENO",
};
export default async function EquipmentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const item = await prisma.equipmentItem.findUnique({
    where: { id },
    include: {
      category: true,
      location: true,
      vehicle: true,
      requirements: {
        include: {
          ruleVersion: {
            include: { rule: { include: { sourceDocument: true } } },
          },
        },
        orderBy: { nextDueAt: "asc" },
      },
      legacyProtocols: { orderBy: { createdAt: "desc" } },
      defects: { where: { closedAt: null } },
      components: true,
      statusHistory: { orderBy: { changedAt: "desc" }, take: 5 },
    },
  });
  if (!item) notFound();
  const blocked = item.complianceStatus === "OVERDUE_BLOCKED";
  const next = item.requirements[0];
  return (
    <AppShell userName={user.displayName}>
      <div className="content">
        <div className="page-head">
          <div>
            <p className="eyebrow">{item.uid}</p>
            <h1>{item.name}</h1>
            <p className="muted">
              {item.manufacturer ?? "Výrobce neuveden"} {item.model ?? ""} ·
              Výr. č. {item.serialNumber ?? "neuvedeno"}
            </p>
          </div>
          <button className="button">
            <ClipboardCheck size={18} />
            Provést kontrolu
          </button>
        </div>
        <section className="status-strip">
          <div className="status-block">
            <span>Provozuschopnost</span>
            <strong style={{ color: blocked ? "#b91c1c" : "#166534" }}>
              {blocked ? "BLOKOVÁNO – PROŠLÝ TERMÍN" : statuses[item.status]}
            </strong>
          </div>
          <div className="status-block">
            <span>Termíny</span>
            <strong>
              {next?.nextDueAt
                ? `${next.name}: ${next.nextDueAt.toLocaleDateString("cs-CZ")}`
                : "Interval není definován"}
            </strong>
          </div>
          <div className="status-block">
            <span>Závady</span>
            <strong>
              {item.defects.length
                ? `${item.defects.length} otevřených závad`
                : "Bez otevřené závady"}
            </strong>
          </div>
        </section>
        {blocked && next && (
          <div className="reason">
            <strong>
              <AlertTriangle
                size={18}
                style={{ display: "inline", marginRight: 8 }}
              />
              Proč je prostředek blokován?
            </strong>
            <p>
              Povinnost „{next.name}“ je po termínu. Termín:{" "}
              {next.nextDueAt?.toLocaleDateString("cs-CZ")}.
            </p>
            <small className="muted">
              Zdroj:{" "}
              {next.ruleVersion?.rule.sourceDocument?.title ??
                "Individuální pravidlo"}
              . Prostředek lze uvolnit až po platném splnění povinnosti.
            </small>
          </div>
        )}
        <section className="dashboard-grid">
          <div className="card">
            <div className="panel-head">
              <h2>Základní údaje</h2>
            </div>
            <div className="panel-body">
              <div className="deadline">
                <MapPin size={18} />
                <div>
                  <strong>Umístění</strong>
                  <span>
                    {item.vehicle?.name ?? item.location?.name ?? "Neurčeno"}
                  </span>
                </div>
              </div>
              <div className="deadline">
                <QrCode size={18} />
                <div>
                  <strong>Identifikace</strong>
                  <span>
                    UID {item.uid} · Původní ID {item.legacyId ?? "neuvedeno"}
                  </span>
                </div>
              </div>
              <div className="deadline">
                <Wrench size={18} />
                <div>
                  <strong>Kategorie</strong>
                  <span>{item.category.name}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="panel-head">
              <h2>Povinnosti</h2>
            </div>
            <div className="panel-body">
              {item.requirements.length ? (
                item.requirements.map((r) => (
                  <div className="deadline" key={r.id}>
                    <i
                      className={`dot ${r.status === "OVERDUE_BLOCKED" ? "red" : r.status === "DUE_SOON" ? "orange" : "yellow"}`}
                    />
                    <div>
                      <strong>{r.name}</strong>
                      <span>
                        {r.ruleVersion?.rule.sourceType ??
                          "Bez zdroje pravidla"}
                      </span>
                    </div>
                    <time>
                      {r.nextDueAt?.toLocaleDateString("cs-CZ") ??
                        "Nedefinováno"}
                    </time>
                  </div>
                ))
              ) : (
                <p className="muted">
                  Interval není definován. Doplňte požadavek výrobce nebo
                  interního předpisu.
                </p>
              )}
            </div>
          </div>
        </section>
        <section className="dashboard-grid">
          <div className="card">
            <div className="panel-head">
              <h2>Historické protokoly</h2>
            </div>
            <div className="panel-body">
              {item.legacyProtocols.length ? (
                item.legacyProtocols.map((protocol) => (
                  <div className="deadline" key={protocol.id}>
                    <i className="dot" />
                    <div>
                      <strong>{protocol.number}</strong>
                      <span>Importovaný uzavřený protokol</span>
                    </div>
                    {protocol.externalUrl ? (
                      <a
                        className="button secondary"
                        href={protocol.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Otevřít původní PDF
                      </a>
                    ) : (
                      <span className="muted">Bez PDF</span>
                    )}
                  </div>
                ))
              ) : (
                <p className="muted">
                  K prostředku nejsou uloženy historické protokoly.
                </p>
              )}
            </div>
          </div>
          <div className="card">
            <div className="panel-head">
              <h2>Import metadata</h2>
            </div>
            <div className="panel-body">
              <div className="deadline">
                <i className="dot" />
                <div>
                  <strong>Zdroj záznamu</strong>
                  <span>
                    {item.importedAt
                      ? `Původní evidence · ${item.importedAt.toLocaleDateString("cs-CZ")}`
                      : "Ručně založený záznam"}
                  </span>
                </div>
              </div>
              {item.legacyProtocolReference && (
                <div className="deadline">
                  <i className="dot" />
                  <div>
                    <strong>Původní reference protokolu</strong>
                    <span>{item.legacyProtocolReference}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
