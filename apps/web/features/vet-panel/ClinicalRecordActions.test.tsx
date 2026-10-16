import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { usePetAccess } from "@/hooks/use-pet-access";
import { vetPanelService } from "@/services/vet-panel.service";
import { providerClinicalService } from "@/services/provider-clinical.service";
import { ClinicalRecordActions } from "./ClinicalRecordActions";
vi.mock("@/hooks/use-pet-access",()=>({usePetAccess:vi.fn()}));
vi.mock("@/services/vet-panel.service",()=>({vetPanelService:{createProblem:vi.fn(),createAlert:vi.fn(),createNoteTemplate:vi.fn(),createEstimate:vi.fn(),updateProblem:vi.fn()}}));
vi.mock("@/services/provider-clinical.service",()=>({providerClinicalService:{createReferral:vi.fn(),createLabResult:vi.fn()}}));
describe("ClinicalRecordActions",()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.mocked(usePetAccess).mockReturnValue({access:{canRecordClinicalData:true}} as never);});
 it("hides all writes from a read-only patient grant",()=>{vi.mocked(usePetAccess).mockReturnValue({access:{canRecordClinicalData:false}} as never);renderWithIntl(<ClinicalRecordActions petId="p1" problems={[]} onSaved={vi.fn()}/>);expect(screen.queryByText("Add to clinical record")).toBeNull();});
 it("submits a lab result using the real provider endpoint and keeps a failed draft",async()=>{
  vi.mocked(providerClinicalService.createLabResult).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({} as never);const saved=vi.fn();renderWithIntl(<ClinicalRecordActions petId="p1" problems={[]} onSaved={saved}/>);
  fireEvent.change(screen.getByLabelText("Record type"),{target:{value:"lab"}});fireEvent.change(screen.getByLabelText("Name"),{target:{value:"Glucose"}});fireEvent.change(screen.getByLabelText("Recorded test result"),{target:{value:"90"}});fireEvent.change(screen.getByLabelText("Lab unit"),{target:{value:"mg/dL"}});
  fireEvent.submit(screen.getByLabelText("Name").closest("form")!);expect(await screen.findByRole("alert")).toBeTruthy();expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Glucose");
  fireEvent.submit(screen.getByLabelText("Name").closest("form")!);await waitFor(()=>expect(saved).toHaveBeenCalled());expect(providerClinicalService.createLabResult).toHaveBeenLastCalledWith({petId:"p1",testName:"Glucose",value:"90",unit:"mg/dL"});
 });
 it("never creates an estimate with a reversed cost range",async()=>{
  renderWithIntl(<ClinicalRecordActions petId="p1" problems={[]} onSaved={vi.fn()}/>);fireEvent.change(screen.getByLabelText("Record type"),{target:{value:"estimate"}});for(const [label,value] of [["Name","Visit"],["Service description","Examination"],["Minimum cost (IRR)","200"],["Maximum cost (IRR)","100"]])fireEvent.change(screen.getByLabelText(label!),{target:{value}});
  fireEvent.submit(screen.getByLabelText("Name").closest("form")!);expect(await screen.findByRole("alert")).toBeTruthy();expect(vetPanelService.createEstimate).not.toHaveBeenCalled();
 });
});
