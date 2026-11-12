import { fetchArticleFeed } from "@/lib/seo/blog-server";
import { buildLlmsFullTxt } from "@/lib/seo/llms";

export const revalidate = 300;

export async function GET() {
  return new Response(buildLlmsFullTxt(await fetchArticleFeed({ withBody: true })), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" } });
}
