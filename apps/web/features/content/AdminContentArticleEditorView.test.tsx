import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { AdminArticleDto, AdminArticleLocaleDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminContentService } from "@/services/admin-content.service";
import { AdminContentArticleEditorView } from "./AdminContentArticleEditorView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/admin-content.service", () => ({
  adminContentService: {
    listCategories: vi.fn(),
    listAuthors: vi.fn(),
    listTags: vi.fn(),
    getArticle: vi.fn(),
    getArticleLocale: vi.fn(),
    saveArticleLocale: vi.fn(),
    createArticle: vi.fn(),
    updateArticle: vi.fn(),
    publishArticleLocale: vi.fn(),
    hideArticleLocale: vi.fn(),
    archiveArticleLocale: vi.fn(),
  },
}));

function article(overrides: Partial<AdminArticleDto> = {}): AdminArticleDto {
  return {
    id: "article-1",
    author: null,
    category: null,
    coverMediaAsset: null,
    tags: [],
    createdByAdmin: { id: "admin-1", displayName: "Editor One", role: "EDITOR" as never },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    locales: [{ locale: "fa" as never, status: "DRAFT" as never, title: "پیش‌نویس", slug: "draft-slug", updatedAt: "2026-01-02T00:00:00.000Z" }],
    ...overrides,
  };
}

