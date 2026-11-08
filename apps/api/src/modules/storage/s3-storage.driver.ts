import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { AppEnv } from "../../config/env";
import type { DownloadOptions, DownloadTarget, StorageDriver, UploadTarget } from "./storage-driver.interface";

const UPLOAD_URL_TTL_SECONDS = 15 * 60;
/** Short-lived on purpose (spec: "signed download/view URLs... expiry") — a medical document's link must not remain valid indefinitely. */
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

@Injectable()
export class S3StorageDriver implements StorageDriver {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService<AppEnv, true>) {
    this.bucket = this.config.get("STORAGE_S3_BUCKET", { infer: true }) ?? "petlife-dev";
    this.client = new S3Client({
      region: this.config.get("STORAGE_S3_REGION", { infer: true }) ?? "us-east-1",
      endpoint: this.config.get("STORAGE_S3_ENDPOINT", { infer: true }),
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.config.get("STORAGE_S3_ACCESS_KEY_ID", { infer: true }) ?? "",
        secretAccessKey: this.config.get("STORAGE_S3_SECRET_ACCESS_KEY", { infer: true }) ?? "",
      },
    });
  }

  async createUploadTarget(key: string, contentType: string, maxBytes?: number): Promise<UploadTarget> {
    // A presigned PUT signs Content-Length, so S3 itself refuses a body of any other size.
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType, ContentLength: maxBytes });
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });

    return {
      uploadUrl,
      method: "PUT",
      publicUrl: `${this.config.get("STORAGE_PUBLIC_BASE_URL", { infer: true })}/${key}`,
      headers: { "Content-Type": contentType },
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    };
  }

  async createDownloadTarget(key: string, options?: DownloadOptions): Promise<DownloadTarget> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(options?.filename ? { ResponseContentDisposition: `attachment; filename="${options.filename}"` } : {}),
      ...(options?.contentType ? { ResponseContentType: options.contentType } : {}),
    });
    const downloadUrl = await getSignedUrl(this.client, command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
    return { downloadUrl, expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS };
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async copyObject(sourceKey: string, destinationKey: string, contentType: string): Promise<void> {
    const copySource = `/${this.bucket}/${sourceKey.split("/").map(encodeURIComponent).join("/")}`;
    await this.client.send(new CopyObjectCommand({
      Bucket: this.bucket,
      Key: destinationKey,
      CopySource: copySource,
      MetadataDirective: "REPLACE",
      ContentType: contentType,
      CacheControl: "no-store",
    }));
  }

  async openObject(key: string) {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body || !("pipe" in result.Body)) throw new Error("Storage object is not a readable stream");
    return { body: result.Body as import("node:stream").Readable, contentType: result.ContentType };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
