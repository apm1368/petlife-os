import { isOwnPublicObjectUrl, isPrivateUploadPath, PRIVATE_OBJECT_KEY_PREFIXES, PUBLIC_OBJECT_KEY_PREFIXES, resolveObjectUrl, resolveObjectUrls } from "./object-url.util";
import { isObjectKeyFor } from "../../common/storage-keys/object-key.validator";

describe("isPrivateUploadPath (local /uploads static mount guard)", () => {
  it("blocks every private prefix, including account exports and NGO verification documents", () => {
    for (const prefix of PRIVATE_OBJECT_KEY_PREFIXES) expect(isPrivateUploadPath(`/${prefix}abc/file.pdf`)).toBe(true);
    expect(isPrivateUploadPath("/account-exports/u1/r1.json")).toBe(true);
    expect(isPrivateUploadPath("/animal-support-verification/org1/doc.pdf")).toBe(true);
  });

  it("treats booking/support attachments, partner verification and any unknown prefix as private", () => {
    expect(isPrivateUploadPath("/booking-attachments/b1/file.pdf")).toBe(true);
    expect(isPrivateUploadPath("/support-attachments/c1/file.pdf")).toBe(true);
    expect(isPrivateUploadPath("/partner-verification/provider/p1/file.pdf")).toBe(true);
    expect(isPrivateUploadPath("/some-new-uploader/x/file.pdf")).toBe(true);
    expect(() => resolveObjectUrl("booking-attachments/b1/file.pdf")).toThrow();
  });

  it("can't be bypassed with dot segments, repeated slashes, encoding or backslashes", () => {
    for (const path of ["/./health-documents/x.pdf", "//health-documents/x.pdf", "/pets/../health-documents/x.pdf", "/%2e/account-exports/x.json", "/%2E%2E/animal-support-verification/x.pdf", "/.\\\\health-documents\\\\x.pdf", "/%E0%A4%A"]) {
      expect(isPrivateUploadPath(path)).toBe(true);
    }
  });

  it("leaves public media alone", () => {
    for (const prefix of PUBLIC_OBJECT_KEY_PREFIXES) expect(isPrivateUploadPath(`/${prefix}abc/img.webp`)).toBe(false);
    expect(isPrivateUploadPath("/pets/p1/photo.jpg")).toBe(false);
    expect(isPrivateUploadPath("/community-media/u1/img.webp")).toBe(false);
  });

  it("keeps existing public memory photos separate from private memorial publication copies", () => {
    const petId = "3f0b8a52-3c1e-4f0e-9a51-0d2c4b8e7a11";
    const mediaId = "7c9d2e10-5b4a-4e3f-8c21-6a0f1b2c3d4e";
    expect(isPrivateUploadPath(`/pet-memories-public/${petId}/${mediaId}.webp`)).toBe(false);
    expect(isPrivateUploadPath(`/pet-memorial-assets/${mediaId}.webp`)).toBe(true);
    expect(() => resolveObjectUrl(`pet-memorial-assets/${mediaId}.webp`)).toThrow();
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

  it("passes absolute URLs and /images/ paths through unchanged; an unknown prefix still throws", () => {
    expect(resolveObjectUrl("https://cdn.example/x.jpg")).toBe("https://cdn.example/x.jpg");
    expect(resolveObjectUrl("http://cdn.example/x.jpg")).toBe("http://cdn.example/x.jpg");
    expect(resolveObjectUrl("/images/experience/grooming-hero.png")).toBe("/images/experience/grooming-hero.png");
    expect(resolveObjectUrls(["https://cdn.example/x.jpg"])).toEqual(["https://cdn.example/x.jpg"]);
    expect(() => resolveObjectUrl(`legacy-media/${u}/${v}.jpg`)).toThrow();
  });

  it("a private key that reached a gallery is dropped, not a 500 for every reader", () => {
    const err = jest.spyOn(console, "error").mockImplementation(() => undefined);
    expect(resolveObjectUrls([`health-documents/${u}/${v}.pdf`, `community-media/${u}/${v}.jpg`])).toEqual([expect.stringContaining(`community-media/${u}/${v}.jpg`)]);
    expect(err).toHaveBeenCalledTimes(1);
    expect(() => resolveObjectUrl(`health-documents/${u}/${v}.pdf`)).toThrow();
    err.mockRestore();
  });
});

describe("isOwnPublicObjectUrl (member-set image addresses)", () => {
  const file = /^[0-9a-f-]{36}\.(jpg|png|webp)$/i;
  const id = "0ea309d0-c582-4710-80e4-276b41b5f94f";
  const photo = "46536654-eebe-4986-af8f-076c9a1b2c3d.png";
  const base = process.env.STORAGE_PUBLIC_BASE_URL ?? "http://localhost:4000/uploads";

  it("accepts only a file under the given public prefix on our own storage address", () => {
    expect(isOwnPublicObjectUrl(`${base}/pets/${id}/${photo}`, `pets/${id}/`, file)).toBe(true);
  });

  it("refuses outside hosts, other pets, nested paths, dot segments and private prefixes", () => {
    expect(isOwnPublicObjectUrl(`https://evil.example/pets/${id}/${photo}`, `pets/${id}/`, file)).toBe(false);
    expect(isOwnPublicObjectUrl(`${base}/pets/11111111-1111-1111-1111-111111111111/${photo}`, `pets/${id}/`, file)).toBe(false);
    expect(isOwnPublicObjectUrl(`${base}/pets/${id}/x/${photo}`, `pets/${id}/`, file)).toBe(false);
    expect(isOwnPublicObjectUrl(`${base}/pets/${id}/../${photo}`, `pets/${id}/`, file)).toBe(false);
    expect(isOwnPublicObjectUrl(`${base}/pets/${id}/${photo}?x=https://evil.example`, `pets/${id}/`, file)).toBe(false);
    expect(isOwnPublicObjectUrl(`${base}/health-documents/${id}/${photo}`, `health-documents/${id}/`, file)).toBe(false);
    expect(isOwnPublicObjectUrl(`${base}.evil.example/pets/${id}/${photo}`, `pets/${id}/`, file)).toBe(false);
  });
});
