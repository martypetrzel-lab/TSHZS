import Link from "next/link";
import { FileSpreadsheet, UploadCloud } from "lucide-react";
import { analyzeEquipmentCardImport } from "@/app/actions/equipment-card-import";
import { AppShell } from "@/components/app-shell";
import { requireImportAdministrator } from "@/lib/authorization";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ chyba?: string }>;
}) {
  const user = await requireImportAdministrator(),
    { chyba } = await searchParams;
  return (
    <AppShell userName={user.displayName}>
      <div className="content">
        <div className="page-head">
          <div>
            <p className="eyebrow">Administrace · Import</p>
            <h1>Karty prostředků / pasporty</h1>
            <p className="muted">
              Každý neprázdný list se vyhodnotí jako samostatná karta.
            </p>
          </div>
          <Link className="button secondary" href="/administrace/import">
            Tabulková evidence
          </Link>
        </div>
        {chyba && <div className="error import-error">{chyba}</div>}
        <section className="card import-card">
          <div className="import-step">
            <span>1</span>
            <div>
              <strong>Nahrát původní karty</strong>
              <p className="muted">
                List VZOR-NEVYPLŇOVAT a prázdné listy se ignorují. Před zápisem
                vždy následuje preview.
              </p>
            </div>
          </div>
          <form action={analyzeEquipmentCardImport}>
            <label className="dropzone">
              <UploadCloud size={38} />
              <strong>Vyberte XLSX s kartami prostředků</strong>
              <span>Originál bude archivován v trvalém úložišti.</span>
              <input
                type="file"
                name="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                required
              />
            </label>
            <button className="button">
              <FileSpreadsheet size={18} />
              Analyzovat karty
            </button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
