import { isPrivateUploadPath, PRIVATE_OBJECT_KEY_PREFIXES, resolveObjectUrl, resolveObjectUrls } from "./object-url.util";
import { isObjectKeyFor } from "../../common/storage-keys/object-key.validator";

describe("isPrivateUploadPath (local /uploads static mount guard)", () => {
  it("blocks every private prefix, including account exports and NGO verification documents", () => {
    for (const prefix of PRIVATE_OBJECT_KEY_PREFIXES) expect(isPrivateUploadPath(`/${prefix}abc/file.pdf`)).toBe(true);
    expect(isPrivateUploadPath("/account-exports/u1/r1.json")).toBe(true);
    expect(isPrivateUploadPath("/animal-support-verification/org1/doc.pdf")).toBe(true);
  });

  it("can't be bypassed with dot segments, repeated slashes, encoding or backslashes", () => {
    for (const path of ["/./health-documents/x.pdf", "//health-documents/x.pdf", "/pets/../health-documents/x.pdf", "/%2e/account-exports/x.json", "/%2E%2E/animal-support-verification/x.pdf", "/.\\\\health-documents\\\\x.pdf", "/%E0%A4%A"]) {
      expect(isPrivateUploadPath(path)).toBe(true);
    }
  });

  it("leaves public media alone", () => {
    expect(isPrivateUploadPath("/pets/p1/photo.jpg")).toBe(false);
    expect(isPrivateUploadPath("/community/u1/img.webp")).toBe(false);
  });
});

describe("object keys handed back by clients", () => {
  const u = "3f0b8a52-3c1e-4f0e-9a51-0d2c4b8e7a11";
  const v = "7c9d2e10-5b4a-4e3f-8c21-6a0f1b2c3d4e";

  it("accepts only the shape StorageService minted for that field", () => {
    expect(isObjectKeyFor(`community-media/${u}/${v}.jpg`, ["community-media"])).toBe(true);
    expect(isObjectKeyFor("/images/experience/grooming-hero.png", ["community-media"])).toBe(true);
    for (const bad of [`health-documents/${u}/${v}.pdf`, `support-need-images/${u}/${v}.jpg`, `community-media/../health-documents/${u}/${v}.pdf`, `./community-media/${u}/${v}.jpg`, `https://evil.example/${u}.jpg`, `community-media/${u}/${v}`, "/images/../uploads/x.png", 42, null]) {
      expect(isObjectKeyFor(bad, ["community-media"])).toBe(false);
    }
  });

  it("a private key that reached a gallery is dropped, not a 500 for every reader", () => {
    const err = jest.spyOn(console, "error").mockImplementation(() => undefined);
    expect(resolveObjectUrls([`health-documents/${u}/${v}.pdf`, `community-media/${u}/${v}.jpg`])).toEqual([expect.stringContaining(`community-media/${u}/${v}.jpg`)]);
    expect(err).toHaveBeenCalledTimes(1);
    expect(() => resolveObjectUrl(`health-documents/${u}/${v}.pdf`)).toThrow();
    err.mockRestore();
  });
});
