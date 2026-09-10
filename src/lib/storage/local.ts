import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageProvider, StoreInput } from "./types";

export class LocalStorageProvider implements StorageProvider {
  private readonly root = path.resolve(process.env.LOCAL_STORAGE_PATH ?? "./storage");

  async put(input: StoreInput) {
    const extension = path.extname(input.fileName).toLowerCase().replace(/[^a-z0-9.]/g, "");
    const storageKey = `${input.namespace}/${randomUUID()}${extension}`;
    const destination = path.resolve(this.root, storageKey);
    if (!destination.startsWith(`${this.root}${path.sep}`)) throw new Error("Neplatný klíč úložiště.");
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, input.body);
    return { storageKey, sizeBytes: input.body.byteLength, checksumSha256: createHash("sha256").update(input.body).digest("hex") };
  }

  async getDownloadUrl(storageKey: string) {
    return `/api/soubory/${encodeURIComponent(storageKey)}`;
  }

  async delete(storageKey: string) {
    const destination = path.resolve(this.root, storageKey);
    if (!destination.startsWith(`${this.root}${path.sep}`)) throw new Error("Neplatný klíč úložiště.");
    await rm(destination, { force: true });
  }
}
