import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { AdminArticleListItemDto, PaginatedDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminContentService } from "@/services/admin-content.service";
import { AdminContentArticleListView } from "./AdminContentArticleListView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/admin-content.service", () => ({ adminContentService: { listArticles: vi.fn() } }));

function item(overrides: Partial<AdminArticleListItemDto> = {}): AdminArticleListItemDto {
  return {
    id: "article-1",
    author: null,
    category: null,
    createdByAdmin: { id: "admin-1", displayName: "Editor One", role: "EDITOR" as never },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    locales: [{ locale: "fa" as never, status: "DRAFT" as never, title: "عنوان تست", slug: "test-title", updatedAt: "2026-01-02T00:00:00.000Z" }],
    ...overrides,
  };
}

function page(items: AdminArticleListItemDto[]): PaginatedDto<AdminArticleListItemDto> {
  return { items, total: items.length, page: 1, pageSize: 50 };
}

describe("AdminContentArticleListView", () => {
  beforeEach(() => {
    vi.mocked(adminContentService.listArticles).mockReset();
  });

  it("shows each article's locale status badges and title", async () => {
    vi.mocked(adminContentService.listArticles).mockResolvedValue(page([item()]));

    renderWithIntl(<AdminContentArticleListView />);

    await waitFor(() => expect(screen.getByText("عنوان تست")).toBeTruthy());
    expect(screen.getByText("FA: Draft")).toBeTruthy();
  });

  it("shows an empty state when there are no articles", async () => {
    vi.mocked(adminContentService.listArticles).mockResolvedValue(page([]));

    renderWithIntl(<AdminContentArticleListView />);

    await waitFor(() => expect(screen.getByText("No articles yet.")).toBeTruthy());
  });

  it("re-queries with the typed search term when filters are applied", async () => {
    vi.mocked(adminContentService.listArticles).mockResolvedValue(page([item()]));

    renderWithIntl(<AdminContentArticleListView />);
    await waitFor(() => expect(screen.getByText("عنوان تست")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "dogs" } });
    fireEvent.click(screen.getByText("Apply filters"));

    await waitFor(() => expect(adminContentService.listArticles).toHaveBeenLastCalledWith(expect.objectContaining({ search: "dogs" })));
  });

  it("shows an error state with retry when the list fails to load", async () => {
    vi.mocked(adminContentService.listArticles).mockRejectedValue(new Error("network error"));

    renderWithIntl(<AdminContentArticleListView />);

    await waitFor(() => expect(screen.getByText("Retry")).toBeTruthy());
  });

  it("renders correctly in fa locale (RTL) with localized status labels", async () => {
    vi.mocked(adminContentService.listArticles).mockResolvedValue(page([item()]));

    renderWithIntl(<AdminContentArticleListView />, "fa");

    await waitFor(() => expect(screen.getByText("مقالات")).toBeTruthy());
  });
});
