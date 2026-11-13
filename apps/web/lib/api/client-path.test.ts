import { describe, expect, it } from "vitest";
import { ApiError, assertSafeApiPath } from "./client";

describe("assertSafeApiPath", () => {
  it("accepts ordinary API paths and queries", () => {
    for (const ok of ["/me", "/chat/conversations/3fa85f64-5717-4562-b3fc-2c963f66afa6/messages", "/shop/products?page=2&q=%23tag", "/blog/articles/s%C3%BC%C3%9F?locale=de"]) {
      expect(() => assertSafeApiPath(ok)).not.toThrow();
    }
  });

  it("refuses paths that a decoded route param could steer to another API route", () => {
    for (const bad of ["/chat/conversations/../../admin/x/messages", "/chat/conversations/%2e%2e/admin", "/a/./b", "/a/.%2E/b", "/chat/x#/messages", "/a\\\\b", "//evil.example/x", "relative", "/a\\nb"]) {
      expect(() => assertSafeApiPath(bad)).toThrow(ApiError);
    }
  });
});
