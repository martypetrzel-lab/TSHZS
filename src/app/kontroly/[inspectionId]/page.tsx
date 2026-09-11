import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelInspection, startCorrection } from "@/app/actions/inspection";
import { ModulePage } from "@/components/module-page";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const resultCs: Record<string, string> = {
  PASSED: "Vyhovuje",
  FAILED: "Nevyhovuje",
  PASSED_WITH_LIMITATION: "Vyhovuje s omezením",
};
type Snapshot = {
  equipment?: Record<string, unknown>;
  requirement?: Record<string, unknown>;
  checklist?: {
    name?: string;
    version?: number;
    sections?: {
      title: string;
      items: {
        id: string;
        label: string;
        value?: unknown;
        unit?: string;
        note?: string;
        photos?: { fileName: string; storageKey: string }[];
      }[];
    }[];
  };
  inspection?: Record<string, unknown>;
};

export default async function Page({
  params,
}: {
  params: Promise<{ inspectionId: string }>;
}) {
  const { inspectionId } = await params;
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    include: {
      protocol: true,
      defects: true,
      corrections: true,
      correctionOf: true,
    },
  });
  if (!inspection) notFound();
  if (inspection.state === "DRAFT" && inspection.requirementId)
    return (
      <ModulePage eyebrow="Kontroly" title="Rozpracovaná kontrola">
        <Link
          className="button"
          href={`/kontroly/provest/${inspection.requirementId}?draft=${inspection.id}`}
        >
          Pokračovat v kontrole
        </Link>
      </ModulePage>
    );
  const snapshot = (inspection.protocol?.snapshot ??
    inspection.snapshot ??
    {}) as Snapshot;
  const e = snapshot.equipment ?? {},
    r = snapshot.requirement ?? {},
    i = snapshot.inspection ?? {};
  const photos =
    snapshot.checklist?.sections?.flatMap((s) =>
      s.items.flatMap((item) => item.photos ?? []),
    ) ?? [];
  return (
    <ModulePage
      eyebrow="Neměnný protokol kontroly"
      title={inspection.protocol?.number ?? "Detail kontroly"}
    >
      <div className="protocol-actions">
        <Link className="button secondary" href="/kontroly?tab=historie">
          Zpět do historie
        </Link>
        {inspection.protocol && (
          <a className="button" href={`/api/kontroly/${inspection.id}/pdf`}>
            Stáhnout PDF
          </a>
        )}
      </div>
      <section className="card protocol-hero">
        <div>
          <span>Výsledek</span>
          <strong
            className={
              inspection.result === "FAILED" ? "result-failed" : "result-passed"
            }
          >
            {resultCs[inspection.result ?? ""] ?? "—"}
          </strong>
        </div>
        <dl>
          <div>
            <dt>Kontrolující</dt>
            <dd>{String(i.inspector ?? "—")}</dd>
          </div>
          <div>
            <dt>Datum a čas</dt>
            <dd>{inspection.completedAt?.toLocaleString("cs-CZ") ?? "—"}</dd>
          </div>
          <div>
            <dt>Stav</dt>
            <dd>
              {inspection.state === "CANCELLED"
                ? "Stornováno"
                : inspection.state === "CORRECTED"
                  ? "Opraveno"
                  : "Uzavřeno"}
            </dd>
          </div>
        </dl>
      </section>
      {inspection.state === "CANCELLED" && (
        <div className="card cancelled-record">
          <strong>Záznam byl stornován.</strong>
          <p>{inspection.correctionReason}</p>
        </div>
      )}
      <div className="protocol-columns">
        <section className="card">
          <h2>Identifikace prostředku</h2>
          <Info data={e} />
        </section>
        <section className="card">
          <h2>Povinnost a zdroj</h2>
          <Info data={r} />
        </section>
      </div>
      <section className="card protocol-checklist">
        <h2>
          {snapshot.checklist?.name ?? "Checklist"}, verze{" "}
          {snapshot.checklist?.version ?? "—"}
        </h2>
        {snapshot.checklist?.sections?.map((section) => (
          <div key={section.title}>
            <h3>{section.title}</h3>
            {section.items.map((item) => (
              <div className="protocol-answer" key={item.id}>
                <div>
                  <strong>{item.label}</strong>
                  {item.note && <small>{item.note}</small>}
                </div>
                <span>
                  {String(item.value ?? "—")} {item.unit ?? ""}
                </span>
              </div>
            ))}
          </div>
        ))}
      </section>
      {!!photos.length && (
        <section className="card">
          <h2>Fotografie</h2>
          <ul>
            {photos.map((p, index) => (
              <li key={`${p.storageKey}-${index}`}>
                {p.fileName} · bezpečně uloženo v úložišti
              </li>
            ))}
          </ul>
        </section>
      )}
      {!!inspection.defects.length && (
        <section className="card">
          <h2>Závady</h2>
          {inspection.defects.map((d) => (
            <div className="defect-link" id={`zavada-${d.id}`} key={d.id}>
              <strong>
                {d.severity === "CRITICAL" ? "Kritická závada" : "Závada"}
              </strong>
              <p>{d.description}</p>
            </div>
          ))}
        </section>
      )}
      {!!inspection.correctionOf && (
        <div className="card">
          Opravný záznam k{" "}
          <Link href={`/kontroly/${inspection.correctionOf.id}`}>
            původní kontrole
          </Link>
          .
        </div>
      )}
      {!!inspection.corrections.length && (
        <div className="card">
          Navazující opravy:{" "}
          {inspection.corrections.map((c) => (
            <Link key={c.id} href={`/kontroly/${c.id}`}>
              {c.id}
            </Link>
          ))}
        </div>
      )}
      {inspection.state === "CLOSED" && (
        <form action={cancelInspection} className="card cancel-form">
          <h2>Storno záznamu</h2>
          <p>Původní obsah zůstane dohledatelný.</p>
          <input type="hidden" name="inspectionId" value={inspection.id} />
          <input name="reason" required placeholder="Povinný důvod storna" />
          <button className="button secondary">Vytvořit storno</button>
        </form>
      )}
      {inspection.state === "CLOSED" && inspection.requirementId && (
        <form action={startCorrection} className="card cancel-form">
          <h2>Opravná kontrola</h2>
          <p>Vznikne nový záznam navázaný na tento protokol.</p>
          <input type="hidden" name="inspectionId" value={inspection.id} />
          <input name="reason" required placeholder="Povinný důvod opravy" />
          <button className="button secondary">
            Zahájit opravnou kontrolu
          </button>
        </form>
      )}
    </ModulePage>
  );
}

function Info({ data }: { data: Record<string, unknown> }) {
  return (
    <dl className="protocol-info">
      {Object.entries(data)
        .filter(([, v]) => v != null && typeof v !== "object")
        .map(([key, value]) => (
          <div key={key}>
            <dt>
              {(
                {
                  uid: "UID",
                  name: "Název",
                  manufacturer: "Výrobce",
                  model: "Model",
                  serialNumber: "Výrobní číslo",
                  registrationNumber: "Evidenční číslo",
                  legacyId: "Původní ID",
                  vehicle: "Vozidlo",
                  location: "Umístění",
                  type: "Typ",
                  source: "Zdroj",
                  article: "Článek",
                  ruleVersion: "Verze pravidla",
                  intervalValue: "Interval",
                  intervalUnit: "Jednotka",
                } as Record<string, string>
              )[key] ?? key}
            </dt>
            <dd>{String(value)}</dd>
          </div>
        ))}
    </dl>
  );
}
