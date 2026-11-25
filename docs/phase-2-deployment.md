# Provozní protokoly – stav implementace a nasazení

## Implementovaný základ

Nové tabulky jsou oddělené od původních kontrolních protokolů. Migrace
`20261125090000_operational_protocols` přidává provozní dokumenty, položky,
předání, servisní případy, rozhodnutí, události, dodavatele, přímá oprávnění
a připravenou tabulku notifikací. Existující čísla, prostředky ani kontroly nemění.

Stránky:

- `/administrace/opravneni`: individuální přidělení a odebrání provozních pravomocí.
- `/protokoly/novy`: vytvoření návrhu nového dokumentu.
- `/protokoly/provozni/[id]`: úprava vlastního návrhu, vystavení, storno,
  potvrzení události, vrácení jednotlivých položek a schvalování návrhu.
- `/zavady`: skutečné otevřené závady a servisní případy.
- `/zavady/[id]`: stav a historie opravy, validované přechody stavů.

Žádná systémová role automaticky nezískává finanční schvalování. Před použitím
administrátor přidělí jednotlivé pravomoci na `/administrace/opravneni`.
Pro práci s návrhy je třeba také `protocol:read`; finanční rozhodnutí vyžaduje
`repair:approve` a odlišného autora a schvalující osobu.

Číslování PP/MP/NO používá původní transakční ProtocolCounter. Vystavené
dokumenty a finanční rozhodnutí chrání databázové triggery. Částečný unikátní
index brání dvěma aktivním předáním stejného prostředku.

## Ještě není dokončeno

Toto není kompletní fáze 2. Chybí nové PDF a jejich vizuální regresní testy,
integrační testy na skutečném PostgreSQL, přílohy a zabezpečené stahování,
evidence nákladů v UI, dodavatelé v UI, vracení návrhu jako nové verze,
ověřený návrat do provozu, dashboard, rozšíření kalendáře, cron a notifikace.
Tabulky a některé doménové validace pro tyto části jsou zatím pouze základem.
Podporované změny stavu při předání jsou zatím servis a zápůjčka.

## Produkční podmínka: ověřená záloha

Railway projekt: bubbly-insight, služba TSHZS, prostředí production.
Repozitář je napojený na main. Push na main spustí deploy a `npm run db:init`.
Ten použije `prisma migrate deploy` a idempotentní seed.

Dne 25. 11. 2026 bylo v Postgres → Backups ověřeno: žádné zálohy, vytváření
záloh vyžaduje Railway Pro. Před pushem vytvořit dokončenou zálohu (nebo
ověřený konzistentní `pg_dump` uložený mimo repozitář) a zaznamenat čas a ID.
Bez dostupné zálohy produkční migraci nespouštět.

Obnova snapshotu: zastavit provozní zápisy, v Postgres → Backups vybrat
ověřenou zálohu a Restore. Obnova vrací stav databáze k času zálohy; pozdější
zápisy mohou být ztraceny. Postup nejprve ověřit v odděleném prostředí.
U logické zálohy použít kompatibilní PostgreSQL `pg_restore` do izolované
databáze, ověřit data a teprve potom plánovat obnovu produkce.

Nové proměnné prostředí nejsou potřeba. Railway konfigurace, Dockerfile,
SESSION_SECRET, DATABASE_URL a storage zůstávají beze změny.
Docker daemon nebyl při lokálním ověření dostupný; image nebyl sestaven.
