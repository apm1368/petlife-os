import { foldPlaceName, isOwnSuggestionPhotoKey } from "./place-suggestion.service";

describe("place suggestion duplicate hints: name folding", () => {
  it("treats Arabic/Persian letter variants, digits, ZWNJ, spaces, punctuation and case as the same name", () => {
    expect(foldPlaceName("كافه سگ‌ها")).toBe(foldPlaceName("کافه سگها"));
    expect(foldPlaceName("پارک ۱۲")).toBe(foldPlaceName("پارك 12"));
    expect(foldPlaceName("Dog-Park (North)")).toBe(foldPlaceName("dog park north"));
    expect(foldPlaceName("خانهٔ مهر")).not.toBe(foldPlaceName("خانه سبز"));
  });
});

describe("place suggestion photos: only the exact issued key", () => {
  const me = "8b0f6c1e-1c1a-4a8e-9a39-2a8b0d4f9e11";
  const photo = "3f2a1b4c-5d6e-4f70-8192-a3b4c5d6e7f8";
  it("accepts place-suggestions/<me>/<uuid>.<jpg|png|webp> and nothing else", () => {
    expect(isOwnSuggestionPhotoKey(me, `place-suggestions/${me}/${photo}.webp`)).toBe(true);
    expect(isOwnSuggestionPhotoKey(me, `place-suggestions/${me}/${photo}.jpg`)).toBe(true);
    for (const key of [
      `place-suggestions/${me}/../../other/${photo}.webp`,
      `place-suggestions/${me}/../${photo}.webp`,
      `place-suggestions/${me}/${photo}.svg`,
      `place-suggestions/${me}/${photo}.webp/extra`,
      `place-suggestions/${photo}/${photo}.webp`,
      `pet-friendly-places/${me}/${photo}.webp`,
      `/images/demo.webp`,
    ]) expect(isOwnSuggestionPhotoKey(me, key)).toBe(false);
  });
});
