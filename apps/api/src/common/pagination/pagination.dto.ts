import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import type { PaginatedDto } from "@petlife/types";

/** Shared offset-pagination query params (Handoff 09, spec section 69-70) — every Seller OS list endpoint uses this instead of an unbounded response. */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export function resolvePagination(query: PaginationQueryDto): { page: number; pageSize: number; skip: number; take: number } {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function toPaginatedDto<T>(items: T[], total: number, page: number, pageSize: number): PaginatedDto<T> {
  return { items, total, page, pageSize };
}
