import type { CommunityCommentDto, CommunityPostDto, CommunityPostType, CommunityReactionType, CommunityReportDto, CommunityReportReason, PaginatedDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

function toQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export interface UploadTargetDto {
  uploadUrl: string;
  method: "PUT";
  publicUrl: string;
  headers?: Record<string, string>;
  expiresInSeconds: number;
  key: string;
}

export interface CreateCommunityPostInput {
  type: CommunityPostType;
  title?: string;
  body: string;
  petId?: string;
  mediaObjectKeys?: string[];
}

/**
 * spec: "Community browsing may be public where appropriate. Creating: post,
 * comment, reaction, report — requires authentication." GET calls here never
 * assume a session; the create/react/report calls require one and the
 * backend enforces it with SessionAuthGuard regardless.
 */
export const communityService = {
  listPosts: (input: { page?: number; pageSize?: number; type?: CommunityPostType; countryCode?: string } = {}) =>
    apiFetch<PaginatedDto<CommunityPostDto>>(`/community/posts${toQueryString(input)}`),
  getPost: (postId: string) => apiFetch<CommunityPostDto>(`/community/posts/${postId}`),
  createPost: (input: CreateCommunityPostInput) => apiFetch<CommunityPostDto>(`/community/posts`, { method: "POST", body: input }),
  requestMediaUpload: (contentType: string, fileSizeBytes: number) => apiFetch<UploadTargetDto>(`/community/posts/upload-url`, { method: "POST", body: { contentType, fileSizeBytes } }),

  listComments: (postId: string, input: { page?: number; pageSize?: number } = {}) => apiFetch<PaginatedDto<CommunityCommentDto>>(`/community/posts/${postId}/comments${toQueryString(input)}`),
  addComment: (postId: string, body: string) => apiFetch<CommunityCommentDto>(`/community/posts/${postId}/comments`, { method: "POST", body: { body } }),

  setReaction: (postId: string, type: CommunityReactionType) => apiFetch<void>(`/community/posts/${postId}/reactions`, { method: "PUT", body: { type } }),
  removeReaction: (postId: string) => apiFetch<void>(`/community/posts/${postId}/reactions`, { method: "DELETE" }),

  reportPost: (postId: string, reason: CommunityReportReason, details?: string) => apiFetch<CommunityReportDto>(`/community/posts/${postId}/report`, { method: "POST", body: { reason, details } }),
  reportComment: (commentId: string, reason: CommunityReportReason, details?: string) => apiFetch<CommunityReportDto>(`/community/comments/${commentId}/report`, { method: "POST", body: { reason, details } }),
};
