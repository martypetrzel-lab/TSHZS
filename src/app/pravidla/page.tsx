import Link from "next/link";
import { ModulePage } from "@/components/module-page";
export default function Page() {
  return <ModulePage eyebrow="Rule Engine" title="Předpisy a pravidla"><div className="admin-grid"><Link className="card admin-tile" href="/pravidla/cepro"><strong>Metodika HZS ČEPRO</strong><span>V6R1, účinnost od 26. 6. 2023 →</span></Link><Link className="card admin-tile" href="/pravidla/cepro/porovnani"><strong>Porovnání s legacy evidencí</strong><span>Náhled rozdílů a ruční přiřazení →</span></Link></div></ModulePage>;
}
