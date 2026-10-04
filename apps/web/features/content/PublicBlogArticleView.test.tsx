import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { PublicArticleDetailDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { blogService } from "@/services/blog.service";
import { PublicBlogArticleView } from "./PublicBlogArticleView";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("@/services/blog.service", () => ({ blogService: { getArticle: vi.fn() } }));

function detail(overrides: Partial<PublicArticleDetailDto> = {}): PublicArticleDetailDto {
  return {
    id: "article-1",
    locale: "en" as never,
    slug: "first-post",
    canonicalPath: "/en/blog/first-post",
    title: "First Post",
    excerpt: "An excerpt",
    coverMediaAsset: null,
    author: { id: "author-1", name: "Jane Vet", bio: null, avatarMediaAsset: null, createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z" },
    category: { id: "cat-1", name: "Nutrition", slug: "nutrition", description: null },
    tags: [{ id: "tag-1", name: "Puppies", slug: "puppies" }],
    publishedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    body: [{ type: "paragraph", content: [{ text: "Body text" }] }],
    seoTitle: null,
    seoDescription: null,
    ...overrides,
  };
}

describe("PublicBlogArticleView", () => {
  beforeEach(() => {
    vi.mocked(blogService.getArticle).mockReset();
  });

  it("renders title, author, published date, body, category, and tags", async () => {
    vi.mocked(blogService.getArticle).mockResolvedValue(detail());

    renderWithIntl(<PublicBlogArticleView slug="first-post" />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "First Post" })).toBeTruthy());
    expect(screen.getByText("Jane Vet")).toBeTruthy();
    expect(screen.getByText("Nutrition")).toBeTruthy();
    expect(screen.getByText("Puppies")).toBeTruthy();
    expect(screen.getByText("Body text")).toBeTruthy();
  });

  it("only shows an 'updated' timestamp when it differs from the published timestamp", async () => {
    vi.mocked(blogService.getArticle).mockResolvedValue(detail({ publishedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }));
    const { unmount } = renderWithIntl(<PublicBlogArticleView slug="first-post" />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "First Post" })).toBeTruthy());
    expect(screen.queryByText(/^Updated/)).toBeNull();
    unmount();

    vi.mocked(blogService.getArticle).mockResolvedValue(detail({ publishedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-02-01T00:00:00.000Z" }));
    renderWithIntl(<PublicBlogArticleView slug="first-post" />);
    await waitFor(() => expect(screen.getByText(/^Updated/)).toBeTruthy());
  });

  it("shows a not-found error state (identical for missing and unpublished) with a retry action", async () => {
    vi.mocked(blogService.getArticle).mockRejectedValue(new Error("not found"));

    renderWithIntl(<PublicBlogArticleView slug="missing" />);

    await waitFor(() => expect(screen.getByText("Article not found")).toBeTruthy());
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("renders correctly in fa locale (RTL)", async () => {
    vi.mocked(blogService.getArticle).mockResolvedValue(detail());

    renderWithIntl(<PublicBlogArticleView slug="first-post" />, "fa");

    await waitFor(() => expect(screen.getByRole("heading", { name: "First Post" })).toBeTruthy());
    expect(screen.getByText(/^انتشار/)).toBeTruthy();
  });

  it("a guide opened under the blog moves to its own section", async () => {
    vi.mocked(blogService.getArticle).mockResolvedValue(detail({ category: { id: "g", name: "Guides", slug: "guides", description: null } }));
    renderWithIntl(<PublicBlogArticleView slug="first-post" />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/guides/first-post"));
  });

  it("the guides section never shows a blog post, and a missing article offers no retry", async () => {
    vi.mocked(blogService.getArticle).mockResolvedValue(detail());
    renderWithIntl(<PublicBlogArticleView slug="first-post" section="guides" />);
    await waitFor(() => expect(screen.queryByRole("button", { name: /retry/i })).toBeNull());
    expect(screen.queryByText("First Post")).toBeNull();
    vi.mocked(blogService.getArticle).mockRejectedValue(new ApiError({ code: "ARTICLE_LOCALE_NOT_FOUND", message: "x", requestId: "r" } as never, 404));
    renderWithIntl(<PublicBlogArticleView slug="gone" />);
    await waitFor(() => expect(document.body.textContent).toMatch(/not found|couldn't find|isn't available/i));
    expect(screen.queryAllByRole("button", { name: /retry/i })).toHaveLength(0);
  });
});
