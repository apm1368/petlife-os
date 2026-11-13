import { detectImageKind, stripImageMetadata } from "../storage/image-metadata.util";

/**
 * What a «ست پت» design file may be (owner, 2026-11-13: "any format" a print shop can use): raster photos and artwork
 * (JPEG, PNG, WebP, HEIC) and print files (PDF, SVG, Adobe Illustrator, Photoshop). The type is decided by the bytes,
 * never by the name or the browser's label. Raster images lose their EXIF/XMP (GPS, device ids) before they are kept.
 * Print files are stored as opaque bytes: never previewed, never served inline (an SVG can carry script); staff
 * download them as attachments only.
 */
export type SetPetFileKind = "jpeg" | "png" | "webp" | "heic" | "pdf" | "svg" | "ai" | "psd";

/** Owner: up to about 50 MB per file (the upload ceiling). */
export const SET_PET_FILE_MAX_BYTES = 50 * 1024 * 1024;
/** Designs per request (owner: two or three; one is fine for a single shared design). */
export const SET_PET_MAX_DESIGNS = 3;
/** Uploaded but not yet placed on a request — enough to try a few, not a free file host. */
export const SET_PET_MAX_LOOSE_FILES = 12;

/** Extension the member's file has → its family and the extension the object key gets. */
const EXTENSIONS: Record<string, SetPetFileKind> = {
  jpg: "jpeg", jpeg: "jpeg", png: "png", webp: "webp", heic: "heic", heif: "heic",
  pdf: "pdf", svg: "svg", ai: "ai", psd: "psd",
};
const KEY_EXTENSION: Record<SetPetFileKind, string> = { jpeg: "jpg", png: "png", webp: "webp", heic: "heic", pdf: "pdf", svg: "svg", ai: "ai", psd: "psd" };
/** Labels browsers put on these files; octet-stream (or nothing) is common for .ai/.psd/.heic. */
const DECLARED_TYPES: Record<string, SetPetFileKind[]> = {
  "image/jpeg": ["jpeg"], "image/png": ["png"], "image/webp": ["webp"],
  "image/heic": ["heic"], "image/heif": ["heic"], "image/heic-sequence": ["heic"],
  "application/pdf": ["pdf", "ai"], "image/svg+xml": ["svg"],
  "application/postscript": ["ai"], "application/illustrator": ["ai"], "application/vnd.adobe.illustrator": ["ai"],
  "image/vnd.adobe.photoshop": ["psd"], "application/x-photoshop": ["psd"], "application/photoshop": ["psd"], "application/psd": ["psd"],
  "application/octet-stream": ["heic", "ai", "psd", "svg", "pdf"], "": ["heic", "ai", "psd", "svg", "pdf"],
};
export const MIME_OF: Record<SetPetFileKind, string> = {
  jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic",
  pdf: "application/pdf", svg: "image/svg+xml", ai: "application/postscript", psd: "image/vnd.adobe.photoshop",
};
const RASTER: SetPetFileKind[] = ["jpeg", "png", "webp"];

/** Only these are shown to their owner (through a short-lived signed URL); browsers can't show HEIC everywhere. */
export const isPreviewable = (kind: SetPetFileKind) => RASTER.includes(kind);

/**
 * The family a new upload claims, from the file name's extension checked against the browser's label; null when
 * the pair is not an allowed type. The object is stored as image/* only for JPEG/PNG/WebP, else as octet-stream.
 */
export function claimedKind(filename: string, contentType: string): { kind: SetPetFileKind; keyExtension: string; storedContentType: string } | null {
  const extension = filename.toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1] ?? "";
  const byName = EXTENSIONS[extension];
  if (!byName) return null;
  const allowed = DECLARED_TYPES[contentType.toLowerCase().split(";")[0]!.trim()];
  if (!allowed?.includes(byName) && !(RASTER.includes(byName) && allowed?.some((k) => RASTER.includes(k)))) return null;
  return { kind: byName, keyExtension: KEY_EXTENSION[byName], storedContentType: isPreviewable(byName) ? MIME_OF[byName] : "application/octet-stream" };
}

