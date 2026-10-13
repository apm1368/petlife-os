import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OtpInput } from "@petlife/ui";

function Harness() {
  const [value, setValue] = useState("");
  return <OtpInput value={value} onChange={setValue} />;
}

describe("OtpInput localized digits", () => {
  it.each(["۱۲۳۴۵۶", "١٢٣٤٥٦", "123456"])("accepts typing %s", (value) => {
    render(<Harness />);
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    [...value].forEach((digit, index) => fireEvent.change(inputs[index]!, { target: { value: digit } }));
    expect(inputs.map((input) => input.value).join("")).toBe("123456");
  });
  it.each(["۱۲۳۴۵۶", "١٢٣٤٥٦", "code: ۱۲۳۴۵۶۷"])("accepts pasting %s", (value) => {
    render(<Harness />);
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    fireEvent.paste(inputs[0]!, { clipboardData: { getData: () => value } });
    expect(inputs.map((input) => input.value).join("")).toBe("123456");
    expect(document.activeElement).toBe(inputs[5]);
  });
});