function localeContent(overrides: Partial<AdminArticleLocaleDto> = {}): AdminArticleLocaleDto {
  return {
    articleId: "article-1",
    locale: "fa" as never,
    status: "DRAFT" as never,
    title: "پیش‌نویس",
    slug: "draft-slug",
    excerpt: null,
    body: [{ type: "paragraph", content: [{ text: "متن" }] }],
    seoTitle: null,
    seoDescription: null,
    publishedAt: null,
    lastEditedByAdmin: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("AdminContentArticleEditorView", () => {
  beforeEach(() => {
    vi.mocked(adminContentService.listCategories).mockReset().mockResolvedValue([]);
    vi.mocked(adminContentService.listAuthors).mockReset().mockResolvedValue([]);
    vi.mocked(adminContentService.listTags).mockReset().mockResolvedValue([]);
    vi.mocked(adminContentService.getArticle).mockReset();
    vi.mocked(adminContentService.getArticleLocale).mockReset();
    vi.mocked(adminContentService.publishArticleLocale).mockReset();
    vi.mocked(adminContentService.hideArticleLocale).mockReset();
    vi.mocked(adminContentService.archiveArticleLocale).mockReset();
  });

  it("a DRAFT locale allows Publish and Archive but not Hide", async () => {
    vi.mocked(adminContentService.getArticle).mockResolvedValue(article());
    vi.mocked(adminContentService.getArticleLocale).mockResolvedValue(localeContent());

    renderWithIntl(<AdminContentArticleEditorView articleId="article-1" />);

    await waitFor(() => expect(screen.getByDisplayValue("پیش‌نویس")).toBeTruthy());
    expect((screen.getByText("Publish").closest("button") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByText("Hide").closest("button") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText("Archive").closest("button") as HTMLButtonElement).disabled).toBe(false);
  });

  it("a VISIBLE locale allows Hide but not Publish or Archive", async () => {
    vi.mocked(adminContentService.getArticle).mockResolvedValue(article({ locales: [{ locale: "fa" as never, status: "VISIBLE" as never, title: "منتشرشده", slug: "live-slug", updatedAt: "2026-01-02T00:00:00.000Z" }] }));
    vi.mocked(adminContentService.getArticleLocale).mockResolvedValue(localeContent({ status: "VISIBLE" as never, title: "منتشرشده", slug: "live-slug", publishedAt: "2026-01-02T00:00:00.000Z" }));

    renderWithIntl(<AdminContentArticleEditorView articleId="article-1" />);

    await waitFor(() => expect(screen.getByDisplayValue("منتشرشده")).toBeTruthy());
    expect((screen.getByText("Publish").closest("button") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText("Hide").closest("button") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByText("Archive").closest("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("an ARCHIVED locale allows neither Publish, Hide, nor Archive — a true terminal state", async () => {
    vi.mocked(adminContentService.getArticle).mockResolvedValue(article({ locales: [{ locale: "fa" as never, status: "ARCHIVED" as never, title: "بایگانی", slug: "archived-slug", updatedAt: "2026-01-02T00:00:00.000Z" }] }));
    vi.mocked(adminContentService.getArticleLocale).mockResolvedValue(localeContent({ status: "ARCHIVED" as never, title: "بایگانی", slug: "archived-slug" }));

    renderWithIntl(<AdminContentArticleEditorView articleId="article-1" />);

    await waitFor(() => expect(screen.getByDisplayValue("بایگانی")).toBeTruthy());
    expect((screen.getByText("Publish").closest("button") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText("Hide").closest("button") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText("Archive").closest("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("publishing calls the publish endpoint for the active locale only, never a combined save+publish", async () => {
    vi.mocked(adminContentService.getArticle).mockResolvedValue(article());
    vi.mocked(adminContentService.getArticleLocale).mockResolvedValue(localeContent());
    vi.mocked(adminContentService.publishArticleLocale).mockResolvedValue(localeContent({ status: "VISIBLE" as never, publishedAt: "2026-01-03T00:00:00.000Z" }));

    renderWithIntl(<AdminContentArticleEditorView articleId="article-1" />);
    await waitFor(() => expect(screen.getByDisplayValue("پیش‌نویس")).toBeTruthy());

    fireEvent.click(screen.getByText("Publish"));

    await waitFor(() => expect(adminContentService.publishArticleLocale).toHaveBeenCalledWith("article-1", "fa"));
    expect(adminContentService.hideArticleLocale).not.toHaveBeenCalled();
  });

  it("toggling preview renders the RichTextRenderer output instead of the block editor", async () => {
    vi.mocked(adminContentService.getArticle).mockResolvedValue(article());
    vi.mocked(adminContentService.getArticleLocale).mockResolvedValue(localeContent());

    renderWithIntl(<AdminContentArticleEditorView articleId="article-1" />);
    await waitFor(() => expect(screen.getByDisplayValue("پیش‌نویس")).toBeTruthy());

    expect(screen.queryAllByRole("textbox").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Preview"));
    expect(screen.queryAllByRole("textbox").some((el) => el.tagName === "TEXTAREA")).toBe(false);
    expect(screen.getByText("متن")).toBeTruthy();
    expect(screen.getByText("Edit")).toBeTruthy();
  });

  it("switching locale tabs loads that locale's own independent content", async () => {
    vi.mocked(adminContentService.getArticle).mockResolvedValue(
      article({ locales: [{ locale: "fa" as never, status: "DRAFT" as never, title: "پیش‌نویس", slug: "draft-slug", updatedAt: "2026-01-02T00:00:00.000Z" }] }),
    );
    vi.mocked(adminContentService.getArticleLocale).mockImplementation(async (id, loc) => (loc === "fa" ? localeContent() : localeContent({ locale: "en" as never, title: "English Draft", slug: "english-draft", body: [] })));

    renderWithIntl(<AdminContentArticleEditorView articleId="article-1" />);
    await waitFor(() => expect(screen.getByDisplayValue("پیش‌نویس")).toBeTruthy());

    fireEvent.click(screen.getByText(/^EN/));
    await waitFor(() => expect(screen.getByDisplayValue("English Draft")).toBeTruthy());
  });

  it("shows an error state with retry when shared data fails to load", async () => {
    vi.mocked(adminContentService.listCategories).mockRejectedValue(new Error("network error"));

    renderWithIntl(<AdminContentArticleEditorView articleId="article-1" />);

    await waitFor(() => expect(screen.getByText("Retry")).toBeTruthy());
  });
});
