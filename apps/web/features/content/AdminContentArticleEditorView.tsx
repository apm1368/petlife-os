"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { ArticleLifecycleStatus } from "@petlife/types";
import type { AdminArticleDto, AdminArticleLocaleDto, CategoryDto, ContentAuthorDto, Locale as ContentLocale, RichTextDocument, TagDto } from "@petlife/types";
import { adminContentService } from "@/services/admin-content.service";
import { RichTextBlockEditor } from "./RichTextBlockEditor";
import { RichTextRenderer } from "./RichTextRenderer";
import { articleStatusTone } from "./content-tone";

const LOCALES: ContentLocale[] = ["fa", "en"];

/**
 * The article editor (spec: "title, slug, excerpt, body, cover, category,
 * tags, author, locale, SEO, state, preview, save"). `articleId === null`
 * is create mode (one locale only); otherwise every locale is reachable
 * via tabs, loaded/saved independently (spec: "manage Persian and English
 * independently"). Save and Publish/Hide/Archive are always separate
 * buttons/calls — never one combined "save and publish" action.
 */
export function AdminContentArticleEditorView({ articleId }: { articleId: string | null }) {
  const t = useTranslations("admin.content.editor");
  const router = useRouter();
  const uiLocale = useLocale() as "fa" | "en";

  const [article, setArticle] = useState<AdminArticleDto | null>(null);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [authors, setAuthors] = useState<ContentAuthorDto[]>([]);
  const [tags, setTags] = useState<TagDto[]>([]);
  const [error, setError] = useState(false);

  const [activeLocale, setActiveLocale] = useState<ContentLocale>("fa");
  const [localeContent, setLocaleContent] = useState<AdminArticleLocaleDto | null>(null);
  const [localeLoading, setLocaleLoading] = useState(false);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [body, setBody] = useState<RichTextDocument>([]);
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [preview, setPreview] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [authorId, setAuthorId] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);

  async function loadShared() {
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
        setTagIds(a.tags.map((tg) => tg.id));
      }
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void loadShared();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  async function loadLocale(loc: ContentLocale) {
    if (!articleId) {
      setLocaleContent(null);
      setTitle("");
      setSlug("");
      setExcerpt("");
      setBody([]);
      setSeoTitle("");
      setSeoDescription("");
      return;
    }
    setLocaleLoading(true);
    try {
      const content = await adminContentService.getArticleLocale(articleId, loc);
      setLocaleContent(content);
      setTitle(content.title);
      setSlug(content.slug);
      setExcerpt(content.excerpt ?? "");
      setBody(content.body);
      setSeoTitle(content.seoTitle ?? "");
      setSeoDescription(content.seoDescription ?? "");
    } catch {
      setLocaleContent(null);
      setTitle("");
      setSlug("");
      setExcerpt("");
      setBody([]);
      setSeoTitle("");
      setSeoDescription("");
    } finally {
      setLocaleLoading(false);
    }
  }

  useEffect(() => {
    void loadLocale(activeLocale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLocale, articleId]);

  async function save() {
    setSaveError(null);
    const input = { title, slug, excerpt: excerpt || undefined, body, seoTitle: seoTitle || undefined, seoDescription: seoDescription || undefined, changeNote: changeNote || undefined };
    try {
      if (!articleId) {
        const created = await adminContentService.createArticle({ locale: activeLocale, authorId: authorId || undefined, categoryId: categoryId || undefined, ...input });
        router.push(`/${uiLocale}/admin/content/${created.id}`);
        return;
      }
      const saved = await adminContentService.saveArticleLocale(articleId, activeLocale, input);
      setLocaleContent(saved);
      setChangeNote("");
    } catch {
      setSaveError(t("saveFailed"));
    }
  }

  async function updateShared() {
    if (!articleId) return;
    const updated = await adminContentService.updateArticle(articleId, { authorId: authorId || null, categoryId: categoryId || null, tagIds });
    setArticle(updated);
  }

  function toggleTag(tagId: string) {
    setTagIds((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]));
  }

  async function transition(action: "publish" | "hide" | "archive") {
    if (!articleId) return;
    const fn = action === "publish" ? adminContentService.publishArticleLocale : action === "hide" ? adminContentService.hideArticleLocale : adminContentService.archiveArticleLocale;
    const updated = await fn(articleId, activeLocale);
    setLocaleContent(updated);
    await loadShared();
  }

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={loadShared} />;
  if (articleId && !article) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  const status = localeContent?.status;
  const canPublish = status === ArticleLifecycleStatus.DRAFT || status === ArticleLifecycleStatus.HIDDEN;
  const canHide = status === ArticleLifecycleStatus.VISIBLE;
  const canArchive = status === ArticleLifecycleStatus.DRAFT || status === ArticleLifecycleStatus.HIDDEN;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{articleId ? t("editTitle") : t("createTitle")}</h1>
        {articleId ? (
          <Button variant="secondary" onClick={() => router.push(`/${uiLocale}/admin/content/${articleId}/versions?locale=${activeLocale}`)}>
            {t("versionHistory")}
          </Button>
        ) : null}
      </div>

      {articleId ? (
        <div className="flex gap-2">
          {LOCALES.map((l) => {
            const availability = article?.locales.find((al) => al.locale === l);
            return (
              <Button key={l} variant={activeLocale === l ? "primary" : "secondary"} size="sm" onClick={() => setActiveLocale(l)}>
                {l.toUpperCase()} {availability ? `· ${t(`status.${availability.status}`)}` : `· ${t("notCreated")}`}
              </Button>
            );
          })}
        </div>
      ) : null}

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-section-title text-text-primary">{t("sharedFieldsTitle")}</span>
        <div className="flex flex-wrap items-end gap-2">
          <Select label={t("category")} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} options={[{ value: "", label: t("none") }, ...categories.map((c) => ({ value: c.id, label: c.locales.find((l) => l.locale === uiLocale)?.name ?? c.locales[0]?.name ?? c.id }))]} />
          <Select label={t("author")} value={authorId} onChange={(e) => setAuthorId(e.target.value)} options={[{ value: "", label: t("none") }, ...authors.map((a) => ({ value: a.id, label: a.name }))]} />
          {articleId ? (
            <Button variant="secondary" size="sm" onClick={updateShared}>
              {t("saveSharedFields")}
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map((tg) => {
            const label = tg.locales.find((l) => l.locale === uiLocale)?.name ?? tg.locales[0]?.name ?? tg.id;
            const selected = tagIds.includes(tg.id);
            return (
              <Button key={tg.id} type="button" size="sm" variant={selected ? "primary" : "secondary"} onClick={() => toggleTag(tg.id)}>
                {label}
              </Button>
            );
          })}
        </div>
      </ContextSurface>

      {localeLoading ? (
        <Skeleton className="h-64 w-full" aria-label={t("loading")} />
      ) : (
        <ContextSurface className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-section-title text-text-primary">{t(`localeSectionTitle.${activeLocale}`)}</span>
            {status ? <StatusLabel tone={articleStatusTone(status)}>{t(`status.${status}`)}</StatusLabel> : null}
          </div>

          <Input label={t("titleField")} value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input label={t("slug")} value={slug} onChange={(e) => setSlug(e.target.value)} />
          <Input label={t("excerpt")} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
          <Input label={t("seoTitle")} value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
          <Input label={t("seoDescription")} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} />

          <div className="flex items-center justify-between">
            <span className="text-metadata text-text-secondary">{t("body")}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
              {preview ? t("editBody") : t("previewBody")}
            </Button>
          </div>
          {preview ? (
            <ContextSurface>
              <RichTextRenderer body={body} />
            </ContextSurface>
          ) : (
            <RichTextBlockEditor value={body} onChange={setBody} />
          )}

          <Input label={t("changeNote")} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />
          {saveError ? <span className="text-metadata text-state-urgent">{saveError}</span> : null}
          <Button onClick={save}>{t("save")}</Button>

          {articleId ? (
            <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-3">
              <Button disabled={!canPublish} onClick={() => transition("publish")}>
                {t("publish")}
              </Button>
              <Button variant="secondary" disabled={!canHide} onClick={() => transition("hide")}>
                {t("hide")}
              </Button>
              <Button variant="secondary" disabled={!canArchive} onClick={() => transition("archive")}>
                {t("archive")}
              </Button>
            </div>
          ) : null}
        </ContextSurface>
      )}
    </div>
  );
}
