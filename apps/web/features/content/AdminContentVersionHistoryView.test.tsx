import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ContentVersionSummaryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminContentService } from "@/services/admin-content.service";
import { AdminContentVersionHistoryView } from "./AdminContentVersionHistoryView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/admin-content.service", () => ({ adminContentService: { listVersions: vi.fn(), restoreVersion: vi.fn() } }));

function version(overrides: Partial<ContentVersionSummaryDto> = {}): ContentVersionSummaryDto {
  return {
    id: "version-1",
    articleId: "article-1",
    locale: "fa" as never,
    versionNumber: 1,
    editorAdmin: { id: "admin-1", displayName: "Editor One", role: "EDITOR" as never },
    changeNote: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("AdminContentVersionHistoryView", () => {
  beforeEach(() => {
    vi.mocked(adminContentService.listVersions).mockReset();
    vi.mocked(adminContentService.restoreVersion).mockReset();
    push.mockReset();
  });

  it("lists versions newest-first with their editor and an optional change note", async () => {
    vi.mocked(adminContentService.listVersions).mockResolvedValue([version({ id: "v2", versionNumber: 2, changeNote: "fixed typo" }), version({ id: "v1", versionNumber: 1 })]);

    renderWithIntl(<AdminContentVersionHistoryView articleId="article-1" locale="fa" />);

    await waitFor(() => expect(screen.getByText("Version 2")).toBeTruthy());
    expect(screen.getByText("Version 1")).toBeTruthy();
    expect(screen.getByText("fixed typo")).toBeTruthy();
    expect(screen.getAllByText("Restore")).toHaveLength(2);
  });

  it("shows an empty state when there is no version history", async () => {
    vi.mocked(adminContentService.listVersions).mockResolvedValue([]);

    renderWithIntl(<AdminContentVersionHistoryView articleId="article-1" locale="fa" />);

    await waitFor(() => expect(screen.getByText("No versions yet.")).toBeTruthy());
  });

  it("restoring a version calls the restore endpoint and navigates back to the editor", async () => {
    vi.mocked(adminContentService.listVersions).mockResolvedValue([version()]);
    vi.mocked(adminContentService.restoreVersion).mockResolvedValue({} as never);

    renderWithIntl(<AdminContentVersionHistoryView articleId="article-1" locale="fa" />);
    await waitFor(() => expect(screen.getByText("Version 1")).toBeTruthy());

    fireEvent.click(screen.getByText("Restore"));

    await waitFor(() => expect(adminContentService.restoreVersion).toHaveBeenCalledWith("version-1"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/admin/content/article-1"));
  });

  it("shows an error state with retry when versions fail to load", async () => {
    vi.mocked(adminContentService.listVersions).mockRejectedValue(new Error("network error"));

    renderWithIntl(<AdminContentVersionHistoryView articleId="article-1" locale="fa" />);

    await waitFor(() => expect(screen.getByText("Retry")).toBeTruthy());
  });

  it("renders correctly in fa locale (RTL)", async () => {
    vi.mocked(adminContentService.listVersions).mockResolvedValue([version()]);

    renderWithIntl(<AdminContentVersionHistoryView articleId="article-1" locale="fa" />, "fa");

    await waitFor(() => expect(screen.getByText("تاریخچه نسخه‌ها")).toBeTruthy());
  });
});
