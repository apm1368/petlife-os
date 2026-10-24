import {describe,expect,it,vi} from "vitest";
import {fireEvent,render,screen} from "@testing-library/react";
import {Dialog} from "@petlife/ui";
describe("Controlled confirmation dialog",()=>{
 it("prevents native Escape dismissal when its controller keeps a pending operation open",()=>{const close=vi.fn();render(<Dialog open onClose={close} title="Pending confirmation"><p>Saving</p></Dialog>);const dialog=screen.getByRole("dialog");const event=new Event("cancel",{bubbles:true,cancelable:true});fireEvent(dialog,event);expect(close).toHaveBeenCalledTimes(1);expect(event.defaultPrevented).toBe(true);expect((dialog as HTMLDialogElement).open).toBe(true)});
});
