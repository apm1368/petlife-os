import {beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,screen,waitFor} from "@testing-library/react";
import {renderWithIntl} from "@/test/render-with-intl";
import {externalStay} from "@/test/fixtures/external-stay";
import {travelService} from "@/services/travel.service";
import {travelExternalService} from "@/services/travel-external.service";
import {TripExternalStaysView} from "./TripExternalStaysView";
const state=vi.hoisted(()=>({canViewIdentity:true,canEditCareProfile:true}));
vi.mock("@/hooks/use-pet-access",()=>({usePetAccess:()=>({access:state,error:false,retry:vi.fn()})}));
vi.mock("@/services/travel-external.service",()=>({travelExternalService:{tripStays:vi.fn(),search:vi.fn(),attach:vi.fn(),detach:vi.fn(),outboundUrl:(id:string)=>`https://api.example.com/travel/external/stays/${id}/out`}}));
vi.mock("@/services/travel.service",()=>({travelService:{get:vi.fn().mockResolvedValue({destinationCity:"Tehran",departAt:"2026-10-20T10:00:00Z",returnAt:"2026-10-22T10:00:00Z"})}}));
const planned={state:"SAVED",reservationConfirmed:false as const,addedAt:"2026-10-15T10:00:00Z",stay:externalStay,priceAtAttach:null};
describe("TripExternalStaysView",()=>{
 beforeEach(()=>{vi.resetAllMocks();state.canViewIdentity=true;state.canEditCareProfile=true;vi.mocked(travelService.get).mockResolvedValue({destinationCity:"Tehran",departAt:"2026-10-20T10:00:00Z",returnAt:"2026-10-22T10:00:00Z"} as never);vi.mocked(travelExternalService.tripStays).mockResolvedValue([]);vi.mocked(travelExternalService.search).mockResolvedValue({items:[externalStay],total:1,page:1,pageSize:20,context:externalStay.price!.context!})});
 it("does not request a trip’s stays without identity access",()=>{state.canViewIdentity=false;renderWithIntl(<TripExternalStaysView petId="p1" tripId="t1"/>);expect(travelExternalService.tripStays).not.toHaveBeenCalled()});
 it("shows a read-only plan without attachment or removal controls",async()=>{state.canEditCareProfile=false;vi.mocked(travelExternalService.tripStays).mockResolvedValue([planned]);renderWithIntl(<TripExternalStaysView petId="p1" tripId="t1"/>);await screen.findByText("External lodge");expect(screen.queryByRole("button",{name:"Remove from trip plan"})).toBeNull();expect(screen.queryByRole("button",{name:"Search and check"})).toBeNull()});
 it("adds a stay only on user action and never claims that it is booked",async()=>{vi.mocked(travelExternalService.attach).mockResolvedValue([planned]);renderWithIntl(<TripExternalStaysView petId="p1" tripId="t1"/>);fireEvent.click(await screen.findByRole("button",{name:"Search and check"}));fireEvent.click(await screen.findByRole("button",{name:"Add to trip plan"}));expect(await screen.findByText("Trip plan updated. This does not confirm a reservation.")).toBeTruthy();expect(travelExternalService.attach).toHaveBeenCalledWith("p1","t1","stay1",expect.objectContaining({checkIn:"2026-10-20",checkOut:"2026-10-22",guests:2,pets:1}));expect((screen.getByRole("button",{name:"Already in trip plan"}) as HTMLButtonElement).disabled).toBe(true)});
 it("requests the next search page without silently truncating results",async()=>{vi.mocked(travelExternalService.search).mockResolvedValue({items:[externalStay],total:30,page:1,pageSize:20,context:externalStay.price!.context!});renderWithIntl(<TripExternalStaysView petId="p1" tripId="t1"/>);fireEvent.click(await screen.findByRole("button",{name:"Search and check"}));fireEvent.click(await screen.findByRole("button",{name:"Next"}));await waitFor(()=>expect(travelExternalService.search).toHaveBeenLastCalledWith(expect.objectContaining({page:2,pageSize:20})))});
});
