import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { lostPetService } from "@/services/lost-pet.service";
import { ReportLostPetView } from "./ReportLostPetView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/lost-pet.service", () => ({ lostPetService: { open: vi.fn(), requestPhotoUpload: vi.fn() } }));

describe("ReportLostPetView", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(lostPetService.open).mockReset();
  });

  it("walks through the steps, keeps the exact place private and publishes the public area", async () => {
    vi.mocked(lostPetService.open).mockResolvedValue({ id: "incident-9" } as never);
    renderWithIntl(<ReportLostPetView petId="pet-1" />);

    fireEvent.change(screen.getByLabelText(/Approximate area/), { target: { value: "Yousefabad" } });
    fireEvent.change(screen.getByLabelText(/Exact last-seen place/), { target: { value: "No. 14, Alley 7" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const next = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: "Slipped out the front gate" } });
    fireEvent.click(next);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("What the public report will show")).toBeTruthy();
    expect(screen.queryByText(/Alley 7/)).toBeNull();
    fireEvent.click(screen.getByText("Report lost pet"));

    await waitFor(() => expect(lostPetService.open).toHaveBeenCalledWith("pet-1", expect.objectContaining({ description: "Slipped out the front gate", publicArea: "Yousefabad", lastKnownLocation: "No. 14, Alley 7", contactPreference: "IN_APP_MESSAGE" })));
    expect(push).toHaveBeenCalledWith("/en/pets/pet-1/lost/incident-9");
  });

  it("asks for an explicit contact line before a public contact can be chosen", () => {
    renderWithIntl(<ReportLostPetView petId="pet-1" />, "fa");
    fireEvent.click(screen.getByRole("button", { name: "ادامه" }));
    fireEvent.click(screen.getByRole("button", { name: "ادامه" }));
    fireEvent.change(screen.getByLabelText(/توضیحات/), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "ادامه" }));
    fireEvent.click(screen.getByLabelText(/نمایش عمومی اطلاعات تماس/));
    expect((screen.getByRole("button", { name: "ادامه" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([["de", "Weiter", "Beschreibung", "Was in der öffentlichen Meldung zu sehen ist"], ["es", "Continuar", "Descripción", "Qué se mostrará en el informe público"]] as const)("keeps the complete report wizard in %s", async (locale, nextLabel, descriptionLabel, reviewTitle) => {
    renderWithIntl(<ReportLostPetView petId="pet-1" />, locale);
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
    fireEvent.click(screen.getByRole("button", { name: nextLabel }));
    fireEvent.click(screen.getByRole("button", { name: nextLabel }));
    fireEvent.change(screen.getByLabelText(new RegExp(descriptionLabel)), { target: { value: "Pet ran away" } });
    fireEvent.click(screen.getByRole("button", { name: nextLabel }));
    expect(screen.getByText(locale === "de" ? "Wie können Menschen dich erreichen?" : "¿Cómo pueden ponerse en contacto contigo?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: nextLabel }));
    expect(screen.getByRole("heading", { name: reviewTitle })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });
});
