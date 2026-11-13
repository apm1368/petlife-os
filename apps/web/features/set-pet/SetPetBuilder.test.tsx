import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { SET_PET_COLOURS, SET_PET_FONTS, SET_PET_GARMENTS, SET_PET_LIMITS, SET_PET_SIZES, type SetPetOptionsDto, type SetPetRequestDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { setPetService } from "@/services/set-pet.service";
import { householdsService } from "@/services/households.service";
import { SetPetBuilder } from "./SetPetBuilder";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("./SetPetPreview", () => ({ SetPetPreview: () => <div data-testid="preview" /> }));
vi.mock("@/services/households.service", () => ({ householdsService: { listMine: vi.fn(), listPets: vi.fn() } }));
vi.mock("@/services/set-pet.service", () => ({
  setPetService: { options: vi.fn(), designs: vi.fn(), draft: vi.fn(), saveDraft: vi.fn(), deleteDraft: vi.fn(), uploadTarget: vi.fn(), completeDesign: vi.fn(), previewDesign: vi.fn(), create: vi.fn(), update: vi.fn() },
}));

const svc = vi.mocked(setPetService);
const OPTIONS: SetPetOptionsDto = {
  sizes: SET_PET_SIZES,
  garments: SET_PET_GARMENTS,
  colours: { ...SET_PET_COLOURS },
  fonts: SET_PET_FONTS,
  zones: [],
  acceptedExtensions: ["jpg", "png", "pdf"],
  limits: SET_PET_LIMITS,
  prices: {
    garmentPricesIrr: { HUMAN_TEE: 4_000_000, HUMAN_HOODIE: 9_000_000, HUMAN_SWEATSHIRT: 7_000_000, PET_TEE: 2_500_000, PET_HOODIE: 4_000_000, PET_BANDANA: 1_500_000 },
    zonePricesIrr: { RIGHT_UPPER_ARM: 500_000, LEFT_UPPER_ARM: 500_000, FRONT_CENTER: 1_200_000, BACK: 1_200_000, PET_BACK: 800_000 },
    setDiscountPercent: 10,
  },
  pricesReady: true,
  productionWorkingDays: 5,
};

beforeEach(() => {
  svc.options.mockResolvedValue(OPTIONS);
  svc.designs.mockResolvedValue([]);
  svc.draft.mockResolvedValue({ draft: null });
  svc.saveDraft.mockResolvedValue({ data: {}, updatedAt: "2026-11-13T10:00:00Z" });
  svc.deleteDraft.mockResolvedValue({ removed: true });
  vi.mocked(householdsService.listMine).mockResolvedValue([]);
});
afterEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));

async function fillGarmentsAndPrint() {
  await screen.findByRole("heading", { name: "Who wears what" });
  // A pet garment needs its pet: from the profile, or a name typed by hand.
  next();
  expect(screen.getByRole("alert").textContent).toContain("Type your pet's name");
  const pet = screen.getByRole("group", { name: "Pet garment 1" });
  fireEvent.change(within(pet).getByLabelText("Pet's name"), { target: { value: "Shiraz" } });
  fireEvent.click(within(pet).getByRole("radio", { name: "Bandana" }));
  const person = screen.getByRole("group", { name: "Garment 1" });
  fireEvent.click(within(person).getByRole("radio", { name: "Hoodie" }));
  fireEvent.click(within(person).getByRole("radio", { name: "2XL" }));
  // The price range shows while building (P35).
  expect(screen.getByText(/^Price range:/)).toBeTruthy();
  next();
  await screen.findByRole("heading", { name: "Prints" });
  next();
  expect(screen.getByRole("alert").textContent).toContain("Add at least one print.");
  fireEvent.click(screen.getByRole("button", { name: /^Front/ }));
  fireEvent.click(screen.getByRole("tab", { name: "Text" }));
  fireEvent.change(screen.getByLabelText("Text (up to 40 characters)"), { target: { value: "Shiraz & me" } });
  fireEvent.click(screen.getByRole("radio", { name: "Bold" }));
  next();
  await screen.findByRole("heading", { name: "Review and send" });
}

describe("Set Pet builder (owner's #368 answers)", () => {
  it("lets a visitor build a set and asks to sign in only to send, keeping the set on the device", async () => {
    renderWithIntl(<SetPetBuilder signedIn={false} onSubmitted={vi.fn()} />);
    await fillGarmentsAndPrint();
    // Exact price at review (P35/P36/P37): hoodie 9.0 + front 1.2 + bandana 1.5 = 11.7 M rial, 10% off → 1,053,000 toman.
    expect(screen.getByText("1,053,000 Toman")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign in and send" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/welcome?returnTo=%2Fen%2Fset-pet%3Fresume%3D1%23setpet-builder"));
    expect(JSON.parse(window.sessionStorage.getItem("opl.setpet.draft.v2")!).snapshot.items).toHaveLength(2);
    expect(svc.create).not.toHaveBeenCalled();
  });

  it("sends the order for a signed-in member and auto-saves the draft to the account (P5)", async () => {
    const onSubmitted = vi.fn();
    svc.create.mockResolvedValue({ id: "o1", reference: "SP-000001" } as SetPetRequestDto);
    renderWithIntl(<SetPetBuilder signedIn onSubmitted={onSubmitted} />);
    await fillGarmentsAndPrint();
    await waitFor(() => expect(svc.saveDraft).toHaveBeenCalled(), { timeout: 3000 });
    fireEvent.change(screen.getByLabelText("Notes for our team (optional)"), { target: { value: "Birthday" } });
    fireEvent.click(screen.getByRole("button", { name: "Send order" }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith({ id: "o1", reference: "SP-000001" }, false));
    expect(svc.create).toHaveBeenCalledWith({
      items: [{ garment: "HUMAN_HOODIE", size: "XXL", colour: "white" }, { garment: "PET_BANDANA", size: "M", colour: "white", petName: "Shiraz", petSpecies: "DOG" }],
      placements: [{ zone: "FRONT_CENTER", text: "Shiraz & me", font: "LALEZAR", textColour: "black" }],
      forPetId: null,
      notes: "Birthday",
      reorderOfId: null,
    });
    expect(svc.deleteDraft).toHaveBeenCalled();
  });

  it("explains P8 when the pet garment is removed, and waits for prices before sending", async () => {
    svc.options.mockResolvedValue({ ...OPTIONS, pricesReady: false });
    renderWithIntl(<SetPetBuilder signedIn={false} onSubmitted={vi.fn()} />);
    await screen.findByRole("heading", { name: "Who wears what" });
    fireEvent.click(within(screen.getByRole("group", { name: "Pet garment 1" })).getByRole("button", { name: "Remove" }));
    expect(screen.getByText(/in memory of a pet that is lost or has passed away/)).toBeTruthy();
    next();
    expect(screen.getByRole("alert").textContent).toContain("Add a garment for your pet");
    expect(screen.getAllByText("Prices will be published soon; you can build your set now.").length).toBeGreaterThan(0);
  });
});
