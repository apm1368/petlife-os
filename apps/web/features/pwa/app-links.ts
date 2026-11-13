/**
 * Where members can get the Android app. Empty until the app is published: the footer then shows only "Install the
 * app" (the installable web app). Fill in the store pages (or a direct APK URL) once they exist; each one that is set
 * appears in the footer.
 */
export const ANDROID_APP_LINKS: { bazaar: string | null; myket: string | null; googlePlay: string | null; apk: string | null } = {
  bazaar: null,
  myket: null,
  googlePlay: null,
  // The owner asked for a direct download in the footer (2026-11-13): the signed release, served from our own domain
  // because GitHub is slow from Iran. Same bytes as public/app/opetlife-1.0.14.apk (see ANDROID_APK).
  apk: "https://opetlife.ir/app/opetlife.apk",
};

/**
 * The APK served at /app/opetlife.apk (and /app/opetlife-<version>.apk): the signed release built by the "Android
 * app" workflow (run 43388831145). Its signing certificate's SHA-256 is the one in /.well-known/assetlinks.json
 * (E1:97:64:…:D3:6D). app-links.test.ts checks these numbers against the files in public/app.
 */
export const ANDROID_APK = {
  version: "1.0.14",
  versionCode: 14,
  sizeBytes: 181809,
  sha256: "32806b76452526c2d4f74383b09b6c922eb3f2ffdc4bcce20cf1ec6e4d5ee700",
  // Static files in public/ (not pages).
  file: "/app/opetlife.apk",
  versionedFile: "/app/opetlife-1.0.14.apk",
} as const;

export function androidDownloadLinks(links = ANDROID_APP_LINKS): Array<{ store: "bazaar" | "myket" | "googlePlay" | "apk"; url: string }> {
  return (["bazaar", "myket", "googlePlay", "apk"] as const).flatMap((store) => {
    const url = links[store];
    return url && /^https:\/\//.test(url) ? [{ store, url }] : [];
  });
}
