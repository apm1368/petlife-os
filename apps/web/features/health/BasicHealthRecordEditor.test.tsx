import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { usePetAccess } from "@/hooks/use-pet-access";
import { healthService } from "@/services/health.service";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { BasicHealthRecordEditor } from "./BasicHealthRecordEditor";
vi.mock("@/hooks/use-pet-access", () => ({ usePetAccess: vi.fn() }));
vi.mock("@/services/health.service", () => ({ healthService: { updateAllergy: vi.fn(), deleteAllergy: vi.fn() } }));
vi.mock("@/services/health-advanced.service", () => ({ healthAdvancedService: { createCorrection: vi.fn() } }));
const record = { id: "a1", name: "Pollen", reaction: "Rash", severity: "MILD", sourceType: "PROVIDER" } as never;
describe("BasicHealthRecordEditor", () => {
 beforeEach(() => { vi.clearAllMocks(); vi.mocked(usePetAccess).mockReturnValue({ access: { canEditHealth: true } } as never); });
 it("does not expose writes until edit access is resolved", () => { vi.mocked(usePetAccess).mockReturnValue({ access: null } as never); renderWithIntl(<BasicHealthRecordEditor petId="p1" kind="allergy" record={record} onSaved={vi.fn()} onDeleted={vi.fn()} />); expect(screen.queryByRole("button")).toBeNull(); });
 it("records a correction for a clinician-authored record without PATCH or DELETE", async () => {
  vi.mocked(healthAdvancedService.createCorrection).mockResolvedValue({} as never); const saved=vi.fn(); renderWithIntl(<BasicHealthRecordEditor petId="p1" kind="allergy" record={record} onSaved={saved} onDeleted={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "Remove" })).toBeNull(); fireEvent.click(screen.getByRole("button", { name: "Request a record correction" })); fireEvent.change(screen.getByRole("textbox"), { target: { value: "Reaction needs clarification" } }); fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(saved).toHaveBeenCalled()); expect(healthAdvancedService.createCorrection).toHaveBeenCalledWith("p1", { targetType: "ALLERGY", targetId: "a1", correctionText: "Reaction needs clarification" }); expect(healthService.updateAllergy).not.toHaveBeenCalled(); expect(healthService.deleteAllergy).not.toHaveBeenCalled();
 });
});
