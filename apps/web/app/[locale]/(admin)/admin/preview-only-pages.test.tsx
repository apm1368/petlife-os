import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const host = vi.hoisted(() => ({ value: "185.231.112.154" }));
vi.mock("next/headers", () => ({ headers: () => new Map([["host", host.value]]) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("@/features/admin/crm/CrmWorkspace", () => ({ CrmWorkspace: () => null }));
vi.mock("@/features/admin/customer-affairs/CustomerAffairsWorkspace", () => ({ CustomerAffairsWorkspace: () => null }));

import AdminCrmPage from "./crm/page";
import AdminCustomerAffairsPage from "./customer-affairs/page";

// Decision 5: the CRM and customer-affairs workspaces are sample data with no backend — never served to real admins.
describe("preview-only admin pages", () => {
  const previous = process.env.NEXT_PUBLIC_LOCAL_PREVIEW;
  beforeEach(() => { host.value = "185.231.112.154"; });
  afterEach(() => { process.env.NEXT_PUBLIC_LOCAL_PREVIEW = previous; });

  it.each([["crm", AdminCrmPage], ["customer-affairs", AdminCustomerAffairsPage]])("%s is a 404 on a real deployment, even for a loopback Host header", (_name, Page) => {
    process.env.NEXT_PUBLIC_LOCAL_PREVIEW = undefined;
    expect(() => Page()).toThrow("NEXT_NOT_FOUND");
    host.value = "localhost:3000";
    expect(() => Page()).toThrow("NEXT_NOT_FOUND");
  });

  it.each([["crm", AdminCrmPage], ["customer-affairs", AdminCustomerAffairsPage]])("%s is a 404 for a non-loopback host even in a preview build", (_name, Page) => {
    process.env.NEXT_PUBLIC_LOCAL_PREVIEW = "1";
    expect(() => Page()).toThrow("NEXT_NOT_FOUND");
  });

  it.each([["crm", AdminCrmPage], ["customer-affairs", AdminCustomerAffairsPage]])("%s renders in the local design preview", (_name, Page) => {
    process.env.NEXT_PUBLIC_LOCAL_PREVIEW = "1";
    for (const h of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) {
      host.value = h;
      expect(() => Page()).not.toThrow();
    }
  });
});
