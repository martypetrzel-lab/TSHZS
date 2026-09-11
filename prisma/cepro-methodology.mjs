export const CEPRO_SOURCE = {
  seedKey: "cepro:01-hse-01-00-2015:v6r1",
  title:
    "Metodika provádění kontrol provozuschopnosti požární techniky a věcných prostředků požární ochrany",
  documentNumber: "Příloha č. 9 směrnice 01/HSE/01/00/2015",
  version: "V6R1",
  issuer: "ČEPRO, a.s.",
  effectiveFrom: new Date("2023-06-26T00:00:00.000Z"),
};

const rule = (
  targetKey,
  targetLabel,
  name,
  intervalValue,
  intervalUnit,
  performedBy,
  extra = {},
) => ({
  targetKey,
  targetLabel,
  name,
  intervalValue,
  intervalUnit,
  performedBy,
  type: "INSPECTION",
  trigger: "PERIODIC",
  ...extra,
});
const months = (key, label, name, value, by, extra) =>
  rule(key, label, name, value, "MONTHS", by, extra);
const weeks = (key, label, name, value, by, extra) =>
  rule(key, label, name, value, "WEEKS", by, extra);
const years = (key, label, name, value, by, extra) =>
  rule(key, label, name, value, "YEARS", by, extra);
const hours = (key, label, name, value, by) =>
  rule(key, label, name, value, "OPERATING_HOURS", by);

