/**
 * Intake forms are plain structured data — never HTML. A provider defines up to 15 questions; an owner's answers
 * are validated against exactly the version they were shown.
 */
export const INTAKE_QUESTION_TYPES = ["TEXT", "LONG_TEXT", "YES_NO", "SINGLE_CHOICE", "MULTI_CHOICE"] as const;
export type IntakeQuestionType = (typeof INTAKE_QUESTION_TYPES)[number];
export interface IntakeQuestion {
  key: string;
  type: IntakeQuestionType;
  label: string;
  required: boolean;
  options?: string[];
}
export type IntakeAnswer = string | boolean | string[];

const KEY = /^[a-z0-9_]{1,40}$/;
const TEXT_MAX: Record<string, number> = { TEXT: 200, LONG_TEXT: 2000 };

/** Returns a normalised copy, or the list of problems. */
export function validateIntakeQuestions(raw: unknown): { questions?: IntakeQuestion[]; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 15) return { errors: ["questions must be 1–15 items"] };
  const seen = new Set<string>();
  const questions: IntakeQuestion[] = [];
  raw.forEach((q, i) => {
    if (!q || typeof q !== "object") return void errors.push(`questions[${i}] must be an object`);
    const { key, type, label, required, options } = q as Record<string, unknown>;
    if (typeof key !== "string" || !KEY.test(key)) errors.push(`questions[${i}].key must match ${KEY}`);
    else if (seen.has(key)) errors.push(`questions[${i}].key is duplicated`);
    else seen.add(key);
    if (!INTAKE_QUESTION_TYPES.includes(type as IntakeQuestionType)) errors.push(`questions[${i}].type is invalid`);
    if (typeof label !== "string" || !label.trim() || label.length > 200 || /[<>]/.test(label)) errors.push(`questions[${i}].label must be 1–200 plain characters`);
    if (required !== undefined && typeof required !== "boolean") errors.push(`questions[${i}].required must be boolean`);
    const choice = type === "SINGLE_CHOICE" || type === "MULTI_CHOICE";
    if (choice) {
      if (!Array.isArray(options) || options.length < 2 || options.length > 10 || options.some((o) => typeof o !== "string" || !o.trim() || o.length > 80 || /[<>]/.test(o)) || new Set(options).size !== options.length) {
        errors.push(`questions[${i}].options must be 2–10 distinct plain strings`);
      }
    } else if (options !== undefined) errors.push(`questions[${i}].options is only for choice questions`);
    questions.push({ key: String(key), type: type as IntakeQuestionType, label: String(label ?? "").trim(), required: required === true, ...(choice ? { options: (options as string[]).map((o) => o.trim()) } : {}) });
  });
  return errors.length ? { errors } : { questions, errors };
}

/** Validates owner answers against a form version. Unknown keys are refused; empty optional answers are dropped. */
export function validateIntakeAnswers(questions: IntakeQuestion[], raw: unknown): { answers?: Record<string, IntakeAnswer>; errors: string[] } {
  const errors: string[] = [];
  const input = raw === undefined || raw === null ? {} : raw;
  if (typeof input !== "object" || Array.isArray(input)) return { errors: ["intakeAnswers must be an object"] };
  const given = input as Record<string, unknown>;
  for (const k of Object.keys(given)) if (!questions.some((q) => q.key === k)) errors.push(`${k} is not a question on this form`);
  const answers: Record<string, IntakeAnswer> = {};
  for (const q of questions) {
    const v = given[q.key];
    const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    if (empty) {
      if (q.required) errors.push(`${q.key} is required`);
      continue;
    }
    switch (q.type) {
      case "TEXT":
      case "LONG_TEXT":
        if (typeof v !== "string" || v.trim().length > TEXT_MAX[q.type]!) errors.push(`${q.key} must be text up to ${TEXT_MAX[q.type]} characters`);
        else answers[q.key] = v.trim();
        break;
      case "YES_NO":
        if (typeof v !== "boolean") errors.push(`${q.key} must be true or false`);
        else answers[q.key] = v;
        break;
      case "SINGLE_CHOICE":
        if (typeof v !== "string" || !q.options!.includes(v)) errors.push(`${q.key} must be one of the options`);
        else answers[q.key] = v;
        break;
      case "MULTI_CHOICE":
        if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !q.options!.includes(x)) || new Set(v).size !== v.length) errors.push(`${q.key} must be distinct options`);
        else answers[q.key] = v as string[];
        break;
    }
  }
  return errors.length ? { errors } : { answers, errors };
}
