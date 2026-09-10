# TSHZS

Produkční základ interní webové aplikace pro evidenci a řízení Technické služby HZS ČEPRO – stanice Mstětice. Rozhraní je v češtině a je navržené pro počítač, tablet i telefon.

## Stav implementace

Hotový je základ modulárního monolitu: přihlášení uživatelským jménem a heslem, serverová relace, role a oprávnění v databázovém modelu, organizace a stanice, hierarchické kategorie a umístění, vozidla, evidence prostředků a souprav, historie stavů, verzovaný systém pravidel, samostatné povinnosti a termíny, checklisty, neměnné snapshoty kontrol a protokolů, závady, servisní případy, audit, dashboard, seznam a karta prostředku, PWA manifest a health endpoint.

Další fáze rozšíří pracovní obrazovky pro uzavírání kontrol, PDF, revize, kalibrace, QR skenování, směnové kontroly, Excel import a reporty. Databázový základ je pro tyto moduly již připravený.

## Technologie a architektura

- Next.js 16 (App Router), React 19, TypeScript a Tailwind CSS
- PostgreSQL a Prisma ORM
- Zod validace, bcrypt hashování hesel, serverové autorizované akce
- modulární monolit; aplikační logika je v `src/lib`, serverové změny v `src/app/actions`
- ukládání času v UTC, zobrazení v českém formátu; kalendářní intervaly používají měsíce a roky, nikoli pevný počet dní

## Lokální spuštění

Požadavky: Node.js 22+, npm a Docker Desktop.

1. Zkopírujte `.env.example` do `.env` a změňte zejména `SESSION_SECRET` a heslo prvního administrátora.
2. Spusťte PostgreSQL příkazem `docker compose up -d db`.
3. Nainstalujte balíčky: `npm ci`.
4. Vygenerujte Prisma klienta: `npm run db:generate`.
5. Aplikujte migrace: `npm run db:deploy`.
6. Vytvořte základní data a prvního administrátora: `npm run db:seed`.
7. Spusťte aplikaci: `npm run dev`.

Aplikace poběží na `http://localhost:3000`, kontrola dostupnosti je na `/api/health`.

## První administrátor

Seed přečte `INITIAL_ADMIN_USERNAME` a `INITIAL_ADMIN_PASSWORD`. Heslo uloží pouze jako bcrypt hash. Pokud už účet existuje, seed ho nepřepíše. Před produkčním nasazením použijte dlouhé unikátní heslo a po prvním vytvoření účtu odstraňte obě hodnoty z prostředí.

## Databáze, migrace a seed

- Schéma: `prisma/schema.prisma`
- První migrace: `prisma/migrations/20260910194500_initial/migration.sql`
- Vývojová změna schématu: `npm run db:migrate`
- Produkční aplikace migrací: `npm run db:deploy`
- Seed: `npm run db:seed`

Seed vytváří pouze HZS ČEPRO, stanici Mstětice, strom základních kategorií, obecný checklist a tři známé intervaly z Pokynu GŘ HZS ČR č. 62/2016: první pomoc 6 měsíců, práce ve výšce 12 měsíců a pneumatická vyprošťovací zařízení 12 měsíců. U ostatních kategorií se interval nevymýšlí.

## Ověření kvality

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

Testy systému pravidel ověřují volbu nejkratšího závazného termínu, budoucí a expirovaná pravidla, kalendářní měsíce a přestupný rok. Stejné kontroly běží v GitHub Actions.

## Docker a Railway

Docker image používá samostatné produkční sestavení Next.js. Na Railway připojte PostgreSQL, nastavte proměnné z `.env.example`, jako start použijte Dockerfile a před spuštěním nové verze proveďte `npm run db:deploy`. Railway předává `PORT`; Next.js jej respektuje. Health check nastavte na `/api/health`.

## Soubory a objektové úložiště

Vývoj používá adresář `storage`, který se necommitne. Produkce má používat privátní S3 kompatibilní bucket. Do PostgreSQL patří pouze metadata a klíče objektů, nikdy fotografie nebo PDF jako base64. Stažení musí vždy projít kontrolou oprávnění.

## Import Excelu

Připravený import bude pracovat ve dvou krocích: náhled a mapování sloupců, poté validovaný transakční import. Existující `UID-*` a `PROT-*` se musí zachovat; duplicity se odmítnou. Každý běh bude mít dry-run, přehled chyb a audit uživatele i času.

## Oprávnění

Model podporuje role Administrátor, Vedoucí technické služby, Technik a Uživatel a samostatná granularní oprávnění. Skrytí tlačítka není ochrana: každá serverová akce musí ověřit relaci, roli/oprávnění a přístup ke konkrétnímu objektu.

## Zálohování a obnova

Pro PostgreSQL nastavte automatické denní zálohy, pravidelný export mimo Railway a čtvrtletní test obnovy. Objektové úložiště zálohujte/verzujte odděleně. Obnova musí vrátit konzistentní dvojici databázových metadat a souborů. Nikdy nemažte uzavřené kontroly, protokoly, revize, kalibrace, audit ani historii stavů; opravy se provádějí stornem a navazujícím opravným záznamem.

## Bezpečnost

Nikdy necommitujte `.env`, hesla ani uživatelské soubory. Produkce musí používat HTTPS, dlouhý `SESSION_SECRET`, privátní databázi a bucket, omezení velikosti a MIME uploadů a rate limiting přihlášení na infrastrukturní i aplikační vrstvě. Závislosti pravidelně aktualizujte po ověření testů a sestavení.
