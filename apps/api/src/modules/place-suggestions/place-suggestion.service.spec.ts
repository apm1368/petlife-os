import { foldPlaceName } from "./place-suggestion.service";

describe("place suggestion duplicate hints: name folding", () => {
  it("treats Arabic/Persian letter variants, digits, ZWNJ, spaces, punctuation and case as the same name", () => {
    expect(foldPlaceName("كافه سگ‌ها")).toBe(foldPlaceName("کافه سگها"));
    expect(foldPlaceName("پارک ۱۲")).toBe(foldPlaceName("پارك 12"));
    expect(foldPlaceName("Dog-Park (North)")).toBe(foldPlaceName("dog park north"));
    expect(foldPlaceName("خانهٔ مهر")).not.toBe(foldPlaceName("خانه سبز"));
  });
});
