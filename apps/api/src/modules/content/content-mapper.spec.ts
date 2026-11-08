import { toPublicContentAuthorDto, toPublicMediaAssetDto } from "./content-mapper";

describe("public content DTOs", () => {
  it("exposes only media fields needed for rendering, never uploader or storage metadata", () => {
    const dto = toPublicMediaAssetDto({
      id: "media-id",
      url: "/images/cover.png",
      mimeType: "image/png",
      widthPx: 640,
      heightPx: 480,
      altText: "Cover",
    });

    expect(dto).toEqual({
      id: "media-id",
      url: "/images/cover.png",
      mimeType: "image/png",
      widthPx: 640,
      heightPx: 480,
      altText: "Cover",
    });
    expect(dto).not.toHaveProperty("createdByAdmin");
    expect(dto).not.toHaveProperty("fileSizeBytes");
    expect(dto).not.toHaveProperty("disabledAt");
    expect(dto).not.toHaveProperty("createdAt");
  });

  it("keeps the public author avatar on the same minimized media contract", () => {
    const dto = toPublicContentAuthorDto({
      id: "author-id",
      name: "Editorial team",
      bio: null,
      avatarMediaAssetId: "avatar-id",
      avatarMediaAsset: {
        id: "avatar-id",
        url: "/images/avatar.png",
        mimeType: "image/png",
        widthPx: null,
        heightPx: null,
        altText: null,
      },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(dto.avatarMediaAsset).toEqual({
      id: "avatar-id",
      url: "/images/avatar.png",
      mimeType: "image/png",
      widthPx: null,
      heightPx: null,
      altText: null,
    });
    expect(dto).not.toHaveProperty("createdAt");
    expect(dto.avatarMediaAsset).not.toHaveProperty("createdByAdmin");
  });
});
