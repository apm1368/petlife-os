import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ANDROID_APK, ANDROID_APP_LINKS, androidDownloadLinks } from "./app-links";

const publicDir = join(__dirname, "../../public");

describe("Android APK download (owner, 2026-11-13)", () => {
  it.each([ANDROID_APK.file, ANDROID_APK.versionedFile])("serves the exact signed release at %s", (path) => {
    const bytes = readFileSync(join(publicDir, path));
    expect(bytes.length).toBe(ANDROID_APK.sizeBytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(ANDROID_APK.sha256);
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("links the footer to our own domain, not GitHub", () => {
    expect(ANDROID_APP_LINKS.apk).toBe(`https://opetlife.ir${ANDROID_APK.file}`);
    expect(androidDownloadLinks()).toContainEqual({ store: "apk", url: "https://opetlife.ir/app/opetlife.apk" });
  });
});