/** A safe display/download name: no path, no control or quote characters, at most 120 characters. */
export function safeFilename(name: string): string | null {
  const base = name.split(/[\\/]/).pop() ?? "";
  // Control characters (code < 32, and DEL) and characters that break headers or file systems are dropped.
  const printable = [...base].filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127 && !'"<>|*?:'.includes(c)).join("");
  const cleaned = printable.replace(/\s+/g, " ").trim().slice(-120);
  return cleaned || null;
}

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);

/** What the bytes really are (from their first bytes), for the family the member claimed; null when they don't match. */
export function detectKind(head: Buffer, claimed: SetPetFileKind): SetPetFileKind | null {
  if (RASTER.includes(claimed)) {
    const image = detectImageKind(head);
    return image ?? null;
  }
  const ascii = (from: number, to: number) => head.toString("latin1", from, to);
  switch (claimed) {
    case "heic": {
      if (head.length < 16 || ascii(4, 8) !== "ftyp") return null;
      const size = head.readUInt32BE(0);
      const brands = [ascii(8, 12)];
      for (let at = 16; at + 4 <= Math.min(size, head.length); at += 4) brands.push(ascii(at, at + 4));
      return brands.some((b) => HEIC_BRANDS.has(b)) ? "heic" : null;
    }
    case "pdf":
      return ascii(0, 5) === "%PDF-" ? "pdf" : null;
    case "ai":
      // Illustrator files are PDF-compatible today; older ones are PostScript.
      return ascii(0, 5) === "%PDF-" || ascii(0, 10) === "%!PS-Adobe" ? "ai" : null;
    case "psd":
      return ascii(0, 4) === "8BPS" && head.length >= 6 && [1, 2].includes(head.readUInt16BE(4)) ? "psd" : null;
    case "svg": {
      if (head.includes(0)) return null;
      const decoded = head.toString("utf8");
      const text = (decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded).trimStart();
      const withoutProlog = text.replace(/^<\?xml[^>]*>\s*/i, "").replace(/^(<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*/i, "");
      return /^<svg[\s>]/i.test(withoutProlog) ? "svg" : null;
    }
    default:
      return null;
  }
}

/**
 * Removes location/device metadata from a raster image: JPEG/PNG/WebP through the shared stripper (pixels untouched),
 * HEIC by blanking its Exif and XMP items in place. Null when the file's structure can't be read — the caller then
 * refuses the file rather than keeping one it could not clean. Print files are returned unchanged.
 */
export function stripMetadata(bytes: Buffer, kind: SetPetFileKind): Buffer | null {
  if (kind === "jpeg" || kind === "png" || kind === "webp") return stripImageMetadata(bytes, kind);
  if (kind === "heic") return blankHeicMetadata(bytes);
  return bytes;
}

// --------------------------------------------------------------------------------------------- HEIC (ISO BMFF)

interface Box { type: string; start: number; dataStart: number; end: number }

function boxes(bytes: Buffer, from: number, to: number): Box[] | null {
  const out: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = bytes.readUInt32BE(at);
    const type = bytes.toString("latin1", at + 4, at + 8);
    let header = 8;
    if (size === 1) {
      if (at + 16 > to) return null;
      const large = bytes.readBigUInt64BE(at + 8);
      if (large > BigInt(to - at)) return null;
      size = Number(large);
      header = 16;
    } else if (size === 0) {
      size = to - at;
    }
    if (size < header || at + size > to) return null;
    out.push({ type, start: at, dataStart: at + header, end: at + size });
    at += size;
  }
  return at === to ? out : null;
}

function readUInt(bytes: Buffer, at: number, size: number): number | null {
  if (size === 0) return 0;
  if (at + size > bytes.length) return null;
  if (size === 4) return bytes.readUInt32BE(at);
  if (size === 8) {
    const value = bytes.readBigUInt64BE(at);
    return value > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(value);
  }
  if (size === 2) return bytes.readUInt16BE(at);
  return null;
}

