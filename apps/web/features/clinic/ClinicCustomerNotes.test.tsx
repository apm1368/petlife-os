import {beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,screen} from "@testing-library/react";
import {renderWithIntl} from "@/test/render-with-intl";
import {clinicOsService} from "@/services/clinic-os.service";
import {ClinicCustomerNotes} from "./ClinicCustomerNotes";
vi.mock("@/services/clinic-os.service",()=>({clinicOsService:{notes:vi.fn(),addNote:vi.fn(),removeNote:vi.fn()}}));
vi.mock("@/stores/provider-store",()=>({useProviderStore:(select:(s:unknown)=>unknown)=>select({context:{active:{role:"STAFF",providerUserId:"staff1"}}})}));
describe("ClinicCustomerNotes",()=>{
 beforeEach(()=>{vi.resetAllMocks();vi.mocked(clinicOsService.notes).mockResolvedValue([{id:"note1",body:"Another clinician's note",authorProviderUserId:"staff2",authorName:"Vet",visibleToOwner:false,createdAt:"2026-10-15T10:00:00Z"}])});
 it("keeps notes internal by default and hides removal for another author",async()=>{vi.mocked(clinicOsService.addNote).mockResolvedValue([]);renderWithIntl(<ClinicCustomerNotes householdId="h1"/>);fireEvent.click(screen.getByRole("button",{name:"Customer notes"}));await screen.findByText("Another clinician's note");expect(screen.queryByRole("button",{name:"Remove note"})).toBeNull();fireEvent.change(screen.getByLabelText("New note"),{target:{value:"Follow up tomorrow"}});fireEvent.click(screen.getByRole("button",{name:"Save note"}));await screen.findByText("No clinic notes yet.");expect(clinicOsService.addNote).toHaveBeenCalledWith("h1",{body:"Follow up tomorrow",visibleToOwner:false})});
 it("preserves the draft when saving fails",async()=>{vi.mocked(clinicOsService.addNote).mockRejectedValue(new Error("offline"));renderWithIntl(<ClinicCustomerNotes householdId="h1"/>);fireEvent.click(screen.getByRole("button",{name:"Customer notes"}));await screen.findByText("Another clinician's note");fireEvent.change(screen.getByLabelText("New note"),{target:{value:"Draft to keep"}});fireEvent.click(screen.getByRole("button",{name:"Save note"}));await screen.findByRole("alert");expect((screen.getByLabelText("New note") as HTMLTextAreaElement).value).toBe("Draft to keep")});
});
