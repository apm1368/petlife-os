import { fetchArticleFeedResult, upstreamUnavailableResponse } from "@/lib/seo/blog-server";
import { buildLlmsFullTxt } from "@/lib/seo/llms";

export const revalidate = 300;

export async function GET() {
  const feed = await fetchArticleFeedResult({ withBody: true });
  if (feed.unavailable) return upstreamUnavailableResponse();
  return new Response(buildLlmsFullTxt(feed.items), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" } });
}
