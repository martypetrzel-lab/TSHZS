import Link from "next/link";
import { ReturnHandoverForm } from "@/components/return-handover-form";
import { notFound } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { OperationalActionForm as ActionForm } from "@/components/operational-action-form";
import {
  operationalPageAccess,
  operationalPermissions,
} from "@/lib/operational-authorization";
import { todayDateKey } from "@/lib/inspection-lifecycle";
import { OperationalAccessDenied } from "@/components/operational-access-denied";
import {
  OperationalDocumentActions,
  MissingOperationalAccess,
} from "@/components/operational-document-actions";
import { prisma } from "@/lib/prisma";
import {
  issueOperationalProtocol,
  confirmOperationalEvent,
  submitRepairProposal,
  decideRepairProposal,
  duplicateOperationalProtocol,
  acknowledgeHandover,
} from "@/app/actions/operational-protocols";
import { OperationalEditorLoader } from "@/components/operational-editor-loader";
import { OperationalAttachments } from "@/components/operational-attachments";
import { changeReturnDeadline } from "@/app/actions/repair-management";
import {
  operationalActionLabels,
  operationalLabels,
  publicFieldValue,
} from "@/lib/operational-fields";
export const dynamic = "force-dynamic";
const labels: Record<string, string> = {
  reason: "Důvod",
  description: "Popis závady / stavu",
  solution: "Navrhovaný postup",
  justification: "Odůvodnění",
  sender: "Předávající",
  recipient: "Přebírající",
  recipientOrganization: "Organizace příjemce",
  recipientAddress: "Adresa",
  recipientPhone: "Telefon",
  recipientEmail: "E-mail",
  place: "Místo",
  accessories: "Příslušenství",
  condition: "Stav",
  note: "Poznámka",
  expectedReturn: "Vrácení do",
  estimatedCost: "Odhad ceny",
  currency: "Měna",
  dueDate: "Termín opravy",
  priority: "Priorita",
  handoverPurpose: "Účel předání",
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user, allowed } = await operationalPageAccess("protocol:read");
  if (!allowed)
    return (
      <OperationalAccessDenied
        title="Provozní protokol"
        permission="protocol:read"
        user={user}
      />
    );
  const permissions = await operationalPermissions(user.id);
  const { id } = await params;
  const doc = await prisma.operationalProtocol.findFirst({
    where: { id, organizationId: user.organizationId },
    include: { items: { include: { handover: true } }, decisions: true },
  });
  if (!doc) notFound();
  const equipment = await prisma.equipmentItem.findMany({
    where: {
      id: { in: doc.items.map((item) => item.equipmentId) },
      organizationId: user.organizationId,
    },
  });
  const data = doc.draftData as Record<string, string>;
  const frozenEquipment = (
    doc.snapshot as {
      equipment?: { id?: string; name: string; uid: string }[];
    } | null
  )?.equipment;
  const displayEquipment =
    doc.status !== "DRAFT" && frozenEquipment
      ? frozenEquipment.map((item, index) => ({
          ...item,
          id: item.id ?? doc.items[index]?.equipmentId ?? item.uid,
        }))
      : equipment;
  const audit = await prisma.auditLog.findMany({
    where: { entityType: "OperationalProtocol", entityId: id },
    orderBy: { createdAt: "asc" },
  });
  const submission = audit.find((entry) => entry.action === "REPAIR_SUBMITTED");
  const repairId = (submission?.newValue as { repairCaseId?: string } | null)
    ?.repairCaseId;
  const confirmed = audit.some((entry) =>
    ["HANDOVER_CONFIRMED", "EQUIPMENT_OUT_OF_SERVICE"].includes(entry.action),
  );
  const hidden = <input name="id" type="hidden" value={id} />;
  return (
    <ModulePage
      eyebrow={
        doc.status === "DRAFT"
          ? "NÁVRH – NEVYSTAVENO"
          : doc.status === "CANCELLED"
            ? "STORNOVÁNO"
            : "Vystavený dokument"
      }
      title={`${doc.title} · ${doc.number ?? "Rozpracováno"}`}
    >
      <Link href="/protokoly">Zpět na protokoly</Link>
      <OperationalDocumentActions
        doc={{
          id,
          status: doc.status,
          createdById: doc.createdById,
          title: doc.title,
          hasAppendix: Boolean(
            (doc.snapshot as { hasAppendix?: boolean } | null)?.hasAppendix,
          ),
          hasDecisions: doc.decisions.length > 0,
        }}
        user={user}
        permissions={permissions}
      />
      {doc.status === "ISSUED" &&
        doc.type === "OUT_OF_SERVICE" &&
        !confirmed && (
          <section className="card review-notice">
            <h2>Čeká na potvrzení skutečného odstavení</h2>
            <p>
              Protokol je vystavený, ale skutečné odstavení zatím není
              potvrzené. V části Závady a opravy je uveden mezi provozními
              protokoly. Závada a stav mimo provoz se zapíší po potvrzení
              skutečné události ve formuláři níže.
            </p>
            {!permissions.has("equipment:out_of_service") && (
              <MissingOperationalAccess
                user={user}
                permission="equipment:out_of_service"
                label="Potvrdit skutečné odstavení prostředku"
              />
            )}
          </section>
        )}
      {doc.status === "ISSUED" &&
        doc.type === "REPAIR_PROPOSAL" &&
        !submission && (
          <section className="card review-notice">
            <h2>Návrh ještě nebyl odeslán ke schválení</h2>
            <p>
              V části Závady a opravy je uveden mezi návrhy. Servisní případ
              vznikne po odeslání ke schválení tlačítkem níže.
            </p>
            {!permissions.has("repair:create") && (
              <MissingOperationalAccess
                user={user}
                permission="repair:create"
                label="Vytvářet opravy a odesílat návrhy"
              />
            )}
          </section>
        )}
      {permissions.has("protocol:create") && (
        <ActionForm action={duplicateOperationalProtocol}>
          {hidden}
          <button className="button secondary">
            Duplikovat / vytvořit novou verzi
          </button>
        </ActionForm>
      )}
      {doc.status === "ISSUED" && (
        <div className="row-actions">
          <Link href={`/protokoly/novy?type=REPAIR_PROPOSAL&protocolId=${id}`}>
            Vytvořit návrh na opravu
          </Link>
          <Link href={`/protokoly/novy?type=HANDOVER&protocolId=${id}`}>
            Připravit předání
          </Link>
        </div>
      )}
      <section className="card">
        <p>
          Datum protokolu:{" "}
          {doc.protocolDate.toLocaleDateString("cs-CZ", {
            timeZone: "Europe/Prague",
          })}
        </p>
        {displayEquipment.map((item) => (
          <p key={item.id}>
            <Link href={`/prostredky/${item.id}`}>
              {item.name} · {item.uid}
            </Link>
          </p>
        ))}
        <dl className="protocol-info">
          {Object.entries(data)
            .filter(([key, v]) => v && !key.endsWith("Id"))
            .map(([key, v]) => (
              <div key={key}>
                <dt>{operationalLabels[key] ?? labels[key] ?? key}</dt>
                <dd>{publicFieldValue(key, v)}</dd>
              </div>
            ))}
        </dl>
      </section>
      {doc.status === "DRAFT" &&
        doc.createdById === user.id &&
        permissions.has("protocol:edit_draft") && (
          <OperationalEditorLoader
            organizationId={user.organizationId}
            docId={id}
            initialType={doc.type}
            date={doc.protocolDate.toISOString().slice(0, 10)}
            initial={{
              ...data,
              eventPlannedAt:
                doc.eventPlannedAt?.toISOString().slice(0, 10) ?? "",
              eventOccurredAt:
                doc.eventOccurredAt?.toISOString().slice(0, 10) ?? "",
            }}
            selectedIds={doc.items.map((i) => i.equipmentId)}
            itemDetails={Object.fromEntries(
              doc.items.map((i) => [
                i.equipmentId,
                {
                  ...(i.details as Record<string, string>),
                  quantity: String(i.quantity),
                },
              ]),
            )}
          />
        )}
      {doc.status === "DRAFT" && permissions.has("protocol:issue") && (
        <ActionForm
          action={issueOperationalProtocol}
          confirmation="Vystavit neměnný dokument a přidělit mu číslo?"
        >
          {hidden}
          <button className="button">Vystavit protokol</button>
        </ActionForm>
      )}
      {doc.status === "ISSUED" &&
        doc.type !== "REPAIR_PROPOSAL" &&
        !confirmed &&
        permissions.has(
          doc.type === "HANDOVER"
            ? "handover:confirm"
            : "equipment:out_of_service",
        ) && (
          <ActionForm action={confirmOperationalEvent}>
            {hidden}
            <h2>
              {doc.type === "HANDOVER"
                ? "Potvrdit skutečné předání"
                : "Potvrdit skutečné odstavení"}
            </h2>
            <p>
              {doc.type === "HANDOVER"
                ? `Navržený provozní stav: ${data.handoverPurpose === "SERVICE" ? "V opravě" : "Zapůjčeno"}.`
                : "Prostředek bude mimo provoz a blokován pro používání."}
            </p>
            <label className="field">
              Datum události
              <input
                type="date"
                name="eventDate"
                required
                defaultValue={todayDateKey()}
              />
            </label>
            <label>
              <input type="checkbox" name="confirmed" required /> Potvrzuji, že
              událost skutečně proběhla.
            </label>
            <button className="button">Potvrdit</button>
          </ActionForm>
        )}
      {doc.items
        .filter((item) => item.handover && !item.handover.returnedAt)
        .map(
          (item) =>
            permissions.has("handover:return") && (
              <ReturnHandoverForm
                key={item.id}
                organizationId={user.organizationId}
                movementId={item.handover!.id}
                name={
                  equipment.find((e) => e.id === item.equipmentId)?.name ??
                  "Prostředek"
                }
              />
            ),
        )}
      {doc.type === "REPAIR_PROPOSAL" &&
        doc.status === "ISSUED" &&
        !submission &&
        permissions.has("repair:create") && (
          <ActionForm action={submitRepairProposal}>
            {hidden}
            <button className="button">Odeslat ke schválení</button>
          </ActionForm>
        )}
      {repairId && (
        <p>
          <Link href={`/zavady/${repairId}`}>Související servisní případ</Link>
        </p>
      )}
      {submission &&
        !doc.decisions.length &&
        doc.createdById !== user.id &&
        permissions.has("repair:approve") &&
        doc.status === "ISSUED" && (
          <ActionForm action={decideRepairProposal}>
            {hidden}
            <h2>Vyjádření schvalující osoby</h2>
            <select name="decision">
              <option value="APPROVED">Schválit</option>
              <option value="REJECTED">Neschválit</option>
              <option value="CHANGES_REQUIRED">Vrátit k doplnění</option>
            </select>
            <label className="field">
              Maximální schválená částka
              <input name="approvedLimit" type="number" step="0.01" min="0" />
            </label>
            <label className="field">
              Důvod / vyjádření
              <textarea name="reason" required />
            </label>
            <label className="field">
              Podmínky
              <textarea name="conditions" />
            </label>
            <button className="button">Uložit rozhodnutí</button>
          </ActionForm>
        )}
      {doc.decisions.map((decision) => (
        <section key={decision.id} className="card">
          <h2>Rozhodnutí</h2>
          <p>
            {decision.decision === "APPROVED"
              ? "Schváleno"
              : decision.decision === "REJECTED"
                ? "Neschváleno"
                : "Vráceno k doplnění"}
            : {decision.reason}
          </p>
        </section>
      ))}
      {doc.cancellationReason && (
        <p className="error">Důvod storna: {doc.cancellationReason}</p>
      )}
      {doc.status === "ISSUED" &&
        data.recipientUserId === user.id &&
        confirmed &&
        permissions.has("handover:confirm") &&
        !audit.some((entry) => entry.action === "HANDOVER_ACCEPTED") && (
          <ActionForm
            action={acknowledgeHandover}
            confirmation="Potvrzujete skutečné převzetí prostředků pod svým účtem?"
          >
            {hidden}
            <button className="button">Elektronicky potvrdit převzetí</button>
          </ActionForm>
        )}
      {doc.items
        .filter((item) => item.handover && !item.handover.returnedAt)
        .map(
          (item) =>
            permissions.has("handover:confirm") && (
              <ActionForm
                key={`deadline-${item.id}`}
                action={changeReturnDeadline}
              >
                <input
                  type="hidden"
                  name="movementId"
                  value={item.handover!.id}
                />
                <label className="field">
                  Nový termín vrácení
                  <input type="date" name="expectedReturnAt" required />
                </label>
                <label className="field">
                  Důvod změny
                  <input name="reason" required />
                </label>
                <button className="button secondary">
                  Aktualizovat termín vrácení
                </button>
              </ActionForm>
            ),
        )}
      <OperationalAttachments
        ownerType="OperationalProtocol"
        ownerId={id}
        canUpload={permissions.has("protocol:edit_draft")}
      />
      <section className="card">
        <h2>Historie dokumentu</h2>
        {audit.map((entry) => (
          <p key={entry.id}>
            {entry.createdAt.toLocaleString("cs-CZ")} ·{" "}
            {operationalActionLabels[entry.action] ?? "Provozní událost"}{" "}
            {entry.reason}
          </p>
        ))}
      </section>
    </ModulePage>
  );
}
