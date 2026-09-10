function requireProductionVariable(name: string) {
  if (!process.env[name]) throw new Error(`Chybí povinná produkční proměnná ${name}.`);
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build") return;
  requireProductionVariable("DATABASE_URL");
  requireProductionVariable("SESSION_SECRET");
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (/(@|\/\/)(localhost|127\.0\.0\.1)(:|\/)/i.test(databaseUrl)) {
    throw new Error("Produkční DATABASE_URL nesmí odkazovat na localhost.");
  }
  if ((process.env.STORAGE_PROVIDER ?? "s3") !== "s3") {
    throw new Error("Produkční prostředí vyžaduje S3 kompatibilní úložiště.");
  }
  for (const name of ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) {
    requireProductionVariable(name);
  }
}
