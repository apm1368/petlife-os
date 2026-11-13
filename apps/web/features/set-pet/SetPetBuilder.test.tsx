import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { SET_PET_MEASUREMENT_RANGES, SET_PET_SIZES, type SetPetOptionsDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { setPetService } from "@/services/set-pet.service";
import { SetPetBuilder } from "./SetPetBuilder";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/set-pet.service", () => ({
  setPetService: { options: vi.fn(), looseDesigns: vi.fn(), uploadTarget: vi.fn(), completeDesign: vi.fn(), previewDesign: vi.fn(), removeDesign: vi.fn(), create: vi.fn() },
}));

const svc = vi.mocked(setPetService);
const OPTIONS: SetPetOptionsDto = {
  sizes: SET_PET_SIZES,
  zones: [],
  measurementRanges: SET_PET_MEASUREMENT_RANGES,
  acceptedExtensions: ["jpg", "jpeg", "png", "webp", "heic", "pdf", "svg", "ai", "psd"],
  maxFileBytes: 20 * 1024 * 1024,
  maxDesigns: 3,
  maxHumanGarments: 10,
};
const fileDto = (id: string, previewable: boolean, status: "READY" | "REJECTED" = "READY") =>
  ({ id, status, mimeType: "image/png", fileSizeBytes: 10, originalFilename: null, previewable, requestId: null, rejectReason: null, createdAt: "2026-11-13T10:00:00Z" });
const createObjectURL = vi.fn((file: File) => `blob:${file.name}`);

beforeEach(() => {
  svc.options.mockResolvedValue(OPTIONS);
  svc.looseDesigns.mockResolvedValue([]);
  svc.removeDesign.mockResolvedValue({ id: "x", removed: true });
  Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 })));
  let n = 0;
  svc.uploadTarget.mockImplementation(async ({ filename }) => ({ file: { ...fileDto(`f${++n}`, false, "READY"), status: "PENDING_UPLOAD", originalFilename: filename }, uploadUrl: `/api/uploads/t${n}`, method: "PUT", headers: { "Content-Type": "image/png" }, expiresInSeconds: 600 }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
const upload = (files: File[]) => fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files } });

async function toDesigns() {
  await screen.findByRole("heading", { name: "Your T-shirts" });
  fireEvent.click(screen.getByRole("button", { name: "One more T-shirt" }));
  fireEvent.click(within(screen.getByRole("group", { name: "Size of T-shirt 2" })).getByRole("radio", { name: "XL" }));
  next();
  expect(screen.getByRole("heading", { name: "Your pet's shirt" })).toBeTruthy();
  next();
  expect(screen.getByRole("alert").textContent).toContain("Please check your pet's measurements.");
  fireEvent.change(screen.getByLabelText(/^1\. Neck/), { target: { value: "۳۰" } });
  fireEvent.change(screen.getByLabelText(/^2\. Chest/), { target: { value: "45" } });
  fireEvent.change(screen.getByLabelText(/^3\. Back length/), { target: { value: "33" } });
  fireEvent.change(screen.getByLabelText(/^Weight/), { target: { value: "12" } });
  expect(screen.getByText("Suggested from the chest: M")).toBeTruthy();
  next();
  fireEvent.click(screen.getAllByRole("radio", { name: "Navy" })[0]!);
  next();
  fireEvent.click(screen.getByRole("checkbox", { name: /Upper right sleeve/ }));
  next();
  expect(screen.getByRole("heading", { name: "Designs" })).toBeTruthy();
}

