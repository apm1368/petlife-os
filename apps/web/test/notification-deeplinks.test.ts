import { describe, expect, it } from "vitest";
import { NotificationDeepLinks } from "../../api/src/modules/notifications/notification-deeplink.util";
import { routeExists } from "./route-exists";

/** Every deep link the API puts in a notification must open a page that exists — in both locales. */
describe("notification deep links", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const entries = Object.entries(NotificationDeepLinks) as [string, (...args: string[]) => string][];

  it.each(entries)("%s resolves to a real page", (_name, build) => {
    const path = build(id, id, id).split(/[?#]/)[0]!;
    expect(path.startsWith("/")).toBe(true);
    for (const locale of ["fa", "en"]) expect(routeExists(`/${locale}${path}`)).toBe(true);
  });
});
