import {beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,screen,within,waitFor} from "@testing-library/react";
import {renderWithIntl} from "@/test/render-with-intl";
import {externalAdminStay} from "@/test/fixtures/external-admin-stay";
import {adminExternalListingsService} from "@/services/admin-external-listings.service";
import {ExternalMatchesView} from "./ExternalMatchesView";
const state=vi.hoisted(()=>({permissions:["travel.source.view","travel.listing.manage"]}));
vi.mock("@/stores/admin-store",()=>({useAdminStore:(select:(s:unknown)=>unknown)=>select({context:{permissions:state.permissions}})}));
vi.mock("@/services/admin-external-listings.service",()=>({adminExternalListingsService:{matches:vi.fn(),inspect:vi.fn(),review:vi.fn(),canonical:vi.fn()}}));
describe("ExternalMatchesView",()=>{
 beforeEach(()=>{vi.resetAllMocks();state.permissions=["travel.source.view","travel.listing.manage"];vi.mocked(adminExternalListingsService.matches).mockResolvedValue([{id:"match1",stayAId:"stay1",stayBId:"stay2",score:0.8,status:"PENDING",reviewedAt:null}]);vi.mocked(adminExternalListingsService.inspect).mockImplementation(async id=>({...externalAdminStay,normalized:{...externalAdminStay.normalized,id,title:id==="stay1"?"Garden stay":"Second source stay"}}))});
 it("loads comparison before allowing a reviewed decision",async()=>{vi.mocked(adminExternalListingsService.review).mockResolvedValue({id:"match1",status:"APPROVED"});renderWithIntl(<ExternalMatchesView/>);fireEvent.click(await screen.findByRole("button",{name:"Compare stays"}));await screen.findByText("Second source stay");const dialog=screen.getByRole("dialog");fireEvent.click(within(dialog).getByRole("button",{name:"Same accommodation"}));expect(adminExternalListingsService.review).not.toHaveBeenCalled();fireEvent.click(within(dialog).getByRole("button",{name:"Confirm and save"}));await waitFor(()=>expect(adminExternalListingsService.review).toHaveBeenCalledWith("match1",true));await screen.findByText("Change saved.")});
 it("never exposes approval controls to read-only users",async()=>{state.permissions=["travel.source.view"];renderWithIntl(<ExternalMatchesView/>);fireEvent.click(await screen.findByRole("button",{name:"Compare stays"}));await screen.findByText("Second source stay");expect(screen.queryByRole("button",{name:"Same accommodation"})).toBeNull()});
 it("does not fetch when source viewing is forbidden",()=>{state.permissions=[];renderWithIntl(<ExternalMatchesView/>);expect(adminExternalListingsService.matches).not.toHaveBeenCalled()});
});
