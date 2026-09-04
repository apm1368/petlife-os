import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { CommunityPostDto, PaginatedDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { communityService } from "@/services/community.service";
import { CommunityFeedView } from "./CommunityFeedView";

vi.mock("@/services/community.service", () => ({ communityService: { listPosts: vi.fn() } }));

function post(overrides: Partial<CommunityPostDto> = {}): CommunityPostDto {
  return {
    id: "post-1",
    authorUserId: "user-1",
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

describe("CommunityFeedView", () => {
  beforeEach(() => {
    vi.mocked(communityService.listPosts).mockReset();
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
});
