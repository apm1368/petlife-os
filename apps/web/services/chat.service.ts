import { apiFetch } from "@/lib/api/client";

export interface ChatConversationSummary {
  id: string;
  otherMember: { id: string; displayName: string; avatarUrl: string | null } | null;
  lastMessage: { id: string; body: string; senderIsMe: boolean; createdAt: string } | null;
  unreadCount: number;
  blocked: boolean;
  blockedByMe: boolean;
  archived?: boolean;
  mutedUntil?: string | null;
  lastMessageAt: string | null;
}
export interface ChatMessageDto { id: string; body: string; senderIsMe: boolean; createdAt: string }

export const chatService = {
  open: (participantUserId: string) => apiFetch<ChatConversationSummary>("/chat/conversations", { method: "POST", body: { participantUserId } }),
  list: () => apiFetch<ChatConversationSummary[]>("/chat/conversations"),
  messages: (id: string, before?: string) => apiFetch<{ items: ChatMessageDto[]; hasMore: boolean }>(`/chat/conversations/${id}/messages${before ? `?before=${encodeURIComponent(before)}` : ""}`),
  send: (id: string, body: string) => apiFetch<ChatMessageDto>(`/chat/conversations/${id}/messages`, { method: "POST", body: { body } }),
  markRead: (id: string) => apiFetch<{ ok: true }>(`/chat/conversations/${id}/read`, { method: "POST" }),
  unreadCount: () => apiFetch<{ unreadCount: number }>("/chat/unread-count"),
  block: (userId: string) => apiFetch<{ blocked: boolean }>("/chat/blocks", { method: "POST", body: { userId } }),
  unblock: (userId: string) => apiFetch<{ blocked: boolean }>(`/chat/blocks/${userId}`, { method: "DELETE" }),
};
