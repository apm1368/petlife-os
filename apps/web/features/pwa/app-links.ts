/**
 * Where members can get the Android app. Empty until the app is published: the footer then shows only "Install the
 * app" (the installable web app). Fill in the store pages (or a direct APK URL) once they exist; each one that is set
 * appears in the footer.
 */
export const ANDROID_APP_LINKS: { bazaar: string | null; myket: string | null; googlePlay: string | null; apk: string | null } = {
  bazaar: null,
  myket: null,
  googlePlay: null,
  apk: null,
};

export function androidDownloadLinks(links = ANDROID_APP_LINKS): Array<{ store: "bazaar" | "myket" | "googlePlay" | "apk"; url: string }> {
  return (["bazaar", "myket", "googlePlay", "apk"] as const).flatMap((store) => {
    const url = links[store];
    return url && /^https:\/\//.test(url) ? [{ store, url }] : [];
  });
}
