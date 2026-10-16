import {beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,screen} from "@testing-library/react";
import {renderWithIntl} from "@/test/render-with-intl";
import {clinicCustomerExtrasService} from "@/services/clinic-customer-extras.service";
import {MemberClinicNotesView} from "./MemberClinicNotesView";
vi.mock("@/services/clinic-customer-extras.service",()=>({clinicCustomerExtrasService:{sharedNotes:vi.fn()}}));
describe("MemberClinicNotesView",()=>{
 beforeEach(()=>vi.resetAllMocks());
 it("shows explicitly shared non-clinical notes with their actual clinic and time",async()=>{vi.mocked(clinicCustomerExtrasService.sharedNotes).mockResolvedValue([{id:"note1",householdId:"h1",clinic:{id:"org1",name:"Companion clinic"},body:"Please call reception about your next appointment.",createdAt:"2026-10-15T10:00:00Z"}]);renderWithIntl(<MemberClinicNotesView/>);await screen.findByText("Please call reception about your next appointment.");expect(screen.getByRole("heading",{name:"Companion clinic"})).toBeTruthy();expect(screen.getByText(/Up to 100 recent messages/)).toBeTruthy();expect(screen.queryByRole("button",{name:"Remove note"})).toBeNull()});
 it("does not present a transport failure as no shared messages",async()=>{vi.mocked(clinicCustomerExtrasService.sharedNotes).mockRejectedValueOnce(Error("network")).mockResolvedValueOnce([]);renderWithIntl(<MemberClinicNotesView/>);await screen.findByRole("alert");expect(screen.queryByText("No clinic messages have been shared yet.")).toBeNull();fireEvent.click(screen.getByRole("button",{name:"Retry"}));await screen.findByText("No clinic messages have been shared yet.")});
});
