import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { useAdminStore } from "@/stores/admin-store";
import { adminAnimalSupportService as api } from "@/services/admin-animal-support.service";
import { ApiError } from "@/lib/api/client";
import {
  CampaignFundType,
  RescueCaseStatus,
  SupportCampaignStatus,
  type AdminPermissionName,
  type RescueCaseDto,
  type SupportCampaignDto,
} from "@petlife/types";
import {
  AdminSupportOrganizationEditor,
  AdminCampaignDetail,
  AdminOrganizationFunds,
  AdminRescueDetail,
  AdminSupportOperationsList,
  tomanToIrr,
} from "./AdminSupportOperations";

vi.mock("next/navigation", () => ({ usePathname: () => "/en/admin/animal-support/campaigns" }));
vi.mock("@/services/admin-animal-support.service", () => ({
  adminAnimalSupportService: {
    rescueEvidenceUpload: vi.fn(),
    registerRescueEvidence: vi.fn(),
    updateOrganization: vi.fn(),
    listCampaigns: vi.fn(),
    listRescueCases: vi.fn(),
    listOrganizations: vi.fn(),
    getCampaign: vi.fn(),
    getRescueCase: vi.fn(),
    listCampaignUpdates: vi.fn(),
    setRescueStatus: vi.fn(),
    setCampaignStatus: vi.fn(),
    postCampaignUpdate: vi.fn(),
    campaignEvidenceUpload: vi.fn(),
    shareCampaign: vi.fn(),
    createCampaign: vi.fn(),
    createRescueCase: vi.fn(),
    getFundBalance: vi.fn(),
    recordPayout: vi.fn(),
  },
}));
const svc = vi.mocked(api);
const permission = (...permissions: AdminPermissionName[]) =>
  useAdminStore.setState({
    context: { isAdmin: true, adminUserId: "a1", displayName: "Admin", role: null, permissions },
    status: "ready",
  });
const rescue: RescueCaseDto = {
  id: "r1",
  organizationId: "o1",
  organizationName: "Shelter",
  title: "Rescue Cookie",
  description: "Needs treatment",
  animalType: "DOG",
  status: RescueCaseStatus.OPEN,
  location: null,
  latitude: null,
  longitude: null,
  estimatedNeedIrr: null,
  evidenceObjectKeys: [],
  evidenceUrls: [],
  createdAt: "2026-10-16T00:00:00Z",
  closedAt: null,
};
const campaign: SupportCampaignDto = {
  id: "c1",
  organizationId: "o1",
  organizationName: "Shelter",
  rescueCaseId: "r1",
  title: "Winter food",
  description: "Food campaign",
  fundType: CampaignFundType.RESTRICTED,
  targetAmountIrr: 1000000,
  raisedAmountIrr: 500000,
  status: SupportCampaignStatus.DRAFT,
  createdAt: "2026-10-16T00:00:00Z",
  startsAt: null,
  endsAt: null,
};
const check = () => fireEvent.click(screen.getByLabelText("I have reviewed and confirm this action."));

beforeEach(() => {
  vi.resetAllMocks();
  permission("animalSupport.view", "animalSupport.manage");
  svc.listOrganizations.mockResolvedValue({
    items: [{ id: "o1", name: "Shelter" }],
    total: 1,
    page: 1,
    pageSize: 100,
  } as never);
  svc.getRescueCase.mockResolvedValue(rescue);
  svc.getCampaign.mockResolvedValue(campaign);
  svc.listCampaignUpdates.mockResolvedValue([]);
  svc.getFundBalance.mockResolvedValue({
    organizationId: "o1",
    generalAvailableIrr: 500000,
    restrictedAvailableIrr: 1000000,
  });
});

