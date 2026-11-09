"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { chatService, type ChatConversationSummary, type ChatMessageDto } from "@/services/chat.service";

const POLL_MS = 10_000;

/**
 * Community chat v1 — functional screens only (the visual design belongs to Codex). Conversations are
 * fetched by polling; there is no websocket in this version.
 */
export function ChatInboxView() {
  const locale = useLocale();
  const t = useTranslations("communityChat.inbox");
  const tCommon = useTranslations("common");
  const [rows, setRows] = useState<ChatConversationSummary[] | null>(null);
  const [error, setError] = useState<"load" | "access" | null>(null);
  const load = useCallback(async () => {
    try { setRows(await chatService.list()); setError(null); } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setRows(null);
        setError("access");
      } else {
        setError("load");
      }
    }
  }, []);
  useEffect(() => { void load(); const t = setInterval(() => void load(), POLL_MS); return () => clearInterval(t); }, [load]);
  if (error === "access") return <EmptyState title={t("noAccess")} />;
  if (error === "load" && !rows) return <ErrorRecovery title={t("failed")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!rows) return <Skeleton className="h-40 w-full" aria-label={tCommon("loading")} />;
  return (
    <section className="chat-inbox">
      <h1>{t("title")}</h1>
      {error ? <p role="status">{t("stale")}</p> : null}
      {rows.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <ul className="chat-inbox__list">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/${locale}/community/messages/${c.id}`} className="chat-inbox__row" data-unread={c.unreadCount > 0 || undefined}>
                <strong>{c.otherMember?.displayName ?? t("fallbackMember")}</strong>
                {c.lastMessage ? <span>{c.lastMessage.senderIsMe ? `${t("youPrefix")} ` : ""}{c.lastMessage.body}</span> : null}
                {c.unreadCount > 0 ? <span className="chat-inbox__unread" aria-label={t("unread", { count: c.unreadCount })}>{new Intl.NumberFormat(locale).format(c.unreadCount)}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ChatThreadView({ conversationId }: { conversationId: string }) {
  const locale = useLocale();
  const t = useTranslations("communityChat.thread");
  const tCommon = useTranslations("common");
  const [meta, setMeta] = useState<ChatConversationSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessageDto[] | null>(null);
  const [state, setState] = useState<"ok" | "notFound" | "failed" | "access">("ok");
  const [text, setText] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [list, page] = await Promise.all([chatService.list(), chatService.messages(conversationId)]);
      setMeta(list.find((c) => c.id === conversationId) ?? null);
      setMessages(page.items);
      setState("ok");
      void chatService.markRead(conversationId).catch(() => undefined);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setMeta(null);
        setMessages(null);
        setState("access");
      } else {
        setState(e instanceof ApiError && e.status === 404 ? "notFound" : "failed");
      }
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
    } catch {
      setSendError(t("sendFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleBlock() {
    if (!meta?.otherMember) return;
    setBlockBusy(true);
    setActionError(null);
    try {
      await (meta.blockedByMe ? chatService.unblock(meta.otherMember.id) : chatService.block(meta.otherMember.id));
      await load();
    } catch {
      setActionError(t("blockFailed"));
    } finally {
      setBlockBusy(false);
    }
  }

  if (state === "notFound") return <EmptyState title={t("notFound")} />;
  if (state === "access") return <EmptyState title={t("noAccess")} />;
  if (state === "failed") return <ErrorRecovery title={t("loadFailed")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!messages) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;
  return (
    <section className="chat-thread">
      <header className="chat-thread__head">
        <Link href={`/${locale}/community/messages`}>{t("allMessages")}</Link>
        <h1>{meta?.otherMember?.displayName ?? t("conversationFallback")}</h1>
        {meta?.otherMember ? <Button variant="ghost" isLoading={blockBusy} onClick={() => void toggleBlock()}>{meta.blockedByMe ? t("unblock") : t("block")}</Button> : null}
      </header>
      {actionError ? <p role="alert">{actionError}</p> : null}
      <ol className="chat-thread__messages">
        {messages.length === 0 ? <li className="chat-thread__empty">{t("noMessages")}</li> : messages.map((m) => (
          <li key={m.id} data-mine={m.senderIsMe || undefined}><p dir="auto">{m.body}</p><time dateTime={m.createdAt}>{new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(m.createdAt))}</time></li>
        ))}
      </ol>
      <div ref={bottom} />
      {meta?.blocked ? (
        <p role="status" className="chat-thread__blocked">{t("blocked")}</p>
      ) : (
        <form className="chat-thread__compose" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <label className="sr-only" htmlFor="chat-body">{t("messageLabel")}</label>
          <textarea id="chat-body" dir="auto" maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" variant="primary" isLoading={busy} disabled={!text.trim()}>{t("send")}</Button>
          {sendError ? <p role="alert">{sendError}</p> : null}
        </form>
      )}
    </section>
  );
}
