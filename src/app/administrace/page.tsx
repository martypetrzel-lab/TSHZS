import Link from "next/link";
import {
  DatabaseBackup,
  Users,
  MapPinned,
  Tags,
  ListChecks,
  ShieldCheck,
  Settings,
  ScrollText,
} from "lucide-react";
import { ModulePage } from "@/components/module-page";
const tiles = [
  ["Import dat", "/administrace/import", DatabaseBackup],
  ["Uživatelé a oprávnění", "/administrace/uzivatele", Users],
  ["Umístění a vozidla", "/administrace/umisteni", MapPinned],
  ["Kategorie prostředků", "/administrace/kategorie", Tags],
  ["Checklisty", "/administrace/checklisty", ListChecks],
  ["Předpisy a pravidla", "/pravidla", ShieldCheck],
  ["Nastavení systému", "/administrace/nastaveni", Settings],
  ["Audit log", "/administrace/audit", ScrollText],
] as const;
export default function Page() {
  return (
    <ModulePage eyebrow="Správa systému" title="Administrace">
      <div className="admin-grid">
        {tiles.map(([label, href, Icon]) => (
          <Link href={href} className="card admin-tile" key={href}>
            <Icon size={25} />
            <strong>{label}</strong>
            <span>Otevřít modul →</span>
          </Link>
        ))}
      </div>
    </ModulePage>
  );
}
