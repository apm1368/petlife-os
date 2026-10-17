import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { AdminTaskDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminService } from "@/services/admin.service";
import { AdminTasksView } from "./AdminTasksView";
vi.mock("@/services/admin.service", () => ({ adminService: { listTasks:vi.fn(),createTask:vi.fn(),updateTask:vi.fn() } }));
const task = {id:"t1",title:"بررسی مدارک کلینیک نمونه",description:"پیگیری مدرک",assigneeAdmin:{id:"a1",displayName:"کارشناس نمونه",role:"VERIFICATION"},dueAt:"2026-10-22T10:00:00Z",status:"BLOCKED",priority:"HIGH",source:"PARTNER_VERIFICATION",team:"PARTNER_OPERATIONS",relatedEntityType:"PROVIDER_ORGANIZATION",relatedEntityId:"org1",createdByAdmin:null,completedAt:null,createdAt:"2026-10-17T07:00:00Z",updatedAt:"2026-10-17T07:00:00Z"} as AdminTaskDto;
describe("Admin task presentation", () => {
 beforeEach(() => {vi.resetAllMocks();vi.mocked(adminService.listTasks).mockResolvedValue({items:[task],total:1,page:1,pageSize:50});});
 it.each(["fa","en"] as const)("localizes every supported status without missing-message errors in %s", async locale => {
  const error = vi.spyOn(console,"error");
  try {
   renderWithIntl(<AdminTasksView />, locale);await screen.findByText(task.title);
   const select=screen.getByRole("combobox") as HTMLSelectElement;
   expect(select.options).toHaveLength(5);expect(select.value).toBe("BLOCKED");
   expect(Array.from(select.options).map(o=>o.text)).toContain(locale==="fa"?"نیازمند رفع مانع":"Blocked");
   expect(error).not.toHaveBeenCalled();
  } finally {error.mockRestore();}
 });
 it("uses the returned assignee, priority and source, and a Jalali due date on Persian pages", async () => {
  renderWithIntl(<AdminTasksView />, "fa");await screen.findByText(task.title);
  expect(screen.getByText("کارشناس نمونه")).toBeTruthy();expect(screen.getByText("بالا")).toBeTruthy();expect(screen.getByText("بررسی مدارک همکاران")).toBeTruthy();
  expect(screen.getByText(/۱۴۰۵/).textContent).not.toContain("2026");
 });
 it("keeps a failed create draft and does not retry the mutation automatically", async () => {
  vi.mocked(adminService.createTask).mockRejectedValue(new Error("offline"));
  renderWithIntl(<AdminTasksView />, "en");await screen.findByText(task.title);fireEvent.click(screen.getByRole("button",{name:"New task"}));
  fireEvent.change(screen.getByLabelText("Title"),{target:{value:"Follow up"}});fireEvent.change(screen.getByLabelText("Description"),{target:{value:"Keep this draft"}});fireEvent.click(screen.getByRole("button",{name:"Create"}));
  expect((await screen.findByRole("alert")).textContent).toContain("Your title and description are kept");
  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Follow up");expect((screen.getByLabelText("Description") as HTMLInputElement).value).toBe("Keep this draft");expect(adminService.createTask).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button",{name:"Check task list"}));await waitFor(()=>expect(adminService.listTasks).toHaveBeenCalledTimes(2));expect(adminService.createTask).toHaveBeenCalledTimes(1);expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Follow up");
 });
 it("keeps the recorded status visible if saving the change fails", async () => {
  vi.mocked(adminService.updateTask).mockRejectedValue(new Error("offline"));renderWithIntl(<AdminTasksView />, "en");await screen.findByText(task.title);
  fireEvent.change(screen.getByRole("combobox"),{target:{value:"DONE"}});expect((await screen.findByRole("alert")).textContent).toContain("not confirmed");expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("BLOCKED");expect(adminService.updateTask).toHaveBeenCalledTimes(1);
 });
 it("blocks repeat changes while the status save is pending", async () => {
  let resolve!: (value:never)=>void;vi.mocked(adminService.updateTask).mockImplementation(()=>new Promise(r=>{resolve=r;}));
  renderWithIntl(<AdminTasksView />, "en");await screen.findByText(task.title);fireEvent.change(screen.getByRole("combobox"),{target:{value:"DONE"}});
  expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(true);resolve(task as never);await waitFor(()=>expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(false));
 });
 it("does not invent an assignee, deadline or source for missing metadata", async () => {
  vi.mocked(adminService.listTasks).mockResolvedValue({items:[{...task,assigneeAdmin:null,dueAt:null,source:undefined}],total:1,page:1,pageSize:50});
  renderWithIntl(<AdminTasksView />, "en");await screen.findByText(task.title);expect(screen.getByText("Not assigned yet")).toBeTruthy();expect(screen.getByText("No deadline set")).toBeTruthy();expect(screen.getByText("Not recorded")).toBeTruthy();
 });
});
