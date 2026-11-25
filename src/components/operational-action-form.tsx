"use client";
import { useState, useTransition, type ReactNode } from "react";
export function OperationalActionForm({ action, children, confirmation }: { action: (data: FormData) => Promise<void>; children: ReactNode; confirmation?: string }) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return <form className="card inspection-mobile-form" action={data => {
    if (confirmation && !window.confirm(confirmation)) return;
    startTransition(async () => {
      setError("");
      try { await action(data); } catch (caught) {
        if (caught && typeof caught === "object" && "digest" in caught) throw caught;
        setError(caught instanceof Error ? caught.message : "Operaci se nepodařilo dokončit.");
      }
    });
  }}><fieldset disabled={pending} style={{ border: 0, padding: 0 }}>{children}</fieldset>{pending && <p role="status">Ukládání…</p>}{error && <p className="error" role="alert">{error}</p>}</form>;
}
