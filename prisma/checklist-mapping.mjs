const externalProvider =
  /extern|výrobce|servis|revizní technik|odborně způsobilá osoba/i;

export function checklistKeyForRule({ targetKey, name, performedBy, type }) {
  if (type !== "INSPECTION" || externalProvider.test(performedBy ?? ""))
    return null;
  if (targetKey === "LADDER") return "ladder";
  if (["LIFTING_BAG", "PIPE_PLUG", "SEALING_BAG"].includes(targetKey))
    return "bag";
  if (targetKey === "FIRE_PUMP")
    return name.includes("sání")
      ? "pump-suction"
      : name.includes("nejvyšší")
        ? "pump-pressure"
        : "pump-weekly";
  if (targetKey === "THERMAL_CAMERA")
    return name.includes("Denní")
      ? "thermal-daily"
      : name.includes("Týdenní")
        ? "thermal-weekly"
        : "thermal-monthly";
  return (
    {
      SUCTION_HOSE: "suction-hose",
      HEIGHT_WORK: "height",
      BOAT_ENGINE: "boat-engine",
      FIREFIGHTER_PPE: "ppe",
      HELMET: "helmet",
      AED: "aed",
      COMPRESSOR: "compressor",
      COMPRESSOR_ASTRA: "compressor",
      COMPRESSOR_TRIDENT: "compressor",
      WATER_RESCUE: "water-rescue",
    }[targetKey] ?? "general-ts"
  );
}

export function isExternalInspection(performedBy) {
  return externalProvider.test(performedBy ?? "");
}

export function ruleVersionStrategy({
  currentChecklistId,
  desiredChecklistId,
  historicallyUsed,
  safeVersionExists,
}) {
  if (currentChecklistId === desiredChecklistId) return "KEEP";
  if (safeVersionExists) return "REUSE_VERSION";
  return historicallyUsed ? "CREATE_VERSION" : "UPDATE_UNUSED";
}
