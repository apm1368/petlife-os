import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { CommunityPostDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { communityService } from "@/services/community.service";
import { CommunityPostDetailView } from "./CommunityPostDetailView";

let sessionStatus: "authenticated" | "unauthenticated" = "unauthenticated";
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/community.service", () => ({
  communityService: { getPost: vi.fn(), listComments: vi.fn(), setReaction: vi.fn(), removeReaction: vi.fn(), addComment: vi.fn(), reportPost: vi.fn() },
}));
vi.mock("@/stores/session-store", () => ({
  useSessionStore: (selector: (state: { status: string }) => unknown) => selector({ status: sessionStatus }),
}));

function post(overrides: Partial<CommunityPostDto> = {}): CommunityPostDto {
  return {
    id: "post-1",
    authorUserId: "user-1",
    authorDisplayName: "Sara",
    type: "GENERAL" as never,
    title: null,
    body: "Anyone know a good groomer nearby?",
    locale: null,
    countryCode: null,
    pet: null,
    mediaObjectKeys: [],
    mediaUrls: [],
    status: "PUBLISHED" as never,
    sourceType: "USER" as never,
    sourceLostPetIncidentId: null,
    sourceSupportCampaignId: null,
    commentCount: 0,
    reactionCount: 0,
    viewerReaction: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("CommunityPostDetailView", () => {
  beforeEach(() => {
    sessionStatus = "unauthenticated";
    push.mockReset();
    vi.mocked(communityService.getPost).mockReset().mockResolvedValue(post());
    vi.mocked(communityService.listComments).mockReset().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    vi.mocked(communityService.setReaction).mockReset();
  });

  it("redirects an unauthenticated visitor to log in instead of reacting", async () => {
    renderWithIntl(<CommunityPostDetailView postId="post-1" />);

    await waitFor(() => expect(screen.getByText("Anyone know a good groomer nearby?")).toBeTruthy());
    fireEvent.click(screen.getByText(/Like/));

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(communityService.setReaction).not.toHaveBeenCalled();
  });

  it("lets an authenticated viewer react to a post", async () => {
    sessionStatus = "authenticated";

    renderWithIntl(<CommunityPostDetailView postId="post-1" />);

    await waitFor(() => expect(screen.getByText("Anyone know a good groomer nearby?")).toBeTruthy());
    fireEvent.click(screen.getByText(/Like/));

    await waitFor(() => expect(communityService.setReaction).toHaveBeenCalledWith("post-1", "LIKE"));
  });
});
