import Link from "next/link";
import {
  CalendarDays,
  ClipboardCheck,
  FileText,
  Gauge,
  LayoutDashboard,
  MapPinned,
  PackageSearch,
  Settings,
  ShieldAlert,
  Siren,
  Users,
  Wrench,
} from "lucide-react";
import { logout } from "@/app/actions/auth";

const nav = [
  ["Dashboard", "/", LayoutDashboard],
  ["Prostředky", "/prostredky", PackageSearch],
  ["Kontroly", "/kontroly", ClipboardCheck],
  ["Revize a kalibrace", "/revize", Gauge],
  ["Závady a opravy", "/zavady", Wrench],
  ["Protokoly", "/protokoly", FileText],
  ["Kalendář", "/kalendar", CalendarDays],
  ["Předpisy a pravidla", "/pravidla", ShieldAlert],
] as const;

export function AppShell({
  children,
  userName = "Technik TS",
}: {
  children: React.ReactNode;
  userName?: string;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">TS</div>
          <div>
            <strong>HZS ČEPRO</strong>
            <span>Technická služba · Mstětice</span>
          </div>
        </div>
        <nav className="nav">
          <div className="nav-section">Provoz</div>
          {nav.map(([label, href, Icon]) => (
            <Link key={href} href={href}>
              <Icon size={18} />
              {label}
            </Link>
          ))}
          <div className="nav-section">Správa</div>
          <Link href="/administrace">
            <Settings size={18} />
            Administrace
          </Link>
          <Link href="/administrace/uzivatele">
            <Users size={18} />
            Uživatelé a oprávnění
          </Link>
          <Link href="/administrace/umisteni">
            <MapPinned size={18} />
            Umístění a vozidla
          </Link>
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="mobile-menu">
            <Siren size={23} />
          </div>
          <input
            className="search"
            aria-label="Globální vyhledávání"
            placeholder="Hledat UID, prostředek, výrobní číslo…"
          />
          <div className="user">
            <strong>{userName}</strong>
            <span>Stanice Mstětice</span>
            <form action={logout}>
              <button
                type="submit"
                className="text-xs text-slate-500 hover:text-red-700"
              >
                Odhlásit se
              </button>
            </form>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
