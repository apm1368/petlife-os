import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { clinicTeamService } from "@/services/clinic-team.service";
import { ApiError } from "@/lib/api/client";
import { ClinicTeamManagement } from "./ClinicTeamManagement";

const state = vi.hoisted(() => ({ role: "OWNER" }));
vi.mock("@/stores/provider-store", () => ({ useProviderStore: (select: (s: unknown) => unknown) => select({ context: { active: { providerOrganizationId: "org1", role: state.role } } }) }));
vi.mock("@/services/clinic-team.service", () => ({ clinicTeamService: { staff: vi.fn(), invite: vi.fn(), revoke: vi.fn(), removeMember: vi.fn(), branches: vi.fn(), addBranch: vi.fn(), removeBranch: vi.fn() } }));
const roster = {
  items: [{ providerUserId: "owner1", displayName: "Owner One", role: "OWNER" as const, displayTitle: null, joinedAt: "2026-10-15T10:00:00Z" }, { providerUserId: "vet1", displayName: "Vet One", role: "VET" as const, displayTitle: "Vet", joinedAt: "2026-10-15T10:00:00Z" }],
  pendingInvitations: [], usage: { used: 2, pending: 0, limit: 4 },
};
const branches = { items: [1, 2].map(id => ({ id: `b${id}`, name: `Branch ${id}`, addressLine: "Main street", city: "Tehran", region: null, latitude: null, longitude: null, phone: "+982100000000", timezone: "Asia/Tehran" })), usage: { used: 2, limit: 3 } };

describe("ClinicTeamManagement", () => {
  beforeEach(() => { vi.resetAllMocks(); state.role = "OWNER"; vi.mocked(clinicTeamService.staff).mockResolvedValue(roster); vi.mocked(clinicTeamService.branches).mockResolvedValue(branches); });
  it("does not expose owner mutations to staff", async () => {
    state.role = "STAFF"; renderWithIntl(<ClinicTeamManagement section="staff" />);
    await screen.findByText("Vet One");
    expect(screen.queryByRole("button", { name: "Remove from team" })).toBeNull();
    expect(screen.queryByLabelText("Colleague account email")).toBeNull();
    expect(clinicTeamService.invite).not.toHaveBeenCalled();
  });
  it("shows invitation capacity including pending seats", async () => {
    vi.mocked(clinicTeamService.staff).mockResolvedValue({ ...roster, usage: { used: 2, pending: 2, limit: 4 } });
    renderWithIntl(<ClinicTeamManagement section="staff" />);
    await screen.findByText("Your current plan capacity is full.");
    expect(screen.queryByRole("button", { name: "Send membership invitation" })).toBeNull();
  });
  it("submits an invitation rather than claiming immediate membership", async () => {
    vi.mocked(clinicTeamService.invite).mockResolvedValue({ ...roster, pendingInvitations: [{ id: "i1", organization: { id: "org1", name: "Clinic" }, invitedDisplayName: "New colleague", role: "VET", displayTitle: null, status: "PENDING", expiresAt: "2026-10-20T10:00:00Z", createdAt: "2026-10-15T10:00:00Z" }], usage: { used: 2, pending: 1, limit: 4 } });
    renderWithIntl(<ClinicTeamManagement section="staff" />);
    fireEvent.change(await screen.findByLabelText("Colleague account email"), { target: { value: "vet@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send membership invitation" }));
    await screen.findByText("New colleague");
    expect(clinicTeamService.invite).toHaveBeenCalledWith({ email: "vet@example.com", role: "VET" });
    expect(screen.getAllByRole("button", { name: "Remove from team" })).toHaveLength(1);
  });
  it("keeps the invitation draft after a server failure", async () => {
    vi.mocked(clinicTeamService.invite).mockRejectedValue(new Error("offline"));
    renderWithIntl(<ClinicTeamManagement section="staff" />);
    const input = await screen.findByLabelText("Colleague account email");
    fireEvent.change(input, { target: { value: "vet@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send membership invitation" }));
    await screen.findByRole("alert"); expect((input as HTMLInputElement).value).toBe("vet@example.com");
  });
  it("requires confirmation and explains a branch that is in use", async () => {
    vi.mocked(clinicTeamService.removeBranch).mockRejectedValue(new ApiError({ code: "CLINIC_BRANCH_IN_USE", message: "In use", requestId: "test" }, 409));
    renderWithIntl(<ClinicTeamManagement section="branches" />);
    fireEvent.click((await screen.findAllByRole("button", { name: "Remove branch" }))[0]!);
    expect(clinicTeamService.removeBranch).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog", { name: "Confirm change" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm and proceed" }));
    await waitFor(() => expect(within(dialog).getByRole("alert").textContent).toContain("cannot be removed"));
    expect(screen.getByText("Branch 1")).toBeTruthy();
  });
  it("never offers to delete the last branch", async () => {
    vi.mocked(clinicTeamService.branches).mockResolvedValue({ items: [branches.items[0]!], usage: { used: 1, limit: 3 } });
    renderWithIntl(<ClinicTeamManagement section="branches" />);
    await screen.findByText("Branch 1"); expect(screen.queryByRole("button", { name: "Remove branch" })).toBeNull();
  });
});
