import { petsService } from "@/services/pets.service";

/** Owner, 2026-11-13: a pet photo may be up to 50 MB (phone and camera originals). The API allows the same. */
export const PET_PHOTO_MAX_BYTES = 50 * 1024 * 1024;

/** Longest edge kept for display; larger originals are scaled down in the browser before they are sent. */
const DISPLAY_EDGE = 2048;
const REENCODE_ABOVE_BYTES = 2 * 1024 * 1024;

type PhotoType = "image/jpeg" | "image/png" | "image/webp";

function photoType(type: string): PhotoType {
  return type === "image/png" || type === "image/webp" ? type : "image/jpeg";
}

/**
 * Scales a large photo down to DISPLAY_EDGE and re-encodes it as JPEG, so a 50 MB original becomes a ~1 MB upload
 * that loads fast everywhere it is shown. Re-encoding also drops the camera's metadata (the server strips EXIF/XMP
 * from whatever arrives as well). Small photos, and browsers without createImageBitmap, send the file unchanged.
 */
export async function preparePetPhoto(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, DISPLAY_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= REENCODE_ABOVE_BYTES) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    return blob && blob.size < file.size ? blob : file;
  } finally {
    bitmap.close();
  }
}

/** Uploads a pet photo and returns its public URL; throws when the file never arrived, so nothing saves a dead link. */
export async function uploadPetPhoto(petId: string, file: File): Promise<string> {
  const body = await preparePetPhoto(file);
  const contentType = photoType(body.type || file.type);
  const target = await petsService.createPhotoUploadUrl(petId, contentType);
  const put = await fetch(target.uploadUrl, { method: "PUT", body, headers: target.headers });
  if (!put.ok) throw new Error(`Photo upload failed (${put.status})`);
  return target.publicUrl;
}
