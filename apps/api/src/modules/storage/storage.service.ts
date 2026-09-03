import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DocumentTooLargeException, UnsupportedDocumentTypeException } from "../../common/errors/api-exception";
import { DownloadTarget, STORAGE_DRIVER, type StorageDriver, type UploadTarget } from "./storage-driver.interface";

/** Handoff 17: allow-listed MIME types for a medical document — a narrow, explicit set, never "anything the client sends". */
const HEALTH_DOCUMENT_MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const HEALTH_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024; // 20MB

/** A looser allow-list for owner photo/video observations — still explicit, never arbitrary. */
const OBSERVATION_MEDIA_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};
const OBSERVATION_MEDIA_MAX_BYTES = 50 * 1024 * 1024; // 50MB

@Injectable()
export class StorageService {
  constructor(@Inject(STORAGE_DRIVER) private readonly driver: StorageDriver) {}

  async createPetPhotoUploadTarget(petId: string, contentType: string): Promise<UploadTarget> {
    const extension = contentType === "image/png" ? "png" : "jpg";
    const key = `pets/${petId}/${randomUUID()}.${extension}`;
    return this.driver.createUploadTarget(key, contentType);
  }

  /**
   * Handoff 17: medical documents live under a PRIVATE key prefix
   * (`health-documents/...`, never `pets/...`'s public-URL scheme) — see the
   * locked principle "private medical documents must never be publicly
   * exposed". Validates MIME type and size before minting anything, per
   * spec: "MIME validation, upload size limits, safe filename handling."
   * The caller is responsible for authorization (canEditHealth/
   * canRecordClinicalData) BEFORE calling this — this method only validates
   * the file itself.
   */
  async createHealthDocumentUploadTarget(petId: string, contentType: string, fileSizeBytes: number): Promise<UploadTarget & { key: string }> {
    const extension = HEALTH_DOCUMENT_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > HEALTH_DOCUMENT_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: HEALTH_DOCUMENT_MAX_BYTES });
    }
    // randomUUID() as the filename — never the client-supplied original name — sidesteps path traversal / unsafe-filename concerns entirely.
    const key = `health-documents/${petId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType);
    return { ...target, key };
  }

  /** Owner photo/video observations — same private-storage treatment as medical documents, under their own key prefix. */
  async createObservationMediaUploadTarget(petId: string, contentType: string, fileSizeBytes: number): Promise<UploadTarget & { key: string }> {
    const extension = OBSERVATION_MEDIA_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > OBSERVATION_MEDIA_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: OBSERVATION_MEDIA_MAX_BYTES });
    }
    const key = `pet-observations/${petId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType);
    return { ...target, key };
  }

  /**
   * Mints a short-TTL signed download URL for a private key. The CALLER must
   * already have verified the requester is authorized to view the
   * underlying record before calling this — this method performs no
   * authorization of its own, it only knows how to sign a URL.
   */
  async createPrivateDownloadTarget(key: string): Promise<DownloadTarget> {
    return this.driver.createDownloadTarget(key);
  }

  /** A completely separate key namespace (`cms/media/...`) from `pets/...` — spec: "strongly separate CMS media authorization from private pet documents." CMS media is meant to be public (blog images), so this uses the same plain-public-URL delivery `createPetPhotoUploadTarget` already established, never a signed-read scheme this codebase has no other precedent for. Returns `key` alongside the target (unlike the pet-photo variant) since the CMS confirm step needs it verbatim, not reconstructed from the URL. */
  async createCmsMediaUploadTarget(contentType: string, extension: string): Promise<UploadTarget & { key: string }> {
    const key = `cms/media/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType);
    return { ...target, key };
  }
}
