import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PublicLayout, { dynamic } from "@/app/[locale]/(public)/layout";

vi.mock("@/features/app-shell/PublicShell", () => ({ PublicShell: ({ children }: { children: React.ReactNode }) => <div data-testid="public-shell">{children}</div> }));

describe("public route HTML freshness", () => {
  it("opts client-backed public pages out of cross-release full-route HTML caching", () => {
    expect(dynamic).toBe("force-dynamic");
    render(<PublicLayout><p>Fixture child</p></PublicLayout>);
    expect(screen.getByTestId("public-shell").textContent).toBe("Fixture child");
  });
});
