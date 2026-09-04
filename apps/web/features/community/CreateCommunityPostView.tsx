"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, Input, Select } from "@petlife/ui";
import { CommunityPostType } from "@petlife/types";
import { communityService } from "@/services/community.service";
import { ApiError } from "@/lib/api/client";

const POST_TYPES: CommunityPostType[] = [CommunityPostType.GENERAL, CommunityPostType.QUESTION, CommunityPostType.LOCAL, CommunityPostType.RESCUE, CommunityPostType.ADOPTION, CommunityPostType.MEMORY];

export function CreateCommunityPostView() {
  const t = useTranslations("community");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<CommunityPostType>(CommunityPostType.GENERAL);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(): Promise<void> {
    if (!body.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const mediaObjectKeys: string[] = [];
      const file = fileInputRef.current?.files?.[0];
      if (file) {
        const target = await communityService.requestMediaUpload(file.type, file.size);
        await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: file });
        mediaObjectKeys.push(target.key);
      }
      const post = await communityService.createPost({ type, title: title.trim() || undefined, body: body.trim(), mediaObjectKeys: mediaObjectKeys.length > 0 ? mediaObjectKeys : undefined });
      router.push(`/community/posts/${post.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("newPost.title")}</h1>

      <ContextSurface className="flex flex-col gap-4">
        <Select
          label={t("newPost.typeLabel")}
          value={type}
          onChange={(e) => setType(e.target.value as CommunityPostType)}
          options={POST_TYPES.map((value) => ({ value, label: t(`postType.${value}`) }))}
        />
        <Input label={t("newPost.titleLabel")} hint={tCommon("optional")} value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input label={t("newPost.bodyLabel")} value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex flex-col gap-1.5">
          <span className="text-metadata text-text-secondary">{t("newPost.mediaLabel")}</span>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="text-body text-text-primary" />
        </div>
        {error ? <p className="text-body text-state-urgent">{error}</p> : null}
        <Button variant="primary" isLoading={isSubmitting} onClick={handleSubmit} disabled={!body.trim()}>
          {t("newPost.submit")}
        </Button>
      </ContextSurface>
    </div>
  );
}
