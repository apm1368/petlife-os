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
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-02-01" } });
    fireEvent.click(screen.getByText("Save memory"));

    await waitFor(() => expect(memoriesService.create).toHaveBeenCalledWith("pet-1", expect.objectContaining({ title: "First trip to the beach", occurredAt: "2026-02-01" })));
    expect(push).toHaveBeenCalledWith("/pets/pet-1/memories/memory-9");
  });

  it("disables submit until both title and date are entered", () => {
    renderWithIntl(<CreateMemoryView petId="pet-1" />);

    const button = screen.getByText("Save memory").closest("button");
    expect(button?.disabled).toBe(true);
  });
});
