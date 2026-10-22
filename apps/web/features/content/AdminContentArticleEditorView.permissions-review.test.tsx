import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
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


import { useAdminStore } from "@/stores/admin-store";

describe("QA review: article write controls follow resolved permissions", () => {
 beforeEach(() => {
  vi.mocked(adminContentService.listCategories).mockReset().mockResolvedValue([]);
  vi.mocked(adminContentService.listAuthors).mockReset().mockResolvedValue([]);
  vi.mocked(adminContentService.listTags).mockReset().mockResolvedValue([]);
  vi.mocked(adminContentService.getArticle).mockReset().mockResolvedValue(article());
  vi.mocked(adminContentService.getArticleLocale).mockReset().mockResolvedValue(localeContent());
 });
 const role = (value: string, permissions: string[]) => useAdminStore.setState({status: "ready", context: {isAdmin: true, adminUserId: "qa-admin", displayName: "QA", role: value, permissions} as never});
 it("does not fetch or expose write controls while admin permissions are unresolved", () => {
  useAdminStore.setState({status: "loading", context: null});
  renderWithIntl(<AdminContentArticleEditorView articleId="article-1" />);
  expect(adminContentService.getArticle).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", {name: "Save draft"})).toBeNull();
 });
 it("does not grant creation to a view-only user", async () => {
  role("READ_ONLY", ["content.view"]);
  renderWithIntl(<AdminContentArticleEditorView articleId={null} />);
  expect(screen.queryByRole("button", {name: "Save draft"})).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
 });
 it("keeps archive permission independent from publish and edit", async () => {
  role("CUSTOM", ["content.view", "content.archive"]);
  renderWithIntl(<AdminContentArticleEditorView articleId="article-1" />);
  await screen.findByDisplayValue("پیش‌نویس");
  expect((screen.getByRole("button", {name: "Archive"}) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByRole("button", {name: "Publish"})).toBeNull();
  expect(screen.queryByRole("button", {name: "Save draft"})).toBeNull();
 });
 it("removes write controls after a permission change without discarding the typed draft", async () => {
  role("EDITOR", ["content.view", "content.edit"]);
  renderWithIntl(<AdminContentArticleEditorView articleId="article-1" />);
  const input = await screen.findByDisplayValue("پیش‌نویس");
  fireEvent.change(input, {target: {value: "پیش‌نویس محفوظ"}});
  act(() => role("READ_ONLY", ["content.view"]));
  expect(screen.queryByRole("button", {name: "Save draft"})).toBeNull();
  expect((screen.getByDisplayValue("پیش‌نویس محفوظ") as HTMLInputElement).readOnly).toBe(true);
  expect(screen.queryByRole("button", {name: "Save"})).toBeNull();
 });
 it("shows only the article's selected tags to a read-only viewer", async () => {
  role("READ_ONLY", ["content.view"]);
  const selected = {id: "tag-one", locales: [{locale: "en", name: "Selected tag", slug: "selected"}]} as never;
  const other = {id: "tag-two", locales: [{locale: "en", name: "Other catalog tag", slug: "other"}]} as never;
  vi.mocked(adminContentService.listTags).mockResolvedValue([selected, other]);
  vi.mocked(adminContentService.getArticle).mockResolvedValue(article({tags: [selected]}));
  renderWithIntl(<AdminContentArticleEditorView articleId="article-1" />);
  await screen.findByDisplayValue("پیش‌نویس");
  expect(screen.getByText("Selected tag")).toBeTruthy();
  expect(screen.queryByText("Other catalog tag")).toBeNull();
 });
 it("READ_ONLY does not see Save or Publish controls", async () => {
  role("READ_ONLY", ["content.view"]);
  renderWithIntl(<AdminContentArticleEditorView articleId="article-1" />);
  await screen.findByDisplayValue("پیش‌نویس");
  expect(screen.queryByRole("button", {name: "Save draft"})).toBeNull();
  expect(screen.queryByRole("button", {name: "Publish"})).toBeNull();
 });
 it("EDITOR may save a draft but does not see Publish", async () => {
  role("EDITOR", ["content.view", "content.create", "content.edit"]);
  renderWithIntl(<AdminContentArticleEditorView articleId="article-1" />);
  await screen.findByDisplayValue("پیش‌نویس");
  expect(screen.getByRole("button", {name: "Save draft"})).toBeTruthy();
  expect(screen.queryByRole("button", {name: "Publish"})).toBeNull();
 });
 it("EDITOR without publish cannot see the live-write control", async () => {
  role("EDITOR", ["content.view", "content.create", "content.edit"]);
  vi.mocked(adminContentService.getArticleLocale).mockResolvedValue(localeContent({status: "VISIBLE" as never}));
  renderWithIntl(<AdminContentArticleEditorView articleId="article-1" />);
  await screen.findByDisplayValue("پیش‌نویس");
  expect(screen.queryByRole("button", {name: "Save and update the live article"})).toBeNull();
 });
 it("publisher keeps the allowed live-write control", async () => {
  role("ADMIN", ["content.view", "content.create", "content.edit", "content.publish"]);
  vi.mocked(adminContentService.getArticleLocale).mockResolvedValue(localeContent({status: "VISIBLE" as never}));
  renderWithIntl(<AdminContentArticleEditorView articleId="article-1" />);
  await screen.findByDisplayValue("پیش‌نویس");
  expect(screen.getByRole("button", {name: "Save and update the live article"})).toBeTruthy();
 });
});
