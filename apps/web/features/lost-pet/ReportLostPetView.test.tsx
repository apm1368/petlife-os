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

  it("submits the description and navigates to the new incident's detail page", async () => {
    vi.mocked(lostPetService.open).mockResolvedValue({ id: "incident-9" } as never);

    renderWithIntl(<ReportLostPetView petId="pet-1" />);

    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Slipped out the front gate" } });
    fireEvent.click(screen.getByText("Report lost pet"));

    await waitFor(() => expect(lostPetService.open).toHaveBeenCalledWith("pet-1", expect.objectContaining({ description: "Slipped out the front gate" })));
    expect(push).toHaveBeenCalledWith("/pets/pet-1/lost/incident-9");
  });

  it("disables submit until a description is entered", () => {
    renderWithIntl(<ReportLostPetView petId="pet-1" />);

    const button = screen.getByText("Report lost pet").closest("button");
    expect(button?.disabled).toBe(true);
  });
});
