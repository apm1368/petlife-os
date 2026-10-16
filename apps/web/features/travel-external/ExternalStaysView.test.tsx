import {beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,screen,waitFor} from "@testing-library/react";
import {renderWithIntl} from "@/test/render-with-intl";
import {externalStay} from "@/test/fixtures/external-stay";
import {travelExternalService} from "@/services/travel-external.service";
import {ExternalStaysView} from "./ExternalStaysView";
const state=vi.hoisted(()=>({status:"authenticated",query:"checkIn=2026-10-20&checkOut=2026-10-22&guests=2&pets=1",replace:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({replace:state.replace}),useSearchParams:()=>new URLSearchParams(state.query)}));
vi.mock("@/hooks/use-session-bootstrap",()=>({useSessionBootstrap:vi.fn()}));
vi.mock("@/stores/session-store",()=>({useSessionStore:(select:(s:unknown)=>unknown)=>select({status:state.status})}));
vi.mock("@/services/travel-external.service",()=>({travelExternalService:{search:vi.fn(),detail:vi.fn(),favorites:vi.fn(),favorite:vi.fn(),unfavorite:vi.fn(),outboundUrl:(id:string)=>`https://api.example.com/travel/external/stays/${id}/out`}}));
describe("ExternalStaysView",()=>{
 beforeEach(()=>{vi.resetAllMocks();state.status="authenticated";state.query="checkIn=2026-10-20&checkOut=2026-10-22&guests=2&pets=1";vi.mocked(travelExternalService.search).mockResolvedValue({items:[externalStay],total:1,page:1,pageSize:20,context:externalStay.price!.context!});vi.mocked(travelExternalService.favorites).mockResolvedValue([])});
 it("does not expose favorite mutations to guests",async()=>{state.status="unauthenticated";renderWithIntl(<ExternalStaysView/>);await screen.findByText("External lodge");expect(screen.queryByRole("button",{name:"Save stay"})).toBeNull();expect(screen.getByRole("link",{name:"Sign in to save stays"})).toBeTruthy();expect(travelExternalService.favorites).not.toHaveBeenCalled()});
 it("hides results for old guest counts until the changed filters are applied",async()=>{renderWithIntl(<ExternalStaysView/>);await screen.findByText("External lodge");fireEvent.change(screen.getByLabelText("Guests"),{target:{value:"3"}});expect(screen.queryByText("External lodge")).toBeNull();expect(screen.getByText("Filters changed. Run the search to show matching results and prices.")).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"Search and check"}));await waitFor(()=>expect(travelExternalService.search).toHaveBeenLastCalledWith(expect.objectContaining({guests:3}),expect.any(AbortSignal)))});
 it("uses the returned saved state after a favorite mutation",async()=>{vi.mocked(travelExternalService.favorite).mockResolvedValue({stayId:"stay1",saved:true});renderWithIntl(<ExternalStaysView/>);fireEvent.click(await screen.findByRole("button",{name:"Save stay"}));await screen.findByRole("button",{name:"Remove saved stay"});expect(travelExternalService.favorite).toHaveBeenCalledWith("stay1")});
 it("does not submit price filters without a date range",async()=>{state.query="";renderWithIntl(<ExternalStaysView/>);await screen.findByText("External lodge");fireEvent.change(screen.getByLabelText("Minimum price for selected dates (Toman)"),{target:{value:"100"}});fireEvent.click(screen.getByRole("button",{name:"Search and check"}));await screen.findByRole("alert");expect(travelExternalService.search).toHaveBeenCalledTimes(1)});
});
