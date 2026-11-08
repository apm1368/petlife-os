import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { healthService } from "@/services/health.service";
import { BasicHealthRecordDetailView } from "./BasicHealthRecordDetailView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./BasicHealthRecordEditor", () => ({ BasicHealthRecordEditor: () => null }));
vi.mock("@/services/health.service", () => ({ healthService: { getCondition: vi.fn() } }));

describe("basic health record detail localization", () => {
  it.each([
    ["de", "Gesundheitszustand", "Quelle", "Erfasst am", "Zurück zur Liste"],
    ["es", "Afección de salud", "Origen", "Fecha de registro", "Volver a la lista"],
  ] as const)("renders record chrome and provenance in %s without translating clinical content", async (locale, title, source, recorded, back) => {
    vi.mocked(healthService.getCondition).mockResolvedValue({
      id: "condition-1", petId: "pet-1", name: "Dermatitis", notes: "Observed after rain", status: "ACTIVE", sourceType: "OWNER", sourceLabel: null,
      firstRecordedAt: "2026-04-12T10:00:00.000Z", createdAt: "2026-04-12T10:00:00.000Z", updatedAt: "2026-04-12T10:00:00.000Z",
    } as never);
    renderWithIntl(<BasicHealthRecordDetailView petId="pet-1" recordId="condition-1" kind="condition" />, locale);
    expect(await screen.findByRole("heading", { name: "Dermatitis" })).toBeTruthy();
    expect(screen.getByRole("link", { name: back })).toBeTruthy();
    expect(screen.getByText(source)).toBeTruthy();
    expect(screen.getByText(recorded)).toBeTruthy();
    expect(screen.getByText("Observed after rain")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
    expect(document.body.textContent).not.toContain("Recorded");
    expect(document.body.textContent).not.toContain("Back to list");
  });
});
