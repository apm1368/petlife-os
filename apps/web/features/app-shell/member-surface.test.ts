import { describe, expect, it } from "vitest";
import { memberSurface } from "./member-surface";
describe("member surface continuity", () => {
  it.each(["/home", "/pets/p1", "/pets/p1/health", "/pets/p1/care", "/pets/p1/memories", "/profile", "/profile/household"])("keeps %s inside the same glass frame in both languages", path => {
    for (const locale of ["fa", "en"]) expect(memberSurface(`/${locale}${path}`)).toBe("glass");
  });
  it.each(["/shop", "/shop/products/p1", "/checkout", "/vet/find", "/services/PET_TAXI", "/booking/p1", "/travel"])("gives %s its dedicated transactional surface", path => {
    for (const locale of ["fa", "en"]) expect(memberSurface(`/${locale}${path}`)).toBe("service");
  });
});
