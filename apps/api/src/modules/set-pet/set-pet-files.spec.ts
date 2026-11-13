import { blankHeicMetadata, claimedKind, detectKind, safeFilename, stripMetadata } from "./set-pet-files";
import { setPetDesignDownloadOptions, setPetReference } from "./set-pet.service";

const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const box = (type: string, payload: Buffer) => Buffer.concat([u32(8 + payload.length), Buffer.from(type, "latin1"), payload]);
const fullBox = (type: string, version: number, payload: Buffer) => box(type, Buffer.concat([Buffer.from([version, 0, 0, 0]), payload]));

/** A minimal HEIC: ftyp, meta (iinf: image item 1 + Exif item 2, iloc: both in mdat), mdat. */
function heic(exif: Buffer) {
  const image = Buffer.from("IMAGEDATA");
  const ftyp = box("ftyp", Buffer.concat([Buffer.from("heic"), u32(0), Buffer.from("mif1heic")]));
  const infe = (id: number, type: string) => fullBox("infe", 2, Buffer.concat([u16(id), u16(0), Buffer.from(type, "latin1"), Buffer.from([0])]));
  const iinf = fullBox("iinf", 0, Buffer.concat([u16(2), infe(1, "hvc1"), infe(2, "Exif")]));
  const iloc = (off1: number, len1: number, off2: number, len2: number) =>
    fullBox("iloc", 0, Buffer.concat([Buffer.from([0x44, 0x00]), u16(2), u16(1), u16(0), u16(1), u32(off1), u32(len1), u16(2), u16(0), u16(1), u32(off2), u32(len2)]));
  const meta = (l: Buffer) => fullBox("meta", 0, Buffer.concat([iinf, l]));
  const mdatStart = ftyp.length + meta(iloc(0, 0, 0, 0)).length + 8;
  const file = Buffer.concat([ftyp, meta(iloc(mdatStart, image.length, mdatStart + image.length, exif.length)), box("mdat", Buffer.concat([image, exif]))]);
  return { file, image };
}

/** A JPEG whose EXIF carries a "GPS" secret, followed by (fake) scan data. */
function jpegWithExif(secret: string) {
  const tiff = Buffer.concat([Buffer.from("II*\0", "latin1"), Buffer.from([8, 0, 0, 0]), Buffer.from([0, 0]), Buffer.from(secret, "latin1")]);
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), u16(payload.length + 2), payload]);
  const sos = Buffer.concat([Buffer.from([0xff, 0xda]), u16(8), Buffer.from([1, 1, 0, 0, 63, 0]), Buffer.from("SCANDATA"), Buffer.from([0xff, 0xd9])]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, sos]);
}

