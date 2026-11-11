import { fetchArticleFeed } from "@/lib/seo/blog-server";
import { buildLlmsTxt } from "@/lib/seo/llms";

export const revalidate = 300;

export async function GET() {
  return new Response(buildLlmsTxt(await fetchArticleFeed()), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" } });
}
