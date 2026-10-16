import {beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,screen} from "@testing-library/react";
import {renderWithIntl} from "@/test/render-with-intl";
import {healthDepthService} from "@/services/health-depth.service";
import {HealthActivityView} from "./HealthActivityView";
const state=vi.hoisted(()=>({canViewHealth:true}));
vi.mock("@/hooks/use-pet-access",()=>({usePetAccess:()=>({access:state,error:false,retry:vi.fn()})}));
vi.mock("@/services/health-depth.service",async importOriginal=>{const actual=await importOriginal<typeof import("@/services/health-depth.service")>();return {...actual,healthDepthService:{snapshot:vi.fn(),feed:vi.fn()}}});
const item={id:"e1",type:"VISIT" as const,recordType:"CLINICAL_VISIT",recordId:"v1",occurredAt:"2026-10-15T10:00:00Z",recordedAt:null,source:"CLINIC" as const,author:{providerUserId:null,displayTitle:null,userId:null},organization:{id:"o1",name:"Clinic"},summary:"Follow-up consultation",deepLink:"/pets/p1/health/visits/v1"};
describe("HealthActivityView",()=>{
 beforeEach(()=>{vi.resetAllMocks();state.canViewHealth=true;vi.mocked(healthDepthService.snapshot).mockResolvedValue({activeConditions:[],activeMedications:[],allergies:[],latestWeight:null,documentsCount:0} as never);vi.mocked(healthDepthService.feed).mockResolvedValue({items:[item],nextCursor:"next-page"})});
 it("never fetches the snapshot or history without health access",()=>{state.canViewHealth=false;renderWithIntl(<HealthActivityView petId="p1"/>);expect(healthDepthService.snapshot).not.toHaveBeenCalled();expect(healthDepthService.feed).not.toHaveBeenCalled()});
 it("preserves loaded history when an older page fails",async()=>{vi.mocked(healthDepthService.feed).mockResolvedValueOnce({items:[item],nextCursor:"next-page"}).mockRejectedValueOnce(new Error("offline"));renderWithIntl(<HealthActivityView petId="p1"/>);await screen.findByText("Follow-up consultation");fireEvent.click(screen.getByRole("button",{name:"Show older"}));await screen.findByRole("alert");expect(screen.getByText("Follow-up consultation")).toBeTruthy();expect(healthDepthService.feed).toHaveBeenLastCalledWith("p1",{cursor:"next-page"},expect.any(AbortSignal))});
 it("does not render a cross-pet or external record link from a response",async()=>{vi.mocked(healthDepthService.feed).mockResolvedValue({items:[{...item,deepLink:"https://example.com/wrong"}],nextCursor:null});renderWithIntl(<HealthActivityView petId="p1"/>);await screen.findByText("Follow-up consultation");expect(screen.queryByRole("link",{name:"Open record"})).toBeNull()});
});