describe("support operations", () => {
  it("accepts Persian and Arabic digits while rejecting decimals, negative, overflow and empty amounts", () => {
    expect(tomanToIrr("۱۲۳۴")).toBe(12340);
    expect(tomanToIrr("١٢٣")).toBe(1230);
    for (const bad of ["", "-1", "1.5", "1e5", "0", "9007199254740992"])
      expect(tomanToIrr(bad)).toBeUndefined();
  });

  it("does not fetch protected records or show write controls without read permission", async () => {
    permission("animalSupport.manage");
    renderWithIntl(<AdminSupportOperationsList kind="campaigns" />);
    expect(screen.getByText("You do not have the required permission.")).toBeTruthy();
    expect(svc.listCampaigns).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
  });

  it("read-only rescue detail has real unknown values and no status controls", async () => {
    permission("animalSupport.view");
    renderWithIntl(<AdminRescueDetail id="r1" />);
    expect(await screen.findByRole("heading", { name: "Rescue Cookie" })).toBeTruthy();
    expect(screen.getAllByText("Not recorded").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("New status")).toBeNull();
  });

  it("requires explicit confirmation, saves server response, and preserves selected status after failure", async () => {
    svc.setRescueStatus
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ...rescue, status: RescueCaseStatus.IN_TREATMENT });
    renderWithIntl(<AdminRescueDetail id="r1" />);
    fireEvent.change(await screen.findByLabelText("New status"), { target: { value: "IN_TREATMENT" } });
    expect((screen.getByRole("button", { name: "Save status" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(
      within(screen.getByRole("button", { name: "Save status" }).closest("section")!).getByRole("checkbox"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save status" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((screen.getByLabelText("New status") as HTMLSelectElement).value).toBe("IN_TREATMENT");
    fireEvent.click(screen.getByRole("button", { name: "Save status" }));
    await waitFor(() => expect(svc.setRescueStatus).toHaveBeenCalledTimes(2));
    expect(svc.setRescueStatus).toHaveBeenLastCalledWith("r1", "IN_TREATMENT");
    expect(await screen.findByRole("status")).toBeTruthy();
  });

  it("pagination and status filters call the existing campaign API", async () => {
    permission("animalSupport.view");
    svc.listCampaigns.mockResolvedValue({ items: [campaign], page: 1, pageSize: 20, total: 21 });
    renderWithIntl(<AdminSupportOperationsList kind="campaigns" />);
    expect(await screen.findByRole("link", { name: "Winter food" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(svc.listCampaigns).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })),
    );
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "ACTIVE" } });
    await waitFor(() =>
      expect(svc.listCampaigns).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, status: "ACTIVE" }),
      ),
    );
  });

  it("distinguishes forbidden and load failures from empty lists", async () => {
    svc.listRescueCases.mockRejectedValueOnce(
      new ApiError({ code: "DENIED", message: "denied", requestId: "x" }, 403),
    );
    renderWithIntl(<AdminSupportOperationsList kind="rescue-cases" />);
    expect(await screen.findByText("You do not have the required permission.")).toBeTruthy();
    expect(screen.queryByText("No records found.")).toBeNull();
  });

  it("a failed campaign update preserves its draft and does not claim success", async () => {
    svc.postCampaignUpdate.mockRejectedValueOnce(new Error("failed"));
    renderWithIntl(<AdminCampaignDetail id="c1" />);
    fireEvent.change(await screen.findByLabelText("Title"), { target: { value: "Food delivered" } });
    fireEvent.change(screen.getByLabelText("Update text"), { target: { value: "Delivered to shelter" } });
    const confirms = screen.getAllByLabelText("I have reviewed and confirm this action.");
    fireEvent.click(confirms[2]!);
    fireEvent.click(screen.getByRole("button", { name: "Post progress update" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Food delivered");
    expect(screen.queryByText("The server confirmed the change.")).toBeNull();
  });

  it("a failed upload never registers an evidence update", async () => {
    svc.campaignEvidenceUpload.mockResolvedValue({
      key: "animal-support-evidence/c1/image",
      uploadUrl: "https://upload.example.test",
      headers: {},
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({ ok: false } as Response);
    renderWithIntl(<AdminCampaignDetail id="c1" />);
    fireEvent.change(await screen.findByLabelText("Title"), { target: { value: "Update" } });
    fireEvent.change(screen.getByLabelText("Update text"), { target: { value: "Evidence" } });
    fireEvent.change(screen.getByLabelText("Public evidence (optional)"), {
      target: { files: [new File(["bytes"], "proof.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getAllByLabelText("I have reviewed and confirm this action.")[2]!);
    fireEvent.click(screen.getByRole("button", { name: "Post progress update" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(svc.postCampaignUpdate).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("hides payout actions from managers without the separate finance permission", async () => {
    renderWithIntl(<AdminOrganizationFunds organizationId="o1" />);
    expect(await screen.findByText("50,000 Toman")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Record completed payout" })).toBeNull();
  });

  it("records only the selected fund in IRR and locks an uncertain payout", async () => {
    permission("animalSupport.view", "animalSupport.payout");
    svc.recordPayout.mockRejectedValueOnce(new Error("lost response"));
    renderWithIntl(<AdminOrganizationFunds organizationId="o1" />);
    fireEvent.change(await screen.findByLabelText("Fund type"), { target: { value: "RESTRICTED" } });
    fireEvent.change(screen.getByLabelText("Amount (Toman)"), { target: { value: "۱۲۳۴" } });
    fireEvent.change(screen.getByLabelText("Reason and payout reference"), {
      target: { value: "Bank receipt 567" },
    });
    check();
    fireEvent.click(screen.getByRole("button", { name: "Record completed payout" }));
    await waitFor(() =>
      expect(svc.recordPayout).toHaveBeenCalledWith("o1", {
        amountIrr: 12340,
        fundType: "RESTRICTED",
        reason: "Bank receipt 567",
      }),
    );
    expect(await screen.findByText(/Outcome is uncertain/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Record completed payout" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

it("organization editor sends only changed fields and uses null for an explicit clear", async () => {
  const org = {
    id: "o1",
    name: "Shelter",
    description: "Original",
    location: "Tehran",
    contactEmail: null,
    contactPhone: null,
  } as import("@petlife/types").AnimalSupportOrganizationDto;
  svc.updateOrganization.mockResolvedValue({ ...org, description: null });
  const saved = vi.fn();
  renderWithIntl(<AdminSupportOrganizationEditor organization={org} onSaved={saved} />);
  fireEvent.change(screen.getByLabelText("Organization description"), { target: { value: "" } });
  check();
  fireEvent.click(screen.getByRole("button", { name: "Save organization" }));
  await waitFor(() => expect(svc.updateOrganization).toHaveBeenCalledWith("o1", { description: null }));
  expect(saved).toHaveBeenCalledWith(expect.objectContaining({ description: null, location: "Tehran" }));
});

it("rescue evidence registration retries the acknowledged object without uploading it twice", async () => {
  svc.rescueEvidenceUpload.mockResolvedValue({
    uploadUrl: "https://upload.example.test",
    key: "animal-support-evidence/r1/proof.jpg",
  });
  svc.registerRescueEvidence
    .mockRejectedValueOnce(new Error("response lost"))
    .mockResolvedValueOnce({
      ...rescue,
      evidenceObjectKeys: ["animal-support-evidence/r1/proof.jpg"],
      evidenceUrls: ["https://assets.example.test/proof.jpg"],
    });
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
  renderWithIntl(<AdminRescueDetail id="r1" />);
  fireEvent.change(await screen.findByLabelText("Public evidence (optional)"), {
    target: { files: [new File(["data"], "proof.jpg", { type: "image/jpeg" })] },
  });
  const button = screen.getByRole("button", { name: "Attach evidence to case" });
  fireEvent.click(within(button.closest("section")!).getByRole("checkbox"));
  fireEvent.click(button);
  expect(await screen.findByRole("alert")).toBeTruthy();
  fireEvent.click(button);
  expect(await screen.findByRole("link", { name: "Evidence 1" })).toBeTruthy();
  expect(svc.rescueEvidenceUpload).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(svc.registerRescueEvidence).toHaveBeenCalledTimes(2);
  fetchMock.mockRestore();
});


it("formats server timestamps on the Tehran Jalali day with Persian digits", async () => {
  permission("animalSupport.view"); svc.getRescueCase.mockResolvedValue({ ...rescue, createdAt: "2026-10-15T21:00:00Z" });
  renderWithIntl(<AdminRescueDetail id="r1" />, "fa");
  const day = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "long", timeZone: "Asia/Tehran" }).format(new Date("2026-10-15T21:00:00Z"));
  expect(await screen.findByText(day)).toBeTruthy();
  expect(screen.queryByText(/NaN|undefined/)).toBeNull();
});
