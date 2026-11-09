import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import { chatService } from "@/services/chat.service";
import { renderWithIntl } from "@/test/render-with-intl";
import { ChatInboxView, ChatThreadView } from "./ChatViews";

vi.mock("@/services/chat.service", () => ({
  chatService: {
    list: vi.fn(), messages: vi.fn(), send: vi.fn(), markRead: vi.fn(), block: vi.fn(), unblock: vi.fn(),
  },
}));

const conversation = {
  id: "conversation-1",
  otherMember: { id: "member-1", displayName: "María García", avatarUrl: null },
  lastMessage: { id: "message-1", body: "Nos vemos mañana", senderIsMe: true, createdAt: "2026-11-08T10:03:00.000Z" },
  unreadCount: 2,
  blocked: false,
  blockedByMe: false,
  lastMessageAt: "2026-11-08T10:03:00.000Z",
};

describe("community chat localization", () => {
  beforeEach(() => {
    vi.mocked(chatService.list).mockReset();
    vi.mocked(chatService.messages).mockReset();
    vi.mocked(chatService.send).mockReset();
    vi.mocked(chatService.markRead).mockReset().mockResolvedValue({ ok: true });
    vi.mocked(chatService.block).mockReset().mockResolvedValue({ blocked: true });
    vi.mocked(chatService.unblock).mockReset().mockResolvedValue({ blocked: false });
  });

  it.each([
    ["de", "Nachrichten", "Du:", "2 ungelesene Nachrichten"],
    ["es", "Mensajes", "Tú:", "2 mensajes sin leer"],
  ] as const)("renders the populated inbox in %s and preserves authored message text", async (locale, title, youPrefix, unread) => {
    vi.mocked(chatService.list).mockResolvedValue([conversation]);
    renderWithIntl(<ChatInboxView />, locale);

    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByText("María García")).toBeTruthy();
    expect(screen.getByText("Nos vemos mañana", { exact: false }).textContent).toContain(youPrefix);
    expect(screen.getByLabelText(unread)).toBeTruthy();
    expect(screen.getByRole("link", { name: /María García/ }).getAttribute("href")).toBe(`/${locale}/community/messages/conversation-1`);
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]|\[Missing/);
  });

  it.each([
    ["de", "Noch keine Gespräche"],
    ["es", "Aún no hay conversaciones"],
  ] as const)("shows the real empty inbox state in %s", async (locale, title) => {
    vi.mocked(chatService.list).mockResolvedValue([]);
    renderWithIntl(<ChatInboxView />, locale);
    expect(await screen.findByText(title)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]|\[Missing/);
  });

  it.each([
    ["de", "Nachrichten konnten nicht geladen werden", "Erneut versuchen"],
    ["es", "No se pudieron cargar los mensajes", "Reintentar"],
  ] as const)("localizes inbox failure and retry in %s", async (locale, failed, retry) => {
    vi.mocked(chatService.list).mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce([]);
    renderWithIntl(<ChatInboxView />, locale);
    expect(await screen.findByText(failed)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: retry }));
    expect(await screen.findByText(locale === "de" ? "Noch keine Gespräche" : "Aún no hay conversaciones")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]|\[Missing/);
  });

  it.each([
    ["de", "Du hast keinen Zugriff auf diese Nachrichten."],
    ["es", "No tienes acceso a estos mensajes."],
  ] as const)("does not render inbox data after access is denied in %s", async (locale, noAccess) => {
    vi.mocked(chatService.list).mockRejectedValue(new ApiError({ code: "FORBIDDEN", message: "private", requestId: "chat-test" }, 403));
    renderWithIntl(<ChatInboxView />, locale);
    expect(await screen.findByText(noAccess)).toBeTruthy();
    expect(screen.queryByText("María García")).toBeNull();
    expect(document.body.textContent).not.toContain("private");
  });

  it.each([
    ["de", "Wird geladen"],
    ["es", "Cargando"],
  ] as const)("labels the inbox loading state in %s", async (locale, loading) => {
    vi.mocked(chatService.list).mockReturnValueOnce(new Promise(() => {}));
    renderWithIntl(<ChatInboxView />, locale);
    expect(await screen.findByLabelText(loading)).toBeTruthy();
  });

  it.each([
    ["de", "Alle Nachrichten", "Blockieren", "Die Nachricht wurde nicht gesendet. Bitte versuche es erneut."],
    ["es", "Todos los mensajes", "Bloquear", "No se envió el mensaje. Inténtalo de nuevo."],
  ] as const)("localizes thread actions and send failure in %s without translating authored messages", async (locale, backLabel, blockLabel, sendFailure) => {
    vi.mocked(chatService.list).mockResolvedValue([conversation]);
    vi.mocked(chatService.messages).mockResolvedValue({ items: [{ id: "message-1", body: "The owner wrote this", senderIsMe: false, createdAt: "2026-11-08T10:03:00.000Z" }], hasMore: false });
    vi.mocked(chatService.send).mockRejectedValueOnce(new Error("server error"));
    renderWithIntl(<ChatThreadView conversationId="conversation-1" />, locale);

    expect(await screen.findByRole("link", { name: backLabel })).toBeTruthy();
    expect(screen.getByText("The owner wrote this")).toBeTruthy();
    expect(screen.getByRole("button", { name: blockLabel })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(locale === "de" ? "Nachricht" : "Mensaje"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: locale === "de" ? "Senden" : "Enviar" }));
    expect(await screen.findByText(sendFailure)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]|\[Missing|server error/);
  });

  it.each([
    ["de", "Gespräch nicht gefunden"],
    ["es", "No se encontró la conversación"],
  ] as const)("localizes missing conversations in %s", async (locale, notFound) => {
    vi.mocked(chatService.list).mockResolvedValue([]);
    vi.mocked(chatService.messages).mockRejectedValue(new ApiError({ code: "NOT_FOUND", message: "private backend detail", requestId: "chat-test" }, 404));
    renderWithIntl(<ChatThreadView conversationId="missing" />, locale);
    expect(await screen.findByText(notFound)).toBeTruthy();
    expect(document.body.textContent).not.toContain("private backend detail");
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]|\[Missing/);
  });

  it.each([
    ["de", "Nachrichten sind in diesem Gespräch blockiert."],
    ["es", "La mensajería está bloqueada en esta conversación."],
  ] as const)("shows the localized blocked state without a composer in %s", async (locale, blocked) => {
    vi.mocked(chatService.list).mockResolvedValue([{ ...conversation, blocked: true, blockedByMe: true }]);
    vi.mocked(chatService.messages).mockResolvedValue({ items: [], hasMore: false });
    renderWithIntl(<ChatThreadView conversationId="conversation-1" />, locale);
    expect(await screen.findByText(blocked)).toBeTruthy();
    expect(screen.queryByLabelText(locale === "de" ? "Nachricht" : "Mensaje")).toBeNull();
    expect(screen.getByText(locale === "de" ? "In diesem Gespräch gibt es noch keine Nachrichten." : "Todavía no hay mensajes en esta conversación.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]|\[Missing/);
  });

  it.each([
    ["de", "Du hast keinen Zugriff auf dieses Gespräch."],
    ["es", "No tienes acceso a esta conversación."],
  ] as const)("does not expose conversation data after access is denied in %s", async (locale, noAccess) => {
    vi.mocked(chatService.list).mockResolvedValue([conversation]);
    vi.mocked(chatService.messages).mockRejectedValue(new ApiError({ code: "FORBIDDEN", message: "private", requestId: "chat-test" }, 403));
    renderWithIntl(<ChatThreadView conversationId="conversation-1" />, locale);
    expect(await screen.findByText(noAccess)).toBeTruthy();
    expect(screen.queryByText("María García")).toBeNull();
    expect(screen.queryByText("The owner wrote this")).toBeNull();
    expect(document.body.textContent).not.toContain("private");
  });

  it.each([
    ["de", "Die Blockierung konnte nicht geändert werden. Bitte versuche es erneut."],
    ["es", "No se pudo cambiar el bloqueo. Inténtalo de nuevo."],
  ] as const)("localizes a failed block action in %s", async (locale, message) => {
    vi.mocked(chatService.list).mockResolvedValue([conversation]);
    vi.mocked(chatService.messages).mockResolvedValue({ items: [], hasMore: false });
    vi.mocked(chatService.block).mockRejectedValueOnce(new Error("private server detail"));
    renderWithIntl(<ChatThreadView conversationId="conversation-1" />, locale);
    fireEvent.click(await screen.findByRole("button", { name: locale === "de" ? "Blockieren" : "Bloquear" }));
    expect((await screen.findByRole("alert")).textContent).toContain(message);
    expect(document.body.textContent).not.toContain("private server detail");
  });
});
