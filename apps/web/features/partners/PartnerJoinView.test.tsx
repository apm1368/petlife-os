import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { useSessionStore } from "@/stores/session-store";
import { partnerOnboardingService, type PartnerOnboardingStateDto } from "@/services/partner-onboarding.service";
import { PartnerJoinView } from "./PartnerJoinView";

vi.mock("@/services/partner-onboarding.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/partner-onboarding.service")>();
  return {
    ...actual,
    partnerOnboardingService: {
      state: vi.fn(), start: vi.fn(), logoUpload: vi.fn(), business: vi.fn(), owner: vi.fn(), documentUpload: vi.fn(), registerDocument: vi.fn(),
      address: vi.fn(), calendar: vi.fn(), services: vi.fn(), openingHours: vi.fn(), products: vi.fn(), submit: vi.fn(), cancel: vi.fn(),
    },
  };
});

const base: PartnerOnboardingStateDto = {
  signupIntent: "PARTNER", mobileVerified: true, started: false, serviceKinds: [], shop: false, linked: false, business: null, owner: null, address: null,
  calendar: [], services: [], openingHours: [], products: [], verification: [], missing: [], providerOrganizationId: null, sellerOrganizationId: null, submitted: false, verified: false,
};

describe("PartnerJoinView", () => {
  beforeEach(() => {
    vi.mocked(partnerOnboardingService.state).mockReset();
    vi.mocked(partnerOnboardingService.start).mockReset();
    vi.mocked(partnerOnboardingService.cancel).mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("introduces partner signup to signed-out visitors and keeps them in the partner flow after signing up", () => {
    useSessionStore.setState({ status: "unauthenticated", user: null });
    renderWithIntl(<PartnerJoinView />, "fa");
    expect(screen.getByRole("heading", { name: "ثبت‌نام همکار" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "ساخت حساب همکار" }).getAttribute("href")).toBe(`/fa/register?returnTo=${encodeURIComponent("/fa/partners/join")}`);
    expect(partnerOnboardingService.state).not.toHaveBeenCalled();
  });

  it("starts with the business type: services and a shop together, refused when nothing is picked", async () => {
    useSessionStore.setState({ status: "authenticated", user: { id: "u1" } as never });
    vi.mocked(partnerOnboardingService.state).mockResolvedValue(base);
    vi.mocked(partnerOnboardingService.start).mockResolvedValue({ ...base, started: true, serviceKinds: ["VET_CLINIC"], shop: true, linked: true, business: { name: "Aria", description: null, logoUrl: null } });
    renderWithIntl(<PartnerJoinView />, "en");
    fireEvent.click(await screen.findByRole("button", { name: "Save and continue" }));
    expect(await screen.findByText("Pick at least one service or a shop.")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Vet clinic"));
    fireEvent.click(screen.getByLabelText("Pet shop (online or in-store)"));
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Aria" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() => expect(partnerOnboardingService.start).toHaveBeenCalledWith({ serviceKinds: ["VET_CLINIC"], shop: true, businessName: "Aria" }));
    // Both businesses get their steps.
    expect(await screen.findByRole("button", { name: /Working calendar/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Products/ })).toBeTruthy();
  });

  it("stores one uploaded document privately for each business of the signup", async () => {
    useSessionStore.setState({ status: "authenticated", user: { id: "u1" } as never });
    const started = { ...base, started: true, serviceKinds: ["GROOMER" as const], shop: true, business: { name: "Aria", description: null, logoUrl: null } };
    vi.mocked(partnerOnboardingService.state).mockResolvedValue(started);
    vi.mocked(partnerOnboardingService.documentUpload).mockImplementation(async (subject) => ({ uploadUrl: `https://upload.test/${subject}`, method: "PUT", publicUrl: "", key: `partner-verification/${subject.toLowerCase()}/x/k.png` }));
    vi.mocked(partnerOnboardingService.registerDocument).mockResolvedValue(started);
    const put = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", put);
    renderWithIntl(<PartnerJoinView />, "en");
    fireEvent.click(await screen.findByRole("button", { name: /Documents/ }));
    const file = new File(["id"], "id.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/^File/), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() => expect(partnerOnboardingService.registerDocument).toHaveBeenCalledTimes(2));
    expect(vi.mocked(partnerOnboardingService.registerDocument).mock.calls.map((c) => c[0].subject)).toEqual(["PROVIDER", "SELLER"]);
    expect(put).toHaveBeenCalledWith("https://upload.test/PROVIDER", expect.objectContaining({ method: "PUT", credentials: "omit" }));
  });

  it("shows a submitted signup as under review, with the way to the business home", async () => {
    useSessionStore.setState({ status: "authenticated", user: { id: "u1" } as never });
    vi.mocked(partnerOnboardingService.state).mockResolvedValue({ ...base, started: true, submitted: true, verification: [{ subject: "PROVIDER", status: "SUBMITTED", lifecycle: "PENDING", canSubmit: false, documents: [], missingProfileFields: [], missingForSubmission: [] }] });
    renderWithIntl(<PartnerJoinView />, "en");
    expect(await screen.findByText("Your application is under review")).toBeTruthy();
    expect(screen.getByText(/Services: Waiting for review/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to my business" }).getAttribute("href")).toBe("/en/business");
  });

  it("requires confirmation before cancelling an unsubmitted signup and returns to the start step", async () => {
    useSessionStore.setState({ status: "authenticated", user: { id: "u1" } as never });
    vi.mocked(partnerOnboardingService.state).mockResolvedValue({ ...base, started: true, serviceKinds: ["GROOMER"] });
    vi.mocked(partnerOnboardingService.cancel).mockResolvedValue(base);
    const confirm = vi.fn().mockReturnValue(true);
    vi.spyOn(window, "confirm").mockImplementation(confirm);
    renderWithIntl(<PartnerJoinView />, "en");
    fireEvent.click(await screen.findByRole("button", { name: "Cancel signup" }));
    await waitFor(() => expect(partnerOnboardingService.cancel).toHaveBeenCalledOnce());
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Cancel partner signup?"));
    expect(await screen.findByText("Pick every service you offer. If you also run a pet shop, tick it too.")).toBeTruthy();
  });

  it("does not call cancellation when the member declines confirmation", async () => {
    useSessionStore.setState({ status: "authenticated", user: { id: "u1" } as never });
    vi.mocked(partnerOnboardingService.state).mockResolvedValue({ ...base, started: true, serviceKinds: ["GROOMER"] });
    const confirm = vi.fn().mockReturnValue(false);
    vi.spyOn(window, "confirm").mockImplementation(confirm);
    renderWithIntl(<PartnerJoinView />, "en");
    fireEvent.click(await screen.findByRole("button", { name: "Cancel signup" }));
    expect(partnerOnboardingService.cancel).not.toHaveBeenCalled();
  });
});
