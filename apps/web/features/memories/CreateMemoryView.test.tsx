import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { memoriesService } from "@/services/memories.service";
import { CreateMemoryView } from "./CreateMemoryView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/memories.service", () => ({ memoriesService: { create: vi.fn(), requestMediaUpload: vi.fn() } }));

describe("CreateMemoryView", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(memoriesService.create).mockReset();
  });

  it("submits the memory and navigates to its detail page", async () => {
    vi.mocked(memoriesService.create).mockResolvedValue({ id: "memory-9" } as never);

    renderWithIntl(<CreateMemoryView petId="pet-1" />);

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "First trip to the beach" } });
    // The canonical date picker: open the field, choose the 1st of this month, apply.
    const firstOfMonth = new Date().toISOString().slice(0, 8) + "01";
    fireEvent.click(screen.getByRole("button", { name: /^Date/ }));
    fireEvent.click(document.querySelector(`[data-iso="${firstOfMonth}"]`)!);
    fireEvent.click(screen.getByRole("button", { name: "Apply dates" }));
    fireEvent.click(screen.getByText("Save memory"));

    await waitFor(() => expect(memoriesService.create).toHaveBeenCalledWith("pet-1", expect.objectContaining({ title: "First trip to the beach", occurredAt: new Date().toISOString().slice(0, 8) + "01" })));
    expect(push).toHaveBeenCalledWith("/pets/pet-1/memories/memory-9");
  });

  it("allows a quick entry with no title — the date defaults to today so submit is enabled by default", () => {
    renderWithIntl(<CreateMemoryView petId="pet-1" />);

    const button = screen.getByText("Save memory").closest("button");
    expect(button?.disabled).toBe(false);
  });

  it("disables submit only if the date is cleared", () => {
    renderWithIntl(<CreateMemoryView petId="pet-1" />);

    fireEvent.click(screen.getByRole("button", { name: /^Date/ }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    const button = screen.getByText("Save memory").closest("button");
    expect(button?.disabled).toBe(true);
  });

  it("submits without a title, per the quick-entry spec", async () => {
    vi.mocked(memoriesService.create).mockResolvedValue({ id: "memory-10" } as never);

    renderWithIntl(<CreateMemoryView petId="pet-1" />);
    fireEvent.click(screen.getByText("Save memory"));

    await waitFor(() => expect(memoriesService.create).toHaveBeenCalledWith("pet-1", expect.objectContaining({ title: undefined })));
  });
});
