import { randomBytes } from "node:crypto";

export function createReadableId(prefix: "UID" | "PROT") {
  return `${prefix}-${randomBytes(4).toString("hex").toUpperCase()}`;
}
