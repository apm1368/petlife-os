import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { AdminArticleDto, AdminArticleLocaleDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminContentService } from "@/services/admin-content.service";
import { AdminContentArticleEditorView } from "./AdminContentArticleEditorView";
import { useAdminStore } from "@/stores/admin-store";
import { ApiError } from "@/lib/api/client";

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
    useAdminStore.setState({ status: "ready", context: { isAdmin: true, adminUserId: "test-admin", displayName: "Publisher", role: "ADMIN", permissions: ["content.view", "content.create", "content.edit", "content.publish", "content.archive"] } as never });
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

  describe("save, shared-field and status errors are explicit and keep what was typed", () => {
    const apiError = (status: number, code: string, details?: Record<string, unknown>) => new ApiError({ code, message: code, details, requestId: "req-1" }, status);

    it("a server-side permission revocation rejects a live save while preserving the edited title", async () => {
      vi.mocked(adminContentService.getArticle).mockResolvedValue(article({ locales: [{ locale: "fa" as never, status: "VISIBLE" as never, title: "منتشرشده", slug: "live-slug", updatedAt: "2026-01-02T00:00:00.000Z" }] }));
      vi.mocked(adminContentService.getArticleLocale).mockResolvedValue(localeContent({ status: "VISIBLE" as never, title: "منتشرشده", slug: "live-slug" }));
      vi.mocked(adminContentService.saveArticleLocale).mockReset().mockRejectedValue(apiError(403, "ADMIN_ACCESS_DENIED", { reason: "LIVE_EDIT_REQUIRES_CONTENT_PUBLISH" }));
      renderWithIntl(<AdminContentArticleEditorView articleId="article-1" />);
      const title = await screen.findByDisplayValue("منتشرشده");
      fireEvent.change(title, { target: { value: "عنوان ویرایش‌شده" } });
      // On a live article the button says what it does: it changes the published text.
      expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Save and update the live article" }));
      expect((await screen.findByRole("alert")).textContent).toContain("Only someone who can publish");
      expect(screen.getByDisplayValue("عنوان ویرایش‌شده")).toBeTruthy();
    });

    it("a network/server failure says the edits are kept (not 'check the slug'); a duplicate slug still says check the slug", async () => {
      vi.mocked(adminContentService.getArticle).mockResolvedValue(article());
      vi.mocked(adminContentService.getArticleLocale).mockResolvedValue(localeContent());
      vi.mocked(adminContentService.saveArticleLocale).mockReset().mockRejectedValueOnce(new Error("network")).mockRejectedValueOnce(apiError(409, "DUPLICATE_ARTICLE_SLUG"));
      renderWithIntl(<AdminContentArticleEditorView articleId="article-1" />);
      await screen.findByDisplayValue("پیش‌نویس");
      fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
      expect((await screen.findByRole("alert")).textContent).toContain("Your edits are still here");
      fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
      await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Check the slug"));
      expect(screen.getByDisplayValue("پیش‌نویس")).toBeTruthy();
    });

    it("a failed shared-fields save and a failed publish are shown, not swallowed", async () => {
      vi.mocked(adminContentService.getArticle).mockResolvedValue(article());
      vi.mocked(adminContentService.getArticleLocale).mockResolvedValue(localeContent());
      vi.mocked(adminContentService.updateArticle).mockReset().mockRejectedValue(new Error("network"));
      vi.mocked(adminContentService.publishArticleLocale).mockRejectedValue(apiError(403, "ADMIN_ACCESS_DENIED"));
      renderWithIntl(<AdminContentArticleEditorView articleId="article-1" />);
      await screen.findByDisplayValue("پیش‌نویس");
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect((await screen.findByRole("alert")).textContent).toContain("Could not save the category, author or tags");
      fireEvent.click(screen.getByText("Publish"));
      await waitFor(() => expect(screen.getAllByRole("alert").some((a) => a.textContent?.includes("permission to change this article's status"))).toBe(true));
    });
  });

  describe("locale read failures never become empty writable drafts", () => {
    it("shows a read error and retries the GET instead of offering an empty save", async () => {
      vi.mocked(adminContentService.getArticle).mockResolvedValue(article());
      vi.mocked(adminContentService.getArticleLocale).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(localeContent());
      renderWithIntl(<AdminContentArticleEditorView articleId="article-1" />);
      const retry = await screen.findByRole("button", {name: "Retry"});
      expect(screen.queryByRole("button", {name: "Save draft"})).toBeNull();
      fireEvent.click(retry);
      await screen.findByDisplayValue("پیش‌نویس");
      expect(adminContentService.getArticleLocale).toHaveBeenCalledTimes(2);
    });

    it("still allows a genuinely missing locale to be created after a 404", async () => {
      vi.mocked(adminContentService.getArticle).mockResolvedValue(article());
      vi.mocked(adminContentService.getArticleLocale).mockRejectedValue(new ApiError({code: "NOT_FOUND", message: "not found", requestId: "qa"},404));
      renderWithIntl(<AdminContentArticleEditorView articleId="article-1" />);
      await screen.findByRole("button", {name: "Save draft"});
      expect(screen.queryByRole("button", {name: "Retry"})).toBeNull();
      expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("");
    });

    it("does not treat a forbidden locale read as a new empty locale", async () => {
      vi.mocked(adminContentService.getArticle).mockResolvedValue(article());
      vi.mocked(adminContentService.getArticleLocale).mockRejectedValue(new ApiError({code: "ADMIN_ACCESS_DENIED", message: "forbidden", requestId: "qa"},403));
      renderWithIntl(<AdminContentArticleEditorView articleId="article-1" />);
      await screen.findByRole("button", {name: "Retry"});
      expect(screen.queryByRole("button", {name: "Save draft"})).toBeNull();
    });

    it("ignores a late response for the previous locale", async () => {
      let resolveFa!: (value: AdminArticleLocaleDto) => void;
      vi.mocked(adminContentService.getArticle).mockResolvedValue(article());
      vi.mocked(adminContentService.getArticleLocale).mockImplementation(async (_id, loc) => loc === "fa" ? new Promise<AdminArticleLocaleDto>(resolve => {resolveFa=resolve;}) : localeContent({locale: "en" as never,title: "English draft"}));
      renderWithIntl(<AdminContentArticleEditorView articleId="article-1" />);
      fireEvent.click(await screen.findByText(/^EN/));
      await screen.findByDisplayValue("English draft");
      await act(async () => resolveFa(localeContent()));
      expect(screen.getByDisplayValue("English draft")).toBeTruthy();
      expect(screen.queryByDisplayValue("پیش‌نویس")).toBeNull();
    });
  });

});
