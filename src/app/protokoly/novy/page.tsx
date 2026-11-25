import { ModulePage } from "@/components/module-page";
import { saveOperationalDraft } from "@/app/actions/operational-protocols";
import { requireOperationalPermission } from "@/lib/operational-authorization";
import { protocolTypes } from "@/lib/operational-workflow";
import { prisma } from "@/lib/prisma";
import { todayDateKey } from "@/lib/inspection-lifecycle";

export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireOperationalPermission("protocol:create");
  const equipment = await prisma.equipmentItem.findMany({ where: { organizationId: user.organizationId, archivedAt: null }, orderBy: { name: "asc" } });
  return <ModulePage eyebrow="Dokumentace" title="Nový provozní protokol"><form action={saveOperationalDraft} className="card inspection-mobile-form">
    <label className="field">Druh dokumentu<select name="type" required>{Object.entries(protocolTypes).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
    <label className="field">Datum protokolu<input name="protocolDate" type="date" required defaultValue={todayDateKey()} /></label>
    <label className="field">Datum skutečné události<input name="eventOccurredAt" type="date" /></label>
    <label className="field">Technické prostředky (více položek pouze pro předání)<select name="equipmentId" multiple required size={10}>{equipment.map(e => <option key={e.id} value={e.id}>{e.name} · {e.uid} · {e.serialNumber ?? e.legacyId ?? ""}</option>)}</select></label>
    <label className="field">Důvod<input name="reason" required /></label>
    <label className="field">Účel předání<select name="handoverPurpose"><option value="SERVICE">Servis / oprava</option><option value="LOAN">Zápůjčka</option></select></label>
    <label className="field">Popis závady / stavu<textarea name="description" /></label>
    <label className="field">Navrhovaná oprava / další postup<textarea name="solution" /></label>
    <label className="field">Odůvodnění<textarea name="justification" /></label>
    <label className="field">Předávající<input name="sender" defaultValue={`${user.displayName}, HZS ČEPRO – Mstětice`} /></label>
    <label className="field">Přebírající<input name="recipient" /></label>
    <label className="field">Organizace příjemce<input name="recipientOrganization" /></label>
    <label className="field">Adresa<input name="recipientAddress" /></label>
    <label className="field">Telefon<input name="recipientPhone" type="tel" /></label>
    <label className="field">E-mail<input name="recipientEmail" type="email" /></label>
    <label className="field">Místo předání<input name="place" /></label>
    <label className="field">Stav při předání<input name="condition" /></label>
    <label className="field">Příslušenství<textarea name="accessories" /></label>
    <label className="field">Předpokládané vrácení<input name="expectedReturn" type="date" /></label>
    <label className="field">Předpokládaná cena<input name="estimatedCost" type="number" step="0.01" min="0" /></label>
    <label className="field">Měna<input name="currency" defaultValue="CZK" /></label>
    <label className="field">Požadovaný termín opravy<input name="dueDate" type="date" /></label>
    <label className="field">Priorita<select name="priority"><option>Běžná</option><option>Nízká</option><option>Vysoká</option><option>Urgentní</option></select></label>
    <label className="field">Poznámka<textarea name="note" /></label>
    <button className="button">Uložit rozpracované</button>
  </form></ModulePage>;
}
