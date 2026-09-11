"use client";

import { useRef } from "react";
import { cancelInspection, deleteInspectionDraft } from "@/app/actions/inspection";

export function CancelInspectionDialog({ inspection }: { inspection: { id: string; equipment: string; uid: string; performed: string; result: string; protocol: string; inspector: string } }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <button type="button" className="button secondary" onClick={() => dialog.current?.showModal()}>Stornovat</button>
    <dialog ref={dialog} className="inspection-dialog">
      <form action={cancelInspection}>
        <h2>Stornování kontroly</h2>
        <dl className="protocol-info">
          <div><dt>Prostředek</dt><dd>{inspection.equipment}</dd></div>
          <div><dt>UID</dt><dd>{inspection.uid}</dd></div>
          <div><dt>Datum kontroly</dt><dd>{inspection.performed}</dd></div>
          <div><dt>Výsledek</dt><dd>{inspection.result}</dd></div>
          <div><dt>Číslo protokolu</dt><dd>{inspection.protocol}</dd></div>
          <div><dt>Kontrolující</dt><dd>{inspection.inspector}</dd></div>
        </dl>
        <input type="hidden" name="inspectionId" value={inspection.id} />
        <label className="field"><span>Kategorie důvodu</span><select name="reasonCategory" required><option value="">Vyberte</option><option>Testovací záznam</option><option>Kontrola založena omylem</option><option>Chybně vybraný prostředek</option><option>Chybná data</option><option>Jiný důvod</option></select></label>
        <label className="field"><span>Důvod storna</span><textarea name="reason" required minLength={3} /></label>
        <div className="row-actions"><button className="button">Potvrdit storno</button><button type="button" className="button secondary" onClick={() => dialog.current?.close()}>Zpět</button></div>
      </form>
    </dialog>
  </>;
}

export function DeleteDraftButton({ inspectionId }: { inspectionId: string }) {
  return <form action={deleteInspectionDraft} onSubmit={(event) => { if (!window.confirm("Opravdu chcete rozpracovanou kontrolu odstranit?")) event.preventDefault(); }}>
    <input type="hidden" name="inspectionId" value={inspectionId} />
    <button className="button secondary">Odstranit draft</button>
  </form>;
}
