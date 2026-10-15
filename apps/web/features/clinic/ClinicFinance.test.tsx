import {beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,screen,waitFor} from "@testing-library/react";
import {renderWithIntl} from "@/test/render-with-intl";
import {clinicOutreachService} from "@/services/clinic-outreach.service";
import {ClinicFinance} from "./ClinicFinance";
vi.mock("@/features/shared/date-picker/DateField",()=>({DateField:({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void})=><label>{label}<input type="date" value={value} onChange={e=>onChange(e.target.value)}/></label>}));
const state=vi.hoisted(()=>({role:"OWNER"}));
vi.mock("@/stores/provider-store",()=>({useProviderStore:(select:(s:unknown)=>unknown)=>select({context:{active:{role:state.role}}})}));
vi.mock("@/services/clinic-outreach.service",()=>({clinicOutreachService:{finance:vi.fn()}}));
const report={from:"2026-10-01T00:00:00Z",to:"2026-10-15T00:00:00Z",bookings:{total:5,completed:3,cancelled:1,noShow:1,refunded:0},billedAmount:[{currency:"IRR",amount:"1000000"}],payAtClinic:[],collectedOnline:[{currency:"USD",amount:"12"}],ledgerPosted:[],byService:[],daily:[]};
describe("ClinicFinance",()=>{
 beforeEach(()=>{vi.resetAllMocks();state.role="OWNER";vi.mocked(clinicOutreachService.finance).mockResolvedValue(report)});
 it("does not request finance for a non-owner",()=>{state.role="VET";renderWithIntl(<ClinicFinance/>);expect(clinicOutreachService.finance).not.toHaveBeenCalled();expect(screen.queryByRole("heading")).toBeNull()});
 it("keeps currencies and collection meanings distinct",async()=>{renderWithIntl(<ClinicFinance/>);await screen.findByText("100,000 Toman");expect(screen.getByText("12 USD")).toBeTruthy();expect(screen.getByText("Net completed-service billing; not proof of collection.")).toBeTruthy()});
 it("rejects a reversed date window without another request",async()=>{renderWithIntl(<ClinicFinance/>);await screen.findByText("100,000 Toman");fireEvent.change(screen.getByLabelText("From"),{target:{value:"2026-10-15"}});fireEvent.change(screen.getByLabelText("To (exclusive)"),{target:{value:"2026-10-01"}});fireEvent.click(screen.getByRole("button",{name:"Load report"}));await screen.findByRole("alert");await waitFor(()=>expect(clinicOutreachService.finance).toHaveBeenCalledTimes(1))});
});
