import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/render-with-intl";
import { NextIntlClientProvider } from "next-intl";
import fa from "@/messages/fa.json";
import en from "@/messages/en.json";
import de from "@/messages/de.json";
import es from "@/messages/es.json";
import type { RouteLocale } from "@/lib/i18n/config";
import { formatLocaleDate } from "@/lib/i18n/format";
import { helpCenterService } from "@/services/help-center.service";
import { HelpArticleView, HelpCategoryView, HelpCenterHomeView, HelpFaqView, IncidentDetailView, LegalDocumentView, LegalIndexView, SystemStatusView } from "./PublicHelpViews";

vi.mock("@/services/help-center.service", () => ({ helpCenterService: {
  categories: vi.fn(), articles: vi.fn(), search: vi.fn(), article: vi.fn(), vote: vi.fn(), legalIndex: vi.fn(), legalDocument: vi.fn(), status: vi.fn(), incident: vi.fn(),
} }));

const catalogs = { fa: fa.publicHelp, en: en.publicHelp, de: de.publicHelp, es: es.publicHelp };
const timestamp = "2026-11-01T00:00:00Z";
const article = { id: "qa-article", slug: "fixture", title: "Original source title", summary: null, body: "Original authored <script>fixture</script>", categorySlug: "care", isFaq: false, publishedAt: timestamp, contextKeys: [], category: { slug: "care", title: "Original source topic" }, version: 1, updatedAt: timestamp };
const emptyStatus = { indicator: "OPERATIONAL", generatedAt: timestamp, openIncidents: [], recentIncidents: [], maintenance: [], activeMaintenance: null };

function leaves(value: object, prefix = ""): Record<string, string> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => typeof entry === "string" ? [[`${prefix}${key}`, entry]] : Object.entries(leaves(entry, `${prefix}${key}.`))));
}

describe("public help/legal/status own catalogs (no merged fallback masking)", () => {
  it.each(["fa", "en", "de", "es"] as RouteLocale[])("has the entire publicHelp key set in %s", (locale) => {
    const copy = leaves(catalogs[locale]);
    expect(Object.keys(copy).sort()).toEqual(Object.keys(leaves(catalogs.en)).sort());
    expect(Object.values(copy).every((value) => value.trim().length > 0)).toBe(true);
  });

  it("does not apply a previous article's delayed feedback to the next article", async () => {
    vi.mocked(helpCenterService.article).mockResolvedValue(article);
    let resolveVote!: (value: { ok: true }) => void;
    vi.mocked(helpCenterService.vote).mockImplementation(() => new Promise((resolve) => { resolveVote = resolve; }));
    const view = renderWithIntl(<HelpArticleView slug="fixture" />);
    fireEvent.click(await screen.findByRole("button", { name: "Yes" }));
    vi.mocked(helpCenterService.article).mockResolvedValue({ ...article, id: "second", slug: "second", title: "Second original article" });
    view.rerender(<NextIntlClientProvider locale="en" messages={en}><HelpArticleView slug="second" /></NextIntlClientProvider>);
    expect(await screen.findByText("Second original article")).toBeTruthy();
    await act(async () => resolveVote({ ok: true }));
    expect(screen.queryByText(en.publicHelp.feedbackThanks)).toBeNull();
    expect(screen.getByRole("button", { name: "Yes" }).hasAttribute("disabled")).toBe(false);
  });
});

