import {useState} from "react";
import {describe,expect,it,vi} from "vitest";
import {fireEvent,screen} from "@testing-library/react";
import {renderWithIntl} from "@/test/render-with-intl";
import {LocalDateTimeField} from "./LocalDateTimeField";
describe("LocalDateTimeField",()=>{
 it("uses a Jalali date and Persian time digits while preserving exact minutes in the API value",()=>{const change=vi.fn();renderWithIntl(<LocalDateTimeField label="زمان" value="2026-10-20T10:07" onChange={change}/>,"fa");expect(document.body.textContent).toContain("۱۴۰۵");const minute=screen.getByLabelText("دقیقه") as HTMLSelectElement;expect(minute.value).toBe("07");expect(minute.options[7]!.text).toBe("۰۷");fireEvent.change(minute,{target:{value:"13"}});expect(change).toHaveBeenCalledWith("2026-10-20T10:13")});
 it("clears optional times and prevents choosing a clock without a date",()=>{function Form(){const[value,setValue]=useState("2026-10-20T10:07");return <LocalDateTimeField label="Time" value={value} onChange={setValue}/>};renderWithIntl(<Form/>);fireEvent.click(screen.getByRole("button",{name:"Clear time"}));expect((screen.getByLabelText("Hour") as HTMLSelectElement).disabled).toBe(true);expect((screen.getByLabelText("Minute") as HTMLSelectElement).disabled).toBe(true);expect(screen.queryByRole("button",{name:"Clear time"})).toBeNull()});
});
