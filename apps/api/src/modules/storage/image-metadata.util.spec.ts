import { detectImageKind, imageKindForKey, stripImageMetadata } from "./image-metadata.util";

function segment(marker: number, payload: Buffer): Buffer {
  const header = Buffer.from([0xff, marker, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

/** EXIF APP1 payload: Orientation=6 in IFD0 plus a GPS-looking ASCII blob the stripper must drop. */
function exifPayload(orientation: number): Buffer {
  const tiff = Buffer.alloc(26 + 32);
  tiff.write("MM", 0, "latin1");
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(1, 8);
  tiff.writeUInt16BE(0x0112, 10);
  tiff.writeUInt16BE(3, 12);
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt16BE(orientation, 18);
  tiff.writeUInt32BE(0, 22);
  tiff.write("GPS 35.6892N 51.3890E home", 26, "latin1");
  return Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
}

function jpeg(withOrientation = 6): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1")),
    segment(0xe1, exifPayload(withOrientation)),
    segment(0xe1, Buffer.from("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>exif:GPSLatitude</x:xmpmeta>", "latin1")),
    segment(0xfe, Buffer.from("camera serial 1234", "latin1")),
    segment(0xdb, Buffer.alloc(65, 1)),
    Buffer.from([0xff, 0xda, 0x00, 0x08, 1, 2, 3, 4, 5, 6, 0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9]),
  ]);
}

describe("stripImageMetadata", () => {
  it("drops EXIF/XMP/comments from a JPEG but keeps orientation and the image data", () => {
    const input = jpeg(6);
    const out = stripImageMetadata(input, "jpeg")!;
    const text = out.toString("latin1");
    expect(text).not.toContain("GPS");
    expect(text).not.toContain("xmpmeta");
    expect(text).not.toContain("camera serial");
    expect(text).toContain("JFIF");
    expect(out.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(out.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
    // The scan (from SOS on) is untouched.
    const sos = input.indexOf(Buffer.from([0xff, 0xda]));
    expect(out.subarray(out.indexOf(Buffer.from([0xff, 0xda])))).toEqual(input.subarray(sos));
    // A minimal EXIF block with Orientation=6 (little-endian) survives.
    const app1 = out.indexOf(Buffer.from("Exif\0\0", "latin1"));
    expect(app1).toBeGreaterThan(0);
    expect(out.readUInt16LE(app1 + 6 + 18)).toBe(6);
  });

  it("adds no EXIF block when the photo is already upright", () => {
    expect(stripImageMetadata(jpeg(1), "jpeg")!.toString("latin1")).not.toContain("Exif");
  });

  it("drops text and EXIF chunks from a PNG", () => {
    const chunk = (type: string, data: Buffer) => {
      const head = Buffer.alloc(8);
      head.writeUInt32BE(data.length, 0);
      head.write(type, 4, "latin1");
      return Buffer.concat([head, data, Buffer.alloc(4)]);
    };
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", Buffer.alloc(13)),
      chunk("tEXt", Buffer.from("Location\0Tehran home", "latin1")),
      chunk("eXIf", Buffer.from("MM\0*GPS", "latin1")),
      chunk("IDAT", Buffer.from([1, 2, 3])),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    const out = stripImageMetadata(png, "png")!;
    expect(out.toString("latin1")).not.toContain("Tehran");
    expect(out.toString("latin1")).not.toContain("GPS");
    expect(out.toString("latin1")).toContain("IDAT");
    expect(out.toString("latin1")).toContain("IEND");
  });

  it("drops EXIF/XMP chunks from a WebP and clears their VP8X flags", () => {
    const chunk = (type: string, data: Buffer) => {
      const head = Buffer.alloc(8);
      head.write(type, 0, "latin1");
      head.writeUInt32LE(data.length, 4);
      return Buffer.concat([head, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
    };
    const vp8x = Buffer.alloc(10);
    vp8x[0] = 0b0000_1100;
    const body = Buffer.concat([chunk("VP8X", vp8x), chunk("VP8 ", Buffer.from([9, 9, 9, 9])), chunk("EXIF", Buffer.from("GPS 35N", "latin1")), chunk("XMP ", Buffer.from("<xmp/>", "latin1"))]);
    const head = Buffer.alloc(12);
    head.write("RIFF", 0, "latin1");
    head.writeUInt32LE(body.length + 4, 4);
    head.write("WEBP", 8, "latin1");
    const out = stripImageMetadata(Buffer.concat([head, body]), "webp")!;
    expect(out.toString("latin1")).not.toContain("GPS");
    expect(out.toString("latin1")).not.toContain("xmp");
    expect(out.readUInt32LE(4)).toBe(out.length - 8);
    expect(out[20]! & 0b0000_1100).toBe(0);
  });

  it("tells real images from anything else by their bytes, whatever the file is called", () => {
    expect(detectImageKind(jpeg())).toBe("jpeg");
    expect(detectImageKind(Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"))).toBe("png");
    expect(detectImageKind(Buffer.from("RIFF\x10\0\0\0WEBPVP8X", "latin1"))).toBe("webp");
    for (const bad of ["<html><script>alert(1)</script>", "%PDF-1.7", "RIFF0000WAVE", ""]) expect(detectImageKind(Buffer.from(bad, "latin1"))).toBeNull();
  });

  it("keeps a slightly truncated PNG (cut-off IEND) instead of refusing it", () => {
    // The 1×1 fixture the browser-upload e2e uses: IHDR + IDAT, IEND cut short.
    const tiny = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
    expect(stripImageMetadata(tiny, "png")).toEqual(tiny);
  });

  it("only treats image keys as images", () => {
    expect(imageKindForKey("pets/a/b.JPG")).toBe("jpeg");
    expect(imageKindForKey("pets/a/b.webp")).toBe("webp");
    expect(imageKindForKey("private/health/doc.pdf")).toBeNull();
  });
});
