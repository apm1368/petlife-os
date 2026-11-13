import { isPublicProvider, publicProviderWhere } from "./public-partner";

describe("public partner rule", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it("hides every provider that is not verified", () => {
    for (const verificationStatus of ["NOT_STARTED", "SUBMITTED", "NEEDS_INFORMATION", "UNDER_REVIEW", "REJECTED", "SUSPENDED"]) expect(isPublicProvider({ verificationStatus })).toBe(false);
    expect(isPublicProvider(null)).toBe(false);
    expect(isPublicProvider({ verificationStatus: "VERIFIED" })).toBe(true);
  });

  it("hides demo fixtures in production only", () => {
    process.env.DEPLOYMENT_ENVIRONMENT = "production";
    expect(publicProviderWhere()).toEqual({ verificationStatus: "VERIFIED", isDemoRecord: false });
    expect(isPublicProvider({ verificationStatus: "VERIFIED", isDemoRecord: true })).toBe(false);
    expect(isPublicProvider({ verificationStatus: "VERIFIED", isDemoRecord: false })).toBe(true);

    delete process.env.DEPLOYMENT_ENVIRONMENT;
    process.env.NODE_ENV = "test";
    expect(publicProviderWhere()).toEqual({ verificationStatus: "VERIFIED" });
    expect(isPublicProvider({ verificationStatus: "VERIFIED", isDemoRecord: true })).toBe(true);
  });
});
