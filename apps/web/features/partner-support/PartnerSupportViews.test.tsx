import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { SupportCasePartnerDetailDto, SupportCasePartnerSummaryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { apiFetch } from "@/lib/api/client";
import { useSellerStore } from "@/stores/seller-store";
import { PartnerSupportCreateView, PartnerSupportDetailView, PartnerSupportListView } from "./PartnerSupportViews";

const push = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), useSearchParams: () => new URLSearchParams(search) }));
vi.mock("@/lib/api/client", async (original) => ({ ...(await original<typeof import("@/lib/api/client")>()), apiFetch: vi.fn() }));

const CASE: SupportCasePartnerSummaryDto = {
  id: "case-1",
  caseNumber: "CASE-000042",
  subject: "Payout missing",
  category: "PAYMENT" as never,
  status: "WAITING" as never,
  householdId: null,
  petId: null,
  relatedEntityType: null,
  relatedEntityId: null,
  createdAt: "2026-11-13T08:00:00.000Z",
  updatedAt: "2026-11-13T08:00:00.000Z",
  resolvedAt: null,
  closedAt: null,
  openedBy: { id: "u-2", displayName: "Sara Staff", isMe: false },
  organization: { type: "PROVIDER", id: "org-1", name: "Mehr Clinic" },
};

describe("partner support views", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(apiFetch).mockReset();
    search = "";
    useSellerStore.setState({ context: null, status: "idle" });
  });

  it("lists the team's cases with who opened them", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [CASE], total: 1, page: 1, pageSize: 50 });
    renderWithIntl(<PartnerSupportListView panel="provider" />);

    await waitFor(() => expect(screen.getByText("CASE-000042 · Payout missing")).toBeTruthy());
    expect(apiFetch).toHaveBeenCalledWith("/provider/support/cases?pageSize=50");
    expect(screen.getByText(/Opened by Sara Staff/)).toBeTruthy();
    expect(screen.getByText("Waiting for your reply")).toBeTruthy();
    fireEvent.click(screen.getByText("CASE-000042 · Payout missing"));
    expect(push).toHaveBeenCalledWith("/en/provider/support/case-1");
  });

  it("opens a shop case on the active shop's path, with the shop topics", async () => {
    useSellerStore.setState({
      context: { active: { sellerMembershipId: "m-1", sellerOrganizationId: "seller-9", organizationName: "Pet Bazaar", verificationStatus: "PENDING" as never, sellerStatus: "PENDING" as never, role: "VIEWER" as never }, memberships: [] },
      status: "ready",
    });
    search = "category=DELIVERY";
    vi.mocked(apiFetch).mockResolvedValue({ ...CASE, id: "case-7" });
    renderWithIntl(<PartnerSupportCreateView panel="seller" />);

    const topic = screen.getByLabelText("Topic") as HTMLSelectElement;
    expect(topic.value).toBe("DELIVERY");
    expect(Array.from(topic.options).map((o) => o.value)).toEqual(["SELLER", "ACCOUNT", "PAYMENT", "ORDER", "DELIVERY", "MARKETPLACE", "OTHER"]);

    fireEvent.click(screen.getByText("Send request"));
    expect(screen.getByRole("alert").textContent).toBe("Fill in the subject and the description.");

    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "  Parcel lost " } });
    fireEvent.change(screen.getByLabelText(/What happened/), { target: { value: "The courier lost order 991." } });
    fireEvent.click(screen.getByText("Send request"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/seller/support/case-7"));
    expect(apiFetch).toHaveBeenCalledWith("/seller-organizations/seller-9/support/cases", { method: "POST", body: { subject: "Parcel lost", description: "The courier lost order 991.", category: "DELIVERY" } });
  });

  it("shows only the conversation it was given and lets the team reply", async () => {
    const detail: SupportCasePartnerDetailDto = {
      ...CASE,
      description: "Last week's payout did not arrive.",
      messages: [
        { id: "m1", caseId: "case-1", authorType: "ADMIN" as never, author: { id: "a1", displayName: "Agent" }, body: "Please send the invoice.", visibility: "PUBLIC" as never, createdAt: "2026-11-13T09:00:00.000Z" },
        { id: "m2", caseId: "case-1", authorType: "USER" as never, author: { id: "u-2", displayName: "Sara Staff" }, body: "Sent.", visibility: "PUBLIC" as never, createdAt: "2026-11-13T09:10:00.000Z" },
      ],
    };
    vi.mocked(apiFetch).mockResolvedValue(detail);
    renderWithIntl(<PartnerSupportDetailView panel="provider" caseId="case-1" />);

    await waitFor(() => expect(screen.getByText("Request CASE-000042")).toBeTruthy());
    expect(screen.getByText(/opetlife support/)).toBeTruthy();
    expect(screen.getByText(/^Sara Staff ·/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Write a reply…"), { target: { value: "Here it is" } });
    fireEvent.click(screen.getByText("Send"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/provider/support/cases/case-1/messages", { method: "POST", body: { body: "Here it is" } }));
  });
});