describe.each(["fa", "en", "de", "es"] as RouteLocale[])("public help/legal/status whole-interface states: %s", (locale) => {
  const copy = catalogs[locale];
  beforeEach(() => vi.resetAllMocks());

  it("announces loading and shows translated topics/search/empty actions without translating source content", async () => {
    let resolveCategories!: (items: []) => void;
    vi.mocked(helpCenterService.categories).mockImplementation(() => new Promise((resolve) => { resolveCategories = resolve; }));
    vi.mocked(helpCenterService.articles).mockResolvedValue([]);
    vi.mocked(helpCenterService.search).mockResolvedValue([]);
    renderWithIntl(<HelpCenterHomeView />, locale);
    expect(screen.getByLabelText(copy.loading)).toBeTruthy();
    expect(screen.getByRole("heading", { name: copy.helpTitle })).toBeTruthy();
    await act(async () => resolveCategories([]));
    expect(await screen.findByText(copy.noTopics)).toBeTruthy();
    expect(screen.getByText(copy.noMatches)).toBeTruthy();
    expect(screen.getByRole("link", { name: copy.contactSupport }).getAttribute("href")).toBe(`/${locale}/support`);
    fireEvent.change(screen.getByRole("textbox", { name: copy.searchLabel }), { target: { value: "fixture" } });
    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() => expect(helpCenterService.search).toHaveBeenCalledWith(locale, "fixture"));
    expect(await screen.findByRole("heading", { name: copy.searchResults })).toBeTruthy();
  });

  it("localizes failure and retry without inventing published articles", async () => {
    vi.mocked(helpCenterService.categories).mockRejectedValueOnce(new Error("fixture offline")).mockResolvedValue([]);
    vi.mocked(helpCenterService.articles).mockResolvedValue([]);
    renderWithIntl(<HelpCenterHomeView />, locale);
    expect(await screen.findByText(copy.failureDescription)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: copy.retry }));
    expect(await screen.findByText(copy.noTopics)).toBeTruthy();
  });

  it("localizes category and FAQ empty states and preserves locale destinations", async () => {
    vi.mocked(helpCenterService.articles).mockResolvedValue([]);
    const category = renderWithIntl(<HelpCategoryView slug="care" />, locale);
    expect(await screen.findByText(copy.noTopicArticles)).toBeTruthy();
    expect(screen.getByRole("link", { name: copy.backHelp }).getAttribute("href")).toBe(`/${locale}/help`);
    category.unmount();
    renderWithIntl(<HelpFaqView />, locale);
    expect(await screen.findByText(copy.noFaq)).toBeTruthy();
  });

  it("preserves/escapes article text, formats dates and prevents duplicate in-flight feedback", async () => {
    vi.mocked(helpCenterService.article).mockResolvedValue(article);
    let resolveVote!: (value: { ok: true }) => void;
    vi.mocked(helpCenterService.vote).mockImplementation(() => new Promise((resolve) => { resolveVote = resolve; }));
    const { container } = renderWithIntl(<HelpArticleView slug="fixture" />, locale);
    expect(await screen.findByText(article.body)).toBeTruthy();
    expect(container.querySelector("article script")).toBeNull();
    expect(container.querySelector("article")?.getAttribute("lang")).toBe(locale === "fa" ? "fa" : "en");
    expect(screen.getByText(new RegExp(formatLocaleDate(timestamp, locale).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeTruthy();
    const yes = screen.getByRole("button", { name: copy.yes });
    fireEvent.click(yes);
    fireEvent.click(yes);
    expect(yes.hasAttribute("disabled")).toBe(true);
    expect(helpCenterService.vote).toHaveBeenCalledTimes(1);
    await act(async () => resolveVote({ ok: true }));
    expect(await screen.findByText(copy.feedbackThanks)).toBeTruthy();
  });

  it("localizes article-unavailable text and feedback failure", async () => {
    vi.mocked(helpCenterService.article).mockRejectedValueOnce(new Error("fixture missing"));
    const missing = renderWithIntl(<HelpArticleView slug="missing" />, locale);
    expect(await screen.findByText(copy.articleUnavailableDescription)).toBeTruthy();
    missing.unmount();
    vi.mocked(helpCenterService.article).mockResolvedValue(article);
    vi.mocked(helpCenterService.vote).mockRejectedValue(new Error("fixture offline"));
    renderWithIntl(<HelpArticleView slug="fixture" />, locale);
    fireEvent.click(await screen.findByRole("button", { name: copy.no }));
    expect(await screen.findByText(copy.feedbackFailure)).toBeTruthy();
  });

  it("localizes all ten unpublished legal labels without creating policy text", async () => {
    vi.mocked(helpCenterService.legalIndex).mockResolvedValue([]);
    const index = renderWithIntl(<LegalIndexView />, locale);
    expect(await screen.findAllByText(copy.unpublished)).toHaveLength(10);
    for (const title of Object.values(copy.legalTitles)) expect(screen.getByText(title)).toBeTruthy();
    index.unmount();
    vi.mocked(helpCenterService.legalDocument).mockResolvedValue({ kind: "PRIVACY_POLICY", locale: "en", available: false, title: null, body: null, version: null, effectiveAt: null });
    renderWithIntl(<LegalDocumentView slug="privacy" />, locale);
    expect(await screen.findByText(copy.documentUnpublished)).toBeTruthy();
    expect(screen.getByRole("heading", { name: copy.legalTitles.privacy })).toBeTruthy();
  });

  it("localizes status errors, recovery and indicator without asserting an unknown status as normal", async () => {
    vi.mocked(helpCenterService.status).mockRejectedValueOnce(new Error("fixture offline")).mockResolvedValue({ ...emptyStatus, indicator: "UNRECOGNIZED" });
    renderWithIntl(<SystemStatusView />, locale);
    expect(await screen.findByText(copy.statusFailure)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: copy.retry }));
    expect(await screen.findByText(copy.unknownState)).toBeTruthy();
    expect(screen.queryByText(copy.indicators.OPERATIONAL)).toBeNull();
  });

  it("localizes operational/incident labels but leaves admin-authored messages unchanged", async () => {
    const incident = { id: "fixture", title: "Original incident title", status: "RESOLVED", impact: "MINOR", components: [], startedAt: timestamp, resolvedAt: timestamp, updates: [{ id: "fixture-update", status: "MONITORING", body: "Original incident message", createdAt: timestamp }] };
    vi.mocked(helpCenterService.status).mockResolvedValue(emptyStatus);
    const status = renderWithIntl(<SystemStatusView />, locale);
    expect(await screen.findByText(copy.indicators.OPERATIONAL)).toBeTruthy();
    expect(screen.getAllByText(copy.noIncidents)).toHaveLength(2);
    status.unmount();
    vi.mocked(helpCenterService.incident).mockResolvedValue(incident);
    renderWithIntl(<IncidentDetailView id="fixture" />, locale);
    expect(await screen.findByText("Original incident message")).toBeTruthy();
    expect(screen.getByText(copy.incidentStates.RESOLVED)).toBeTruthy();
    expect(screen.getByText(new RegExp(copy.incidentStates.MONITORING))).toBeTruthy();
    expect(screen.getByRole("link", { name: copy.backStatus }).getAttribute("href")).toBe(`/${locale}/status`);
  });
});
