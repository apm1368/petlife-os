import type { HomeResponseDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export const homeService = {
  get: () => apiFetch<HomeResponseDto>("/home"),
};
