import "server-only";
import { LocalStorageProvider } from "./local";
import { S3StorageProvider } from "./s3";
import type { StorageProvider } from "./types";

let instance: StorageProvider | undefined;

export function getStorage(): StorageProvider {
  if (instance) return instance;
  const provider = process.env.STORAGE_PROVIDER ?? (process.env.NODE_ENV === "production" ? "s3" : "local");
  if (process.env.NODE_ENV === "production" && provider === "local") throw new Error("Lokální úložiště nelze použít v produkci.");
  instance = provider === "s3" ? new S3StorageProvider() : new LocalStorageProvider();
  return instance;
}

export type { StorageProvider, StoreInput, StoredFile } from "./types";
