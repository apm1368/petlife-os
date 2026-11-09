import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { PlanRequiredNote } from "./PlanRequiredNote";

function limitError() {
  return new ApiError({ code: "SUBSCRIPTION_ENTITLEMENT_LIMIT_EXCEEDED", message: "API-only detail", details: { key: "care.reminders" }, requestId: "test" }, 403);
}

describe("PlanRequiredNote", () => {
  it.each([
    ["fa", "یادآورهای شخصی و تکرارشونده", "/fa/subscription/plans"],
    ["en", "personal and recurring reminders", "/en/subscription/plans"],
    ["de", "Persönliche und wiederkehrende Erinnerungen", "/de/subscription/plans"],
    ["es", "Recordatorios personales y recurrentes", "/es/subscription/plans"],
  ] as const)("renders a localized plan-limit explanation for %s", (locale, feature, href) => {
    renderWithIntl(<PlanRequiredNote error={limitError()} />, locale);
    expect(screen.getByRole("alert").textContent).toContain(feature);
    expect(screen.getByRole("link").getAttribute("href")).toBe(href);
    expect(screen.queryByText(/API-only detail/)).toBeNull();
  });
});
