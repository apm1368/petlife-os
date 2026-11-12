/**
 * Privacy for uploaded photos: phone cameras write EXIF/XMP metadata — GPS coordinates of where the picture was
 * taken (often the owner's home), device serials, timestamps — into JPEG/PNG/WebP files. Pet, lost-pet, sighting,
 * community and memory photos are served publicly, so that metadata is removed before a file is kept. Pixels are
 * never re-encoded: only metadata segments/chunks are dropped. A JPEG keeps a minimal EXIF block holding its
 * Orientation alone, so portrait phone photos still display upright.
 *
 * `detectImageKind` decides what the bytes really are (browsers label files loosely — a WebP saved as .jpg is
 * common); anything that is no image at all is refused by the caller rather than hosted under an image name.
 * `stripImageMetadata` returns the cleaned bytes, or null when the structure can't be parsed.
 */
export type ImageKind = "jpeg" | "png" | "webp";

export function detectImageKind(bytes: Buffer): ImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return "png";
  if (bytes.length >= 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") return "webp";
  return null;
}

export function imageKindForKey(key: string): ImageKind | null {
  const extension = key.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "jpeg";
  if (extension === "png") return "png";
  if (extension === "webp") return "webp";
  return null;
}

export function stripImageMetadata(bytes: Buffer, kind: ImageKind): Buffer | null {
  if (kind === "jpeg") return stripJpeg(bytes);
  if (kind === "png") return stripPng(bytes);
  return stripWebp(bytes);
}

// --------------------------------------------------------------------------------------------- JPEG

const APP1 = 0xe1;
const APP13 = 0xed;
const COM = 0xfe;
const SOS = 0xda;

function stripJpeg(bytes: Buffer): Buffer | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const out: Buffer[] = [bytes.subarray(0, 2)];
  let orientation: number | null = null;
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    // Fill bytes (0xFF padding) before a marker are allowed.
    let markerAt = offset;
    while (bytes[markerAt + 1] === 0xff) markerAt++;
    const marker = bytes[markerAt + 1];
    if (marker === undefined) return null;
    if (marker === SOS || marker === 0xd9) {
      // Entropy-coded image data (and everything after it) is copied verbatim.
      if (orientation && orientation !== 1) out.splice(1, 0, orientationApp1(orientation));
      out.push(bytes.subarray(markerAt));
      return Buffer.concat(out);
    }
    if (markerAt + 3 >= bytes.length) return null;
    const length = bytes.readUInt16BE(markerAt + 2);
    if (length < 2) return null;
    const end = markerAt + 2 + length;
    if (end > bytes.length) return null;
    const segment = bytes.subarray(markerAt, end);
    if (marker === APP1) {
      const found = readExifOrientation(segment.subarray(4));
      if (found) orientation = found;
    } else if (marker !== APP13 && marker !== COM) {
      out.push(segment);
    }
    offset = end;
  }
  return null;
}

/** Orientation (tag 0x0112) from an APP1 payload, if it is EXIF. */
function readExifOrientation(payload: Buffer): number | null {
  if (payload.length < 14 || payload.toString("latin1", 0, 6) !== "Exif\0\0") return null;
  const tiff = payload.subarray(6);
  const little = tiff.toString("latin1", 0, 2) === "II";
  if (!little && tiff.toString("latin1", 0, 2) !== "MM") return null;
  const u16 = (at: number) => (little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at));
  const u32 = (at: number) => (little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at));
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return null;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > tiff.length) return null;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** A minimal EXIF APP1 segment carrying only the Orientation tag. */
function orientationApp1(orientation: number): Buffer {
  const tiff = Buffer.alloc(26);
  tiff.write("II", 0, "latin1");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4); // IFD0 right after the header
  tiff.writeUInt16LE(1, 8); // one entry
  tiff.writeUInt16LE(0x0112, 10); // Orientation
  tiff.writeUInt16LE(3, 12); // SHORT
  tiff.writeUInt32LE(1, 14); // count
  tiff.writeUInt16LE(orientation, 18);
  tiff.writeUInt32LE(0, 22); // no next IFD
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const header = Buffer.alloc(4);
  header[0] = 0xff;
  header[1] = APP1;
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

// --------------------------------------------------------------------------------------------- PNG

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_METADATA_CHUNKS = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

function stripPng(bytes: Buffer): Buffer | null {
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  const out: Buffer[] = [PNG_SIGNATURE];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > bytes.length) break;
    if (!PNG_METADATA_CHUNKS.has(type)) out.push(bytes.subarray(offset, end));
    offset = end;
    if (type === "IEND") return Buffer.concat(out);
  }
  // A truncated tail (e.g. a cut-off IEND, which decoders tolerate) is kept as it is.
  if (out.length === 1) return null;
  out.push(bytes.subarray(offset));
  return Buffer.concat(out);
}

// --------------------------------------------------------------------------------------------- WebP

function stripWebp(bytes: Buffer): Buffer | null {
  if (bytes.length < 12 || bytes.toString("latin1", 0, 4) !== "RIFF" || bytes.toString("latin1", 8, 12) !== "WEBP") return null;
  const chunks: Buffer[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString("latin1", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + size + (size % 2);
    if (offset + 8 + size > bytes.length) return null;
    if (type !== "EXIF" && type !== "XMP ") {
      const chunk = Buffer.from(bytes.subarray(offset, Math.min(end, bytes.length)));
      // VP8X flags: bit 3 = EXIF present, bit 2 = XMP present.
      if (type === "VP8X" && chunk.length > 8) chunk[8] = chunk[8]! & ~0b0000_1100;
      chunks.push(chunk);
    }
    offset = end;
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(body.length + 4, 4);
  header.write("WEBP", 8, "latin1");
  return Buffer.concat([header, body]);
}
