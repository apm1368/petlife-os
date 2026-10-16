import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { useSessionStore } from "@/stores/session-store";
import { supportService } from "@/services/support.service";
import { ContactView } from "./ContactView";
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/support.service", () => ({ supportService: { create: vi.fn() } }));
function fill() { fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Delivery question" } }); fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "Please help with my order" } }); }
describe("ContactView", () => {
  beforeEach(() => { sessionStorage.clear(); vi.clearAllMocks(); useSessionStore.setState({ status: "authenticated", user: { id: "u1", displayName: "Owner" } as never }); });
  it("keeps a guest draft before sign-in and never calls the authenticated API", async () => {
    useSessionStore.setState({ status: "unauthenticated", user: null }); renderWithIntl(<ContactView />); fill(); fireEvent.click(screen.getByRole("button", { name: "Sign in and send" }));
    expect(supportService.create).not.toHaveBeenCalled(); expect(push).toHaveBeenCalledWith(expect.stringContaining("returnTo=")); expect(JSON.parse(sessionStorage.getItem("petlife-contact-draft-v1")!)).toEqual({ subject: "Delivery question", description: "Please help with my order" });
  });
  it("preserves the message when the server rejects it and shows actual success only after retry", async () => {
    vi.mocked(supportService.create).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ id: "ticket-1" } as never);
    renderWithIntl(<ContactView />); fill(); fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("alert")).toBeTruthy(); expect((screen.getByLabelText("Your message") as HTMLTextAreaElement).value).toBe("Please help with my order");
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Follow your conversation" }).getAttribute("href")).toBe("/en/support/tickets/ticket-1")); expect(sessionStorage.getItem("petlife-contact-draft-v1")).toBeNull();
  });
});
