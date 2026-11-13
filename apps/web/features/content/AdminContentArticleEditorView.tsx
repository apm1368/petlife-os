"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { ArticleLifecycleStatus } from "@petlife/types";
import type { AdminArticleSlugCheckDto, AdminPermissionName, AdminArticleDto, AdminArticleLocaleDto, CategoryDto, ContentAuthorDto, Locale as ContentLocale, MediaAssetDto, RichTextDocument, TagDto } from "@petlife/types";
import { adminContentService } from "@/services/admin-content.service";
import { useAdminStore } from "@/stores/admin-store";
import { ApiError } from "@/lib/api/client";
import { RichTextBlockEditor } from "./RichTextBlockEditor";
import { RichTextRenderer } from "./RichTextRenderer";
import { articleStatusTone } from "./content-tone";
import { SLUG_PATTERN, normalizeSlugInput, slugify } from "./slug";

const LOCALES: ContentLocale[] = ["fa", "en", "de", "es", "ar", "nl"];
const PUBLIC_ORIGIN = "https://opetlife.ir";
const SEO_TITLE_MAX = 60;
const SEO_DESCRIPTION_MAX = 160;

/**
 * The article editor (spec: "title, slug, excerpt, body, cover, category,
 * tags, author, locale, SEO, state, preview, save"). `articleId === null`
 * is create mode (one locale only); otherwise every locale is reachable
 * via tabs, loaded/saved independently (spec: "manage Persian and English
 * independently"). Save and Publish/Hide/Archive are always separate
 * buttons/calls — never one combined "save and publish" action.
 *
 * The URL builder makes the page address explicit: it is built from the title (or another language's
 * address), checked live for validity and collisions, shown as the full public URL, and goes live the
 * moment the locale is published. Renaming a published address keeps the old one as a permanent redirect.
 */
