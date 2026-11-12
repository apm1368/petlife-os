import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { CustomerAddressDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { addressesService } from "@/services/addresses.service";
import { householdsService } from "@/services/households.service";
import { AddressBookView } from "./AddressBookView";

vi.mock("@/services/addresses.service", () => ({ addressesService: { list: vi.fn(), create: vi.fn(), update: vi.fn(), archive: vi.fn() } }));
vi.mock("@/services/households.service", () => ({ householdsService: { listMine: vi.fn() } }));

const home: CustomerAddressDto = { id: "a1", householdId: "h1", label: "Home", recipient: "Sara", phone: "09120000000", addressLine: "Valiasr St 10", city: "Tehran", region: null, area: "Vanak", countryCode: "IR", latitude: 35.75, longitude: 51.41, instructions: null, postalCode: "1234567890", isDefault: true };
const work: CustomerAddressDto = { ...home, id: "a2", label: "Work", area: null, latitude: null, longitude: null, isDefault: false };

describe("AddressBookView", () => {
  beforeEach(() => {
    vi.mocked(householdsService.listMine).mockReset().mockResolvedValue([{ id: "h1" }] as never);
    vi.mocked(addressesService.list).mockReset().mockResolvedValue([home, work]);
    vi.mocked(addressesService.archive).mockReset();
    vi.mocked(addressesService.create).mockReset();
  });

  it("lists the household's addresses with the default, neighbourhood and map point", async () => {
    renderWithIntl(<AddressBookView />, "en");
    expect(await screen.findByText("Home")).toBeTruthy();
    expect(screen.getByText("Default")).toBeTruthy();
    expect(screen.getByText(/Tehran، Vanak، Valiasr St 10/)).toBeTruthy();
    expect(screen.getAllByText("Has a map point")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Make default" })).toHaveLength(1);
  });

  it("removes an address and moves the default to the one the API names", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(addressesService.archive).mockResolvedValue({ archived: true, newDefaultId: "a2" });
    renderWithIntl(<AddressBookView />, "en");
    await screen.findByText("Home");
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]!);
    await waitFor(() => expect(addressesService.archive).toHaveBeenCalledWith("a1"));
    expect(await screen.findByText("Address removed.")).toBeTruthy();
    expect(screen.queryByText("Home")).toBeNull();
    expect(screen.getByText("Default")).toBeTruthy();
  });

  it("adds an address with Latin postal digits and the neighbourhood", async () => {
    vi.mocked(addressesService.list).mockResolvedValue([]);
    vi.mocked(addressesService.create).mockResolvedValue({ ...home, id: "a3" });
    renderWithIntl(<AddressBookView />, "fa");
    fireEvent.click(await screen.findByRole("button", { name: "افزودن نشانی" }));
    fireEvent.change(screen.getByLabelText("شهر"), { target: { value: "تهران" } });
    fireEvent.change(screen.getByLabelText("محله"), { target: { value: "ونک" } });
    fireEvent.change(screen.getByLabelText("نشانی کامل (خیابان، کوچه، پلاک، واحد)"), { target: { value: "ولیعصر ۱۰" } });
    fireEvent.change(screen.getByLabelText("کد پستی ۱۰ رقمی"), { target: { value: "۱۲۳۴۵۶۷۸۹۰" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیرهٔ نشانی" }));
    await waitFor(() => expect(addressesService.create).toHaveBeenCalled());
    expect(vi.mocked(addressesService.create).mock.calls[0]![0]).toMatchObject({ householdId: "h1", city: "تهران", area: "ونک", postalCode: "1234567890", countryCode: "IR", isDefault: true });
  });
});
