import { describe, expect, it } from "vitest";
import { ANDROID_CERT_FINGERPRINTS, assetLinkFingerprints, assetLinks, ANDROID_PACKAGE_NAME } from "./asset-links";
import { GET } from "@/app/.well-known/assetlinks.json/route";

const FP = "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5";

describe("Digital Asset Links", () => {
  it("lists the Android app with every valid SHA-256 fingerprint, uppercase and without duplicates", () => {
    expect(assetLinkFingerprints(`${FP.toLowerCase()}, ${FP}, not-a-fingerprint`)).toEqual([...ANDROID_CERT_FINGERPRINTS, FP]);
    expect(assetLinkFingerprints(ANDROID_CERT_FINGERPRINTS[0]!.toLowerCase())).toEqual([...ANDROID_CERT_FINGERPRINTS]);
    expect(assetLinks([FP])).toEqual([
      { relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: ANDROID_PACKAGE_NAME, sha256_cert_fingerprints: [FP] } },
    ]);
  });

  it("serves an empty statement list (valid JSON) when there is no fingerprint", () => {
    expect(assetLinks([])).toEqual([]);
  });

  it("publishes the upload key for ir.opetlife.app", async () => {
    const response = GET();
    expect(response.headers.get("content-type")).toBe("application/json");
    const statements = await response.json();
    expect(statements[0].target.package_name).toBe("ir.opetlife.app");
    expect(statements[0].target.sha256_cert_fingerprints).toContain("E1:97:64:CB:E7:B6:74:27:44:B0:EA:0A:9B:9E:37:45:E4:F5:F8:2A:50:52:FB:19:CE:3A:F2:7B:CF:A6:D3:6D");
  });
});
