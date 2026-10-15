import {beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,screen} from "@testing-library/react";
import {renderWithIntl} from "@/test/render-with-intl";
import {clinicOutreachService} from "@/services/clinic-outreach.service";
import {ClinicCampaigns} from "./ClinicCampaigns";
const state=vi.hoisted(()=>({role:"OWNER"}));
vi.mock("@/stores/provider-store",()=>({useProviderStore:(select:(s:unknown)=>unknown)=>select({context:{active:{role:state.role}}})}));
vi.mock("@/services/clinic-outreach.service",()=>({clinicOutreachService:{preview:vi.fn(),send:vi.fn()}}));
const audience={segment:"APPOINTMENTS_TOMORROW" as const,count:3,recipientCount:3,excludedCount:0,exclusionReasons:[],alreadySentToday:false,sample:[]};
describe("ClinicCampaigns",()=>{
 beforeEach(()=>{vi.resetAllMocks();state.role="OWNER";vi.mocked(clinicOutreachService.preview).mockResolvedValue(audience)});
 it("does not expose campaign controls to staff",()=>{state.role="STAFF";renderWithIntl(<ClinicCampaigns canSend/>);expect(screen.queryByRole("button")).toBeNull();expect(clinicOutreachService.preview).not.toHaveBeenCalled()});
 it("requires preview and explicit confirmation of the exact recipient count",async()=>{vi.mocked(clinicOutreachService.send).mockResolvedValue({campaignId:"c1",segment:audience.segment,recipientCount:3,delivered:2});renderWithIntl(<ClinicCampaigns canSend/>);expect(screen.queryByRole("checkbox")).toBeNull();fireEvent.click(screen.getByRole("button",{name:"Preview audience"}));const input=await screen.findByLabelText("Message title");fireEvent.change(input,{target:{value:"Appointment reminder"}});const button=screen.getByRole("button",{name:"Confirm and send reminders"});expect((button as HTMLButtonElement).disabled).toBe(true);fireEvent.click(screen.getByRole("checkbox"));fireEvent.click(button);await screen.findByRole("status");expect(clinicOutreachService.send).toHaveBeenCalledWith({segment:audience.segment,title:"Appointment reminder",confirm:true,expectedCount:3});expect(screen.queryByRole("checkbox")).toBeNull()});
 it("invalidates a reviewed audience when the segment changes",async()=>{renderWithIntl(<ClinicCampaigns canSend/>);fireEvent.click(screen.getByRole("button",{name:"Preview audience"}));await screen.findByRole("checkbox");fireEvent.change(screen.getByLabelText("Audience segment"),{target:{value:"VACCINES_DUE"}});expect(screen.queryByRole("checkbox")).toBeNull();expect(clinicOutreachService.send).not.toHaveBeenCalled()});
 it("blocks sending when the plan lacks reminder delivery",async()=>{renderWithIntl(<ClinicCampaigns canSend={false}/>);fireEvent.click(screen.getByRole("button",{name:"Preview audience"}));await screen.findByText("Sending reminders is not enabled on your current plan.");expect(screen.queryByRole("checkbox")).toBeNull()});
 it("does not permit a second send for a segment already sent today",async()=>{vi.mocked(clinicOutreachService.preview).mockResolvedValue({...audience,alreadySentToday:true});renderWithIntl(<ClinicCampaigns canSend/>);fireEvent.click(screen.getByRole("button",{name:"Preview audience"}));await screen.findByText("This segment was already contacted today. Another send is not allowed.");expect(screen.queryByLabelText("Message title")).toBeNull()});
});
