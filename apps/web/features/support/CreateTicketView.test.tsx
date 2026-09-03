import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { supportService } from "@/services/support.service";
import { ApiError } from "@/lib/api/client";
import { CreateTicketView } from "./CreateTicketView";

const push = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParams,
}));
vi.mock("@/services/support.service", () => ({ supportService: { create: vi.fn() } }));

describe("CreateTicketView", () => {
  beforeEach(() => {
    push.mockReset();
    searchParams = new URLSearchParams();
    vi.mocked(supportService.create).mockReset();
  });

  it("submits a new ticket and routes to its detail page", async () => {
    vi.mocked(supportService.create).mockResolvedValue({
      id: "case-1",
      caseNumber: "CASE-000001",
      subject: "Cannot log in",
      category: "ACCOUNT" as never,
      status: "SUBMITTED" as never,
      householdId: null,
      petId: null,
      relatedEntityType: null,
      relatedEntityId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      resolvedAt: null,
      closedAt: null,
    });

    renderWithIntl(<CreateTicketView />);

    fireEvent.change(screen.getByText("Subject").parentElement!.querySelector("input")!, { target: { value: "Cannot log in" } });
    fireEvent.change(screen.getByText("Describe the issue").parentElement!.querySelector("textarea")!, { target: { value: "Password reset link never arrives" } });
    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() =>
      expect(supportService.create).toHaveBeenCalledWith(
        expect.objectContaining({ subject: "Cannot log in", description: "Password reset link never arrives" }),
      ),
    );
    expect(push).toHaveBeenCalledWith("/en/support/tickets/case-1");
  });

  it("prefills the category and links the case to an order from a contextual entry point, without exposing priority", async () => {
    searchParams = new URLSearchParams({ relatedEntityType: "ORDER", relatedEntityId: "order-1", category: "ORDER" });
    vi.mocked(supportService.create).mockResolvedValue({
      id: "case-2",
      caseNumber: "CASE-000002",
      subject: "x",
      category: "ORDER" as never,
      status: "SUBMITTED" as never,
      householdId: null,
      petId: null,
      relatedEntityType: "ORDER",
      relatedEntityId: "order-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      resolvedAt: null,
      closedAt: null,
    });

    renderWithIntl(<CreateTicketView />);

    expect(screen.getByText("This ticket will be linked to your order.")).toBeTruthy();

    fireEvent.change(screen.getByText("Subject").parentElement!.querySelector("input")!, { target: { value: "Missing item" } });
    fireEvent.change(screen.getByText("Describe the issue").parentElement!.querySelector("textarea")!, { target: { value: "One item was missing" } });
    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() =>
      expect(supportService.create).toHaveBeenCalledWith(
        expect.objectContaining({ relatedEntityType: "ORDER", relatedEntityId: "order-1" }),
      ),
    );
    const [callArgs] = vi.mocked(supportService.create).mock.calls[0]!;
    expect(callArgs).not.toHaveProperty("priority");
  });

  it("shows an error message when submission fails", async () => {
    vi.mocked(supportService.create).mockRejectedValue(new ApiError({ code: "SUPPORT_CASE_INVALID_REFERENCE", message: "That item could not be linked to your support case.", requestId: "r1" }, 400));

    renderWithIntl(<CreateTicketView />);

    fireEvent.change(screen.getByText("Subject").parentElement!.querySelector("input")!, { target: { value: "x" } });
    fireEvent.change(screen.getByText("Describe the issue").parentElement!.querySelector("textarea")!, { target: { value: "y" } });
    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => expect(screen.getByText("That item could not be linked to your support case.")).toBeTruthy());
  });
});
