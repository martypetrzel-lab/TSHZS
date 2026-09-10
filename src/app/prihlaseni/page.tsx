import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";
export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="login-page">
      <section className="login-art">
        <div className="brand" style={{ border: 0, padding: 0 }}>
          <div className="brand-mark">TS</div>
          <div>
            <strong>HZS ČEPRO</strong>
            <span>Stanice Mstětice</span>
          </div>
        </div>
        <div>
          <p className="eyebrow">Technická služba</p>
          <h1>Vybavení pod kontrolou.</h1>
          <p>
            Evidence prostředků, kontrol, revizí a závad v jednom bezpečném
            pracovním systému.
          </p>
        </div>
        <small>Interní systém · HZS ČEPRO</small>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <ShieldCheck size={34} color="#b91c1c" />
          <h2>Přihlášení</h2>
          <p className="muted">Pokračujte do evidence Technické služby.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
