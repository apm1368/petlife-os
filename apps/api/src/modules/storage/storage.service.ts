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

/** Handoff 18: Lost Pet photos (incident + sighting) — public by design, since a shared incident link needs the photo to render for an anonymous visitor. */
const LOST_PET_PHOTO_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const LOST_PET_PHOTO_MAX_BYTES = 10 * 1024 * 1024; // 10MB

/** Handoff 18: Pet Memory media — same allow-list as observation media, but a distinct key prefix per visibility (see createPetMemoryMediaUploadTarget's own doc comment). */
const MEMORY_MEDIA_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};
const MEMORY_MEDIA_MAX_BYTES = 50 * 1024 * 1024; // 50MB

/** Handoff 18: Animal Support org logos/images and rescue-case/campaign evidence — all public by design (spec: "keep transparency visible"), same allow-list as a Lost Pet photo. */
const ANIMAL_SUPPORT_MEDIA_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const ANIMAL_SUPPORT_MEDIA_MAX_BYTES = 10 * 1024 * 1024; // 10MB

/** Handoff 19: Insurance provider/product logos and Pet-Friendly Place images — public by design, same allow-list as Animal Support media. */
const TRAVEL_COMMERCE_MEDIA_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const TRAVEL_COMMERCE_MEDIA_MAX_BYTES = 10 * 1024 * 1024; // 10MB

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

  /**
   * Handoff 18: a Lost Pet incident's own primary photo — public, under
   * `lost-pet-photos/{petId}/...`. Keyed by petId (not incidentId) because
   * the two-phase upload (request URL -> PUT -> confirm on incident create)
   * happens before the incident row exists — petId is the aggregate that's
   * already real at request time, the same reasoning the private
   * health-document/observation upload targets already use.
   */
  async createLostPetPhotoUploadTarget(petId: string, contentType: string, fileSizeBytes: number): Promise<UploadTarget & { key: string }> {
    const extension = LOST_PET_PHOTO_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > LOST_PET_PHOTO_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: LOST_PET_PHOTO_MAX_BYTES });
    }
    const key = `lost-pet-photos/${petId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType);
    return { ...target, key };
  }

  /** A sighting's own photo — same allow-list/cap as an incident photo, own key prefix so a sighting's evidence and the incident's own primary photo are never confused. */
  async createLostPetSightingPhotoUploadTarget(incidentId: string, contentType: string, fileSizeBytes: number): Promise<UploadTarget & { key: string }> {
    const extension = LOST_PET_PHOTO_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > LOST_PET_PHOTO_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: LOST_PET_PHOTO_MAX_BYTES });
    }
    const key = `lost-pet-sightings/${incidentId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType);
    return { ...target, key };
  }

  /**
   * Handoff 18: a Pet Memory's own media — visibility decides the prefix
   * (and thus public-URL vs. signed-download delivery) at upload time,
   * never a visibility flip on the same stored object (spec: "Memories
   * default to household-private unless visibility is explicitly public").
   * PRIVATE reuses the exact `pet-observations/...`-style private prefix/
   * signed-download pattern; PUBLIC reuses the plain public-URL scheme.
   */
  async createPetMemoryMediaUploadTarget(petId: string, contentType: string, fileSizeBytes: number, visibility: "PRIVATE" | "PUBLIC"): Promise<UploadTarget & { key: string }> {
    const extension = MEMORY_MEDIA_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > MEMORY_MEDIA_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: MEMORY_MEDIA_MAX_BYTES });
    }
    const prefix = visibility === "PUBLIC" ? "pet-memories-public" : "pet-memories-private";
    const key = `${prefix}/${petId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType);
    return { ...target, key };
  }

  /** An Animal Support organization's logo or gallery image — public, keyed by organizationId. */
  async createAnimalSupportOrgMediaUploadTarget(organizationId: string, contentType: string, fileSizeBytes: number): Promise<UploadTarget & { key: string }> {
    const extension = ANIMAL_SUPPORT_MEDIA_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > ANIMAL_SUPPORT_MEDIA_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: ANIMAL_SUPPORT_MEDIA_MAX_BYTES });
    }
    const key = `animal-support-orgs/${organizationId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType);
    return { ...target, key };
  }

  /** An Insurance provider's logo — public, keyed by providerId. */
  async createInsuranceProviderLogoUploadTarget(providerId: string, contentType: string, fileSizeBytes: number): Promise<UploadTarget & { key: string }> {
    const extension = TRAVEL_COMMERCE_MEDIA_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > TRAVEL_COMMERCE_MEDIA_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: TRAVEL_COMMERCE_MEDIA_MAX_BYTES });
    }
    const key = `insurance-providers/${providerId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType);
    return { ...target, key };
  }

  /** A Pet-Friendly Place's gallery image — public, keyed by placeId. */
  async createPetFriendlyPlaceImageUploadTarget(placeId: string, contentType: string, fileSizeBytes: number): Promise<UploadTarget & { key: string }> {
    const extension = TRAVEL_COMMERCE_MEDIA_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > TRAVEL_COMMERCE_MEDIA_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: TRAVEL_COMMERCE_MEDIA_MAX_BYTES });
    }
    const key = `pet-friendly-places/${placeId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType);
    return { ...target, key };
  }

  /** Evidence for a rescue case (or, later, a campaign update) — public, same allow-list, own key prefix per aggregate id. */
  async createAnimalSupportEvidenceUploadTarget(aggregateId: string, contentType: string, fileSizeBytes: number): Promise<UploadTarget & { key: string }> {
    const extension = ANIMAL_SUPPORT_MEDIA_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > ANIMAL_SUPPORT_MEDIA_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: ANIMAL_SUPPORT_MEDIA_MAX_BYTES });
    }
    const key = `animal-support-evidence/${aggregateId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType);
    return { ...target, key };
  }

  /** Handoff 18: Community post media — public, same allow-list as Memory media, keyed by the posting user's id. Post-hoc moderation (Trust & Safety) governs visibility, not upload-time review. */
  async createCommunityMediaUploadTarget(userId: string, contentType: string, fileSizeBytes: number): Promise<UploadTarget & { key: string }> {
    const extension = MEMORY_MEDIA_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > MEMORY_MEDIA_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: MEMORY_MEDIA_MAX_BYTES });
    }
    const key = `community-media/${userId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType);
    return { ...target, key };
  }
}
