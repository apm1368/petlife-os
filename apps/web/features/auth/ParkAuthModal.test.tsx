import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ParkAuthModal } from "./ParkAuthModal";
import { AuthModalOrigin } from "./AuthModalOrigin";
import { parkAuthCopy } from "./park-auth-copy";
import { storyCopy } from "@/features/landing/story-copy";
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
beforeEach(() => { replace.mockClear(); window.history.replaceState({}, "", "/fa"); });
afterEach(() => { document.body.style.overflow = ""; });

describe("Park auth overlay", () => {
  it.each(["fa", "en"] as const)("opens a labelled %s native modal and restores body scrolling on unmount", locale => {
    document.body.style.overflow = "clip";
    const { unmount } = renderWithIntl(<ParkAuthModal><input aria-label="Username" /></ParkAuthModal>, locale);
    const dialog = screen.getByRole("dialog", { name: parkAuthCopy[locale].title }) as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent(dialog, new Event("cancel", { bubbles: true, cancelable: true }));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(`/${locale}`, { scroll: false });
    fireEvent.click(screen.getByRole("button", { name: parkAuthCopy[locale].close }));
    expect(replace).toHaveBeenCalledTimes(1);
    unmount();
    expect(document.body.style.overflow).toBe("clip");
  });
  it("closes a multi-step flow to the originating page and preserves its filters", () => {
    window.history.replaceState({}, "", "/fa/services/GROOMING?city=Tehran#results");
    renderWithIntl(<AuthModalOrigin><a href="/fa/auth" onClick={event => event.preventDefault()}>Sign in</a><ParkAuthModal registration><p>Existing form</p></ParkAuthModal></AuthModalOrigin>);
    fireEvent.click(screen.getByRole("link", { name: "Sign in" }));
    fireEvent.click(screen.getByRole("button", { name: parkAuthCopy.en.close }));
    expect(replace).toHaveBeenCalledWith("/fa/services/GROOMING?city=Tehran#results", { scroll: false });
  });
  it("does not dismiss when clicking inside the form", () => {
    renderWithIntl(<ParkAuthModal><button type="button">Existing submit</button></ParkAuthModal>);
    fireEvent.click(screen.getByRole("button", { name: "Existing submit" }));
    expect(replace).not.toHaveBeenCalled();
  });
  it("keeps both new copy dictionaries aligned across locales", () => {
    const keys = (value: object, prefix = ""): string[] => Object.entries(value).flatMap(([key, child]) => typeof child === "object" && child !== null ? keys(child, `${prefix}${key}.`) : [`${prefix}${key}`]).sort();
    expect(keys(parkAuthCopy.fa)).toEqual(keys(parkAuthCopy.en));
    expect(keys(storyCopy.fa)).toEqual(keys(storyCopy.en));
  });
});
