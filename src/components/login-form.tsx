"use client";
import { useActionState } from "react";
import { login } from "@/app/actions/auth";
export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="username">Uživatelské jméno</label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          required
          autoFocus
        />
      </div>
      <div className="field">
        <label htmlFor="password">Heslo</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {state?.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      <button className="button" disabled={pending}>
        {pending ? "Ověřuji…" : "Přihlásit se"}
      </button>
    </form>
  );
}
