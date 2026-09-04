"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import type { CommunityPostDto, PaginatedDto } from "@petlife/types";
import { communityService } from "@/services/community.service";
import { ApiError } from "@/lib/api/client";

/** spec: "avoid endless card clutter" — a plain paged feed with an explicit Load more, never infinite auto-scroll. */
export function CommunityFeedView() {
  const t = useTranslations("community");
  const tCommon = useTranslations("common");

  const [page, setPage] = useState<PaginatedDto<CommunityPostDto> | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [error, setError] = useState<string | null>(null);

  async function load(nextPage: number, append = false) {
    setError(null);
    try {
      const data = await communityService.listPosts({ page: nextPage, pageSize: 20 });
      setPage((prev) => (append && prev ? { ...data, items: [...prev.items, ...data.items] } : data));
      setPageNumber(nextPage);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={() => load(1)} />;
  if (!page) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-page-title text-text-primary">{t("feed.title")}</h1>
        <Link href="/community/new">
          <Button variant="primary">{t("feed.newPost")}</Button>
        </Link>
      </div>

      {page.items.length === 0 ? (
        <EmptyState title={t("feed.empty")} />
      ) : (
        <div className="flex flex-col gap-3">
          {page.items.map((post) => (
            <Link key={post.id} href={`/community/posts/${post.id}`}>
              <ContextSurface className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-body text-text-primary">{post.authorDisplayName}</span>
                  <span className="text-metadata text-text-secondary">{t(`postType.${post.type}`)}</span>
                </div>
                {post.title ? <p className="text-body text-text-primary">{post.title}</p> : null}
                <p className="line-clamp-3 text-body text-text-secondary">{post.body}</p>
                <p className="text-metadata text-text-secondary">{t("feed.commentsAndReactions", { comments: post.commentCount, reactions: post.reactionCount })}</p>
              </ContextSurface>
            </Link>
          ))}
        </div>
      )}

      {page.items.length < page.total ? (
        <Button variant="secondary" onClick={() => load(pageNumber + 1, true)}>
          {t("feed.loadMore")}
        </Button>
      ) : null}
    </div>
  );
}
