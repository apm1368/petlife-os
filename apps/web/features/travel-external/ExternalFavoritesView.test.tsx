import {beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,screen} from "@testing-library/react";
import {renderWithIntl} from "@/test/render-with-intl";
import {externalStay} from "@/test/fixtures/external-stay";
import {travelExternalService} from "@/services/travel-external.service";
import {ExternalFavoritesView} from "./ExternalFavoritesView";
const state=vi.hoisted(()=>({status:"authenticated"}));
vi.mock("@/hooks/use-session-bootstrap",()=>({useSessionBootstrap:vi.fn()}));
vi.mock("@/stores/session-store",()=>({useSessionStore:(select:(s:unknown)=>unknown)=>select({status:state.status})}));
vi.mock("@/services/travel-external.service",()=>({travelExternalService:{favorites:vi.fn(),unfavorite:vi.fn(),outboundUrl:(id:string)=>`https://api.example.com/travel/external/stays/${id}/out`}}));
describe("ExternalFavoritesView",()=>{
 beforeEach(()=>{vi.resetAllMocks();state.status="authenticated";vi.mocked(travelExternalService.favorites).mockResolvedValue([{savedAt:"2026-10-15T10:00:00Z",available:false,stay:externalStay}])});
 it("preserves an unavailable favorite but hides outbound navigation",async()=>{renderWithIntl(<ExternalFavoritesView/>);await screen.findByText("External lodge");expect(screen.getByText("This stay is currently unavailable in the public directory. It remains in your saved list.")).toBeTruthy();expect(screen.queryByRole("link",{name:"View and check at source website"})).toBeNull();expect(screen.getByRole("button",{name:"Remove saved stay"})).toBeTruthy()});
 it("keeps a favorite visible if removal fails",async()=>{vi.mocked(travelExternalService.unfavorite).mockRejectedValue(new Error("offline"));renderWithIntl(<ExternalFavoritesView/>);fireEvent.click(await screen.findByRole("button",{name:"Remove saved stay"}));await screen.findByRole("alert");expect(screen.getByText("External lodge")).toBeTruthy()});
});
