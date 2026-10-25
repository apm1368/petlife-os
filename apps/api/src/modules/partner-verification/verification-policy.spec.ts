import { evaluateVerificationPolicy, verificationPolicy } from "./verification-policy";

describe("partner verification evidence policy", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const identity = { kind: "IDENTITY" as const, status: "ACCEPTED", expiresAt: null };
  const license = { kind: "LICENSE" as const, status: "ACCEPTED", expiresAt: new Date("2027-01-01") };

  it("accepts explicit national ID without treating commercial evidence as a professional licence", () => {
    const national = { ...identity, kind: "NATIONAL_ID_CARD" as const };
    expect(evaluateVerificationPolicy("VET_CLINIC", [national, license], now).missingForApproval).toEqual([]);
    expect(evaluateVerificationPolicy("VET_CLINIC", [national, { ...license, kind: "BUSINESS_LICENSE" }], now).missingForApproval).toEqual(["LICENSE"]);
    expect(evaluateVerificationPolicy("VET_CLINIC", [national, { ...license, kind: "ENAMAD" }], now).missingForApproval).toEqual(["LICENSE"]);
  });

  it.each(["VET_CLINIC", "VET_HOSPITAL", "VETERINARIAN"])("requires identity and licence for %s", kind => {
    expect(evaluateVerificationPolicy(kind, [license], now).missingForApproval).toEqual(["IDENTITY"]);
    expect(evaluateVerificationPolicy(kind, [identity], now).missingForApproval).toEqual(["LICENSE"]);
    expect(evaluateVerificationPolicy(kind, [identity, license], now).missingForApproval).toEqual([]);
  });
  it("uses actual VET services even when the organization has a nonclinical business type", () => {
    expect(evaluateVerificationPolicy("MULTI_SERVICE_PROVIDER", [identity], now, true).missingForApproval).toEqual(["LICENSE"]);
  });
  it.each(["GROOMER", "TRAINER", "WALKER", "SITTER", "BOARDING", "PET_TAXI", "TRAVEL_ACCOMMODATION", "SELLER"])("requires identity, not an unrelated attachment, for %s", kind => {
    expect(evaluateVerificationPolicy(kind, [license], now).missingForApproval).toEqual(["IDENTITY"]);
    expect(evaluateVerificationPolicy(kind, [identity], now).missingForApproval).toEqual([]);
  });
  it("allows pending evidence at submission but never at approval", () => {
    const result = evaluateVerificationPolicy("VET_CLINIC", [identity, { ...license, status: "PENDING" }], now);
    expect(result.missingForSubmission).toEqual([]);
    expect(result.missingForApproval).toEqual(["LICENSE"]);
  });
  it.each(["REJECTED", "EXPIRED"])("never counts %s evidence", status => {
    expect(evaluateVerificationPolicy("VET_CLINIC", [identity, { ...license, status }], now).missingForSubmission).toEqual(["LICENSE"]);
  });
  it("rejects expiry at this instant, expired and invalid dates; accepts a fresh replacement", () => {
    for (const expiresAt of [now, new Date("2026-01-01"), new Date("invalid")]) {
      expect(evaluateVerificationPolicy("VET_CLINIC", [identity, { ...license, expiresAt }], now).missingForApproval).toEqual(["LICENSE"]);
    }
    expect(evaluateVerificationPolicy("VET_CLINIC", [identity, { ...license, status: "EXPIRED" }, license], now).missingForApproval).toEqual([]);
  });
  it("exposes an explicit version and never claims official verification", () => {
    expect(verificationPolicy("VET_CLINIC")).toMatchObject({ version: "2026-10-24.1", mode: "MANUAL_DOCUMENT_REVIEW", officialLookup: "NOT_CONNECTED" });
  });
});
