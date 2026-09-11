import Link from "next/link";
import { MANAGED_ROLE_CODES } from "@/lib/user-management";

const roleNames: Record<(typeof MANAGED_ROLE_CODES)[number], string> = {
  ADMIN: "Systémová administrace",
  TS_ADMIN: "Vedení technické služby",
  TECHNICIAN: "Technik",
  USER: "Běžný uživatel",
};

export function UserForm({
  action,
  user,
}: {
  action: (formData: FormData) => Promise<void>;
  user?: {
    id: string;
    username: string;
    displayName: string;
    active: boolean;
    roleCodes: string[];
  };
}) {
  return (
    <form action={action} className="card user-editor">
      {user && <input type="hidden" name="userId" value={user.id} />}
      <div className="form-grid">
        <label>
          Uživatelské jméno
          <input
            name="username"
            defaultValue={user?.username}
            disabled={Boolean(user)}
            required={!user}
            autoComplete="username"
          />
        </label>
        <label>
          Zobrazované jméno
          <input name="displayName" defaultValue={user?.displayName} required />
        </label>
        <label className="full-width">
          {user ? "Nové heslo (prázdné = beze změny)" : "Heslo"}
          <input
            name="password"
            type="password"
            minLength={10}
            required={!user}
            autoComplete="new-password"
          />
        </label>
      </div>
      <fieldset className="role-picker">
        <legend>Role</legend>
        {MANAGED_ROLE_CODES.map((code) => (
          <label key={code}>
            <input
              type="checkbox"
              name="roles"
              value={code}
              defaultChecked={user?.roleCodes.includes(code)}
            />
            <span>
              <strong>{code}</strong>
              <small>{roleNames[code]}</small>
            </span>
          </label>
        ))}
      </fieldset>
      {user && (
        <label className="confirm-check">
          <input type="checkbox" name="active" defaultChecked={user.active} />{" "}
          Aktivní účet
        </label>
      )}
      <div className="row-actions">
        <button className="button">
          {user ? "Uložit změny" : "Vytvořit uživatele"}
        </button>
        <Link className="button secondary" href="/administrace/uzivatele">
          Zrušit
        </Link>
      </div>
    </form>
  );
}
