import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { PaginatedDto, PublicArticleSummaryDto, PublicCategoryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { blogService } from "@/services/blog.service";
import { PublicBlogIndexView } from "./PublicBlogIndexView";

vi.mock("@/services/blog.service", () => ({ blogService: { listArticles: vi.fn(), listCategories: vi.fn() } }));

function article(overrides: Partial<PublicArticleSummaryDto> = {}): PublicArticleSummaryDto {
  return {
    id: "article-1",
    locale: "en" as never,
    slug: "first-post",
    canonicalPath: "/en/blog/first-post",
    title: "First Post",
    excerpt: "An excerpt",
    coverMediaAsset: null,
    author: null,
    category: null,
    tags: [],
    publishedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function page(items: PublicArticleSummaryDto[], total = items.length): PaginatedDto<PublicArticleSummaryDto> {
  return { items, total, page: 1, pageSize: 12 };
}

const CATEGORY: PublicCategoryDto = { id: "cat-1", name: "Nutrition", slug: "nutrition", description: null };

describe("PublicBlogIndexView", () => {
  beforeEach(() => {
    vi.mocked(blogService.listArticles).mockReset();
    vi.mocked(blogService.listCategories).mockReset().mockResolvedValue([CATEGORY]);
  });

  it("shows the article grid and category navigation once loaded", async () => {
    vi.mocked(blogService.listArticles).mockResolvedValue(page([article()]));

    renderWithIntl(<PublicBlogIndexView />);

    await waitFor(() => expect(screen.getByText("First Post")).toBeTruthy());
    expect(screen.getByText("Nutrition")).toBeTruthy();
    expect(screen.getByText("An excerpt")).toBeTruthy();
  });

  it("shows a localized empty state when there are no articles", async () => {
    vi.mocked(blogService.listArticles).mockResolvedValue(page([], 0));

    renderWithIntl(<PublicBlogIndexView />);

    await waitFor(() => expect(screen.getByText("No articles yet. Check back soon.")).toBeTruthy());
  });

  it("shows an error state with retry when the list fails to load", async () => {
    vi.mocked(blogService.listArticles).mockRejectedValue(new Error("network error"));

    renderWithIntl(<PublicBlogIndexView />);

    await waitFor(() => expect(screen.getByText("Try again")).toBeTruthy());
  });

  it("appends the next page's articles on Load more, never replacing what's already shown", async () => {
    vi.mocked(blogService.listArticles)
      .mockResolvedValueOnce(page([article({ id: "a1", slug: "post-1", title: "Post One" })], 2))
      .mockResolvedValueOnce({ items: [article({ id: "a2", slug: "post-2", title: "Post Two" })], total: 2, page: 2, pageSize: 12 });

    renderWithIntl(<PublicBlogIndexView />);
    await waitFor(() => expect(screen.getByText("Post One")).toBeTruthy());

    fireEvent.click(screen.getByText("Load more"));

    await waitFor(() => expect(screen.getByText("Post Two")).toBeTruthy());
    expect(screen.getByText("Post One")).toBeTruthy();
  });

  it("passes a titleOverride through as the page heading for category/tag pages", async () => {
    vi.mocked(blogService.listArticles).mockResolvedValue(page([article()]));

    renderWithIntl(<PublicBlogIndexView categorySlug="nutrition" titleOverride="Nutrition" />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Nutrition" })).toBeTruthy());
  });

  it("renders correctly in fa locale (RTL)", async () => {
    vi.mocked(blogService.listArticles).mockResolvedValue(page([article()]));

    renderWithIntl(<PublicBlogIndexView />, "fa");

    await waitFor(() => expect(screen.getByText("وبلاگ")).toBeTruthy());
  });
});
