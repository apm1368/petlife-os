"use client";

import { useEffect, useState } from "react";
import Link from "@/features/navigation/localized-link";
import { useLocale, useTranslations } from "next-intl";
import { Avatar, Button, EmptyState, HandHeart, Input, Mail, Select, Siren, Skeleton } from "@petlife/ui";
import { formatDay, localizeDigits } from "@/lib/date/jalali";
import { CommunityPostType } from "@petlife/types";
import type { CommunityPostDto, PaginatedDto } from "@petlife/types";
import { communityService } from "@/services/community.service";
import { LoadFailure } from "@/features/system/LoadFailure";

/** spec: "avoid endless card clutter" — a plain paged feed with an explicit Load more, never infinite auto-scroll. */
export function CommunityFeedView() {
  const t = useTranslations("community");
  const tCommon = useTranslations("common");

  const [page, setPage] = useState<PaginatedDto<CommunityPostDto> | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [error, setError] = useState<unknown>(null);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [type, setType] = useState<CommunityPostType | "">("");

  async function load(nextPage: number, append = false, filters: { q: string; type: CommunityPostType | "" } = { q: appliedQuery, type }) {
    setError(null);
    try {
      const data = await communityService.listPosts({ page: nextPage, pageSize: 20, q: filters.q || undefined, type: filters.type || undefined });
      setPage((prev) => (append && prev ? { ...data, items: [...prev.items, ...data.items] } : data));
      setPageNumber(nextPage);
    } catch (err) {
      setError(err);
    }
  }

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <LoadFailure error={error} onRetry={() => load(1)} />;
  if (!page) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  const locale = useLocale() === "en" ? "en" : "fa";
  const fa = locale === "fa";
  const chooseType = (next: CommunityPostType | "") => { setType(next); void load(1, false, { q: appliedQuery, type: next }); };

  return (
    <div className="community-layout">
      <div className="community-main">
        <header className="section-head">
          <div>
            <h1>{t("feed.title")}</h1>
            <p>{fa ? "پرسش، تجربه و خبر از صاحبان حیوانات؛ محترمانه و بدون تبلیغ." : "Questions, stories and news from pet owners — respectful, no ads."}</p>
          </div>
          <Link href="/community/new" className="btn-primary-link">{t("feed.newPost")}</Link>
        </header>

        <form
          role="search"
          className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const q = query.trim();
            setAppliedQuery(q);
            void load(1, false, { q, type });
          }}
        >
          <Input dir="auto" label={t("feed.searchLabel")} value={query} maxLength={80} onChange={(e) => setQuery(e.target.value)} />
          <Select
            label={t("feed.typeLabel")}
            value={type}
            onChange={(e) => chooseType(e.target.value as CommunityPostType | "")}
            options={[{ value: "", label: t("feed.allTypes") }, ...Object.values(CommunityPostType).map((value) => ({ value, label: t(`postType.${value}`) }))]}
          />
          <Button type="submit" variant="secondary">
            {t("feed.search")}
          </Button>
        </form>

        {page.items.length === 0 ? (
          <EmptyState title={appliedQuery || type ? t("feed.noResults") : t("feed.empty")} />
        ) : (
          <ul className="post-rows">
            {page.items.map((post) => (
              <li key={post.id}>
                <Link href={`/community/posts/${post.id}`} className="post-row">
                  <span className="post-row__byline">
                    <Avatar name={post.authorDisplayName} size="sm" />
                    <span className="post-row__author">{post.authorDisplayName}</span>
                    {post.pet ? <span className="post-row__pet">· {fa ? "با" : "with"} {post.pet.name}</span> : null}
                    <span className="post-row__date">· {formatDay(post.createdAt.slice(0, 10), locale, { year: false })}</span>
                    <span className="tag">{t(`postType.${post.type}`)}</span>
                  </span>
                  {post.title ? <span className="post-row__title">{post.title}</span> : null}
                  <span className="post-row__body">{post.body}</span>
                  <span className="post-row__meta">{t("feed.commentsAndReactions", { comments: localizeDigits(post.commentCount, locale), reactions: localizeDigits(post.reactionCount, locale) })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {page.items.length < page.total ? (
          <Button variant="secondary" onClick={() => load(pageNumber + 1, true)}>
            {t("feed.loadMore")}
          </Button>
        ) : null}
      </div>

      <aside className="community-side" aria-label={fa ? "میان‌برهای جامعه" : "Community shortcuts"}>
        <section>
          <h2>{fa ? "موضوع‌ها" : "Topics"}</h2>
          <div className="community-side__chips">
            <button type="button" aria-pressed={type === ""} onClick={() => chooseType("")}>{t("feed.allTypes")}</button>
            {Object.values(CommunityPostType).map((value) => (
              <button key={value} type="button" aria-pressed={type === value} onClick={() => chooseType(value)}>{t(`postType.${value}`)}</button>
            ))}
          </div>
        </section>
        <section>
          <h2>{fa ? "همین حالا" : "Right now"}</h2>
          <ul className="community-side__links">
            <li><Link href="/community/messages"><Mail size={16} aria-hidden="true" />{fa ? "پیام‌های من" : "My messages"}</Link></li>
            <li><Link href="/lost-pets"><Siren size={16} aria-hidden="true" />{fa ? "حیوانات گم‌شده‌ی اطراف" : "Lost pets nearby"}</Link></li>
            <li><Link href="/animal-support/needs"><HandHeart size={16} aria-hidden="true" />{fa ? "نیازهای حمایت" : "Support needs"}</Link></li>
          </ul>
        </section>
      </aside>
    </div>
  );
}
