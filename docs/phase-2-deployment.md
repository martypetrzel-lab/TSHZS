# Fáze 2 – nasazení na Railway

Produkce používá Railpack, žádný Dockerfile ani Docker Compose.
Web i samostatná plánovaná úloha mají nastavení přímo na Railway službách.
Nepoužívá se společný kořenový konfigurační soubor, který by přepsal cron příkaz.
Podrobný popis funkcí, oprávnění, PDF, testů a nastavení je v README.

Původní základ byl nasazen commitem `811bb50` a migrací
`20261125090000_operational_protocols`. Navazující migrace
`20261125100000_operational_history_guards` pouze přidává ochranné triggery.

Nové obrazovky: `/dodavatele`, `/upozorneni`, `/zavady/statistiky`,
`/administrace/provozni-nastaveni`. Doplněny jsou původní protokoly,
servisní případy, karta prostředku, kontrola, dashboard a kalendář.

Fotografie se ukládají do existujícího S3 storage a mohou být součástí PDF
přílohy A. Žádné produkční soubory ani skutečná testovací data nejsou v GitHubu.

Produkční souhlas bez zálohy byl udělen 25. 11. 2026. Neukládat tento souhlas
jako obecné vypnutí budoucích záloh; jde o pokyn pro toto nasazení.
