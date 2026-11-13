import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { MembershipOffersDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { membershipOffersService } from "@/services/membership-offers.service";
import { ApiError } from "@/lib/api/client";
import { MembershipOffersCard } from "./MembershipOffersCard";

const state = vi.hoisted(() => ({ householdId: "household-1" as string | null }));
vi.mock("@/stores/pet-store", () => ({ usePetStore: (selector: (s: { householdId: string | null }) => unknown) => selector({ householdId: state.householdId }) }));
vi.mock("@/services/membership-offers.service", () => ({ membershipOffersService: { forHousehold: vi.fn(), forAccount: vi.fn(), startFreeWeek: vi.fn(), checkGift: vi.fn() } }));

const PLAN = { id: "plan-full", code: "premium", nameFa: "کامل", nameEn: "Full" };
const offers = (over: Partial<MembershipOffersDto["freeWeek"]> = {}, gift: MembershipOffersDto["firstPurchaseGift"] = null): MembershipOffersDto => ({
  freeWeek: { status: "AVAILABLE", days: 7, canStart: true, trialUsed: false, trialEndsAt: null, plan: PLAN, ...over },
  firstPurchaseGift: gift,
});

describe("MembershipOffersCard", () => {
  beforeEach(() => {
    state.householdId = "household-1";
    vi.mocked(membershipOffersService.forHousehold).mockReset();
    vi.mocked(membershipOffersService.forAccount).mockReset();
    vi.mocked(membershipOffersService.startFreeWeek).mockReset();
  });

  it("renders nothing when there is nothing this member can use", async () => {
    vi.mocked(membershipOffersService.forHousehold).mockResolvedValue(offers({ status: "USED", canStart: false, trialUsed: true }));
    const { container } = renderWithIntl(<MembershipOffersCard />);
    await waitFor(() => expect(membershipOffersService.forHousehold).toHaveBeenCalledWith("household-1"));
    expect(container.querySelector(".membership-offers")).toBeNull();
  });

  it("renders nothing on a load failure or without a household", async () => {
    vi.mocked(membershipOffersService.forHousehold).mockRejectedValue(new Error("offline"));
    const { container } = renderWithIntl(<MembershipOffersCard />);
    await waitFor(() => expect(membershipOffersService.forHousehold).toHaveBeenCalled());
    expect(container.querySelector(".membership-offers")).toBeNull();
    state.householdId = null;
    vi.mocked(membershipOffersService.forHousehold).mockClear();
    renderWithIntl(<MembershipOffersCard />);
    expect(membershipOffersService.forHousehold).not.toHaveBeenCalled();
  });

  it("starts the free week in one click and then shows when it ends and that nothing is charged", async () => {
    vi.mocked(membershipOffersService.forHousehold).mockResolvedValue(offers({ days: 7 }));
    vi.mocked(membershipOffersService.startFreeWeek).mockResolvedValue({ started: true, subscription: { trialEndsAt: "2026-11-20T12:00:00.000Z" } as never });
    const onStarted = vi.fn();
    renderWithIntl(<MembershipOffersCard onTrialStarted={onStarted} />);
    expect(await screen.findByText("Try Full free for 7 days")).toBeTruthy();
    expect(screen.getByText("No card or payment needed to start.")).toBeTruthy();
    expect(screen.getByText("Nothing is charged when it ends: you simply go back to the free plan.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start my free week" }));
    expect(await screen.findByText("Your free trial is on")).toBeTruthy();
    expect(screen.getByText("It ends on 20 November 2026.")).toBeTruthy();
    expect(membershipOffersService.startFreeWeek).toHaveBeenCalledWith("household-1");
    expect(onStarted).toHaveBeenCalled();
  });

  it("explains a refused start instead of failing silently", async () => {
    vi.mocked(membershipOffersService.forHousehold).mockResolvedValue(offers());
    vi.mocked(membershipOffersService.startFreeWeek).mockRejectedValue(new ApiError({ code: "SUBSCRIPTION_TRIAL_NOT_ELIGIBLE", message: "x", requestId: "r" }, 409));
    renderWithIntl(<MembershipOffersCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Start my free week" }));
    expect((await screen.findByRole("alert")).textContent).toBe("This account or household has already used its free trial.");
  });

  it("tells a family member that the owner starts it", async () => {
    vi.mocked(membershipOffersService.forHousehold).mockResolvedValue(offers({ canStart: false }));
    renderWithIntl(<MembershipOffersCard />);
    expect(await screen.findByText("Only a household owner can start it.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start my free week" })).toBeNull();
  });

  it("shows the gift code with its percent, copies it and applies it at checkout", async () => {
    vi.mocked(membershipOffersService.forHousehold).mockResolvedValue(offers({ status: "USED", canStart: false, trialUsed: true }, { code: "SPRING-25", percentOff: 25, expiresOn: "2026-12-31" }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const onApply = vi.fn();
    renderWithIntl(<MembershipOffersCard onApplyGift={onApply} />);
    expect(await screen.findByText("25% off your first paid membership")).toBeTruthy();
    expect(screen.getByText("SPRING-25")).toBeTruthy();
    expect(screen.getByText("Valid until 31 December 2026.")).toBeTruthy();
    expect(screen.getByText(/can't be exchanged for cash or wallet credit/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("SPRING-25"));
    fireEvent.click(screen.getByRole("button", { name: "Apply at checkout" }));
    expect(onApply).toHaveBeenCalledWith("SPRING-25", 25);
  });

  it("links the gift to the checkout from other pages", async () => {
    vi.mocked(membershipOffersService.forHousehold).mockResolvedValue(offers({ status: "UNAVAILABLE", canStart: false }, { code: "SPRING-25", percentOff: 25, expiresOn: null }));
    renderWithIntl(<MembershipOffersCard />);
    const link = await screen.findByRole("link", { name: "Apply at checkout" });
    expect(link.getAttribute("href")).toBe("/en/subscription/plans?gift=SPRING-25");
  });

  it("on the first screen after sign-up, uses the account's offers and says the week starts with the first pet", async () => {
    vi.mocked(membershipOffersService.forAccount).mockResolvedValue(offers({ canStart: false }, { code: "HELLO", percentOff: 10, expiresOn: null }));
    renderWithIntl(<MembershipOffersCard scope="account" />, "fa");
    expect(await screen.findByText("با افزودن اولین حیوان، خودکار شروع می‌شود.")).toBeTruthy();
    expect(screen.getByText("HELLO")).toBeTruthy();
    expect(membershipOffersService.forHousehold).not.toHaveBeenCalled();
  });
});
