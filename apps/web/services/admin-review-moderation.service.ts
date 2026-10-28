import type {
  AdminReviewModerationListDto,
  AdminReviewModerationRowDto,
  AdminReviewModerationStatus,
  AdminReviewVertical,
} from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

function query(input: {
  vertical: AdminReviewVertical;
  status?: AdminReviewModerationStatus;
  q?: string;
  page?: number;
}): string {
  const params = new URLSearchParams({ vertical: input.vertical });
  if (input.status) params.set("status", input.status);
  if (input.q) params.set("q", input.q);
  if (input.page) params.set("page", String(input.page));
  return params.toString();
}

export const adminReviewModerationService = {
  list: (
    input: { vertical: AdminReviewVertical; status?: AdminReviewModerationStatus; q?: string; page?: number },
    signal?: AbortSignal,
  ) => apiFetch<AdminReviewModerationListDto>(`/admin/review-moderation?${query(input)}`, { signal }),
  approve: (vertical: AdminReviewVertical, id: string, body: { reason?: string; labels: string[] }) =>
    apiFetch<AdminReviewModerationRowDto>(`/admin/review-moderation/${vertical}/${id}/approve`, {
      method: "POST",
      body,
    }),
  reject: (vertical: AdminReviewVertical, id: string, body: { reason: string; labels: string[] }) =>
    apiFetch<AdminReviewModerationRowDto>(`/admin/review-moderation/${vertical}/${id}/reject`, {
      method: "POST",
      body,
    }),
};
