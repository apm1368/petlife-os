import { afterEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { HealthLoadFailure } from "./HealthLoadFailure";

const originalOnLine = window.navigator.onLine;
afterEach(() => Object.defineProperty(window.navigator, "onLine", { configurable: true, value: originalOnLine }));

describe("HealthLoadFailure", () => {
  it("shows the localized no-access state for a forbidden response", () => {
    renderWithIntl(<HealthLoadFailure error={{ status: 403 }} onRetry={() => undefined} />, "es");
    expect(screen.getByRole("heading", { name: "No tienes acceso" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it("distinguishes the offline state from an ordinary retryable error", () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    renderWithIntl(<HealthLoadFailure error={new Error("network") } onRetry={() => undefined} />, "de");
    expect(screen.getByRole("heading", { name: "Du bist offline. Einige Aktionen funktionieren möglicherweise nicht." })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });
});