export const CEPRO_RULES = [
  months(
    "LADDER",
    "Nastavovací, vysunovací, hákové a sklopné žebříky",
    "Odborná kontrola",
    6,
    "technik TS",
    { article: "4.5" },
  ),
  years(
    "LADDER",
    "Nastavovací, vysunovací, hákové a sklopné žebříky",
    "Nedestruktivní zkouška žebříku",
    5,
    "výrobce",
    { article: "4.5", type: "VERIFICATION" },
  ),
  ...[
    "BEFORE_COMMISSIONING",
    "BEFORE_USE",
    "AFTER_USE",
    "AFTER_UNUSUAL_USE",
    "SHIFT_HANDOVER",
  ].map((trigger) =>
    rule(
      "LADDER",
      "Nastavovací, vysunovací, hákové a sklopné žebříky",
      "Kontrola žebříku při události",
      null,
      null,
      "uživatel",
      { article: "4.5", trigger },
    ),
  ),
  months("LIFTING_BAG", "Zvedací vak", "Odborná kontrola", 12, "technik TS"),
  months(
    "LIFTING_BAG",
    "Zvedací vak",
    "Revize",
    60,
    "externí firma / výrobce / servisní organizace",
    { type: "REVISION" },
  ),
  months("PIPE_PLUG", "Potrubní ucpávka", "Kontrola", 12, "technik TS"),
  months("PIPE_PLUG", "Potrubní ucpávka", "Revize", 60, "externí firma", {
    type: "REVISION",
  }),
  months("SEALING_BAG", "Ucpávkový vak", "Kontrola", 12, "technik TS"),
  months("SEALING_BAG", "Ucpávkový vak", "Revize", 60, "externí firma", {
    type: "REVISION",
  }),
  months(
    "EXTINGUISHER",
    "Hasicí přístroj",
    "Revize",
    12,
    "odborně způsobilá osoba",
    { type: "REVISION" },
  ),
  months(
    "EXTINGUISHER",
    "Hasicí přístroj",
    "Tlaková zkouška",
    60,
    "odborně způsobilá osoba",
    { type: "VERIFICATION" },
  ),
  ...[
    ["SUCTION_HOSE", "Hadice sací"],
    ["PRESSURE_HOSE", "Hadice tlakové"],
    ["HAZMAT_HOSE", "Hadice na NL"],
  ].map(([k, l]) =>
    months(k, l, "Zkouška těsnosti", 12, "technik TS", {
      type: "VERIFICATION",
    }),
  ),
  ...[
    ["NOZZLE", "Proudnice"],
    ["RELIEF_VALVE", "Přetlakový ventil"],
    ["DIVIDER", "Rozdělovač"],
    ["HOSE_COLLECTOR", "Hadicový sběrač"],
    ["HYDRANT_ADAPTER", "Hydrantový nástavec"],
    ["VALVE_ROPE", "Lano ventilové/záchytné"],
    ["HOSE_HOLDER", "Hadicový držák"],
    ["MEDICAL_BAG", "Zdravotnické brašny / lékárničky"],
    ["STRETCHER", "Záchranná a evakuační nosítka"],
    ["WATER_BARRIER", "Vzdouvací přepážka"],
    ["OIL_BOOM", "Norné stěny"],
  ].map(([k, l]) => months(k, l, "Kontrola", 12, "technik TS")),
  months(
    "PORTABLE_EDUCTOR",
    "Přenosný přiměšovač",
    "Kontrola",
    6,
    "technik TS",
  ),
  months("LIGHT", "Světlomet a stativ / svítilna", "Kontrola", 1, "technik TS"),
  weeks(
    "FIRE_PUMP",
    "Požární čerpadlo",
    "Zkouška základní funkčnosti",
    1,
    "technik STS",
  ),
  months(
    "FIRE_PUMP",
    "Požární čerpadlo",
    "Zkouška sání a těsnosti",
    3,
    "technik STS",
    { type: "VERIFICATION" },
  ),
  months(
    "FIRE_PUMP",
    "Požární čerpadlo",
    "Zkouška nejvyššího tlaku",
    12,
    "technik STS",
    { type: "VERIFICATION" },
  ),
  ...["ON_DOUBT", "AFTER_REPAIR"].map((trigger) =>
    rule(
      "SUCTION_HOSE",
      "Sací požární hadice",
      "Zkouška těsnosti při události",
      null,
      null,
      "technik TS",
      { type: "VERIFICATION", trigger },
    ),
  ),
  months(
    "WATER_RESCUE",
    "Prostředky pro práci na vodě a zamrzlých hladinách",
    "Odborná kontrola",
    12,
    "technik TS",
  ),
  rule(
    "WATER_RESCUE",
    "Prostředky pro práci na vodě a zamrzlých hladinách",
    "Kontrola při střídání směn",
    null,
    null,
    "uživatel",
    { trigger: "SHIFT_HANDOVER" },
  ),
  months(
    "HEIGHT_WORK",
    "Prostředky pro práci ve výškách a nad volnou hloubkou",
    "Odborná kontrola",
    12,
    "technik TS",
  ),
  weeks("BOAT_ENGINE", "Lodní motor", "Týdenní kontrola", 1, "technik STS"),
  months("BOAT_ENGINE", "Lodní motor", "Zkouška funkčnosti", 3, "technik STS", {
    type: "VERIFICATION",
    note: "Nejméně 5 minut; při stavu WINTERIZED pouze kontrola akumulátoru.",
  }),
  years(
    "FIREFIGHTER_PPE",
    "Osobní ochranné prostředky pro hasiče",
    "Odborná kontrola",
    2,
    "odborně způsobilá osoba",
  ),
  years(
    "HELMET",
    "Přilba zásahová / technická",
    "Odborná kontrola",
    2,
    "odborně způsobilá osoba",
  ),
  years(
    "MLV011",
    "MLV011",
    "Odborná kontrola",
    1,
    "výrobce / pověřená servisní organizace",
  ),
  years("MULTITEST_PLUS", "Multitest plus", "Kontrola", 2, "technik"),
  years("MULTITEST_PLUS", "Multitest plus", "Kontrola u výrobce", 6, "výrobce"),
  years("MEDICABINET_51018", "Mediskříňka typ 51018", "Kontrola", 2, "technik"),
  hours("COMPRESSOR", "Kompresor", "Kontrola/doplnění oleje", 10, "obsluha"),
  hours(
    "COMPRESSOR",
    "Kompresor",
    "Výměna aktivního uhlí a silikagelu",
    10,
    "technik",
  ),
  hours("COMPRESSOR", "Kompresor", "Výměna molekulového síta", 20, "technik"),
  hours("COMPRESSOR", "Kompresor", "Výměna vzduchového filtru", 100, "technik"),
  hours("COMPRESSOR_ASTRA", "Kompresor Astra", "Výměna oleje", 100, "technik"),
  hours(
    "COMPRESSOR_TRIDENT",
    "Kompresor Trident",
    "Výměna oleje",
    200,
    "technik",
  ),
  ...["Elektroinstalace", "Kvalita vzduchu", "Výkon kompresoru"].map((name) =>
    years("COMPRESSOR", "Kompresor", name, 1, "odborně způsobilá osoba"),
  ),
  weeks("AED", "AED", "Ruční odborná kontrola", 1, "technik"),
  rule(
    "AED",
    "AED",
    "Potvrzení automatického self-testu",
    1,
    "DAYS",
    "automatický self-test",
    {
      type: "VERIFICATION",
      note: "Nevyžaduje ruční potvrzení každých 24 hodin.",
    },
  ),
  rule(
    "THERMAL_CAMERA",
    "Termokamera",
    "Denní kontrola při převzetí",
    1,
    "DAYS",
    "uživatel",
  ),
  weeks("THERMAL_CAMERA", "Termokamera", "Týdenní kontrola", 1, "technik"),
  months("THERMAL_CAMERA", "Termokamera", "Měsíční kontrola", 1, "technik"),
  months("CHAINSAW", "Motorová řetězová pila", "Kontrola", 6, "instruktor MŘP"),
  months(
    "CUT_OFF_SAW",
    "Motorová rozbrušovací pila",
    "Kontrola",
    6,
    "instruktor MŘP",
  ),
  ...[
    ["GENERATOR", "Elektrocentrála"],
    ["PORTABLE_PUMP", "Přenosná motorová stříkačka"],
    ["FLOATING_PUMP", "Plovoucí motorové čerpadlo"],
    ["HIGH_PRESSURE_EXTINGUISHING", "Vysokotlaké hasicí zařízení"],
    ["PORTABLE_FOAM_UNIT", "Přenosný pěnomet"],
    ["HAZMAT_PUMP", "Čerpadlo na NL"],
    ["OIL_SEPARATOR", "Odlučovač ropných látek"],
    ["HYDRAULIC_RESCUE", "Hydraulické vyprošťovací zařízení"],
    ["POSITIVE_PRESSURE_FAN", "Přetlakový ventilátor"],
    ["SMOKE_EXTRACTOR", "Odsavač kouře"],
  ].map(([k, l]) => weeks(k, l, "Kontrola", 1, "technik STS")),
  months(
    "GENERATOR",
    "Elektrocentrála",
    "Elektrorevize",
    12,
    "revizní technik elektro",
    { type: "REVISION" },
  ),
  ...[
    [
      "BREATHING_APPARATUS",
      "Dýchací přístroj",
      "Statická/dynamická zkouška",
      12,
      "externí firma",
    ],
    [
      "BREATHING_APPARATUS",
      "Dýchací přístroj",
      "Statická zkouška",
      12,
      "technik CHS",
    ],
    [
      "RESUSCITATOR",
      "Křísící přístroj",
      "Statická/dynamická zkouška",
      12,
      "externí firma",
    ],
    ["RESUSCITATOR", "Křísící přístroj", "Kontrola", 12, "technik CHS"],
    [
      "COMPOSITE_CYLINDER",
      "Tlakové lahve kompozitní",
      "Tlaková zkouška",
      60,
      "externí firma",
    ],
    [
      "STEEL_CYLINDER",
      "Tlakové lahve ocelové",
      "Tlaková zkouška",
      60,
      "externí firma",
    ],
    ["CYLINDER", "Tlakové lahve", "Výměna provozního média", 12, "technik CHS"],
    ["FACE_MASK", "Obličejová maska", "Kontrola externí", 12, "externí firma"],
    ["FACE_MASK", "Obličejová maska", "Kontrola interní", 12, "technik CHS"],
    ["ESCAPE_HOOD", "Vyváděcí kukla", "Kontrola", 6, "technik CHS"],
    ["DEAD_MAN_ALARM", "Mrtvý muž", "Kontrola", 6, "technik CHS"],
    ["DETECTOR", "Detektor", "Kalibrace", 6, "externí firma"],
    [
      "CHEMICAL_SUIT",
      "Protichemické oděvy",
      "Provozní kontrola",
      6,
      "technik CHS",
    ],
    [
      "CHEMICAL_SUIT",
      "Protichemické oděvy",
      "Přetlaková tlaková kontrola",
      12,
      "technik CHS",
    ],
    [
      "RADIANT_HEAT_SUIT",
      "Oděvy proti sálavému teplu",
      "Kontrola",
      6,
      "technik CHS",
    ],
    [
      "FILLING_DEVICE",
      "Plnící zařízení",
      "Provozní kontrola",
      12,
      "externí firma",
    ],
    [
      "HAZMAT_PUMP",
      "Čerpadlo na NL ruční a elektrické",
      "Kontrola",
      6,
      "technik CHS",
    ],
    [
      "ELECTRIC_HAZMAT_PUMP",
      "Čerpadlo na NL elektrické",
      "Revize",
      12,
      "externí firma",
    ],
  ].map(([k, l, n, v, by]) =>
    months(k, l, n, v, by, {
      type: n.includes("Revize")
        ? "REVISION"
        : n.includes("Kalibrace")
          ? "CALIBRATION"
          : "INSPECTION",
    }),
  ),
  rule("DETECTOR", "Detektor", "Uživatelská kontrola", 14, "DAYS", "uživatel"),
];

