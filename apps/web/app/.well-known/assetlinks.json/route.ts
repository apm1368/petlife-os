import { assetLinks } from "@/lib/android/asset-links";

/** Read at request time, so a fingerprint added to the server env works after a restart, without a rebuild. */
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(JSON.stringify(assetLinks()), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
  });
}
