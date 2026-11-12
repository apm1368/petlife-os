import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { clinicClientsService } from "@/services/clinic-clients.service";
import { ClinicClients } from "./ClinicClients";

vi.mock("@/services/clinic-clients.service", () => ({
  clinicClientsService: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), addPet: vi.fn(), removePet: vi.fn(), message: vi.fn(), invite: vi.fn(), remind: vi.fn() },
}));

const client = { id: "c1", name: "Sara Ahmadi", phone: "+989121234567", email: null, notes: null, source: "MANUAL" as const, pets: [{ id: "p1", name: "Milo", species: "Cat", breed: null, birthDate: null, notes: null }], status: "CLINIC_ONLY" as const, invitedAt: null, joinedAt: null, smsOptOut: false, createdAt: "2026-11-12T08:00:00Z" };

describe("ClinicClients", () => {
  beforeEach(() => {
    vi.mocked(clinicClientsService.list).mockReset().mockResolvedValue({ smsMode: "SANDBOX", items: [client] });
    vi.mocked(clinicClientsService.get).mockReset().mockResolvedValue({ ...client, smsMode: "SANDBOX", messages: [], reminders: [] });
    vi.mocked(clinicClientsService.message).mockReset().mockResolvedValue({ smsMode: "SANDBOX", message: { id: "m1", kind: "MESSAGE", body: "x", status: "SIMULATED", failureReason: null, createdAt: "" } });
    vi.mocked(clinicClientsService.create).mockReset().mockResolvedValue({ ...client, id: "c2", name: "Reza" });
  });

  it("says plainly that SMS is in test mode and records a text as not delivered", async () => {
    renderWithIntl(<ClinicClients canRemind />);
    expect((await screen.findAllByText(/SMS is in test mode/)).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Sara Ahmadi/ }));
    fireEvent.change(await screen.findByLabelText("Message"), { target: { value: "Milo's vaccine is due" } });
    fireEvent.click(screen.getByRole("button", { name: "Send text" }));
    await waitFor(() => expect(clinicClientsService.message).toHaveBeenCalledWith("c1", "Milo's vaccine is due"));
    expect(await screen.findByText("Recorded in test mode — not delivered to the phone.")).toBeTruthy();
  });

  it("adds a client with their pets", async () => {
    renderWithIntl(<ClinicClients canRemind={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add client" }));
    fireEvent.change(screen.getByLabelText("Owner's name"), { target: { value: "Reza" } });
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "09121112233" } });
    fireEvent.change(screen.getByLabelText("Pet's name"), { target: { value: "Toto" } });
    fireEvent.click(screen.getByRole("button", { name: "Save client" }));
    await waitFor(() => expect(clinicClientsService.create).toHaveBeenCalledWith({ name: "Reza", phone: "09121112233", pets: [{ name: "Toto" }] }));
  });

  it.each(["fa", "de", "es"] as const)("renders in %s", async (locale) => {
    renderWithIntl(<ClinicClients canRemind />, locale);
    await screen.findByText("Sara Ahmadi");
    expect(document.body.textContent).not.toMatch(/SMS is in test mode|Add client/);
  });
});
