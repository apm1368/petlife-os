import { describe, expect, it } from "vitest";
import { assetLinkFingerprints, assetLinks, ANDROID_PACKAGE_NAME } from "./asset-links";
import { GET } from "@/app/.well-known/assetlinks.json/route";

const FP = "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5";

describe("Digital Asset Links", () => {
  it("lists the Android app with every valid SHA-256 fingerprint, uppercase and without duplicates", () => {
    expect(assetLinkFingerprints(`${FP.toLowerCase()}, ${FP}, not-a-fingerprint`)).toEqual([FP]);
    expect(assetLinks([FP])).toEqual([
      { relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: ANDROID_PACKAGE_NAME, sha256_cert_fingerprints: [FP] } },
    ]);
  });

  it("serves an empty statement list (valid JSON) until a signing key exists", async () => {
    expect(assetLinks([])).toEqual([]);
    const response = GET();
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(Array.isArray(await response.json())).toBe(true);
  });
});
