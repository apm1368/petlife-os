import type { ArticleLifecycleStatus } from "@petlife/types";

export function articleStatusTone(status: ArticleLifecycleStatus): "success" | "neutral" | "attention" | "urgent" {
  switch (status) {
    case "VISIBLE":
      return "success";
    case "DRAFT":
      return "neutral";
    case "HIDDEN":
      return "attention";
    case "ARCHIVED":
      return "urgent";
    default:
      return "neutral";
  }
}
