import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { ProviderContextDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { authService } from "@/services/auth.service";
import { providerOsService } from "@/services/provider-os.service";
import { useProviderStore } from "@/stores/provider-store";
import { ProviderShell } from "./ProviderShell";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/en/provider",
}));
vi.mock("@/services/auth.service", () => ({ authService: { getSession: vi.fn() } }));
vi.mock("@/services/provider-os.service", () => ({ providerOsService: { getContext: vi.fn(), setContext: vi.fn() } }));

describe("ProviderShell", () => {
  beforeEach(() => {
    vi.mocked(authService.getSession).mockReset();
    vi.mocked(providerOsService.getContext).mockReset();
    useProviderStore.setState({ context: null, status: "idle" });
  });

  it("shows a clear message when the user has no provider membership", async () => {
    vi.mocked(authService.getSession).mockResolvedValue({ user: { id: "u1", email: "not-a-provider@example.com", phone: null, displayName: "Not A Provider", avatarUrl: null, locale: "en", themePreference: "SYSTEM", createdAt: "", updatedAt: "" } });
    vi.mocked(providerOsService.getContext).mockResolvedValue({ active: null, memberships: [] } satisfies ProviderContextDto);

    renderWithIntl(
      <ProviderShell>
        <div>content</div>
      </ProviderShell>,
    );

    await waitFor(() => expect(screen.getByText("No provider access")).toBeTruthy());
    expect(screen.queryByText("content")).toBeNull();
  });

  it("shows an organization picker when the user belongs to more than one organization", async () => {
    vi.mocked(authService.getSession).mockResolvedValue({ user: { id: "u1", email: "multi@example.com", phone: null, displayName: "Multi Org", avatarUrl: null, locale: "en", themePreference: "SYSTEM", createdAt: "", updatedAt: "" } });
    vi.mocked(providerOsService.getContext).mockResolvedValue({
      active: null,
      memberships: [
        { providerUserId: "pu-1", providerOrganizationId: "org-1", organizationName: "Org A", organizationType: "GROOMER" as never, verificationStatus: "VERIFIED" as never, role: "STAFF" as never },
        { providerUserId: "pu-2", providerOrganizationId: "org-2", organizationName: "Org B", organizationType: "GROOMER" as never, verificationStatus: "VERIFIED" as never, role: "STAFF" as never },
      ],
    } satisfies ProviderContextDto);

    renderWithIntl(
      <ProviderShell>
        <div>content</div>
      </ProviderShell>,
    );

    await waitFor(() => expect(screen.getByText("Choose an organization")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Org A" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Org B" })).toBeTruthy();
  });

  it("shows the shell header and content once an active organization is resolved", async () => {
    vi.mocked(authService.getSession).mockResolvedValue({ user: { id: "u1", email: "groomer@example.com", phone: null, displayName: "Groomer", avatarUrl: null, locale: "en", themePreference: "SYSTEM", createdAt: "", updatedAt: "" } });
    vi.mocked(providerOsService.getContext).mockResolvedValue({
      active: { providerUserId: "pu-1", providerOrganizationId: "org-1", organizationName: "Happy Paws Grooming", organizationType: "GROOMER" as never, verificationStatus: "VERIFIED" as never, role: "STAFF" as never },
      memberships: [{ providerUserId: "pu-1", providerOrganizationId: "org-1", organizationName: "Happy Paws Grooming", organizationType: "GROOMER" as never, verificationStatus: "VERIFIED" as never, role: "STAFF" as never }],
    } satisfies ProviderContextDto);

    renderWithIntl(
      <ProviderShell>
        <div>content</div>
      </ProviderShell>,
    );

    await waitFor(() => expect(screen.getByText("Happy Paws Grooming")).toBeTruthy());
    expect(screen.getByText("content")).toBeTruthy();
  });

  it("shows an operational-restriction banner when the organization is not verified", async () => {
    vi.mocked(authService.getSession).mockResolvedValue({ user: { id: "u1", email: "new-provider@example.com", phone: null, displayName: "New Provider", avatarUrl: null, locale: "en", themePreference: "SYSTEM", createdAt: "", updatedAt: "" } });
    vi.mocked(providerOsService.getContext).mockResolvedValue({
      active: { providerUserId: "pu-1", providerOrganizationId: "org-1", organizationName: "New Org", organizationType: "GROOMER" as never, verificationStatus: "SUBMITTED" as never, role: "OWNER" as never },
      memberships: [{ providerUserId: "pu-1", providerOrganizationId: "org-1", organizationName: "New Org", organizationType: "GROOMER" as never, verificationStatus: "SUBMITTED" as never, role: "OWNER" as never }],
    } satisfies ProviderContextDto);

    renderWithIntl(
      <ProviderShell>
        <div>content</div>
      </ProviderShell>,
    );

    await waitFor(() => expect(screen.getByText("This organization is not yet verified. Some actions are restricted.")).toBeTruthy());
  });
});
