import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { householdsService } from "@/services/households.service";
import { petsService } from "@/services/pets.service";
import { ApiError } from "@/lib/api/client";
import { PetAccessView } from "./PetAccessView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/households.service", () => ({ householdsService: { collaboration: vi.fn() } }));
vi.mock("@/services/pets.service", () => ({ petsService: { getById: vi.fn(), listAccessGrants: vi.fn(), createAccessGrant: vi.fn(), updateAccessGrant: vi.fn(), revokeAccessGrant: vi.fn() } }));

describe("PetAccessView locale coverage", () => {
  beforeEach(() => {
    vi.mocked(petsService.getById).mockReset().mockResolvedValue({ id: "p1", name: "Cookie", householdId: "h1" } as never);
    vi.mocked(householdsService.collaboration).mockReset().mockResolvedValue({ id: "h1", name: "Home", members: [{ userId: "u1", role: "OWNER", user: { displayName: "Sara" } }, { userId: "u2", role: "FAMILY", user: { displayName: "Reza" } }] } as never);
    vi.mocked(petsService.listAccessGrants).mockReset().mockResolvedValue([{ id: "g1", user: { displayName: "Reza", avatarUrl: null }, active: true, source: "TEMPORARY", canViewIdentity: true, canViewCareProfile: true, expiresAt: "2026-11-09T12:00:00.000Z" }] as never);
  });

  it.each([
    ["de", "TIERBERECHTIGUNGEN", "Erteilte Zugriffe", "Profil ansehen"],
    ["es", "PERMISOS DE LA MASCOTA", "Accesos concedidos", "Ver perfil"],
  ] as const)("renders the complete access page in %s without Persian UI text", async (locale, eyebrow, section, flag) => {
    const { container } = renderWithIntl(<PetAccessView petId="p1"/>, locale);
    expect(await screen.findByRole("heading", { name: /Cookie/ })).toBeTruthy();
    expect(screen.getByText(eyebrow)).toBeTruthy();
    expect(screen.getByRole("heading", { name: section })).toBeTruthy();
    expect(screen.getAllByText(flag).length).toBeGreaterThan(0);
    expect(screen.getByText(/Haushaltsmitgliedschaft|Pertenecer al hogar/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/[\u0600-\u06FF]/);
    fireEvent.click(screen.getByRole("button", { name: locale === "de" ? "Zugriff erteilen" : "Conceder acceso" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(container.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([
    ["de", "Keine zusätzlichen Zugriffe erteilt"],
    ["es", "No se han concedido accesos adicionales"],
  ] as const)("localizes the genuinely empty state in %s", async (locale, title) => {
    vi.mocked(petsService.listAccessGrants).mockResolvedValue([]);
    renderWithIntl(<PetAccessView petId="p1"/>, locale);
    expect((await screen.findAllByRole("heading", { name: title })).length).toBeGreaterThan(0);
  });

  it.each([
    ["de", "Keine Verwaltungsberechtigung"],
    ["es", "No tienes acceso de administración"],
  ] as const)("localizes the denied state in %s", async (locale, title) => {
    vi.mocked(petsService.getById).mockRejectedValue(new ApiError({ code: "FORBIDDEN", message: "forbidden", requestId: "r1" } as never, 403));
    renderWithIntl(<PetAccessView petId="p1"/>, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
  });

  it.each([
    ["de", "Berechtigungen konnten nicht geladen werden"],
    ["es", "No se pudieron cargar los permisos"],
  ] as const)("localizes a recoverable load failure in %s", async (locale, title) => {
    vi.mocked(petsService.getById).mockRejectedValue(new Error("network"));
    renderWithIntl(<PetAccessView petId="p1"/>, locale);
    expect((await screen.findAllByRole("heading", { name: title })).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: locale === "de" ? "Erneut versuchen" : "Intentar de nuevo" })).toBeTruthy();
  });

  it.each([
    ["de", "Wird geladen"],
    ["es", "Cargando"],
  ] as const)("localizes the loading state in %s", (locale, label) => {
    vi.mocked(petsService.getById).mockReturnValue(new Promise(() => undefined));
    renderWithIntl(<PetAccessView petId="p1"/>, locale);
    expect(screen.getByLabelText(label)).toBeTruthy();
  });
});
