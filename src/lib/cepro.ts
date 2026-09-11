const hints: Array<[string, string[]]> = [
  ["LADDER", ["žebřík", "žebříky"]],
  ["LIFTING_BAG", ["zvedací vak"]],
  ["PIPE_PLUG", ["potrubní ucpáv"]],
  ["SEALING_BAG", ["ucpávkový vak"]],
  ["AED", ["aed", "defibrilátor"]],
  ["THERMAL_CAMERA", ["termokamer"]],
  ["FIRE_PUMP", ["požární čerpad", "motorová stříkačka"]],
  ["SUCTION_HOSE", ["sací hadic"]],
  ["COMPRESSOR_ASTRA", ["kompresor astra"]],
  ["COMPRESSOR_TRIDENT", ["kompresor trident"]],
  ["COMPRESSOR", ["kompresor"]],
  ["BOAT_ENGINE", ["lodní motor"]],
  ["CHAINSAW", ["řetězová pila"]],
  ["CUT_OFF_SAW", ["rozbrušovací pila"]],
  ["GENERATOR", ["elektrocentrál"]],
  ["DETECTOR", ["detektor"]],
  ["BREATHING_APPARATUS", ["dýchací přístroj"]],
  ["FACE_MASK", ["obličejová maska"]],
  ["HELMET", ["přilba"]],
  ["WATER_RESCUE", ["plovací vest", "házecí pytl", "plavidl"]],
];

export function suggestCeproTarget(name: string, typeName?: string | null) {
  const haystack = `${name} ${typeName ?? ""}`.toLocaleLowerCase("cs");
  return (
    hints.find(([, words]) =>
      words.some((word) => haystack.includes(word)),
    )?.[0] ?? null
  );
}

export function intervalLabel(
  value: number | null,
  unit: string | null,
  trigger = "PERIODIC",
) {
  if (trigger !== "PERIODIC") return "Při události";
  if (value == null || !unit) return "Vyžaduje doplnění";
  const labels: Record<string, string> = {
    DAYS: "dní",
    WEEKS: "týdnů",
    MONTHS: "měsíců",
    YEARS: "let",
    OPERATING_HOURS: "motohodin",
    USAGE_COUNT: "použití",
  };
  return `${value} ${labels[unit] ?? unit}`;
}
