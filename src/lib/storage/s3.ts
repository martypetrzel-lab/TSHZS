import "server-only";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageProvider, StoreInput } from "./types";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Chybí povinná proměnná ${name}.`);
  return value;
}

export class S3StorageProvider implements StorageProvider {
  private readonly bucket = required("S3_BUCKET");
  private readonly client = new S3Client({
    endpoint: required("S3_ENDPOINT"),
    region: process.env.S3_REGION || "auto",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: required("S3_ACCESS_KEY_ID"), secretAccessKey: required("S3_SECRET_ACCESS_KEY") },
  });

  async put(input: StoreInput) {
    const extension = path.extname(input.fileName).toLowerCase().replace(/[^a-z0-9.]/g, "");
    const storageKey = `${input.namespace}/${randomUUID()}${extension}`;
    const checksumSha256 = createHash("sha256").update(input.body).digest("hex");
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: storageKey, Body: input.body, ContentType: input.mimeType, Metadata: { checksumSha256 } }));
    return { storageKey, checksumSha256, sizeBytes: input.body.byteLength };
  }

  getDownloadUrl(storageKey: string, expiresInSeconds = 300) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }), { expiresIn: expiresInSeconds });
  }

  async delete(storageKey: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
  }
}
