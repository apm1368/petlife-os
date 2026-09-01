import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { ProviderTeamMemberDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { providerOsService } from "@/services/provider-os.service";
import { ProviderTeamView } from "./ProviderTeamView";

vi.mock("@/services/provider-os.service", () => ({ providerOsService: { listTeam: vi.fn() } }));

describe("ProviderTeamView", () => {
  beforeEach(() => {
    vi.mocked(providerOsService.listTeam).mockReset();
  });

  it("lists team members with their role", async () => {
    const members: ProviderTeamMemberDto[] = [
      { providerUserId: "pu-1", displayName: "Dr. Sara Vet", role: "VET" as never, displayTitle: "DVM", status: "ACTIVE", createdAt: "2026-01-01T00:00:00.000Z" },
      { providerUserId: "pu-2", displayName: "Reception Staff", role: "STAFF" as never, displayTitle: "Front Desk", status: "ACTIVE", createdAt: "2026-01-01T00:00:00.000Z" },
    ];
    vi.mocked(providerOsService.listTeam).mockResolvedValue(members);

    renderWithIntl(<ProviderTeamView />);

    await waitFor(() => expect(screen.getByText("Dr. Sara Vet")).toBeTruthy());
    expect(screen.getByText("Reception Staff")).toBeTruthy();
    expect(screen.getByText("Vet")).toBeTruthy();
    expect(screen.getByText("Staff")).toBeTruthy();
  });

  it("shows an empty state with no members", async () => {
    vi.mocked(providerOsService.listTeam).mockResolvedValue([]);

    renderWithIntl(<ProviderTeamView />);

    await waitFor(() => expect(screen.getByText("No team members yet.")).toBeTruthy());
  });
});
