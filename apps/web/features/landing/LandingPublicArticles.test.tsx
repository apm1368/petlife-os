import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { PaginatedDto, PublicArticleSummaryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { blogService } from "@/services/blog.service";
import { LandingPublicArticles, type LandingArticlesCopy } from "./LandingPublicArticles";

vi.mock("@/services/blog.service", () => ({ blogService: { listArticles: vi.fn() } }));

const copy: LandingArticlesCopy = {
  eyebrow: "Trusted guidance",
  title: "Latest articles",
  allArticles: "See all articles",
  empty: "There are no published articles yet.",
  loadError: "Articles could not be loaded.",
  retry: "Try again",
};

function article(): PublicArticleSummaryDto {
  return {
    id: "article-1", locale: "en", slug: "care-guide", canonicalPath: "/en/blog/care-guide",
    title: "A published care guide", excerpt: "Verified editorial content", coverMediaAsset: null,
    author: null, category: null, tags: [], publishedAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

function page(items: PublicArticleSummaryDto[]): PaginatedDto<PublicArticleSummaryDto> {
  return { items, total: items.length, page: 1, pageSize: 3 };
}

describe("LandingPublicArticles", () => {
  beforeEach(() => vi.mocked(blogService.listArticles).mockReset());

  it("renders only returned public articles and excludes the guides section", async () => {
    vi.mocked(blogService.listArticles).mockResolvedValue(page([article()]));
    renderWithIntl(<LandingPublicArticles locale="en" copy={copy} />);

    await waitFor(() => expect(screen.getByText("A published care guide")).toBeTruthy());
    expect(blogService.listArticles).toHaveBeenCalledWith("en", { page: 1, pageSize: 3, excludeCategorySlug: "guides" });
    expect(screen.getByRole("link", { name: "See all articles" }).getAttribute("href")).toBe("/en/blog");
  });

  it("shows a genuine empty state when no articles are published", async () => {
    vi.mocked(blogService.listArticles).mockResolvedValue(page([]));
    renderWithIntl(<LandingPublicArticles locale="en" copy={copy} />);
    await waitFor(() => expect(screen.getByText(copy.empty)).toBeTruthy());
    expect(screen.queryByText("A published care guide")).toBeNull();
  });

  it("keeps failures explicit and retries the public endpoint", async () => {
    vi.mocked(blogService.listArticles).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(page([article()]));
    renderWithIntl(<LandingPublicArticles locale="en" copy={copy} />);
    await waitFor(() => expect(screen.getByText(copy.loadError)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: copy.retry }));
    await waitFor(() => expect(screen.getByText("A published care guide")).toBeTruthy());
    expect(blogService.listArticles).toHaveBeenCalledTimes(2);
  });
});
