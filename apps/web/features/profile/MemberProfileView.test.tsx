import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { MemberProfileView } from "./MemberProfileView";
import { usersService } from "@/services/users.service";
import { useSessionStore } from "@/stores/session-store";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/users.service", () => ({usersService:{getMe:vi.fn(),updateMe:vi.fn()}}));
const user={id:"u1",displayName:"Sarah",email:null,phone:null,avatarUrl:null,locale:"en" as const,themePreference:"SYSTEM" as const,createdAt:"",updatedAt:""};
beforeEach(()=>{vi.clearAllMocks();vi.mocked(usersService.getMe).mockResolvedValue(user);});
it("persists a profile edit and refreshes the shared identity",async()=>{
 vi.mocked(usersService.updateMe).mockResolvedValue({...user,displayName:"Sara"});
 renderWithIntl(<MemberProfileView/>);
 fireEvent.click(await screen.findByRole("button",{name:"Edit profile"}));
 fireEvent.change(screen.getByLabelText("Display name"),{target:{value:"Sara"}});
 fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
 await screen.findByText("Profile saved.");
 expect(usersService.updateMe).toHaveBeenCalledWith({displayName:"Sara"});
 expect(useSessionStore.getState().user?.displayName).toBe("Sara");
});
it("retains the editable value when saving fails",async()=>{
 vi.mocked(usersService.updateMe).mockRejectedValue(new Error("offline"));
 renderWithIntl(<MemberProfileView/>);
 fireEvent.click(await screen.findByRole("button",{name:"Edit profile"}));
 fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
 await screen.findByRole("alert");
 await waitFor(()=>expect(screen.getByRole("button",{name:"Save changes"})).not.toHaveProperty("disabled",true));
 expect(screen.getByLabelText("Display name")).toHaveProperty("value","Sarah");
});
