import {describe,expect,it,vi} from "vitest";
import {fireEvent,screen,waitFor} from "@testing-library/react";
import {renderWithIntl} from "@/test/render-with-intl";
import {externalSource} from "@/test/fixtures/external-source";
import {ExternalSourceConfigForm} from "./ExternalSourceConfigForm";
describe("ExternalSourceConfigForm",()=>{
 it("requires an audit reason and sends explicit validated settings",async()=>{const save=vi.fn().mockResolvedValue(undefined);renderWithIntl(<ExternalSourceConfigForm config={externalSource.config} busy={false} onSave={save}/>);fireEvent.change(screen.getByLabelText("Reason (at least 5 characters)"),{target:{value:"Adjust safe collection interval"}});fireEvent.click(screen.getByRole("button",{name:"Save settings with audit reason"}));await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({reason:"Adjust safe collection interval",requestDelayMinMs:1000,requestDelayMaxMs:2000,cityScopes:["Tehran"],autoPublish:false})));expect(save.mock.calls[0]![0]).not.toHaveProperty("concurrency")});
 it("rejects delay and lifecycle thresholds that contradict each other",async()=>{const save=vi.fn();renderWithIntl(<ExternalSourceConfigForm config={externalSource.config} busy={false} onSave={save}/>);fireEvent.change(screen.getByLabelText("Reason (at least 5 characters)"),{target:{value:"Review settings"}});fireEvent.change(screen.getByLabelText("Minimum request delay (milliseconds)"),{target:{value:"5000"}});fireEvent.click(screen.getByRole("button",{name:"Save settings with audit reason"}));await screen.findByRole("alert");expect(save).not.toHaveBeenCalled()});
});
