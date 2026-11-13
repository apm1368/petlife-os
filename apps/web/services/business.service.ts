import type { BusinessMembershipsDto, BusinessOverviewDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

/** The partner's own businesses — always resolved from the session on the server, never from an id sent here. */
export const businessService = {
  memberships: () => apiFetch<BusinessMembershipsDto>("/business/memberships"),
  overview: () => apiFetch<BusinessOverviewDto>("/business/overview"),
};

export const hasBusiness = (m: Pick<BusinessMembershipsDto, "services" | "shops"> | null | undefined) => !!m && m.services.length + m.shops.length > 0;