export const EVENT_TRIGGERS = [
  "BEFORE_COMMISSIONING",
  "BEFORE_USE",
  "AFTER_USE",
  "AFTER_UNUSUAL_USE",
  "AFTER_REPAIR",
  "AFTER_REVISION",
  "SHIFT_HANDOVER",
  "ON_DOUBT",
  "ON_BROKEN_SEAL",
];

export const CEPRO_CHECKLISTS = [
  [
    "ladder",
    "Žebřík",
    [
      "Celistvost nosných částí",
      "Příčle a spoje",
      "Aretace a výsuv",
      "Patky a opěrné prvky",
    ],
  ],
  [
    "bag",
    "Zvedací a těsnicí vaky",
    [
      "Redukční ventil",
      "Hadice a spojky",
      "Ovládací zařízení",
      "Povrch vaků",
      "Těsnost systému",
      "Tlakoměry",
      "Zkouška systému při stanoveném tlaku",
      "Pojistný ventil",
    ],
  ],
  [
    "pump-weekly",
    "Požární čerpadlo – týdenní",
    ["Základní funkčnost", "Mazání a provozní náplně", "Ovládací prvky"],
  ],
  [
    "pump-suction",
    "Požární čerpadlo – sání a těsnost",
    [
      "Podtlak 0,08 MPa dosažen nejdéle do 30 s",
      "Pokles podtlaku během 60 s nejvýše 0,01 MPa",
    ],
  ],
  [
    "pump-pressure",
    "Požární čerpadlo – nejvyšší tlak",
    [
      "Naměřený nejvyšší tlak dle metodiky, typu nebo přísnějšího požadavku výrobce",
    ],
  ],
  [
    "suction-hose",
    "Sací požární hadice",
    [
      "Podtlak 0,07 MPa dosažen do 30 s",
      "Pokles za 1 min nejvýše 0,01 MPa",
      "Přetlaková zkouška 0,01–0,2 MPa, je-li předepsána",
    ],
  ],
  [
    "height",
    "Lana a postroje",
    [
      "Lana",
      "Pásy a postroje",
      "Ostatní textilní materiál",
      "Kovové součásti",
      "Pasport a evidenční označení",
    ],
  ],
  [
    "boat-engine",
    "Lodní motor",
    [
      "Doba funkční zkoušky nejméně 5 minut",
      "Akumulátor",
      "Stav zazimování a důvod neprovedení zkoušky",
    ],
  ],
  [
    "ppe",
    "Zásahový oděv a OOPP",
    ["Zásahový oděv", "Rukavice", "Kukla", "Obuv"],
  ],
  [
    "helmet",
    "Přilba",
    ["Skořepina", "Vnitřní výstroj", "Upínací systém", "Označení a životnost"],
  ],
  [
    "aed",
    "AED",
    [
      "Znečištění",
      "Mechanické poškození",
      "Displej",
      "Servisní symbol",
      "OK symbol",
      "Stav baterie",
      "Stav elektrod",
      "Expirace elektrod",
      "Stav pomůcek",
    ],
  ],
  [
    "thermal-camera",
    "Termokamera",
    [
      "Funkce přístroje",
      "Baterie",
      "Nastavení zobrazení",
      "Záznam do provozního deníku",
    ],
  ],
  [
    "compressor",
    "Kompresor",
    [
      "Stav oleje",
      "Filtrační náplně",
      "Vzduchový filtr",
      "Elektroinstalace",
      "Kvalita vzduchu",
      "Výkon kompresoru",
      "Zápis do provozního deníku",
    ],
  ],
  [
    "water-rescue",
    "Prostředky pro práci na vodě",
    [
      "Uložení a upevnění",
      "Házecí pytlík / záchranný prostředek",
      "Ochranný oděv a přilba",
      "Plovací vesta",
      "Plavidlo",
      "Tlak nafukovacího plavidla",
    ],
  ],
];

