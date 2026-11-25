import Link from "next/link";
import {
  protocolTypes,
  type OperationalType,
} from "@/lib/operational-workflow";
import { operationalForms } from "@/lib/operational-form";
export function OperationalProtocolChoices({
  context = {},
}: {
  context?: Record<string, string>;
}) {
  return (
    <section className="grid-stats" aria-label="Vyberte samostatný protokol">
      {(Object.entries(protocolTypes) as [OperationalType, string][]).map(
        ([type, title]) => (
          <article className="card" key={type}>
            <h2>{title}</h2>
            <p>{operationalForms[type].description}</p>
            <Link
              className="button"
              href={`/protokoly/novy?${new URLSearchParams({ ...context, type })}`}
            >
              Vytvořit: {title}
            </Link>
          </article>
        ),
      )}
    </section>
  );
}