describe("Set Pet design files", () => {
  it("accepts print-shop formats by name and label, stores print files as opaque bytes, refuses everything else", () => {
    expect(claimedKind("design.png", "image/png")).toEqual({ kind: "png", keyExtension: "png", storedContentType: "image/png" });
    expect(claimedKind("photo.JPEG", "image/jpeg")).toMatchObject({ kind: "jpeg", keyExtension: "jpg" });
    // Browsers label images loosely: a raster name with another raster label is fine (the bytes decide later).
    expect(claimedKind("photo.jpg", "image/png")).toMatchObject({ kind: "jpeg" });
    expect(claimedKind("art.svg", "image/svg+xml")).toEqual({ kind: "svg", keyExtension: "svg", storedContentType: "application/octet-stream" });
    expect(claimedKind("logo.ai", "application/octet-stream")).toMatchObject({ kind: "ai", storedContentType: "application/octet-stream" });
    expect(claimedKind("logo.ai", "")).toMatchObject({ kind: "ai" });
    expect(claimedKind("layers.psd", "image/vnd.adobe.photoshop")).toMatchObject({ kind: "psd" });
    expect(claimedKind("IMG_1234.HEIC", "image/heic")).toMatchObject({ kind: "heic", storedContentType: "application/octet-stream" });
    expect(claimedKind("print.pdf", "application/pdf")).toMatchObject({ kind: "pdf" });
    expect(claimedKind("setup.exe", "application/octet-stream")).toBeNull();
    expect(claimedKind("page.html", "text/html")).toBeNull();
    expect(claimedKind("design.png", "application/pdf")).toBeNull();
    expect(claimedKind("design.png", "text/html")).toBeNull();
    expect(claimedKind("noextension", "image/png")).toBeNull();
  });

  it("decides the type from the bytes", () => {
    expect(detectKind(Buffer.from("%PDF-1.7\n"), "pdf")).toBe("pdf");
    expect(detectKind(Buffer.from("<html>"), "pdf")).toBeNull();
    expect(detectKind(Buffer.from("%PDF-1.5"), "ai")).toBe("ai");
    expect(detectKind(Buffer.from("%!PS-Adobe-3.0 EPSF"), "ai")).toBe("ai");
    expect(detectKind(Buffer.concat([Buffer.from("8BPS"), u16(1)]), "psd")).toBe("psd");
    expect(detectKind(Buffer.concat([Buffer.from("8BPS"), u16(9)]), "psd")).toBeNull();
    expect(detectKind(Buffer.from('\uFEFF<?xml version="1.0"?>\n<!-- made by hand -->\n<!DOCTYPE svg>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>'), "svg")).toBe("svg");
    expect(detectKind(Buffer.from("<html><svg></svg></html>"), "svg")).toBeNull();
    expect(detectKind(Buffer.from([0x3c, 0x73, 0x76, 0x67, 0x20, 0x00]), "svg")).toBeNull();
    expect(detectKind(heic(Buffer.from("Exif")).file, "heic")).toBe("heic");
    expect(detectKind(Buffer.from("ftypxxxxxxxxxxxxxxxx"), "heic")).toBeNull();
    // A PNG uploaded under a .jpg name is a PNG.
    const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001", "hex");
    expect(detectKind(png, "jpeg")).toBe("png");
    expect(detectKind(Buffer.from("%PDF-1.7"), "png")).toBeNull();
  });

  it("removes photo metadata: JPEG EXIF goes, HEIC Exif items are blanked in place, pixels stay", () => {
    const jpeg = jpegWithExif("GPS-SECRET-35.7,51.4");
    const cleanJpeg = stripMetadata(jpeg, "jpeg")!;
    expect(cleanJpeg.toString("latin1")).not.toContain("GPS-SECRET");
    expect(cleanJpeg.toString("latin1")).toContain("SCANDATA");

    const { file, image } = heic(Buffer.from("Exif\0\0GPS-SECRET-35.7,51.4", "latin1"));
    const cleanHeic = blankHeicMetadata(file)!;
    expect(cleanHeic.length).toBe(file.length);
    expect(cleanHeic.toString("latin1")).not.toContain("GPS-SECRET");
    expect(cleanHeic.includes(image)).toBe(true);
    expect(stripMetadata(file, "heic")!.equals(cleanHeic)).toBe(true);
    // The original buffer is not modified.
    expect(file.toString("latin1")).toContain("GPS-SECRET");
    // Unreadable structure → null, and the caller refuses the file.
    expect(blankHeicMetadata(Buffer.concat([file.subarray(0, 40), Buffer.from("garbage")]))).toBeNull();
    // Print files are kept as they are.
    const pdf = Buffer.from("%PDF-1.7 ...");
    expect(stripMetadata(pdf, "pdf")).toBe(pdf);
  });

  it("keeps file names harmless and downloads print files as opaque attachments", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename('C:\\Users\\me\\"><script>.png')).toBe("script.png");
    expect(safeFilename("   ")).toBeNull();
    expect(setPetReference(123)).toBe("SP-000123");
    const key = "set-pet-designs/00000000-0000-4000-8000-000000000000/11111111-1111-4111-8111-111111111111";
    expect(setPetDesignDownloadOptions({ objectKey: `${key}.svg`, mimeType: "image/svg+xml", previewable: false, originalFilename: null })).toEqual({ filename: "design.svg", contentType: "application/octet-stream" });
    expect(setPetDesignDownloadOptions({ objectKey: `${key}.png`, mimeType: "image/png", previewable: true, originalFilename: "front.png" })).toEqual({ filename: "front.png", contentType: "image/png" });
  });
});
