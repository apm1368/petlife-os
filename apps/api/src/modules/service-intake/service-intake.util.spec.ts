import { validateIntakeAnswers, validateIntakeQuestions } from "./service-intake.util";

describe("intake forms", () => {
  const form = [
    { key: "behavior", type: "LONG_TEXT", label: "Behaviour concerns", required: false },
    { key: "bites", type: "YES_NO", label: "Has bitten before?", required: true },
    { key: "style", type: "SINGLE_CHOICE", label: "Cut style", required: true, options: ["Short", "Natural"] },
    { key: "extras", type: "MULTI_CHOICE", label: "Extras", required: false, options: ["Nails", "Ears", "Teeth"] },
  ];

  it("accepts a well-formed form and normalises it", () => {
    const r = validateIntakeQuestions(form);
    expect(r.errors).toEqual([]);
    expect(r.questions).toHaveLength(4);
  });

  it("refuses HTML, duplicates, bad keys and option misuse", () => {
    expect(validateIntakeQuestions([{ key: "a", type: "TEXT", label: "<b>x</b>" }]).errors).toHaveLength(1);
    expect(validateIntakeQuestions([{ key: "a", type: "TEXT", label: "x" }, { key: "a", type: "TEXT", label: "y" }]).errors[0]).toMatch(/duplicated/);
    expect(validateIntakeQuestions([{ key: "Bad Key", type: "TEXT", label: "x" }]).errors).toHaveLength(1);
    expect(validateIntakeQuestions([{ key: "a", type: "SINGLE_CHOICE", label: "x", options: ["only"] }]).errors).toHaveLength(1);
    expect(validateIntakeQuestions([{ key: "a", type: "TEXT", label: "x", options: ["a", "b"] }]).errors).toHaveLength(1);
    expect(validateIntakeQuestions([]).errors).toHaveLength(1);
    expect(validateIntakeQuestions(Array.from({ length: 16 }, (_, i) => ({ key: `q${i}`, type: "TEXT", label: "x" }))).errors).toHaveLength(1);
  });

  it("validates answers by type, options and required-ness", () => {
    const q = validateIntakeQuestions(form).questions!;
    expect(validateIntakeAnswers(q, { bites: false, style: "Short", extras: ["Nails", "Ears"], behavior: "  shy  " })).toEqual({ answers: { bites: false, style: "Short", extras: ["Nails", "Ears"], behavior: "shy" }, errors: [] });
    expect(validateIntakeAnswers(q, { style: "Short" }).errors).toEqual(["bites is required"]);
    expect(validateIntakeAnswers(q, { bites: "yes", style: "Mohawk" }).errors).toHaveLength(2);
    expect(validateIntakeAnswers(q, { bites: true, style: "Short", extras: ["Nails", "Nails"] }).errors).toHaveLength(1);
    expect(validateIntakeAnswers(q, { bites: true, style: "Short", unknown: "x" }).errors).toEqual(["unknown is not a question on this form"]);
    expect(validateIntakeAnswers(q, { bites: true, style: "Short", behavior: "x".repeat(2001) }).errors).toHaveLength(1);
  });
});