export function AdminContentArticleEditorView({ articleId }: { articleId: string | null }) {
  const authorT = useTranslations("rollout.authors");
  const t = useTranslations("admin.content.editor");
  const actions = useTranslations("rollout.records");
  const context = useAdminStore((state) => state.context);
  const adminStatus = useAdminStore((state) => state.status);
  const canRead = adminStatus === "ready" && context?.isAdmin === true && context.permissions.includes("content.view");
  const permitted = (permission: AdminPermissionName) => canRead && context?.permissions.includes(permission) === true;
  // Resolve again at click time so an old DOM handler cannot use revoked permissions.
  const canAct = (permission: AdminPermissionName) => {
    const current = useAdminStore.getState();
    return current.status === "ready" && current.context?.isAdmin === true && current.context.permissions.includes("content.view") && current.context.permissions.includes(permission);
  };
  const router = useRouter();
  const uiLocale = useLocale() as "fa" | "en";

  const [article, setArticle] = useState<AdminArticleDto | null>(null);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [authors, setAuthors] = useState<ContentAuthorDto[]>([]);
  const [tags, setTags] = useState<TagDto[]>([]);
  const [media, setMedia] = useState<MediaAssetDto[]>([]);
  const [error, setError] = useState(false);

  const [activeLocale, setActiveLocale] = useState<ContentLocale>("fa");
  const [localeContent, setLocaleContent] = useState<AdminArticleLocaleDto | null>(null);
  const [localeLoading, setLocaleLoading] = useState(false);
  const [localeLoadError, setLocaleLoadError] = useState(false);
  const localeRequest = useRef(0);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [body, setBody] = useState<RichTextDocument>([]);
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [preview, setPreview] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sharedError, setSharedError] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [transitionNotice, setTransitionNotice] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [authorId, setAuthorId] = useState("");
  const [coverMediaAssetId, setCoverMediaAssetId] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [slugCheck, setSlugCheck] = useState<AdminArticleSlugCheckDto | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const slugRequest = useRef(0);

  const status = localeContent?.status;
  const canSave = !localeLoadError && !localeLoading && (articleId ? permitted("content.edit") : permitted("content.create")) && (status !== ArticleLifecycleStatus.VISIBLE || permitted("content.publish"));
  const canEditShared = articleId ? permitted("content.edit") : permitted("content.create");

  async function loadShared() {
    if (!canRead) return;
    setError(false);
    try {
      const [cats, auths, tgs] = await Promise.all([adminContentService.listCategories(), adminContentService.listAuthors(), adminContentService.listTags()]);
      setCategories(cats);
      setAuthors(auths);
      setTags(tgs);
      if (articleId) {
        const a = await adminContentService.getArticle(articleId);
        setArticle(a);
        setCategoryId(a.category?.id ?? "");
        setAuthorId(a.author?.id ?? "");
        setCoverMediaAssetId(a.coverMediaAsset?.id ?? "");
        setTagIds(a.tags.map((tg) => tg.id));
      }
    } catch {
      setError(true);
    }
    // The cover picker is a convenience; the editor works without the media library.
    try {
      const library = await adminContentService.listMedia(1, 100);
      setMedia(library.items.filter((m) => m.mimeType.startsWith("image/") && !m.disabledAt));
    } catch {
      setMedia([]);
    }
  }

  useEffect(() => {
    void loadShared();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, canRead]);

  function resetFields() {
    setTitle("");
    setSlug("");
    setExcerpt("");
    setBody([]);
    setSeoTitle("");
    setSeoDescription("");
  }

  async function loadLocale(loc: ContentLocale) {
    if (!canRead) return;
    const request = ++localeRequest.current;
    setLocaleLoadError(false);
    setTransitionNotice(null);
    if (!articleId) {
      setLocaleLoading(false);
      setLocaleContent(null);
      resetFields();
      return;
    }
    setLocaleLoading(true);
    try {
      const content = await adminContentService.getArticleLocale(articleId, loc);
      if (request !== localeRequest.current) return;
      setLocaleContent(content);
      setTitle(content.title);
      setSlug(content.slug);
      setExcerpt(content.excerpt ?? "");
      setBody(content.body);
      setSeoTitle(content.seoTitle ?? "");
      setSeoDescription(content.seoDescription ?? "");
    } catch (err) {
      if (request !== localeRequest.current) return;
      // Only an explicit 404 means this language has no content yet.
      if (!(err instanceof ApiError && err.status === 404)) {
        setLocaleLoadError(true);
        return;
      }
      setLocaleContent(null);
      resetFields();
    } finally {
      if (request === localeRequest.current) setLocaleLoading(false);
    }
  }

  useEffect(() => {
    void loadLocale(activeLocale);
    return () => { localeRequest.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLocale, articleId, canRead]);

  // Live URL check: validity, collisions with other articles, and the public path the address will get.
  useEffect(() => {
    const request = ++slugRequest.current;
    setSlugCheck(null);
    if (!canRead || !slug || !SLUG_PATTERN.test(slug)) { setSlugChecking(false); return; }
    setSlugChecking(true);
    const timer = setTimeout(async () => {
      try {
        const result = await adminContentService.checkArticleSlug({ locale: activeLocale, slug, articleId: articleId ?? undefined, categoryId });
        if (request === slugRequest.current) setSlugCheck(result ?? null);
      } catch {
        if (request === slugRequest.current) setSlugCheck(null);
      } finally {
        if (request === slugRequest.current) setSlugChecking(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [slug, activeLocale, articleId, categoryId, canRead]);

  async function save() {
    if (localeLoadError || localeLoading || !canAct(articleId ? "content.edit" : "content.create") || (status === ArticleLifecycleStatus.VISIBLE && !canAct("content.publish"))) return;
    setSaveError(null);
    setTransitionNotice(null);
    // The API accepts only lowercase Latin words joined by hyphens (SLUG_PATTERN); say so before a round-trip.
    if (!SLUG_PATTERN.test(slug)) {
      setSaveError(t("slugInvalid"));
      return;
    }
    const input = { title, slug, excerpt: excerpt || undefined, body, seoTitle: seoTitle || undefined, seoDescription: seoDescription || undefined, changeNote: changeNote || undefined };
    try {
      if (!articleId) {
        const created = await adminContentService.createArticle({ locale: activeLocale, authorId: authorId || undefined, categoryId: categoryId || undefined, coverMediaAssetId: coverMediaAssetId || undefined, tagIds: tagIds.length ? tagIds : undefined, ...input });
        router.push(`/${uiLocale}/admin/content/${created.id}`);
        return;
      }
      const saved = await adminContentService.saveArticleLocale(articleId, activeLocale, input);
      setLocaleContent(saved);
      setChangeNote("");
      setArticle((prev) => (prev ? { ...prev, locales: [...prev.locales.filter((l) => l.locale !== saved.locale), { locale: saved.locale, status: saved.status, title: saved.title, slug: saved.slug, updatedAt: saved.updatedAt }] } : prev));
    } catch (err) {
      // The typed fields stay as they are, so nothing the editor wrote is lost on a failed save.
      setSaveError(saveErrorMessage(err));
    }
  }

  function saveErrorMessage(err: unknown) {
    if (err instanceof ApiError && err.code === "DUPLICATE_ARTICLE_SLUG") return t("saveFailed");
    if (err instanceof ApiError && err.details?.reason === "LIVE_EDIT_REQUIRES_CONTENT_PUBLISH") return t("liveEditNeedsPublish");
    if (err instanceof ApiError && err.status === 403) return t("saveForbidden");
    return t("saveFailedKept");
  }

  async function updateShared() {
    if (!articleId || !canAct("content.edit")) return;
    setSharedError(null);
    try {
      const updated = await adminContentService.updateArticle(articleId, { authorId: authorId || null, categoryId: categoryId || null, coverMediaAssetId: coverMediaAssetId || null, tagIds });
      setArticle(updated);
      // The category decides /blog vs /guides, so refresh this locale's public path.
      if (localeContent) void loadLocale(activeLocale);
    } catch (err) {
      setSharedError(err instanceof ApiError && err.status === 403 ? t("saveForbidden") : t("sharedSaveFailed"));
    }
  }

  function toggleTag(tagId: string) {
    if (!canAct(articleId ? "content.edit" : "content.create")) return;
    setTagIds((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]));
  }

  const dirty = Boolean(localeContent) && (title !== localeContent!.title || slug !== localeContent!.slug || excerpt !== (localeContent!.excerpt ?? "") || seoTitle !== (localeContent!.seoTitle ?? "") || seoDescription !== (localeContent!.seoDescription ?? "") || JSON.stringify(body) !== JSON.stringify(localeContent!.body));

  async function transition(action: "publish" | "hide" | "archive") {
    if (!articleId || localeLoadError || localeLoading || !canAct(action === "archive" ? "content.archive" : "content.publish")) return;
    if (action === "publish" && dirty) { setTransitionError(t("publishNeedsSave")); return; }
    const fn = action === "publish" ? adminContentService.publishArticleLocale : action === "hide" ? adminContentService.hideArticleLocale : adminContentService.archiveArticleLocale;
    setTransitionError(null);
    setTransitionNotice(null);
    try {
      const updated = await fn(articleId, activeLocale);
      setLocaleContent(updated);
      if (action === "publish") setTransitionNotice(t("publishedNotice"));
      await loadShared();
    } catch (err) {
      setTransitionError(err instanceof ApiError && err.status === 403 ? t("transitionForbidden") : t("transitionFailed"));
    }
  }

  async function copyLiveUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  if (adminStatus === "idle" || adminStatus === "loading") return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;
  if (!canRead || (!articleId && !permitted("content.create"))) return <EmptyState title={actions("noAccess")} />;

  if (error && articleId) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={loadShared} />;
  if (articleId && !article) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  const canPublish = status === ArticleLifecycleStatus.DRAFT || status === ArticleLifecycleStatus.HIDDEN;
  const canHide = status === ArticleLifecycleStatus.VISIBLE;
  const canArchive = status === ArticleLifecycleStatus.DRAFT || status === ArticleLifecycleStatus.HIDDEN;

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const categorySlug = selectedCategory?.locales.find((l) => l.locale === activeLocale)?.slug;
  const sectionPath = categorySlug === "guides" ? "guides" : "blog";
  const publicPath = slugCheck?.publicPath ?? (slug && SLUG_PATTERN.test(slug) ? `/${activeLocale}/${sectionPath}/${slug}` : localeContent?.publicPath ?? `/${activeLocale}/${sectionPath}/…`);
  const publicUrl = `${PUBLIC_ORIGIN}${publicPath}`;
  const slugInvalid = slug.length > 0 && !SLUG_PATTERN.test(slug);
  const slugRenamedAfterPublish = Boolean(localeContent?.publishedAt) && slug !== localeContent?.slug;
  const otherLocaleSlugs = (article?.locales ?? []).filter((l) => l.locale !== activeLocale && l.slug);
  const cover = media.find((m) => m.id === coverMediaAssetId) ?? (article?.coverMediaAsset?.id === coverMediaAssetId ? article.coverMediaAsset : null);

  return (
    <div className="flex flex-col gap-5">
      {error && <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={loadShared} />}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{articleId ? t("editTitle") : t("createTitle")}</h1>
        {articleId ? (
          <Button variant="secondary" onClick={() => router.push(`/${uiLocale}/admin/content/${articleId}/versions?locale=${activeLocale}`)}>
            {t("versionHistory")}
          </Button>
        ) : null}
      </div>

      {articleId ? (
        <div className="flex flex-wrap gap-2">
          {LOCALES.map((l) => {
            const availability = article?.locales.find((al) => al.locale === l);
            return (
              <Button key={l} aria-pressed={activeLocale === l} variant={activeLocale === l ? "primary" : "secondary"} size="sm" onClick={() => setActiveLocale(l)}>
                {l.toUpperCase()} {availability ? `· ${t(`status.${availability.status}`)}` : `· ${t("notCreated")}`}
              </Button>
            );
          })}
        </div>
      ) : (
        <Select label={t("localeSectionTitle." + activeLocale)} value={activeLocale} onChange={(e) => setActiveLocale(e.target.value as ContentLocale)} options={LOCALES.map((l) => ({ value: l, label: t(`localeSectionTitle.${l}`) }))} />
      )}

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-section-title text-text-primary">{t("sharedFieldsTitle")}</span>
        <div className="flex flex-wrap items-end gap-2">
          <Select disabled={!canEditShared} label={t("category")} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} options={[{ value: "", label: t("none") }, ...categories.map((c) => ({ value: c.id, label: c.locales.find((l) => l.locale === uiLocale)?.name ?? c.locales[0]?.name ?? c.id }))]} />
          {canEditShared ? <Link href={`/${uiLocale}/admin/content/authors`}>{authorT("manage")}</Link> : null}
          <Select disabled={!canEditShared} label={t("author")} value={authorId} onChange={(e) => setAuthorId(e.target.value)} options={[{ value: "", label: t("none") }, ...authors.map((a) => ({ value: a.id, label: a.name }))]} />
          <Select disabled={!canEditShared} label={t("cover")} value={coverMediaAssetId} onChange={(e) => setCoverMediaAssetId(e.target.value)} options={[{ value: "", label: t("coverNone") }, ...[...(cover && !media.some((m) => m.id === cover.id) ? [cover] : []), ...media].map((m) => ({ value: m.id, label: m.altText || m.url.split("/").pop() || m.id }))]} />
          {articleId && canEditShared ? (
            <Button variant="secondary" size="sm" onClick={updateShared}>
              {t("saveSharedFields")}
            </Button>
          ) : null}
          {sharedError ? <span role="alert" className="text-metadata text-state-urgent">{sharedError}</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* CMS media URLs are authored public content; no static image-host allow-list applies. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {cover ? <img src={cover.url} alt={cover.altText ?? ""} className="h-20 w-32 rounded-md object-cover" /> : null}
          <span className="text-metadata text-text-secondary">{t("coverHelp")}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map((tg) => {
            const label = tg.locales.find((l) => l.locale === uiLocale)?.name ?? tg.locales[0]?.name ?? tg.id;
            const selected = tagIds.includes(tg.id);
            if (!canEditShared) return selected ? <span key={tg.id}>{label}</span> : null;
            return (
              <Button key={tg.id} type="button" size="sm" aria-pressed={selected} variant={selected ? "primary" : "secondary"} onClick={() => toggleTag(tg.id)}>
                {label}
              </Button>
            );
          })}
        </div>
      </ContextSurface>

      {localeLoading ? (
        <Skeleton className="h-64 w-full" aria-label={t("loading")} />
      ) : localeLoadError ? (
        <ErrorRecovery title={t("title")} message={actions("failed")} retryLabel={t("retry")} onRetry={() => void loadLocale(activeLocale)} />
      ) : (
        <ContextSurface className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-section-title text-text-primary">{t(`localeSectionTitle.${activeLocale}`)}</span>
            {status ? <StatusLabel tone={articleStatusTone(status)}>{t(`status.${status}`)}</StatusLabel> : null}
          </div>

          <Input readOnly={!canSave} label={t("titleField")} value={title} onChange={(e) => setTitle(e.target.value)} />

          <fieldset className="flex flex-col gap-2 rounded-md border border-border-subtle p-3">
            <legend className="px-1 text-metadata font-bold text-text-primary">{t("urlSection")}</legend>
            <div className="flex flex-wrap items-end gap-2">
              <span dir="ltr" className="pb-2 text-metadata text-text-secondary">{`${PUBLIC_ORIGIN}${publicPath.slice(0, publicPath.lastIndexOf("/") + 1)}`}</span>
              <Input readOnly={!canSave} dir="ltr" label={t("slug")} value={slug} onChange={(e) => setSlug(normalizeSlugInput(e.target.value))} onBlur={() => setSlug((s) => s.replace(/^-+|-+$/g, ""))} className="min-w-[240px] flex-1" />
              {canSave ? (
                <Button type="button" size="sm" variant="secondary" disabled={!title.trim()} onClick={() => setSlug(slugify(title))}>
                  {t("generateSlug")}
                </Button>
              ) : null}
              {canSave
                ? otherLocaleSlugs.map((other) => (
                    <Button key={other.locale} type="button" size="sm" variant="ghost" onClick={() => setSlug(other.slug)}>
                      {t("slugFromOtherLocale", { locale: other.locale.toUpperCase() })}
                    </Button>
                  ))
                : null}
            </div>
            <span className="text-metadata text-text-secondary">{t("urlHelp")}</span>
            <div role="status" aria-live="polite" className="text-metadata">
              {slugInvalid ? <span className="text-state-urgent">{t("slugInvalid")}</span> : slugChecking ? <span className="text-text-secondary">{t("slugChecking")}</span> : slugCheck && !slugCheck.available ? <span className="text-state-urgent">{t("slugTaken", { title: slugCheck.conflict?.title ?? "" })}</span> : slugCheck?.conflict?.kind === "REDIRECT" ? <span className="text-state-urgent">{t("slugRedirectWarning")}</span> : slugCheck?.available && slug !== localeContent?.slug ? <span className="text-state-success">{t("slugAvailable")}</span> : null}
            </div>
            {slugRenamedAfterPublish ? <span className="text-metadata text-state-urgent">{t("slugChangeWarning")}</span> : null}
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-surface-elevated px-3 py-2">
              <span className="text-metadata text-text-secondary">{status === ArticleLifecycleStatus.VISIBLE ? t("liveAt") : status === ArticleLifecycleStatus.HIDDEN ? t("hiddenAt") : t("willGoLiveAt")}</span>
              {status === ArticleLifecycleStatus.VISIBLE && localeContent?.publicPath ? (
                <>
                  <a dir="ltr" href={`${PUBLIC_ORIGIN}${localeContent.publicPath}`} target="_blank" rel="noopener noreferrer" className="text-metadata text-brand-natural underline">{`${PUBLIC_ORIGIN}${localeContent.publicPath}`}</a>
                  <Button type="button" size="sm" variant="ghost" onClick={() => void copyLiveUrl(`${PUBLIC_ORIGIN}${localeContent.publicPath}`)}>{copied ? t("copied") : t("copyLink")}</Button>
                </>
              ) : (
                <span dir="ltr" className="text-metadata text-text-primary">{publicUrl}</span>
              )}
            </div>
          </fieldset>

          <Input readOnly={!canSave} label={t("excerpt")} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
          <Input readOnly={!canSave} label={t("seoTitle")} value={seoTitle} maxLength={70} onChange={(e) => setSeoTitle(e.target.value)} />
          <span className={"text-metadata " + (seoTitle.length > SEO_TITLE_MAX ? "text-state-urgent" : "text-text-secondary")}>{t("charCount", { count: seoTitle.length, max: SEO_TITLE_MAX })} · {t("seoTitleHint")}</span>
          <Input readOnly={!canSave} label={t("seoDescription")} value={seoDescription} maxLength={200} onChange={(e) => setSeoDescription(e.target.value)} />
          <span className={"text-metadata " + (seoDescription.length > SEO_DESCRIPTION_MAX ? "text-state-urgent" : "text-text-secondary")}>{t("charCount", { count: seoDescription.length, max: SEO_DESCRIPTION_MAX })} · {t("seoDescriptionHint")}</span>

          <section aria-label={t("serpPreview")} className="flex flex-col gap-1 rounded-md border border-border-subtle bg-surface-elevated p-3" dir={activeLocale === "fa" ? "rtl" : "ltr"}>
            <span className="text-metadata text-text-secondary">{t("serpPreview")}</span>
            <span dir="ltr" className="text-metadata text-text-secondary">{publicUrl}</span>
            <span className="text-body font-bold text-brand-natural">{(seoTitle || title).slice(0, SEO_TITLE_MAX) || "…"}</span>
            <span className="text-metadata text-text-secondary">{(seoDescription || excerpt).slice(0, SEO_DESCRIPTION_MAX) || "…"}</span>
          </section>

          <div className="flex items-center justify-between">
            <span className="text-metadata text-text-secondary">{t("body")}</span>
            {canSave ? <Button type="button" variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
              {preview ? t("editBody") : t("previewBody")}
            </Button> : null}
          </div>
          {preview || !canSave ? (
            <ContextSurface>
              <RichTextRenderer body={body} />
            </ContextSurface>
          ) : (
            <RichTextBlockEditor value={body} onChange={setBody} />
          )}

          <Input readOnly={!canSave} label={t("changeNote")} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />
          {saveError ? <span role="alert" className="text-metadata text-state-urgent">{saveError}</span> : null}
          {canSave ? <Button onClick={save} disabled={slugInvalid || (slugCheck !== null && !slugCheck.available)}>{status === ArticleLifecycleStatus.VISIBLE ? t("saveLive") : t("save")}</Button> : null}

          {articleId && (permitted("content.publish") || permitted("content.archive")) ? (
            <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-3">
              {permitted("content.publish") ? <><Button disabled={!canPublish} onClick={() => transition("publish")}>
                {t("publish")}
              </Button>
              <Button variant="secondary" disabled={!canHide} onClick={() => transition("hide")}>
                {t("hide")}
              </Button></> : null}
              {permitted("content.archive") ? <Button variant="secondary" disabled={!canArchive} onClick={() => transition("archive")}>
                {t("archive")}
              </Button> : null}
              {transitionError ? <span role="alert" className="text-metadata text-state-urgent">{transitionError}</span> : null}
              {transitionNotice ? <span role="status" className="text-metadata text-state-success">{transitionNotice}{localeContent?.publicPath ? <> — <a dir="ltr" href={`${PUBLIC_ORIGIN}${localeContent.publicPath}`} target="_blank" rel="noopener noreferrer" className="underline">{t("openLive")}</a></> : null}</span> : null}
            </div>
          ) : null}
        </ContextSurface>
      )}
    </div>
  );
}
