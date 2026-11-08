import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { helpCenterService } from "@/services/help-center.service";
import { HelpCenterHomeView, HelpArticleView, LegalIndexView, SystemStatusView } from "./PublicHelpViews";

vi.mock("@/services/help-center.service", () => ({ helpCenterService: {
  categories: vi.fn(), articles: vi.fn(), search: vi.fn(), article: vi.fn(), vote: vi.fn(), legalIndex: vi.fn(), legalDocument: vi.fn(), status: vi.fn(), incident: vi.fn(),
} }));

describe("public Help Center, legal and status views", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses genuine empty states when there are no published help records", async () => {
    vi.mocked(helpCenterService.categories).mockResolvedValue([]);
    vi.mocked(helpCenterService.articles).mockResolvedValue([]);
    renderWithIntl(<HelpCenterHomeView />);
    expect(await screen.findByText("No help topics have been published yet.")).toBeTruthy();
    expect(screen.getByText("No matching articles found.")).toBeTruthy();
  });

  it("never substitutes legal placeholder copy when a document is unpublished", async () => {
    vi.mocked(helpCenterService.legalIndex).mockResolvedValue([]);
    renderWithIntl(<LegalIndexView />);
    expect(await screen.findAllByText("Not yet published")).toHaveLength(10);
    expect(screen.queryByText(/Lorem ipsum|sample legal/i)).toBeNull();
  });

  it("renders an article body as text and records explicit feedback", async () => {
    vi.mocked(helpCenterService.article).mockResolvedValue({ id: "a1", slug: "real-guide", title: "Real guide", summary: null, categorySlug: "care", isFaq: false, publishedAt: null, body: "Only published content", contextKeys: [], category: { slug: "care", title: "Care" }, version: 1, updatedAt: "2026-11-01T00:00:00Z" });
    vi.mocked(helpCenterService.vote).mockResolvedValue({ ok: true });
    renderWithIntl(<HelpArticleView slug="real-guide" />);
    expect(await screen.findByText("Only published content")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(await screen.findByText("Thanks for your feedback.")).toBeTruthy();
    expect(helpCenterService.vote).toHaveBeenCalledWith("en", "real-guide", true);
  });

  it("shows the unavailable state instead of asserting status when the API cannot be reached", async () => {
    vi.mocked(helpCenterService.status).mockRejectedValue(new Error("offline"));
    renderWithIntl(<SystemStatusView />);
    expect(await screen.findByText("System status is unavailable")).toBeTruthy();
    vi.mocked(helpCenterService.status).mockResolvedValue({ indicator: "OPERATIONAL", generatedAt: "2026-11-01T00:00:00Z", openIncidents: [], recentIncidents: [], maintenance: [], activeMaintenance: null });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("All systems operational")).toBeTruthy());
  });
});
