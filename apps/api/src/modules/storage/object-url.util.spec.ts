import { isPrivateUploadPath, PRIVATE_OBJECT_KEY_PREFIXES } from "./object-url.util";

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
