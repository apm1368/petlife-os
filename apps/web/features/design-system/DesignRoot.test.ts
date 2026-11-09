import { describe, expect, it } from "vitest";
import { routePattern } from "./DesignRoot";

describe("routePattern travel design mapping", () => {
  it.each(["/fa/travel", "/en/travel/search", "/de/travel/compare", "/es/travel/external"])(
    "uses the discovery pattern for public travel browsing: %s",
    (pathname) => {
      expect(routePattern(pathname)).toBe("discovery");
    },
  );

  it.each(["/fa/travel/book/booking-1", "/en/travel/bookings/booking-1", "/de/bookings/booking-2"])(
    "uses the reservation pattern for booking flows: %s",
    (pathname) => {
      expect(routePattern(pathname)).toBe("reservation");
    },
  );
});
