import {beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,screen,waitFor} from "@testing-library/react";
import {renderWithIntl} from "@/test/render-with-intl";
import {adminExternalListingsService} from "@/services/admin-external-listings.service";
import {ExternalPriceForm} from "./ExternalPriceForm";
vi.mock("@/features/shared/date-picker/DateField",()=>({DateField:({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void})=><label>{label}<input value={value} onChange={e=>onChange(e.target.value)}/></label>}));
vi.mock("@/features/shared/date-picker/LocalDateTimeField",()=>({LocalDateTimeField:({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void})=><label>{label}<input value={value} onChange={e=>onChange(e.target.value)}/></label>}));
vi.mock("@/services/admin-external-listings.service",()=>({adminExternalListingsService:{price:vi.fn()}}));
function fill(amount:string){fireEvent.change(screen.getByLabelText("Check-in"),{target:{value:"2026-11-01"}});fireEvent.change(screen.getByLabelText("Check-out"),{target:{value:"2026-11-03"}});fireEvent.change(screen.getByLabelText("Observation time"),{target:{value:"2026-01-01T12:17"}});if(amount)fireEvent.change(screen.getByLabelText("Observed amount (Toman, optional)"),{target:{value:amount}});fireEvent.click(screen.getByRole("checkbox"));fireEvent.click(screen.getByRole("button",{name:"Save information"}))}
describe("ExternalPriceForm",()=>{
 beforeEach(()=>{vi.resetAllMocks();vi.mocked(adminExternalListingsService.price).mockResolvedValue({})});
 it("preserves unknown price instead of sending zero",async()=>{renderWithIntl(<ExternalPriceForm id="stay1" onSaved={vi.fn().mockResolvedValue(undefined)}/>);fill("");await waitFor(()=>expect(adminExternalListingsService.price).toHaveBeenCalled());const body=vi.mocked(adminExternalListingsService.price).mock.calls[0]![1];expect(body).not.toHaveProperty("priceIrr");expect(body).not.toHaveProperty("pets");expect(body.guests).toBe(2);expect(body.observedAt).toContain(":17:")});
 it("converts explicit Toman amount to IRR",async()=>{renderWithIntl(<ExternalPriceForm id="stay1" onSaved={vi.fn().mockResolvedValue(undefined)}/>);fill("125000");await waitFor(()=>expect(adminExternalListingsService.price).toHaveBeenCalledWith("stay1",expect.objectContaining({priceIrr:1250000}))) });
 it("rejects a reversed date window before any write",async()=>{renderWithIntl(<ExternalPriceForm id="stay1" onSaved={vi.fn()}/>);fireEvent.change(screen.getByLabelText("Check-in"),{target:{value:"2026-11-04"}});fireEvent.change(screen.getByLabelText("Check-out"),{target:{value:"2026-11-03"}});fireEvent.change(screen.getByLabelText("Observation time"),{target:{value:"2026-01-01T12:17"}});fireEvent.click(screen.getByRole("checkbox"));fireEvent.click(screen.getByRole("button",{name:"Save information"}));await screen.findByRole("alert");expect(adminExternalListingsService.price).not.toHaveBeenCalled()});
});
