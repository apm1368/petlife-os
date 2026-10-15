import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { clinicContactsService } from "@/services/clinic-contacts.service";
import { ClinicContacts } from "./ClinicContacts";
const state = vi.hoisted(() => ({ role: "OWNER" }));
vi.mock("@/stores/provider-store", () => ({ useProviderStore: (select: (s: unknown) => unknown) => select({ context: { active: { providerOrganizationId: "org1", role: state.role } } }) }));
vi.mock("@/services/clinic-contacts.service", () => ({ clinicContactsService: { list: vi.fn(), preview: vi.fn(), import: vi.fn(), export: vi.fn() } }));
const csv = "name,phone,email,petName,species,notes\nTest,+989120000000,,,,";
const preview = { dryRun: true, totalRows: 1, validRows: 1, imported: 0, confirmationToken: "preview-token", errors: [], duplicates: [] };
async function chooseFile(text = csv) {
  const file = new File([text], "contacts.csv", { type: "text/csv" });
  Object.defineProperty(file, "text", { value: async () => text });
  fireEvent.change(await screen.findByLabelText("Contacts CSV file"), { target: { files: [file] } });
  await waitFor(() => expect((screen.getByRole("button", { name: "Validate and preview" }) as HTMLButtonElement).disabled).toBe(false));
}
describe("ClinicContacts", () => {
  beforeEach(() => { vi.resetAllMocks(); state.role = "OWNER"; vi.mocked(clinicContactsService.list).mockResolvedValue([]); vi.mocked(clinicContactsService.preview).mockResolvedValue(preview); });
  it("hides imports and exports from non-owners", async () => {
    state.role = "STAFF"; renderWithIntl(<ClinicContacts canExport />); await screen.findByText("No matching contacts.");
    expect(screen.queryByLabelText("Contacts CSV file")).toBeNull(); expect(screen.queryByRole("button", { name: "Download CSV" })).toBeNull();
  });
  it("requires a preview, explicit confirmation and the returned token", async () => {
    vi.mocked(clinicContactsService.import).mockResolvedValue({ ...preview, dryRun: false, imported: 1 });
    renderWithIntl(<ClinicContacts canExport={false} />); await chooseFile();
    expect(clinicContactsService.import).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Validate and preview" }));
    const button = await screen.findByRole("button", { name: "Confirm and import contacts" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(button);
    await screen.findByText("Imported 1 contacts."); expect(clinicContactsService.import).toHaveBeenCalledWith(csv, "preview-token");
    expect(screen.queryByRole("button", { name: "Download CSV" })).toBeNull();
  });
  it("invalidates the confirmation token when the selected file changes", async () => {
    renderWithIntl(<ClinicContacts canExport={false} />); await chooseFile(); fireEvent.click(screen.getByRole("button", { name: "Validate and preview" })); await screen.findByRole("checkbox");
    await chooseFile(csv + "\nOther,+989130000000,,,,"); expect(screen.queryByRole("checkbox")).toBeNull(); expect(clinicContactsService.import).not.toHaveBeenCalled();
  });
  it("requires a new preview after an import rejection", async () => {
    vi.mocked(clinicContactsService.import).mockRejectedValue(new Error("stale preview")); renderWithIntl(<ClinicContacts canExport={false} />); await chooseFile(); fireEvent.click(screen.getByRole("button", { name: "Validate and preview" })); fireEvent.click(await screen.findByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Confirm and import contacts" }));
    await screen.findByRole("alert"); expect(screen.queryByRole("button", { name: "Confirm and import contacts" })).toBeNull(); expect(clinicContactsService.import).toHaveBeenCalledTimes(1);
  });
});
