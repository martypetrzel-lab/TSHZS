"use client";
import { useState, useTransition, type ReactNode } from "react";
import { executeOperationalAction } from "@/app/actions/operational-execution";
export function OperationalActionForm({
  action,
  children,
  confirmation,
}: {
  action: (data: FormData) => Promise<void>;
  children: ReactNode;
  confirmation?: string;
}) {
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="card inspection-mobile-form"
      action={(data) => {
        if (confirmation && !window.confirm(confirmation)) return;
        startTransition(async () => {
          setError("");
          setSaved(false);
          try {
            const result = await executeOperationalAction(action, data);
            if (!result.ok) setError(result.message);
            else setSaved(true);
          } catch (caught) {
            if (caught && typeof caught === "object" && "digest" in caught)
              throw caught;
            setError(
              caught instanceof Error
                ? caught.message
                : "Operaci se nepodařilo dokončit.",
            );
          }
        });
      }}
    >
      <fieldset disabled={pending} style={{ border: 0, padding: 0 }}>
        {children}
      </fieldset>
      {pending && <p role="status">Ukládání…</p>}
      {saved && <p role="status">Uloženo</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
