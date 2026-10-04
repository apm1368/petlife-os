import { PublicBlogIndexView } from "@/features/content/PublicBlogIndexView";

/** Guides: practical care articles, a section of their own — not the blog. */
export default async function GuidesIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PublicBlogIndexView section="guides" titleOverride={locale === "fa" ? "راهنماهای مراقبت" : "Care guides"} />;
}
