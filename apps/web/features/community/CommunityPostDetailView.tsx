"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, Input, Skeleton } from "@petlife/ui";
import { CommunityReactionType } from "@petlife/types";
import type { CommunityCommentDto, CommunityPostDto, PaginatedDto } from "@petlife/types";
import { communityService } from "@/services/community.service";
import { ApiError } from "@/lib/api/client";
import { LoadFailure } from "@/features/system/LoadFailure";
import { useSessionStore } from "@/stores/session-store";
import { ReportContentPanel } from "@/features/shared/ReportContentPanel";

const REACTIONS: CommunityReactionType[] = [CommunityReactionType.LIKE, CommunityReactionType.LOVE, CommunityReactionType.HELPFUL];

export function CommunityPostDetailView({ postId }: { postId: string }) {
  const t = useTranslations("community");
  const tCommon = useTranslations("common");
  const status = useSessionStore((s) => s.status);
  const router = useRouter();
  const locale = useLocale();

  const [post, setPost] = useState<CommunityPostDto | null>(null);
  const [comments, setComments] = useState<PaginatedDto<CommunityCommentDto> | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  const [commentBody, setCommentBody] = useState("");
  const [isCommenting, setIsCommenting] = useState(false);
  const [isReacting, setIsReacting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function load() {
    setLoadError(null);
    try {
      const [postData, commentsData] = await Promise.all([communityService.getPost(postId), communityService.listComments(postId, { pageSize: 50 })]);
      setPost(postData);
      setComments(commentsData);
    } catch (err) {
      setLoadError(err);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  function requireLogin(): boolean {
    if (status !== "authenticated") {
      router.push(`/${locale}/welcome?returnTo=${encodeURIComponent(window.location.pathname)}`);
      return false;
    }
    return true;
  }

  async function handleReact(type: CommunityReactionType): Promise<void> {
    if (!requireLogin()) return;
    setIsReacting(true);
    setActionError(null);
    try {
      if (post?.viewerReaction === type) {
        await communityService.removeReaction(postId);
      } else {
        await communityService.setReaction(postId, type);
      }
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setIsReacting(false);
    }
  }

  async function handleComment(): Promise<void> {
    if (!requireLogin() || !commentBody.trim()) return;
    setIsCommenting(true);
    setActionError(null);
    try {
      await communityService.addComment(postId, commentBody.trim());
      setCommentBody("");
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setIsCommenting(false);
    }
  }

  if (loadError) return <LoadFailure error={loadError} onRetry={load} />;
  if (!post || !comments) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <ContextSurface className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-body text-text-primary">{post.authorDisplayName}</span>
          <span className="text-metadata text-text-secondary">{t(`postType.${post.type}`)}</span>
        </div>
        {post.title ? <h1 className="text-page-title text-text-primary">{post.title}</h1> : null}
        <p className="text-body text-text-primary">{post.body}</p>
        {post.mediaUrls.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {post.mediaUrls.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt="" className="h-40 w-full rounded-md object-cover" />
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-2">
          {REACTIONS.map((type) => (
            <Button key={type} variant={post.viewerReaction === type ? "primary" : "secondary"} size="sm" isLoading={isReacting} onClick={() => handleReact(type)}>
              {t(`reaction.${type}`)} {post.reactionCount > 0 ? `(${post.reactionCount})` : ""}
            </Button>
          ))}
        </div>

        <ReportContentPanel successMessage={t("post.reportSuccess")} submit={(reason, details) => communityService.reportPost(postId, reason, details)} />

        {actionError ? <p className="text-body text-state-urgent">{actionError}</p> : null}
      </ContextSurface>

      <div className="flex flex-col gap-3">
        <h2 className="text-section-title text-text-primary">{t("post.commentsTitle")}</h2>
        <div className="flex gap-2">
          <div className="flex-1">
            <Input label={t("post.commentLabel")} value={commentBody} onChange={(e) => setCommentBody(e.target.value)} />
          </div>
          <Button variant="primary" isLoading={isCommenting} onClick={handleComment} disabled={!commentBody.trim()}>
            {t("post.commentSubmit")}
          </Button>
        </div>

        {comments.items.length === 0 ? (
          <EmptyState title={t("post.commentsEmpty")} />
        ) : (
          <div className="flex flex-col gap-2">
            {comments.items.map((comment) => (
              <ContextSurface key={comment.id} className="flex flex-col gap-1">
                <span className="text-metadata text-text-secondary">{comment.authorDisplayName}</span>
                <p className="text-body text-text-primary">{comment.body}</p>
              </ContextSurface>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
