import { FileSpreadsheet, UploadCloud } from "lucide-react";
import { analyzeImport } from "@/app/actions/import";
import { AppShell } from "@/components/app-shell";
import { requireImportAdministrator } from "@/lib/authorization";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ chyba?: string }>;
}) {
  const user = await requireImportAdministrator();
  const { chyba } = await searchParams;
  return (
    <AppShell userName={user.displayName}>
      <div className="content">
        <div className="page-head">
          <div>
            <p className="eyebrow">Administrace · Import</p>
            <h1>Import původní evidence</h1>
            <p className="muted">
              Kontrola techniky.xlsx · bezpečná analýza před zápisem
            </p>
          </div>
        </div>
        {chyba && <div className="error import-error">{chyba}</div>}
        <section className="card import-card">
          <div className="import-step">
            <span>1</span>
            <div>
              <strong>Nahrát XLSX</strong>
              <p className="muted">
                Povoleny jsou pouze soubory .xlsx do 20 MB. Soubor se zpracuje
                na serveru.
              </p>
            </div>
          </div>
          <form action={analyzeImport}>
            <label className="dropzone">
              <UploadCloud size={38} />
              <strong>Přetáhněte soubor sem nebo jej vyberte</strong>
              <span>
                Kontrola 1 · Protokol · Karta Prostředku · Historie protokolů
              </span>
              <input
                type="file"
                name="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                required
              />
            </label>
            <button className="button" type="submit">
              <FileSpreadsheet size={18} />
              Analyzovat soubor
            </button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
