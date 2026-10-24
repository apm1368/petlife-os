import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Avatar } from "@petlife/ui";

describe("Avatar initials", () => {
  it.each([["سارا (QA)", "س"], ["Sara Vet", "SV"], ["(QA) Milo", "M"], ["", "?"]])("%s → %s", (name, expected) => {
    const { getByRole } = render(<Avatar name={name} />);
    expect(getByRole("img").textContent).toBe(expected);
  });
});
