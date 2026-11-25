import { PrismaClient } from "@prisma/client";
import { generateOperationalReminders } from "./operational-reminders.mjs";
const db = new PrismaClient();
try {
  console.info("TSHZS REMINDERS START");
  console.info("Created:", await generateOperationalReminders(db));
  console.info("TSHZS REMINDERS DONE");
} catch (error) {
  console.error("TSHZS reminders failed", error);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
