import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { CommunityPostDto, PaginatedDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { communityService } from "@/services/community.service";
import { CommunityFeedView } from "./CommunityFeedView";

vi.mock("@/services/community.service", () => ({ communityService: { listPosts: vi.fn() } }));

function post(overrides: Partial<CommunityPostDto> = {}): CommunityPostDto {
  return {
    id: "post-1",
    authorUserId: null,
    isMine: false,
    authorDisplayName: "Sara",
    type: "GENERAL" as never,
    title: "A good day at the park",
    body: "We had a wonderful time today.",
    locale: null,
    countryCode: null,
    pet: null,
    mediaObjectKeys: [],
    mediaUrls: [],
    status: "PUBLISHED" as never,
    sourceType: "USER" as never,
    sourceLostPetIncidentId: null,
    sourceSupportCampaignId: null,
    commentCount: 2,
    reactionCount: 5,
    viewerReaction: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function page(items: CommunityPostDto[], total = items.length): PaginatedDto<CommunityPostDto> {
  return { items, total, page: 1, pageSize: 20 };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("CommunityFeedView", () => {
  beforeEach(() => {
    vi.mocked(communityService.listPosts).mockReset();
  });

  it.each(["fa", "en", "de", "es"] as const)("keeps the newest selected topic when an older response arrives last in %s", async (locale) => {
    const older = deferred<PaginatedDto<CommunityPostDto>>();
    const newer = deferred<PaginatedDto<CommunityPostDto>>();
    vi.mocked(communityService.listPosts).mockResolvedValueOnce(page([post()]))
      .mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    renderWithIntl(<CommunityFeedView />, locale);
    await screen.findByText("A good day at the park");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "QUESTION" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "GENERAL" } });
    await act(async () => newer.resolve(page([post({ id: "latest", title: "Latest topic result" })])));
    await act(async () => older.resolve(page([post({ id: "old", title: "Obsolete question result" })])));
    expect(screen.getByText("Latest topic result")).toBeTruthy();
    expect(screen.queryByText("Obsolete question result")).toBeNull();
    expect(communityService.listPosts).toHaveBeenLastCalledWith(expect.objectContaining({ type: "GENERAL", page: 1 }));
  });

  it("does not append an old page into a newly selected topic", async () => {
    const older = deferred<PaginatedDto<CommunityPostDto>>();
    vi.mocked(communityService.listPosts).mockResolvedValueOnce(page([post()], 2))
      .mockReturnValueOnce(older.promise).mockResolvedValueOnce(page([post({ id: "current", title: "Selected topic" })]));
    renderWithIntl(<CommunityFeedView />);
    await screen.findByText("A good day at the park");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "QUESTION" } });
    await screen.findByText("Selected topic");
    await act(async () => older.resolve({ ...page([post({ id: "old-page", title: "Old next page" })]), page: 2 }));
    expect(screen.getByText("Selected topic")).toBeTruthy();
    expect(screen.queryByText("Old next page")).toBeNull();
  });

  it("does not replace a current result with an obsolete request error", async () => {
    const older = deferred<PaginatedDto<CommunityPostDto>>();
    vi.mocked(communityService.listPosts).mockResolvedValueOnce(page([post()]))
      .mockReturnValueOnce(older.promise).mockResolvedValueOnce(page([post({ title: "Current result" })]));
    renderWithIntl(<CommunityFeedView />);
    await screen.findByText("A good day at the park");
    fireEvent.change(screen.getByLabelText("Post type"), { target: { value: "QUESTION" } });
    fireEvent.change(screen.getByLabelText("Post type"), { target: { value: "GENERAL" } });
    await screen.findByText("Current result");
    await act(async () => older.reject(new Error("obsolete failure")));
    expect(screen.getByText("Current result")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("keeps loading until the newest request finishes, not an older one", async () => {
    const older = deferred<PaginatedDto<CommunityPostDto>>();
    const newer = deferred<PaginatedDto<CommunityPostDto>>();
    vi.mocked(communityService.listPosts).mockResolvedValueOnce(page([post()]))
      .mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    renderWithIntl(<CommunityFeedView />);
    await screen.findByText("A good day at the park");
    fireEvent.change(screen.getByLabelText("Post type"), { target: { value: "QUESTION" } });
    fireEvent.change(screen.getByLabelText("Post type"), { target: { value: "GENERAL" } });
    await act(async () => older.resolve(page([])));
    expect(screen.getByRole("status").textContent).toBe("Loading posts…");
    await act(async () => newer.resolve(page([post({ title: "Done" })])));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Done")).toBeTruthy();
  });

  it("shows posts with title, body, comment and reaction counts", async () => {
    vi.mocked(communityService.listPosts).mockResolvedValue(page([post()]));

    renderWithIntl(<CommunityFeedView />);

    await waitFor(() => expect(screen.getByText("A good day at the park")).toBeTruthy());
    expect(screen.getByText("We had a wonderful time today.")).toBeTruthy();
    expect(screen.getByText("2 comments · 5 reactions")).toBeTruthy();
  });

  it("shows a localized empty state when there are no posts", async () => {
    vi.mocked(communityService.listPosts).mockResolvedValue(page([], 0));

    renderWithIntl(<CommunityFeedView />);

    await waitFor(() => expect(screen.getByText("No posts yet. Be the first to share something.")).toBeTruthy());
  });

  it("appends the next page's posts on Load more, avoiding endless auto-scroll clutter", async () => {
    vi.mocked(communityService.listPosts)
      .mockResolvedValueOnce(page([post({ id: "p1", title: "Post One" })], 2))
      .mockResolvedValueOnce({ items: [post({ id: "p2", title: "Post Two" })], total: 2, page: 2, pageSize: 20 });

    renderWithIntl(<CommunityFeedView />);
    await waitFor(() => expect(screen.getByText("Post One")).toBeTruthy());

    fireEvent.click(screen.getByText("Load more"));

    await waitFor(() => expect(screen.getByText("Post Two")).toBeTruthy());
    expect(screen.getByText("Post One")).toBeTruthy();
  });

  it.each([
    ["de", "Community", "Fragen, Erfahrungen und Neuigkeiten", "Themen", "Meine Nachrichten", "1 Januar"],
    ["es", "Comunidad", "Preguntas, experiencias y novedades", "Temas", "Mis mensajes", "1 enero"],
  ] as const)("renders the complete feed in %s and preserves authored post content", async (locale, heading, description, topics, myMessages, date) => {
    vi.mocked(communityService.listPosts).mockResolvedValue(page([post({ pet: { id: "pet-1", name: "Milo", species: "DOG" as never, photoUrl: null } as never })]));

    const { container } = renderWithIntl(<CommunityFeedView />, locale);

    expect(await screen.findByRole("heading", { name: heading })).toBeTruthy();
    expect(screen.getByText(new RegExp(description))).toBeTruthy();
    expect(screen.getByRole("heading", { name: topics })).toBeTruthy();
    expect(screen.getByRole("link", { name: myMessages }).getAttribute("href")).toBe(`/${locale}/community/messages`);
    expect(screen.getByText("Milo", { exact: false })).toBeTruthy();
    expect(screen.getByText("A good day at the park")).toBeTruthy();
    expect(container.textContent).toContain(date);
    expect(container.textContent).not.toMatch(/[\u0600-\u06ff]|\[Missing/);
  });

  it.each([
    ["de", "Beiträge suchen", "Suchen", "Keine Beiträge zu dieser Suche gefunden."],
    ["es", "Buscar publicaciones", "Buscar", "No hay publicaciones que coincidan con la búsqueda."],
  ] as const)("localizes search and empty-result feedback in %s", async (locale, searchLabel, searchButton, noResults) => {
    vi.mocked(communityService.listPosts).mockResolvedValueOnce(page([post()])).mockResolvedValueOnce(page([], 0));
    renderWithIntl(<CommunityFeedView />, locale);

    await screen.findByText("A good day at the park");
    fireEvent.change(screen.getByLabelText(searchLabel), { target: { value: "no match" } });
    fireEvent.click(screen.getByRole("button", { name: searchButton }));

    expect(await screen.findByText(noResults)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]|\[Missing/);
  });

  it.each([
    ["de", "Ein Fehler ist aufgetreten", "Erneut versuchen"],
    ["es", "Ha ocurrido un problema", "Reintentar"],
  ] as const)("shows a localized recoverable feed error in %s", async (locale, errorTitle, retry) => {
    vi.mocked(communityService.listPosts).mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(page([post()]));
    renderWithIntl(<CommunityFeedView />, locale);

    expect(await screen.findByRole("heading", { name: errorTitle })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: retry }));
    expect(await screen.findByText("A good day at the park")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]|\[Missing/);
  });

  it.each([
    ["de", "Wird geladen"],
    ["es", "Cargando"],
  ] as const)("renders a localized initial loading state in %s", async (locale, loadingLabel) => {
    vi.mocked(communityService.listPosts).mockReturnValueOnce(new Promise(() => {}));
    renderWithIntl(<CommunityFeedView />, locale);

    expect(await screen.findByLabelText(loadingLabel)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]|\[Missing/);
  });

  it.each([
    ["de", "Noch keine Beiträge. Teilen Sie als Erste oder Erster etwas."],
    ["es", "Aún no hay publicaciones. Sé la primera persona en compartir algo."],
  ] as const)("renders a genuinely empty feed in %s", async (locale, emptyText) => {
    vi.mocked(communityService.listPosts).mockResolvedValueOnce(page([], 0));
    renderWithIntl(<CommunityFeedView />, locale);

    expect(await screen.findByText(emptyText)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]|\[Missing/);
  });
});