describe("Set Pet builder (owner, 2026-11-13)", () => {
  it("builds a set step by step, previews the design on its zones and moves it live, then sends exactly what was chosen", async () => {
    svc.completeDesign.mockResolvedValue(fileDto("f1", true));
    svc.create.mockResolvedValue({ id: "r1", reference: "SP-000001" } as never);
    const onSubmitted = vi.fn();
    renderWithIntl(<SetPetBuilder signedIn onSubmitted={onSubmitted} />, "en");
    await toDesigns();

    next();
    expect(screen.getByRole("alert").textContent).toContain("Choose a design for “Upper right sleeve”.");

    upload([new File(["png"], "logo.png", { type: "image/png" })]);
    // The PNG is uploaded (target → PUT → complete) and drawn on both chosen zones, on the side-by-side mockups.
    expect(await screen.findByAltText("logo.png on Front centre")).toBeTruthy();
    expect(screen.getByAltText("logo.png on Upper right sleeve").getAttribute("src")).toBe("blob:logo.png");
    expect(fetch).toHaveBeenCalledWith("/api/uploads/t1", expect.objectContaining({ method: "PUT", credentials: "omit" }));
    expect(svc.completeDesign).toHaveBeenCalledWith("f1");

    // Edit: untick the front centre, tick BACK → the shirt turns and the design moves to the back.
    fireEvent.click(screen.getByRole("button", { name: /Print areas/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Front centre/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^Back(?! of)/ }));
    expect(await screen.findByAltText("logo.png on Back")).toBeTruthy();
    expect(screen.queryByAltText("logo.png on Front centre")).toBeNull();
    expect(screen.getByRole("button", { name: "Show front" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /Designs/ }));
    next();
    expect(screen.getByRole("heading", { name: "Review and send" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
    expect(svc.create).toHaveBeenCalledWith({
      humanColour: "navy",
      humanSizes: ["M", "XL"],
      petSize: "M",
      petColour: "navy",
      petMeasurements: { neckCm: 30, chestCm: 45, backLengthCm: 33, weightKg: 12 },
      placements: [{ zone: "RIGHT_UPPER_ARM", designFileId: "f1" }, { zone: "BACK", designFileId: "f1" }],
    });
  });

  it("never previews an SVG or print file: no blob URL, a 'file received' tile instead", async () => {
    svc.completeDesign.mockResolvedValue(fileDto("f1", false));
    renderWithIntl(<SetPetBuilder signedIn onSubmitted={vi.fn()} />, "en");
    await toDesigns();
    upload([new File(["<svg onload=alert(1)>"], "art.svg", { type: "image/svg+xml" })]);
    expect(await screen.findByText("File received; our team will check it (no preview)")).toBeTruthy();
    expect(createObjectURL).not.toHaveBeenCalled();
    const zone = screen.getByRole("button", { name: "Front centre (20 × 20 cm)" });
    expect(zone.querySelector("img")).toBeNull();
    expect(within(zone).getByText("File received")).toBeTruthy();
    expect(document.querySelector("svg image, img[src*='svg']")).toBeNull();
  });

  it("explains a rejected upload in plain words", async () => {
    svc.completeDesign.mockRejectedValue(new ApiError({ code: "SET_PET_FILE_REJECTED", message: "x", requestId: "r", details: { reason: "CONTENT_DOES_NOT_MATCH_TYPE" } }, 422));
    renderWithIntl(<SetPetBuilder signedIn onSubmitted={vi.fn()} />, "en");
    await toDesigns();
    upload([new File(["x"], "fake.png", { type: "image/png" })]);
    expect(await screen.findByText("The file's content doesn't match its type.")).toBeTruthy();
    expect(screen.queryByAltText(/fake\.png on/)).toBeNull();
  });

  it("says Set Pet opens soon while the API is not live, and asks for a retry on errors", async () => {
    svc.options.mockRejectedValueOnce(new ApiError({ code: "NOT_FOUND", message: "x", requestId: "r" }, 404));
    const { unmount } = renderWithIntl(<SetPetBuilder signedIn onSubmitted={vi.fn()} />, "en");
    expect(await screen.findByText("Set Pet orders open very soon. Please check back shortly.")).toBeTruthy();
    unmount();
    svc.options.mockRejectedValueOnce(new Error("offline"));
    renderWithIntl(<SetPetBuilder signedIn onSubmitted={vi.fn()} />, "fa");
    expect(await screen.findByText("الان نتوانستیم ست پت را باز کنیم.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "دوباره تلاش کن" }));
    expect(await screen.findByRole("heading", { name: "تی‌شرت‌ها" })).toBeTruthy();
  });

  it("lets a visitor build without an account and asks to sign in only to send, keeping the set on the device", async () => {
    renderWithIntl(<SetPetBuilder signedIn={false} onSubmitted={vi.fn()} />, "en");
    await toDesigns();
    expect(svc.options).not.toHaveBeenCalled();
    upload([new File(["png"], "logo.png", { type: "image/png" })]);
    // Kept on the device (not uploaded yet) and already drawn on the chosen zones.
    expect(await screen.findByText("Ready; it's sent with your request")).toBeTruthy();
    expect(screen.getByAltText("logo.png on Front centre")).toBeTruthy();
    expect(svc.uploadTarget).not.toHaveBeenCalled();
    next();
    expect(screen.getByText("To send, you'll sign in or create an account. Your set is kept on this device meanwhile.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign in and send" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/welcome?returnTo=%2Fen%2Fset-pet%3Fresume%3D1%23setpet-builder"));
    const draft = JSON.parse(window.sessionStorage.getItem("opl.setpet.draft.v1")!);
    expect(draft).toMatchObject({ step: "review", humanSizes: ["M", "XL"], colour: "navy", zones: ["FRONT_CENTER", "RIGHT_UPPER_ARM"], raw: { neckCm: "۳۰", chestCm: "45" } });
    expect(draft.files).toEqual([{ id: "local-1", name: "logo.png" }]);
    expect(svc.create).not.toHaveBeenCalled();
  });

  it("comes back after sign-in at the saved step with the saved choices", async () => {
    window.sessionStorage.setItem("opl.setpet.draft.v1", JSON.stringify({
      step: "review", humanSizes: ["L"], petSize: "S", petSizeChosen: true, raw: { neckCm: "25", chestCm: "35", backLengthCm: "28", weightKg: "4" },
      petId: "", colour: "cream", petColour: "sage", zones: ["BACK"], placements: {}, notes: "Name: Cookie", files: [],
    }));
    renderWithIntl(<SetPetBuilder signedIn onSubmitted={vi.fn()} />, "en");
    expect(await screen.findByRole("heading", { name: "Review and send" })).toBeTruthy();
    expect(screen.getByText("1 · sizes L")).toBeTruthy();
    expect(screen.getByText("Cream · Pet shirt colour: Sage green")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: /^Notes for our team/ }) as HTMLTextAreaElement).value).toBe("Name: Cookie");
    // The design was not kept (no IndexedDB here): sending asks for it again instead of failing on the server.
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByText("Choose a design for “Back”.")).toBeTruthy();
    expect(svc.create).not.toHaveBeenCalled();
  });

  it("can colour the pet's shirt differently and suggests a T-shirt size from height and weight", async () => {
    svc.completeDesign.mockResolvedValue(fileDto("f1", true));
    svc.create.mockResolvedValue({ id: "r1", reference: "SP-000002" } as never);
    renderWithIntl(<SetPetBuilder signedIn onSubmitted={vi.fn()} />, "en");
    await screen.findByRole("heading", { name: "Your T-shirts" });
    fireEvent.click(screen.getByText("Not sure? Suggest a size"));
    fireEvent.change(screen.getByLabelText(/^Height/), { target: { value: "190" } });
    fireEvent.change(screen.getByLabelText(/^Weight/), { target: { value: "88" } });
    expect(screen.getByText(/Suggested size: 2XL/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use 2XL" }));
    expect((screen.getByRole("radio", { name: "2XL" }) as HTMLInputElement).checked).toBe(true);
    next();
    fireEvent.change(screen.getByLabelText(/^1\. Neck/), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText(/^2\. Chest/), { target: { value: "45" } });
    fireEvent.change(screen.getByLabelText(/^3\. Back length/), { target: { value: "33" } });
    fireEvent.change(screen.getByLabelText(/^Weight/), { target: { value: "12" } });
    // A size other than the suggestion only warns.
    fireEvent.click(screen.getByRole("radio", { name: "L" }));
    expect(screen.getByText("The chest measurement suggests M. Your choice is fine if you want a looser or snugger fit.")).toBeTruthy();
    next();
    fireEvent.click(screen.getByRole("checkbox", { name: "A different colour for the pet's shirt" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Pet shirt colour" })).getByRole("radio", { name: "Black" }));
    next();
    next();
    upload([new File(["png"], "logo.png", { type: "image/png" })]);
    await screen.findByAltText("logo.png on Front centre");
    next();
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(svc.create).toHaveBeenCalled());
    expect(svc.create.mock.calls[0]![0]).toMatchObject({ humanSizes: ["XXL"], humanColour: "white", petColour: "black", petSize: "L" });
  });
});