const pf = (label, extra = {}) => ({
  label,
  responseType: "PASS_FAIL",
  required: true,
  failRequiresNote: true,
  failCreatesDefect: true,
  ...extra,
});
const measure = (label, unit, options = {}) => ({
  label,
  responseType: "MEASUREMENT",
  unit,
  required: true,
  optionsJson: options,
  failRequiresNote: false,
});
const section = (title, items, conditionJson) => ({
  title,
  items,
  conditionJson,
});

export const CEPRO_DETAILED_CHECKLISTS = {
  ladder: [
    section(
      "Prohlídka",
      [
        "Uchycení všech příčlí",
        "Pevnost uchycení všech šroubů a nýtů",
        "Neporušenost svarů",
        "Trhliny",
        "Rozštípnutí",
        "Lomy",
        "Deformace",
        "Prohloubeniny příčlí a štěřin",
        "Stav protiskluzových patek",
        "Zřetelnost a čitelnost označení",
      ].map((x) =>
        pf(x, { critical: ["Trhliny", "Lomy", "Deformace"].includes(x) }),
      ),
    ),
    section(
      "Funkčnost",
      [
        "Spojení nastavovacích dílů",
        "Díly do sebe snadno zapadají",
        "Funkčnost západek",
        "Díly se při zkoušce nesmí rozpojit",
      ].map((x) => pf(x, { critical: x.includes("nesmí rozpojit") })),
    ),
    section("Identifikace", [
      pf("Ověřeno výrobní / evidenční číslo", { critical: true }),
    ]),
  ],
  bag: [
    section(
      "Prohlídka",
      [
        "Redukční ventil",
        "Závit ventilu",
        "O-kroužek",
        "Hadice",
        "Spojky",
        "Ovládací zařízení",
        "Ovládací prvky",
        "Povrch vaků",
        "Označená poškození",
      ].map((x) => pf(x, { critical: true })),
    ),
    section(
      "Funkční zkouška",
      [
        "Těsnost spojení",
        "Funkce tlakoměrů redukčního ventilu",
        "Funkce tlakoměrů ovládacího zařízení",
        "Systém sestaven správně",
        "Tlak 1/10 přípustného tlaku",
        "Kontrola nejméně 1 min",
        "Tlak 1/2 přípustného tlaku",
        "Kontrola těsnosti",
        "Pojistný ventil",
        "Činnost pojistného ventilu podle výrobce",
      ].map((x) => pf(x, { critical: true })),
      { stopWhenPreviousSectionFailed: true },
    ),
  ],
  "suction-hose": [
    section(
      "Prohlídka",
      ["Vizuální stav", "Mechanické poškození", "Sací šroubení"].map((x) =>
        pf(x),
      ),
    ),
    section("Měření podtlaku", [
      measure("Dosažený podtlak", "MPa", { targetMin: 0.07 }),
      measure("Čas dosažení", "s", { max: 30 }),
      measure("Pokles podtlaku za 1 min", "MPa", { max: 0.01 }),
    ]),
    section(
      "Přetlaková zkouška",
      [
        measure("Zkušební přetlak", "MPa", { min: 0.01, max: 0.2 }),
        measure("Doba zkoušky", "min", { min: 1 }),
        pf("Těsnost"),
      ],
      { showWhenAnyFailed: true },
    ),
  ],
  "pump-weekly": [
    section("Týdenní – základní funkčnost", [
      pf("Základní funkčnost", { critical: true }),
      pf("Mazání a provozní náplně"),
      pf("Ovládací prvky"),
    ]),
  ],
  "pump-suction": [
    section("3 měsíce – sání a těsnost", [
      measure("Dosažený podtlak", "MPa", { targetMin: 0.08 }),
      measure("Dosažen do", "s", { max: 30 }),
      measure("Pokles během 60 s", "MPa", { max: 0.01 }),
    ]),
  ],
  "pump-pressure": [
    section("12 měsíců – nejvyšší tlak", [
      measure("Naměřený nejvyšší tlak", "MPa"),
      pf("Tlak odpovídá metodice, typu nebo přísnějšímu požadavku výrobce", {
        critical: true,
      }),
    ]),
  ],
  aed: [
    section(
      "Týdenní kontrola AED",
      [
        "Znečištění",
        "Mechanické poškození",
        "Displej",
        "Symbol OK",
        "Stav baterie",
        "Stav elektrod",
        "Expirace elektrod",
        "Pomůcky",
      ].map((x) => pf(x)),
      {},
    ),
    section("Servisní stav", [
      {
        label: "Servisní symbol je zobrazen",
        responseType: "BOOLEAN",
        required: true,
        critical: true,
        failRequiresNote: true,
        failCreatesDefect: true,
        optionsJson: { failWhen: true },
      },
    ]),
  ],
  "thermal-daily": [
    section(
      "Denní kontrola",
      ["Celistvost", "Úplnost", "Viditelné poškození", "Správné uložení"].map(
        (x) => pf(x),
      ),
    ),
  ],
  "thermal-weekly": [
    section(
      "Týdenní kontrola",
      [
        "Celistvost",
        "Úplnost",
        "Viditelné poškození",
        "Správné uložení",
        "Stav baterie",
      ].map((x) => pf(x)),
    ),
  ],
  "thermal-monthly": [
    section(
      "Měsíční kontrola",
      [
        "Celistvost",
        "Úplnost",
        "Viditelné poškození",
        "Správné uložení",
        "Stav baterie",
        "Funkční zkouška nastavení zobrazení",
      ].map((x) => pf(x)),
    ),
  ],
  "general-ts": [
    section(
      "Obecná odborná kontrola",
      [
        "Identifikace prostředku",
        "Celistvost",
        "Úplnost",
        "Viditelné poškození",
        "Funkčnost",
        "Označení",
      ]
        .map((x) => pf(x))
        .concat([
          { label: "Poznámka", responseType: "TEXTAREA", required: false },
        ]),
    ),
  ],
};
