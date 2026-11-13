import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { useSessionStore } from "@/stores/session-store";
import { MessagePoster } from "./MessagePoster";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const openForPost = vi.fn();
const send = vi.fn();
vi.mock("@/services/chat.service", () => ({ chatService: { openForPost: (id: string) => openForPost(id), send: (id: string, body: string) => send(id, body) } }));

describe("MessagePoster (#290 Q52/Q57)", () => {
  beforeEach(() => { vi.clearAllMocks(); useSessionStore.setState({ status: "authenticated" }); openForPost.mockResolvedValue({ id: "c1" }); send.mockResolvedValue({}); });

  it("is not offered on your own post", () => {
    const { container } = renderWithIntl(<MessagePoster post={{ id: "p1", type: "GENERAL" as never, isMine: true }} />, "en");
    expect(container.textContent).toBe("");
  });

  it("opens the chat with the author straight from a post", async () => {
    renderWithIntl(<MessagePoster post={{ id: "p1", type: "FOUND_PET" as never, isMine: false }} />, "en");
    fireEvent.click(screen.getByRole("button", { name: "Message the poster" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/community/messages/c1"));
    expect(openForPost).toHaveBeenCalledWith("p1");
    expect(send).not.toHaveBeenCalled();
  });

  it("asks adoption screening questions and sends the answers as the first message", async () => {
    renderWithIntl(<MessagePoster post={{ id: "p2", type: "ADOPTION" as never, isMine: false }} />, "de");
    fireEvent.click(screen.getByRole("button", { name: "Adoption anfragen" }));
    fireEvent.change(screen.getByLabelText("Wohnsituation"), { target: { value: "houseWithYard" } });
    fireEvent.change(screen.getByLabelText("Warum Sie adoptieren möchten"), { target: { value: "Unsere Katze ist gestorben." } });
    fireEvent.click(screen.getByRole("button", { name: "Anfrage senden" }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    const [conversation, body] = send.mock.calls[0]!;
    expect(conversation).toBe("c1");
    expect(body).toContain("Wohnsituation: Haus mit Garten");
    expect(body).toContain("Warum Sie adoptieren möchten: Unsere Katze ist gestorben.");
    expect(body).toContain("persönlich kennenlernen");
    expect(push).toHaveBeenCalledWith("/de/community/messages/c1");
  });

  it("sends signed-out visitors to sign in", () => {
    useSessionStore.setState({ status: "unauthenticated" });
    renderWithIntl(<MessagePoster post={{ id: "p1", type: "ADOPTION" as never, isMine: false }} />, "fa");
    expect(screen.getByRole("button", { name: "برای پیام دادن وارد شوید" })).toBeTruthy();
  });
});
