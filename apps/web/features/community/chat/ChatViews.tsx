"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { Button, EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { apiErrorText } from "@/lib/errors/api-error-text";
import { chatService, type ChatConversationSummary, type ChatMessageDto } from "@/services/chat.service";

const POLL_MS = 10_000;

/**
 * Community chat v1 — functional screens only (the visual design belongs to Codex). Conversations are
 * fetched by polling; there is no websocket in this version.
 */
export function ChatInboxView() {
  const fa = useLocale() === "fa";
  const locale = fa ? "fa" : "en";
  const [rows, setRows] = useState<ChatConversationSummary[] | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    try { setRows(await chatService.list()); setError(false); } catch { setError(true); }
  }, []);
  useEffect(() => { void load(); const t = setInterval(() => void load(), POLL_MS); return () => clearInterval(t); }, [load]);
  if (error && !rows) return <ErrorRecovery title={fa ? "پیام‌ها بارگیری نشد" : "Messages could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={load} />;
  if (!rows) return <Skeleton className="h-40 w-full" />;
  return (
    <section className="chat-inbox">
      <h1>{fa ? "پیام‌ها" : "Messages"}</h1>
      {rows.length === 0 ? (
        <EmptyState title={fa ? "هنوز گفت‌وگویی ندارید" : "No conversations yet"} description={fa ? "از صفحهٔ یک پست یا پروفایل عضو، گفت‌وگو را شروع کنید." : "Start a conversation from a post or a member's profile."} />
      ) : (
        <ul className="chat-inbox__list">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/${locale}/community/messages/${c.id}`} className="chat-inbox__row" data-unread={c.unreadCount > 0 || undefined}>
                <strong>{c.otherMember?.displayName ?? (fa ? "عضو" : "Member")}</strong>
                {c.lastMessage ? <span>{c.lastMessage.senderIsMe ? (fa ? "شما: " : "You: ") : ""}{c.lastMessage.body}</span> : null}
                {c.unreadCount > 0 ? <span className="chat-inbox__unread">{c.unreadCount.toLocaleString(fa ? "fa-IR" : "en-US")}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ChatThreadView({ conversationId }: { conversationId: string }) {
  const fa = useLocale() === "fa";
  const locale = fa ? "fa" : "en";
  const [meta, setMeta] = useState<ChatConversationSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessageDto[] | null>(null);
  const [state, setState] = useState<"ok" | "notFound" | "failed">("ok");
  const [text, setText] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [list, page] = await Promise.all([chatService.list(), chatService.messages(conversationId)]);
      setMeta(list.find((c) => c.id === conversationId) ?? null);
      setMessages(page.items);
      setState("ok");
      void chatService.markRead(conversationId).catch(() => undefined);
    } catch (e) {
      setState(e instanceof ApiError && e.status === 404 ? "notFound" : "failed");
    }
  }, [conversationId]);
  useEffect(() => { void load(); const t = setInterval(() => void load(), POLL_MS); return () => clearInterval(t); }, [load]);
  useEffect(() => { bottom.current?.scrollIntoView?.({ block: "end" }); }, [messages?.length]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setSendError(null);
    try {
      const m = await chatService.send(conversationId, body);
      setMessages((prev) => [...(prev ?? []), m]);
      setText("");
    } catch (e) {
      setSendError(apiErrorText(e, undefined, fa ? "پیام فرستاده نشد." : "The message wasn't sent."));
    } finally {
      setBusy(false);
    }
  }

  async function toggleBlock() {
    if (!meta?.otherMember) return;
    await (meta.blockedByMe ? chatService.unblock(meta.otherMember.id) : chatService.block(meta.otherMember.id));
    await load();
  }

  if (state === "notFound") return <EmptyState title={fa ? "این گفت‌وگو پیدا نشد" : "Conversation not found"} />;
  if (state === "failed") return <ErrorRecovery title={fa ? "گفت‌وگو بارگیری نشد" : "Conversation could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={load} />;
  if (!messages) return <Skeleton className="h-64 w-full" />;
  return (
    <section className="chat-thread">
      <header className="chat-thread__head">
        <Link href={`/${locale}/community/messages`}>{fa ? "همهٔ پیام‌ها" : "All messages"}</Link>
        <h1>{meta?.otherMember?.displayName ?? (fa ? "گفت‌وگو" : "Conversation")}</h1>
        {meta?.otherMember ? <Button variant="ghost" onClick={() => void toggleBlock()}>{meta.blockedByMe ? (fa ? "رفع مسدودی" : "Unblock") : fa ? "مسدود کردن" : "Block"}</Button> : null}
      </header>
      <ol className="chat-thread__messages">
        {messages.map((m) => (
          <li key={m.id} data-mine={m.senderIsMe || undefined}><p dir="auto">{m.body}</p><time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleTimeString(fa ? "fa-IR" : "en-US", { hour: "2-digit", minute: "2-digit" })}</time></li>
        ))}
      </ol>
      <div ref={bottom} />
      {meta?.blocked ? (
        <p role="status" className="chat-thread__blocked">{fa ? "پیام‌رسانی در این گفت‌وگو مسدود است." : "Messaging is blocked in this conversation."}</p>
      ) : (
        <form className="chat-thread__compose" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <label className="sr-only" htmlFor="chat-body">{fa ? "پیام" : "Message"}</label>
          <textarea id="chat-body" dir="auto" maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" variant="primary" isLoading={busy} disabled={!text.trim()}>{fa ? "ارسال" : "Send"}</Button>
          {sendError ? <p role="alert">{sendError}</p> : null}
        </form>
      )}
    </section>
  );
}
