import {beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,screen,within} from "@testing-library/react";
import {renderWithIntl} from "@/test/render-with-intl";
import {healthDepthService} from "@/services/health-depth.service";
import {CareSuggestionsView} from "./CareSuggestionsView";
const state=vi.hoisted(()=>({canViewCareProfile:true,canEditCareProfile:true}));
vi.mock("@/hooks/use-pet-access",()=>({usePetAccess:()=>({access:state,error:false,retry:vi.fn()})}));
vi.mock("@/services/health-depth.service",()=>({healthDepthService:{suggestions:vi.fn(),acceptSuggestion:vi.fn(),dismissSuggestion:vi.fn()}}));
const suggestion={id:"c1",petId:"p1",title:"Follow-up visit",type:"FOLLOW_UP",notes:"Follow the clinic instructions",suggestedDueAt:"2026-10-20T10:00:00Z",recurrence:"ONCE",intervalDays:null,status:"PENDING" as const,source:{kind:"VISIT" as const,id:"v1"},careReminderId:null,decidedAt:null,createdAt:"2026-10-15T10:00:00Z",organization:{id:"o1",name:"Clinic"}};
describe("CareSuggestionsView",()=>{
 beforeEach(()=>{vi.resetAllMocks();state.canViewCareProfile=true;state.canEditCareProfile=true;vi.mocked(healthDepthService.suggestions).mockResolvedValue([suggestion])});
 it("does not load suggestions without care access",()=>{state.canViewCareProfile=false;renderWithIntl(<CareSuggestionsView petId="p1"/>);expect(healthDepthService.suggestions).not.toHaveBeenCalled()});
 it("does not offer acceptance or dismissal to read-only viewers",async()=>{state.canEditCareProfile=false;renderWithIntl(<CareSuggestionsView petId="p1"/>);await screen.findByText("Follow-up visit");expect(screen.queryByRole("button",{name:"Review and accept"})).toBeNull();expect(screen.queryByRole("button",{name:"Dismiss suggestion"})).toBeNull()});
 it("only creates a reminder after a confirmed acceptance",async()=>{vi.mocked(healthDepthService.acceptSuggestion).mockResolvedValue({...suggestion,status:"ACCEPTED",careReminderId:"reminder1"});renderWithIntl(<CareSuggestionsView petId="p1"/>);fireEvent.click(await screen.findByRole("button",{name:"Review and accept"}));expect(healthDepthService.acceptSuggestion).not.toHaveBeenCalled();fireEvent.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Confirm and proceed"}));await screen.findByRole("status");expect(healthDepthService.acceptSuggestion).toHaveBeenCalledWith("p1","c1",{})});
 it("keeps a rejected acceptance visible with a retryable action error",async()=>{vi.mocked(healthDepthService.acceptSuggestion).mockRejectedValue(new Error("plan limit"));renderWithIntl(<CareSuggestionsView petId="p1"/>);fireEvent.click(await screen.findByRole("button",{name:"Review and accept"}));fireEvent.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Confirm and proceed"}));expect((await screen.findByRole("alert")).textContent).toContain("Could not record the decision");expect(healthDepthService.dismissSuggestion).not.toHaveBeenCalled()});
});
