import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  DocumentTooLargeException,
  UnsupportedDocumentTypeException,
} from "../../common/errors/api-exception";
import {
  type DownloadOptions,
  DownloadTarget,
  STORAGE_DRIVER,
  type StorageDriver,
  type UploadTarget,
} from "./storage-driver.interface";

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

/** Product-gallery images are public catalogue media. The catalog retains at
 * most three approved images per product; upload validation lives here so a
 * browser can never mint arbitrary storage targets. */
const PRODUCT_MEDIA_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const PRODUCT_MEDIA_MAX_BYTES = 10 * 1024 * 1024; // 10MB

@Injectable()
export class StorageService {
  constructor(@Inject(STORAGE_DRIVER) private readonly driver: StorageDriver) {}

  async createPetPhotoUploadTarget(petId: string, contentType: string): Promise<UploadTarget> {
    // Pet photos are public profile media. Keep the object suffix aligned with
    // the validated MIME type so WebP uploads do not become misleading `.jpg`
    // objects (some object stores/CDNs use the suffix in downstream tooling).
    const extensionByContentType: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };
    const extension = extensionByContentType[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    const key = `pets/${petId}/${randomUUID()}.${extension}`;
    return this.driver.createUploadTarget(key, contentType);
  }

  /** Copies a validated, already-public source photo into an independently controlled private memorial asset. */
  async createPetMemorialPublicationAsset(petId: string, sourceKey: string): Promise<string> {
    const prefix = `pet-memories-public/${petId}/`;
    const filename = sourceKey.startsWith(prefix) ? sourceKey.slice(prefix.length) : "";
    const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpe?g|png|webp)$/i.exec(filename);
    if (!match) throw new Error("Invalid memorial source image object key");
    const extension = match[2]!.toLowerCase();
    const contentType = extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
    const publicationKey = `pet-memorial-assets/${randomUUID()}.${extension}`;
    try {
      await this.driver.copyObject(sourceKey, publicationKey, contentType);
      return publicationKey;
    } catch {
      // Storage errors can contain object keys; do not expose them in API errors/logs.
      throw new ServiceUnavailableException("The selected photo is temporarily unavailable.");
    }
  }

  /** Streams only an opaque private publication asset; never accepts the source pet-scoped key. */
  async openPetMemorialPublicationAsset(key: string) {
    if (!/^pet-memorial-assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpe?g|png|webp)$/i.test(key)) {
      throw new Error("Invalid memorial publication asset key");
    }
    return this.driver.openObject(key);
  }

  /** Removes only a newly created orphan after its database transaction failed; never the owner's source photo. */
  async deletePetMemorialPublicationAsset(key: string): Promise<void> {
    if (!/^pet-memorial-assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpe?g|png|webp)$/i.test(key)) {
      throw new Error("Invalid memorial publication asset key");
    }
    await this.driver.deleteObject(key);
  }

  /** Stores a validated public catalog image fetched by an approved importer. The caller must validate the source URL and bytes first. */
  async storeCatalogImage(productId: string, contentType: string, bytes: Buffer): Promise<{ url: string; key: string }> {
    const extensionByType: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    const extension = extensionByType[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024) throw new DocumentTooLargeException({ fileSizeBytes: bytes.length, maxBytes: 5 * 1024 * 1024 });
    const validSignature = contentType === "image/jpeg"
      ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : contentType === "image/png"
        ? bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    if (!validSignature) throw new UnsupportedDocumentTypeException({ contentType, reason: "image-signature-mismatch" });
    const key = `product-catalog/${productId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType, bytes.length);
    await this.driver.putObject(key, bytes, contentType);
    return { url: target.publicUrl, key };
  }

  /** Removes an importer-created catalog image when an atomic draft creation fails. */
  async deleteCatalogImage(key: string): Promise<void> {
    if (!/^product-catalog\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(key)) throw new Error("Invalid catalog image key");
    await this.driver.deleteObject(key);
  }

  /**
   * A catalogue-product image is public by definition, but it is still
   * scoped under the product UUID. The confirm endpoint checks that exact
   * scope before attaching it, preventing a user from reusing an upload
   * target issued for another product.
   */
  async createProductMediaUploadTarget(
    productId: string,
    contentType: string,
    fileSizeBytes: number,
  ): Promise<UploadTarget & { key: string }> {
    const extension = PRODUCT_MEDIA_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > PRODUCT_MEDIA_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: PRODUCT_MEDIA_MAX_BYTES });
    }
    const key = `product-media/${productId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType, fileSizeBytes);
    return { ...target, key };
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
  async createHealthDocumentUploadTarget(
    petId: string,
    contentType: string,
    fileSizeBytes: number,
  ): Promise<UploadTarget & { key: string }> {
    const extension = HEALTH_DOCUMENT_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > HEALTH_DOCUMENT_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: HEALTH_DOCUMENT_MAX_BYTES });
    }
    // randomUUID() as the filename — never the client-supplied original name — sidesteps path traversal / unsafe-filename concerns entirely.
    const key = `health-documents/${petId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType, fileSizeBytes);
    return { ...target, key };
  }

  /** A private file on a booking (owner ↔ provider). Same file types and size cap as medical documents. */
  async createBookingAttachmentUploadTarget(
    bookingId: string,
    contentType: string,
    fileSizeBytes: number,
  ): Promise<UploadTarget & { key: string }> {
    const extension = HEALTH_DOCUMENT_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > HEALTH_DOCUMENT_MAX_BYTES)
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: HEALTH_DOCUMENT_MAX_BYTES });
    const key = `booking-attachments/${bookingId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType, fileSizeBytes);
    return { ...target, key };
  }

  /** Owner photo/video observations — same private-storage treatment as medical documents, under their own key prefix. */
  async createObservationMediaUploadTarget(
    petId: string,
    contentType: string,
    fileSizeBytes: number,
  ): Promise<UploadTarget & { key: string }> {
    const extension = OBSERVATION_MEDIA_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > OBSERVATION_MEDIA_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: OBSERVATION_MEDIA_MAX_BYTES });
    }
    const key = `pet-observations/${petId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType, fileSizeBytes);
    return { ...target, key };
  }

  /**
   * Mints a short-TTL signed download URL for a private key. The CALLER must
   * already have verified the requester is authorized to view the
   * underlying record before calling this — this method performs no
   * authorization of its own, it only knows how to sign a URL.
   */
  async createPrivateDownloadTarget(key: string, options?: DownloadOptions): Promise<DownloadTarget> {
    return this.driver.createDownloadTarget(key, options);
  }

  /** Batch 8 — writes a server-generated account export into the private `account-exports/` space. */
  async putAccountExport(userId: string, requestId: string, body: Buffer): Promise<string> {
    const key = `account-exports/${userId}/${requestId}-${randomUUID()}.json`;
    await this.driver.putObject(key, body, "application/json");
    return key;
  }

  async deletePrivateObject(key: string): Promise<void> {
    await this.driver.deleteObject(key);
  }

  /** A completely separate key namespace (`cms/media/...`) from `pets/...` — spec: "strongly separate CMS media authorization from private pet documents." CMS media is meant to be public (blog images), so this uses the same plain-public-URL delivery `createPetPhotoUploadTarget` already established, never a signed-read scheme this codebase has no other precedent for. Returns `key` alongside the target (unlike the pet-photo variant) since the CMS confirm step needs it verbatim, not reconstructed from the URL. */
  async createCmsMediaUploadTarget(
    contentType: string,
    extension: string,
  ): Promise<UploadTarget & { key: string }> {
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
  async createLostPetPhotoUploadTarget(
    petId: string,
    contentType: string,
    fileSizeBytes: number,
  ): Promise<UploadTarget & { key: string }> {
    const extension = LOST_PET_PHOTO_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > LOST_PET_PHOTO_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: LOST_PET_PHOTO_MAX_BYTES });
    }
    const key = `lost-pet-photos/${petId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType, fileSizeBytes);
    return { ...target, key };
  }

  /** A sighting's own photo — same allow-list/cap as an incident photo, own key prefix so a sighting's evidence and the incident's own primary photo are never confused. */
  async createLostPetSightingPhotoUploadTarget(
    incidentId: string,
    contentType: string,
    fileSizeBytes: number,
  ): Promise<UploadTarget & { key: string }> {
    const extension = LOST_PET_PHOTO_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > LOST_PET_PHOTO_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: LOST_PET_PHOTO_MAX_BYTES });
    }
    const key = `lost-pet-sightings/${incidentId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType, fileSizeBytes);
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
  async createPetMemoryMediaUploadTarget(
    petId: string,
    contentType: string,
    fileSizeBytes: number,
    visibility: "PRIVATE" | "PUBLIC",
  ): Promise<UploadTarget & { key: string }> {
    const extension = MEMORY_MEDIA_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > MEMORY_MEDIA_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: MEMORY_MEDIA_MAX_BYTES });
    }
    const prefix = visibility === "PUBLIC" ? "pet-memories-public" : "pet-memories-private";
    const key = `${prefix}/${petId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType, fileSizeBytes);
    return { ...target, key };
  }

  /** An Animal Support organization's logo or gallery image — public, keyed by organizationId. */
  async createAnimalSupportOrgMediaUploadTarget(
    organizationId: string,
    contentType: string,
    fileSizeBytes: number,
  ): Promise<UploadTarget & { key: string }> {
    const extension = ANIMAL_SUPPORT_MEDIA_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > ANIMAL_SUPPORT_MEDIA_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: ANIMAL_SUPPORT_MEDIA_MAX_BYTES });
    }
    const key = `animal-support-orgs/${organizationId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType, fileSizeBytes);
    return { ...target, key };
  }

  /** An Insurance provider's logo — public, keyed by providerId. */
  async createInsuranceProviderLogoUploadTarget(
    providerId: string,
    contentType: string,
    fileSizeBytes: number,
  ): Promise<UploadTarget & { key: string }> {
    const extension = TRAVEL_COMMERCE_MEDIA_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > TRAVEL_COMMERCE_MEDIA_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: TRAVEL_COMMERCE_MEDIA_MAX_BYTES });
    }
    const key = `insurance-providers/${providerId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType, fileSizeBytes);
    return { ...target, key };
  }

  /** A Pet-Friendly Place's gallery image — public, keyed by placeId. */
  async createPetFriendlyPlaceImageUploadTarget(
    placeId: string,
    contentType: string,
    fileSizeBytes: number,
  ): Promise<UploadTarget & { key: string }> {
    const extension = TRAVEL_COMMERCE_MEDIA_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > TRAVEL_COMMERCE_MEDIA_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: TRAVEL_COMMERCE_MEDIA_MAX_BYTES });
    }
    const key = `pet-friendly-places/${placeId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType, fileSizeBytes);
    return { ...target, key };
  }

  /** Evidence for a rescue case (or, later, a campaign update) — public, same allow-list, own key prefix per aggregate id. */
  async createAnimalSupportEvidenceUploadTarget(
    aggregateId: string,
    contentType: string,
    fileSizeBytes: number,
  ): Promise<UploadTarget & { key: string }> {
    const extension = ANIMAL_SUPPORT_MEDIA_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > ANIMAL_SUPPORT_MEDIA_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: ANIMAL_SUPPORT_MEDIA_MAX_BYTES });
    }
    const key = `animal-support-evidence/${aggregateId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType, fileSizeBytes);
    return { ...target, key };
  }

  /** Batch 6: an NGO's verification documents — private (same allow-list and limits as medical documents); only admins read them, through signed download targets. */
  async createOrgVerificationDocumentUploadTarget(
    organizationId: string,
    contentType: string,
    fileSizeBytes: number,
  ): Promise<UploadTarget & { key: string }> {
    const extension = HEALTH_DOCUMENT_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > HEALTH_DOCUMENT_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: HEALTH_DOCUMENT_MAX_BYTES });
    }
    const key = `animal-support-verification/${organizationId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType, fileSizeBytes);
    return { ...target, key };
  }

  /** ERP-F: a support-case attachment — private, same allow-list and limits as medical documents; read only via signed downloads after a case-access check. */
  async createSupportAttachmentUploadTarget(
    caseId: string,
    contentType: string,
    fileSizeBytes: number,
  ): Promise<UploadTarget & { key: string }> {
    const extension = HEALTH_DOCUMENT_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > HEALTH_DOCUMENT_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: HEALTH_DOCUMENT_MAX_BYTES });
    }
    const key = `support-attachments/${caseId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType, fileSizeBytes);
    return { ...target, key };
  }

  /** ERP-C: a provider's or seller's verification evidence — private, same allow-list and limits as medical documents; staff read it only through signed, audited downloads. */
  async createPartnerVerificationUploadTarget(
    subject: "provider" | "seller",
    subjectId: string,
    contentType: string,
    fileSizeBytes: number,
  ): Promise<UploadTarget & { key: string }> {
    const extension = HEALTH_DOCUMENT_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > HEALTH_DOCUMENT_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: HEALTH_DOCUMENT_MAX_BYTES });
    }
    const key = `partner-verification/${subject}/${subjectId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType, fileSizeBytes);
    return { ...target, key };
  }

  /** Handoff 18: Community post media — public, same allow-list as Memory media, keyed by the posting user's id. Post-hoc moderation (Trust & Safety) governs visibility, not upload-time review. */
  async createCommunityMediaUploadTarget(
    userId: string,
    contentType: string,
    fileSizeBytes: number,
  ): Promise<UploadTarget & { key: string }> {
    const extension = MEMORY_MEDIA_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > MEMORY_MEDIA_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: MEMORY_MEDIA_MAX_BYTES });
    }
    const key = `community-media/${userId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType, fileSizeBytes);
    return { ...target, key };
  }

  /**
   * Handoff 22: Animal Support classifieds listing photos — public by
   * design (a needs board nobody can see helps nobody), same allow-list and
   * size cap as Community media, keyed by the publishing user. Post-hoc
   * moderation governs visibility, exactly as it does for Community.
   */
  async createSupportNeedImageUploadTarget(
    userId: string,
    contentType: string,
    fileSizeBytes: number,
  ): Promise<UploadTarget & { key: string }> {
    const extension = MEMORY_MEDIA_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > MEMORY_MEDIA_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: MEMORY_MEDIA_MAX_BYTES });
    }
    const key = `support-need-images/${userId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType, fileSizeBytes);
    return { ...target, key };
  }

  /**
   * Handoff 23 — travel listing photos. Public by design (a listing is a
   * public marketplace page), so the key deliberately stays outside
   * PRIVATE_OBJECT_KEY_PREFIXES and resolves through resolveObjectUrls().
   */
  async createTravelListingImageUploadTarget(
    organizationId: string,
    contentType: string,
    fileSizeBytes: number,
  ): Promise<UploadTarget & { key: string }> {
    const extension = MEMORY_MEDIA_MIME_EXTENSIONS[contentType];
    if (!extension) throw new UnsupportedDocumentTypeException({ contentType });
    if (fileSizeBytes <= 0 || fileSizeBytes > MEMORY_MEDIA_MAX_BYTES) {
      throw new DocumentTooLargeException({ fileSizeBytes, maxBytes: MEMORY_MEDIA_MAX_BYTES });
    }
    const key = `travel-listing-images/${organizationId}/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType, fileSizeBytes);
    return { ...target, key };
  }
}
