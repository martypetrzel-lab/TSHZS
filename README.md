# TSHZS

Interní evidence Technické služby HZS ČEPRO, stanice Mstětice, 4773.
Next.js 16, React 19, TypeScript, Prisma, PostgreSQL a privátní S3 storage.
Rozhraní je české, termíny a notifikace používají Europe/Prague.

## Produkce přímo na Railway

Produkční větev je `main` repozitáře `martypetrzel-lab/TSHZS`.
Webová služba je v Railway nastavena na Railpack a Node.js 22. Dockerfile ani Compose nejsou potřeba.
Build/start/pre-deploy a healthcheck jsou nastavené přímo na příslušných Railway službách;
kořenový railway.json se nepoužívá, aby nepřepisoval nastavení samostatné cron úlohy.

- Build: `npm run db:generate && npm run build` po instalaci závislostí Railpackem.
- Pre-deploy: `npm run db:init` = `prisma migrate deploy && node prisma/seed.mjs`.
- Start: `npm run start -- --hostname 0.0.0.0`; Next.js čte Railway `PORT`.
- Healthcheck: `/api/health`, odpověď bez citlivých údajů, spojení s PostgreSQL.
- SIGTERM zpracovává Next.js; Railway draining ponechat alespoň 30 sekund.
- Prisma CLI, klient, PDF fonty a zpracování fotografií jsou produkční závislosti.

Povinné Railway Variables: `DATABASE_URL`, `SESSION_SECRET`, `STORAGE_PROVIDER=s3`,
`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
`S3_FORCE_PATH_STYLE` se řídí nastavením konkrétního bucketu. `TZ=Europe/Prague`.
Nikdy nevkládat skutečné hodnoty do repozitáře.

`INITIAL_ADMIN_USERNAME` a `INITIAL_ADMIN_PASSWORD` jsou potřebné jen při vytvoření
prvního účtu. Seed hashuje heslo bcryptem, existující heslo nemění a počátečnímu
účtu idempotentně zajistí ADMIN + TS_ADMIN. ADMIN nenahrazuje odborné oprávnění.

## Provozní dokumenty a opravy

`/protokoly` sjednocuje původní kontrolní protokoly a nové předávací dokumenty,
protokoly mimo provoz a návrhy oprav. Podporuje rok, text, číslo, typ, stav,
vozidlo, umístění, zpracovatele, servis a období. Vystavené protokoly jsou
neměnné; oprava znamená nový návrh/verzi nebo storno s důvodem.

Číselné řady TS/PP/MP/NO jsou samostatné pro každý rok data dokumentu.
Finální číslo se přiděluje až při vystavení transakčním čítačem.

`/protokoly/novy` umožňuje vybrat prostředky a doplnit položkové údaje,
kontakty, plánované/skutečné datum a relevantní vazby. Odkazy z prostředku,
kontroly, závady nebo servisního případu předvyplňují známá data.

Předání a vrácení jsou samostatné skutečné události. Potvrzení předání mění
stav/umístění, u více položek je možné vracet prostředky postupně. Dvojímu
aktivnímu předání brání databázový unikátní index. Návrat ze servisu nepřepíná
prostředek automaticky do provozu.

`/zavady` a `/zavady/[id]` zobrazují servisní průběh, rozhodnutí, termíny,
dodavatele, náklady, dokumentaci a historii. Každá změna stavu je validovaná.
Návrh čeká na samostatně oprávněnou schvalující osobu; vlastní návrh nelze
schválit. Nová verze zachovává předchozí rozhodnutí i původní PDF.
Překročený finanční limit vyžaduje dodatečné schválení novou verzí návrhu.
Částky jsou Decimal, skutečný náklad se eviduje jednou na servisním případu.

Návrat do provozu vyžaduje: vyřešené závady, servisní zprávu, kontrolu fyzicky
provedenou po opravě, oprávnění/kvalifikaci potvrzující osoby, žádné aktivní
předání ani další blokující povinnosti/opravy. Běžná editace nemůže obejít
aktivní servisní blokace.

## Oprávnění a nastavení

Na `/administrace/opravneni` ADMIN jednotlivě přiděluje provozní pravomoci.
`repair:approve` nemá žádná role automaticky. Pro práci s dokumentem přidělit
také `protocol:read`; stažení vyžaduje `protocol:download`. Finance mají
samostatné `repair:costs_read` a `repair:costs_edit`.

`/dodavatele` eviduje servisní organizace a kontakty. PDF používá kontaktní
snapshot v době vystavení. `/administrace/provozni-nastaveni` nastavuje
intervaly upozornění a zobrazování grafického razítka.

Šablony jsou pracovními formuláři Technické služby, nikoli automaticky
schválenými oficiálními vzory ČEPRO. Elektronické potvrzení v aplikaci ani
grafické razítko není kvalifikovaným elektronickým podpisem.

## PDF a fotografie

Nové hlavní PDF mají právě jednu portrétní A4. Delší údaje a fotografie jsou
v samostatné označené příloze A se stejným číslem dokumentu. Povinný obsah se
neořezává a nepřetéká pod podpisy. Náhled je označen NÁVRH – NEVYSTAVENO,
stornovaná kopie STORNOVÁNO. Schvalovací doložka je samostatná navazující kopie.

Fotografie lze nahrát nebo pořídit telefonem. PDF/JPEG/PNG/WebP do 20 MB,
fotografie nejvýše 25 megapixelů. Metadata a SHA-256 jsou v PostgreSQL,
obsah v privátním S3. Stahování `/api/prilohy/[id]` kontroluje relaci,
organizaci a oprávnění; S3 URL má krátkou platnost. Fotografie v příloze PDF
se načítají serverově. Přílohy při vystavení jsou součástí neměnného manifestu;
pozdější soubory patří k navazující dokumentaci a nepřepisují původní protokol.

## Dashboard, kalendář a ekonomická evidence

Dashboard rozšiřují skutečné počty stavů prostředků, schvalování, opravy a
vrácení po termínu, kontrola po opravě a náklady podle měny. Odkazy vedou na
filtrované seznamy. `/kalendar` rozlišuje povinnost, revizi, plánovanou kontrolu,
předání, vrácení a opravu.

`/zavady/statistiky` filtruje období, prostředek, vozidlo, kategorii, servis
a měnu. Náklady různých měn se nezobrazují jako jeden finanční součet.
CSV export je autentizovaný a chrání před tabulkovými vzorci.

## Railway Cron – upozornění

Samostatná služba `TSHZS-reminders` ve stejném Railway projektu používá stejný
repozitář a větev `main`. Nastavení jsou přímo na této Railway službě.
Nemá veřejnou doménu ani novou databázi.

1. Railpack nainstaluje závislosti a spustí `npm run db:generate && npm run build`.
2. Start command je `npm run reminders`.
3. `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `TZ=Europe/Prague`.
4. Cron `0 * * * *` (UTC, každou hodinu), restart policy NEVER.
5. Pre-deploy a healthcheck této cron služby nejsou potřeba; migrace spouští web.

