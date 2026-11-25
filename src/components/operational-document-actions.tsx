import { OperationalActionForm } from "@/components/operational-action-form";
import {
  grantOperationalPermission,
  deleteOperationalDraft,
  cancelOperationalProtocol,
} from "@/app/actions/operational-protocols";

type Actor = { id: string; roles: { role: { code: string } }[] };
export function MissingOperationalAccess({
  user,
  permission,
  label,
}: {
  user: Actor;
  permission: string;
  label: string;
}) {
  return (
    <div>
      <p>
        Chybí oprávnění: <strong>{label}</strong>.
      </p>
      {user.roles.some(({ role }) => role.code === "ADMIN") ? (
        <OperationalActionForm action={grantOperationalPermission}>
          <input type="hidden" name="userId" value={user.id} />
          <input type="hidden" name="permission" value={permission} />
          <button className="button secondary">
            Povolit pro můj účet: {label}
          </button>
        </OperationalActionForm>
      ) : (
        <p>Požádejte administrátora o přidělení tohoto oprávnění.</p>
      )}
    </div>
  );
}

export function OperationalDocumentActions({
  doc,
  user,
  permissions,
}: {
  doc: {
    id: string;
    status: string;
    createdById: string;
    title: string;
    hasAppendix: boolean;
    hasDecisions: boolean;
  };
  user: Actor;
  permissions: Set<string>;
}) {
  const url = `/api/protokoly/${doc.id}/pdf`;
  return (
    <section className="card operational-document-form">
      <h2>Tisk a správa protokolu</h2>
      {permissions.has("protocol:download") ? (
        <div className="row-actions">
          <a
            className="button"
            href={`${url}?zobrazeni=tisk`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {doc.status === "DRAFT"
              ? "Náhled a tisk návrhu"
              : "Otevřít protokol k tisku"}
          </a>
          <a className="button secondary" href={url}>
            Stáhnout kompletní PDF
          </a>
          {doc.status !== "DRAFT" && (
            <a href={`${url}?original=1`}>Původní vystavené PDF</a>
          )}
          {doc.hasAppendix && (
            <a
              href={`${url}?priloha=A&zobrazeni=tisk`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Samostatně vytisknout přílohu A
            </a>
          )}
          {doc.hasDecisions && (
            <a
              href={`${url}?dolozka=1&zobrazeni=tisk`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Tisk se schvalovací doložkou
            </a>
          )}
        </div>
      ) : (
        <MissingOperationalAccess
          user={user}
          permission="protocol:download"
          label="Tisk a stahování PDF"
        />
      )}
      {doc.status === "DRAFT" ? (
        doc.createdById === user.id ? (
          permissions.has("protocol:edit_draft") ? (
            <OperationalActionForm
              action={deleteOperationalDraft}
              confirmation="Opravdu smazat tento rozpracovaný protokol?"
            >
              <input type="hidden" name="id" value={doc.id} />
              <button className="button secondary">
                Smazat rozpracovaný protokol
              </button>
            </OperationalActionForm>
          ) : (
            <MissingOperationalAccess
              user={user}
              permission="protocol:edit_draft"
              label="Úprava a smazání vlastních návrhů"
            />
          )
        ) : (
          <p>
            Rozpracovaný protokol může smazat pouze jeho autor s oprávněním
            upravovat návrhy.
          </p>
        )
      ) : doc.status === "ISSUED" ? (
        <>
          <p>
            Vystavený protokol má přidělené číslo a nelze jej smazat. Lze jej
            stornovat s uvedením důvodu; dokument i historie zůstanou zachované.
          </p>
          {permissions.has("protocol:cancel") ? (
            <details>
              <summary>Stornovat protokol</summary>
              <OperationalActionForm
                action={cancelOperationalProtocol}
                confirmation="Opravdu stornovat vystavený protokol? Dokument zůstane v historii."
              >
                <input type="hidden" name="id" value={doc.id} />
                <label className="field">
                  Důvod storna
                  <textarea name="reason" required />
                </label>
                <button className="button secondary">
                  Potvrdit storno protokolu
                </button>
              </OperationalActionForm>
            </details>
          ) : (
            <MissingOperationalAccess
              user={user}
              permission="protocol:cancel"
              label="Stornování vystavených protokolů"
            />
          )}
        </>
      ) : (
        <p>
          Protokol je stornovaný. Zůstává dostupný v historii a jeho tisk je
          označen STORNOVÁNO.
        </p>
      )}
    </section>
  );
}
