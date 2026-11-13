/**
 * Digital Asset Links for the Android app (apps/android): proves that ir.opetlife.app belongs to opetlife.ir, so the
 * Trusted Web Activity opens without a browser bar and opetlife.ir links open in the app.
 *
 * Fingerprints are public (they identify the signing certificate, not its key). Add the upload key's SHA-256
 * (printed by the "Android app" GitHub workflow) and, once Google Play App Signing is on, Play's app-signing key from
 * Play Console → App integrity. Cafe Bazaar and Myket ship the APK as we sign it, so the upload key covers them.
 * ANDROID_APP_SHA256_FINGERPRINTS (comma-separated, server env) adds more without a code change.
 */
export const ANDROID_PACKAGE_NAME = "ir.opetlife.app";

export const ANDROID_CERT_FINGERPRINTS: readonly string[] = [
  // Upload key, created 2026-11-12 (signs the Cafe Bazaar / Myket APK and the AAB uploaded to Google Play).
  "E1:97:64:CB:E7:B6:74:27:44:B0:EA:0A:9B:9E:37:45:E4:F5:F8:2A:50:52:FB:19:CE:3A:F2:7B:CF:A6:D3:6D",
];

const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function assetLinkFingerprints(extra: string | undefined = process.env.ANDROID_APP_SHA256_FINGERPRINTS): string[] {
  const fromEnv = (extra ?? "").split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
  return [...new Set([...ANDROID_CERT_FINGERPRINTS, ...fromEnv])].filter((value) => FINGERPRINT.test(value));
}

export function assetLinks(fingerprints: string[] = assetLinkFingerprints()) {
  if (fingerprints.length === 0) return [];
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: ANDROID_PACKAGE_NAME, sha256_cert_fingerprints: fingerprints },
    },
  ];
}