Úloha porovnává kalendářní dny v Praze, standardně 30/14/7/3/1/0 dní a po
termínu. Jedinečný klíč příjemce + událost + termín + interval zabraňuje
duplikátům. Vytváří upozornění k povinnostem, opravám, vrácení, schvalování,
rozhodnutím a kritickým závadám. `/upozorneni` umožňuje označení jako přečtené;
zvonek zobrazuje počet nepřečtených. Externí e-mail není bez konfigurace odesílán.

## Ověření

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
Integrační testy se spouští jen s `TEST_DATABASE_URL` i `DATABASE_URL` ukazujícími
na oddělený testovací PostgreSQL `tshzs_test`; automatické spuštění nad produkcí
je zakázané. Unit/PDF testy databázi nevyžadují. `PDF_QA=1` uloží anonymní
regresní dokumenty do ignorovaného `tmp/pdfs/` pro vizuální kontrolu.
Testovací databáze ani kontejnery nejsou podmínkou produkčního běhu.

Migrace `20261125100000_operational_history_guards` chrání položky vystavených
dokumentů, historii oprav a původní přílohy. Nikdy nepoužívat `db push` nebo
`migrate reset` pro produkci. Stávající UID, kontroly a čísla protokolů se nemění.

## Obnova a bezpečnost

Dne 25. 11. 2026 uživatel výslovně požádal o nasazení bez zálohy. Tím nebyla
záloha vytvořena. Dostupná Railway záloha se obnovuje přes Postgres → Backups;
logický dump přes `pg_restore` po ověření v odděleném prostředí. Obnova databáze
a souborů musí být konzistentní. Secrets a produkční dokumenty nikdy necommitovat.
