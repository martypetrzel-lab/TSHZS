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

## Produkční nasazení na Railway

Railway je hlavní cílové prostředí. Připojte repozitář `martypetrzel-lab/TSHZS`, nastavte produkční větev `main` a do stejného Railway projektu přidejte PostgreSQL. Do webové služby předejte `DATABASE_URL` referencí na proměnnou PostgreSQL služby; produkční start odmítne adresu mířící na `localhost`.

Soubor `railway.json` vybírá kořenový vícefázový `Dockerfile`, nastavuje `/api/health` a před startem nové verze postupně spustí `npm run db:deploy` a idempotentní `npm run db:seed`. Když migrace nebo seed skončí nenulovým kódem, nová verze se nespustí. Seed nepoužívá `tsx` ani jinou vývojovou závislost. Po prvním vytvoření administrátora lze obě `INITIAL_ADMIN_*` proměnné odstranit; další seedy master data dál bezpečně aktualizují a uživatelský účet ani heslo nemění. Health endpoint ověřuje spojení s databází, vrací pouze `ok` nebo `unavailable` a necacheuje se.

Railway předává `PORT` automaticky. Standalone Next.js server jej čte za běhu a poslouchá na `0.0.0.0`; Dockerfile proto produkční port nepřepisuje. Start používá exec-form `CMD`, takže Node běží jako PID 1 a dostane `SIGTERM` přímo. Next.js při SIGTERM dokončí rozpracované požadavky. V Railway Variables nastavte `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=30`, aby před případným SIGKILL dostal doporučené okno pro korektní ukončení.

Produkční image neobsahuje vývojové nástroje. Prisma CLI je záměrně produkční závislost, protože ho samostatný Railway pre-deploy kontejner potřebuje pro `prisma migrate deploy`. Docker Compose slouží pouze k místnímu vývoji a pro Railway není potřeba.

## Soubory a objektové úložiště

Storage vrstva v `src/lib/storage` má shodné rozhraní pro lokální disk a S3. Vývoj používá `STORAGE_PROVIDER=local` a adresář `storage`, který se necommitne. Produkce vyžaduje `STORAGE_PROVIDER=s3`; jinou hodnotu aplikace při startu odmítne.

V Railway vytvořte privátní Bucket a jeho credentials předejte pomocí Variable References do `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` a `S3_SECRET_ACCESS_KEY`. Nové Railway Buckety používají virtual-hosted URL, proto ponechte `S3_FORCE_PATH_STYLE=false`; u staršího bucketu použijte hodnotu z jeho Credentials panelu. Stahování probíhá přes krátkodobé podepsané URL.

Tabulka `Attachment` ukládá pouze název, MIME, velikost, storage key, SHA-256 checksum, typ a ID navázaného objektu, autora uploadu a čas. Fotografie ani PDF se jako base64 do PostgreSQL neukládají.

## Import Excelu

Připravený import bude pracovat ve dvou krocích: náhled a mapování sloupců, poté validovaný transakční import. Existující `UID-*` a `PROT-*` se musí zachovat; duplicity se odmítnou. Každý běh bude mít dry-run, přehled chyb a audit uživatele i času.

## Oprávnění

Model podporuje role Administrátor, Vedoucí technické služby, Technik a Uživatel a samostatná granularní oprávnění. Skrytí tlačítka není ochrana: každá serverová akce musí ověřit relaci, roli/oprávnění a přístup ke konkrétnímu objektu.

## Zálohování a obnova

Pro PostgreSQL nastavte automatické denní zálohy, pravidelný export mimo Railway a čtvrtletní test obnovy. Objektové úložiště zálohujte/verzujte odděleně. Obnova musí vrátit konzistentní dvojici databázových metadat a souborů. Nikdy nemažte uzavřené kontroly, protokoly, revize, kalibrace, audit ani historii stavů; opravy se provádějí stornem a navazujícím opravným záznamem.

## Bezpečnost

Nikdy necommitujte `.env`, hesla ani uživatelské soubory. Produkce musí používat HTTPS, dlouhý `SESSION_SECRET`, privátní databázi a bucket, omezení velikosti a MIME uploadů a rate limiting přihlášení na infrastrukturní i aplikační vrstvě. Závislosti pravidelně aktualizujte po ověření testů a sestavení.
