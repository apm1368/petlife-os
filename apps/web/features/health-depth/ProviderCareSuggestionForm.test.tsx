import {beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,screen} from "@testing-library/react";
import {renderWithIntl} from "@/test/render-with-intl";
import {healthDepthService} from "@/services/health-depth.service";
import {ProviderCareSuggestionForm} from "./ProviderCareSuggestionForm";
// This file checks the suggestion contract; localized calendar and minute behavior have their own shared-field tests.
vi.mock("@/features/shared/date-picker/LocalDateTimeField",()=>({LocalDateTimeField:({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void})=><label>{label}<input type="datetime-local" value={value} onChange={e=>onChange(e.target.value)}/></label>}));
const state=vi.hoisted(()=>({role:"VET"}));
vi.mock("@/stores/provider-store",()=>({useProviderStore:(select:(s:unknown)=>unknown)=>select({context:{active:{role:state.role,providerOrganizationId:"o1"}}})}));
vi.mock("@/services/health-depth.service",()=>({healthDepthService:{suggestForVisit:vi.fn(),suggestForBooking:vi.fn()}}));
describe("ProviderCareSuggestionForm",()=>{
 beforeEach(()=>{vi.resetAllMocks();state.role="VET"});
 it("hides suggestions until the source is completed",()=>{renderWithIntl(<ProviderCareSuggestionForm source="visit" sourceId="v1" completed={false}/>);expect(screen.queryByRole("button")).toBeNull()});
 it("does not allow a staff member to suggest from a clinical visit",()=>{state.role="STAFF";renderWithIntl(<ProviderCareSuggestionForm source="visit" sourceId="v1" completed/>);expect(screen.queryByRole("button")).toBeNull()});
 it("submits care suggestions only after confirmation and never creates an owner reminder directly",async()=>{vi.mocked(healthDepthService.suggestForVisit).mockResolvedValue([]);renderWithIntl(<ProviderCareSuggestionForm source="visit" sourceId="v1" completed/>);fireEvent.change(screen.getByLabelText("Suggestion title"),{target:{value:"Follow-up visit"}});fireEvent.change(screen.getByLabelText("Suggested time (device time)"),{target:{value:"2026-10-20T10:00"}});const button=screen.getByRole("button",{name:"Record and send suggestion"});expect((button as HTMLButtonElement).disabled).toBe(true);fireEvent.click(screen.getByRole("checkbox"));fireEvent.click(button);await screen.findByRole("status");expect(healthDepthService.suggestForVisit).toHaveBeenCalledWith("v1",[expect.objectContaining({title:"Follow-up visit",type:"FOLLOW_UP",recurrence:"ONCE"})]);expect(healthDepthService.suggestForBooking).not.toHaveBeenCalled()});
});