/** HEIC keeps Exif (and XMP as a "mime" item) as items located by `iloc`; their bytes are overwritten with zeros. */
export function blankHeicMetadata(input: Buffer): Buffer | null {
  const bytes = Buffer.from(input);
  const top = boxes(bytes, 0, bytes.length);
  const meta = top?.find((b) => b.type === "meta");
  if (!top || top[0]?.type !== "ftyp" || !meta) return null;
  // meta is a full box: 4 bytes of version/flags before its children.
  const children = boxes(bytes, meta.dataStart + 4, meta.end);
  const iinf = children?.find((b) => b.type === "iinf");
  const iloc = children?.find((b) => b.type === "iloc");
  const idat = children?.find((b) => b.type === "idat");
  if (!children || !iinf || !iloc) return null;

  // Which item ids are metadata.
  const metadataItems = new Set<number>();
  const iinfVersion = bytes[iinf.dataStart]!;
  const entriesAt = iinf.dataStart + 4 + (iinfVersion === 0 ? 2 : 4);
  const entries = boxes(bytes, entriesAt, iinf.end);
  if (!entries) return null;
  for (const infe of entries) {
    if (infe.type !== "infe") continue;
    const version = bytes[infe.dataStart]!;
    if (version < 2) continue;
    let at = infe.dataStart + 4;
    const itemId = version === 2 ? bytes.readUInt16BE(at) : bytes.readUInt32BE(at);
    at += (version === 2 ? 2 : 4) + 2; // item_ID, item_protection_index
    const itemType = bytes.toString("latin1", at, at + 4);
    at += 4;
    const nameEnd = bytes.indexOf(0, at);
    if (itemType === "Exif") metadataItems.add(itemId);
    if (itemType === "mime" && nameEnd >= 0 && nameEnd < infe.end) {
      const typeEnd = bytes.indexOf(0, nameEnd + 1);
      const contentType = bytes.toString("latin1", nameEnd + 1, typeEnd >= 0 && typeEnd < infe.end ? typeEnd : infe.end);
      if (/rdf\+xml|xmp/i.test(contentType)) metadataItems.add(itemId);
    }
  }
  if (!metadataItems.size) return bytes;

  // Where those items' bytes are.
  const version = bytes[iloc.dataStart]!;
  if (version > 2) return null;
  let at = iloc.dataStart + 4;
  const offsetSize = bytes[at]! >> 4;
  const lengthSize = bytes[at]! & 0x0f;
  const baseOffsetSize = bytes[at + 1]! >> 4;
  const indexSize = version === 1 || version === 2 ? bytes[at + 1]! & 0x0f : 0;
  at += 2;
  const itemCount = version < 2 ? bytes.readUInt16BE(at) : bytes.readUInt32BE(at);
  at += version < 2 ? 2 : 4;
  for (let i = 0; i < itemCount; i++) {
    if (at + 4 > iloc.end) return null;
    const itemId = version < 2 ? bytes.readUInt16BE(at) : bytes.readUInt32BE(at);
    at += version < 2 ? 2 : 4;
    let construction = 0;
    if (version === 1 || version === 2) { construction = bytes.readUInt16BE(at) & 0x0f; at += 2; }
    at += 2; // data_reference_index
    const baseOffset = readUInt(bytes, at, baseOffsetSize);
    if (baseOffset === null) return null;
    at += baseOffsetSize;
    if (at + 2 > iloc.end) return null;
    const extentCount = bytes.readUInt16BE(at);
    at += 2;
    for (let e = 0; e < extentCount; e++) {
      at += indexSize;
      const extentOffset = readUInt(bytes, at, offsetSize);
      at += offsetSize;
      const extentLength = readUInt(bytes, at, lengthSize);
      at += lengthSize;
      if (extentOffset === null || extentLength === null || at > iloc.end) return null;
      if (!metadataItems.has(itemId)) continue;
      // Only file offsets (0) and the meta box's own idat (1) are blanked; anything else is refused.
      const origin = construction === 0 ? 0 : construction === 1 && idat ? idat.dataStart : -1;
      if (origin < 0 || extentLength === 0) return null;
      const from = origin + baseOffset + extentOffset;
      const to = from + extentLength;
      if (to > bytes.length) return null;
      bytes.fill(0, from, to);
    }
  }
  return bytes;
}
