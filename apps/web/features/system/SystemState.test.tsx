import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { SystemState, systemStateFor } from "./SystemState";
import { NotFoundFrame } from "./NotFoundFrame";

const apiError = (status: number, code: string, details?: Record<string, unknown>) => new ApiError({ code, message: "SQL constraint pet_access_grants_fk violated at row 42", details, requestId: "r" }, status);

describe("SystemState", () => {
  it("maps API failures to specific states — expired and revoked access explain themselves", () => {
    expect(systemStateFor(apiError(403, "PET_ACCESS_DENIED", { lapse: { reason: "EXPIRED", at: "2026-09-01T00:00:00Z" } }))).toBe("ACCESS_EXPIRED");
    expect(systemStateFor(apiError(403, "PET_ACCESS_DENIED", { lapse: { reason: "REVOKED" } }))).toBe("ACCESS_REVOKED");
    expect(systemStateFor(apiError(403, "PET_ACCESS_DENIED"))).toBe("FORBIDDEN");
    expect(systemStateFor(apiError(404, "NOT_FOUND"))).toBe("NOT_FOUND");
    expect(systemStateFor(apiError(401, "UNAUTHENTICATED"))).toBe("AUTH_REQUIRED");
    expect(systemStateFor(apiError(500, "INTERNAL_ERROR"))).toBe("GENERIC_RETRYABLE_ERROR");
    expect(systemStateFor(new Error("network"))).toBe("GENERIC_RETRYABLE_ERROR");
  });

  it("renders product copy with a way forward, never the backend message (EN)", () => {
    renderWithIntl(<SystemState kind="ACCESS_EXPIRED" />, "en");
    expect(screen.getByRole("heading", { name: "Your access has ended" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to home" }).getAttribute("href")).toBe("/en/home");
    expect(document.body.textContent).not.toContain("SQL");
  });

  it("sign-in state carries a safe returnTo; Persian copy for 404", () => {
    renderWithIntl(<SystemState kind="AUTH_REQUIRED" returnTo="/fa/pets/p1" />, "fa");
    expect(screen.getByRole("link", { name: "ورود" }).getAttribute("href")).toBe("/fa/welcome?returnTo=%2Ffa%2Fpets%2Fp1");
  });

  it.each([["ar", "إعادة المحاولة"], ["nl", "Opnieuw proberen"]] as const)("uses its own copy and button labels in %s, not English", (locale, retry) => {
    renderWithIntl(<SystemState kind="GENERIC_RETRYABLE_ERROR" onRetry={() => undefined} />, locale);
    expect(screen.getByRole("button", { name: retry })).toBeTruthy();
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(screen.queryByRole("link", { name: "Go to home" })).toBeNull();
  });

  it("forbidden says nothing about the thing being protected", () => {
    renderWithIntl(<SystemState kind="FORBIDDEN" />, "en");
    expect(screen.getByRole("heading").textContent).toBe("You don't have access to this");
  });

  it.each([
    ["de", "Ein Fehler ist aufgetreten", "Erneut versuchen"],
    ["es", "Ha ocurrido un problema", "Reintentar"],
  ] as const)("renders retry/error states in %s", (locale, title, retry) => {
    renderWithIntl(<SystemState kind="GENERIC_RETRYABLE_ERROR" onRetry={() => undefined} />, locale);
    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByRole("button", { name: retry })).toBeTruthy();
  });
  it.each([
    ["fa", "/", "/fa", "بازگشت به خانه"],
    ["en", "/en", "/en", "Go to home"],
    ["de", "/de", "/de", "Zur Startseite"],
    ["es", "/es", "/es", "Volver al inicio"],
  ] as const)("the 404 frame (%s) sits on the pattern and leads back to the public site, not the member home", (locale, logoHref, homeHref, homeLabel) => {
    const { container } = renderWithIntl(<NotFoundFrame><SystemState kind="NOT_FOUND" home="site" /></NotFoundFrame>, locale);
    expect(container.querySelector(".opl-page.opl-boot .opl-boot__card .system-state")).toBeTruthy();
    expect(container.querySelector(".opl-boot__card .opl-bird")).toBeTruthy();
    expect(container.querySelector(".opl-boot__home")?.getAttribute("href")).toBe(logoHref);
    expect(screen.getByRole("link", { name: homeLabel }).getAttribute("href")).toBe(homeHref);
  });
});

