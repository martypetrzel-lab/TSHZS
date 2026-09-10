export type StoredFile = {
  storageKey: string;
  checksumSha256: string;
  sizeBytes: number;
};

export type StoreInput = {
  body: Uint8Array;
  fileName: string;
  mimeType: string;
  namespace: string;
};

export interface StorageProvider {
  put(input: StoreInput): Promise<StoredFile>;
  getDownloadUrl(storageKey: string, expiresInSeconds?: number): Promise<string>;
  delete(storageKey: string): Promise<void>;
}
