import { describe, expect, it } from "vitest";
import fa from "@/messages/fa.json";
import en from "@/messages/en.json";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Every NotificationCategory value in the database enum must have a label — a raw "notifications.category.X" key once reached members. */
const schema = readFileSync(join(__dirname, "..", "..", "api", "prisma", "schema.prisma"), "utf8");
const DB_CATEGORIES = schema.match(/enum NotificationCategory \{([^}]*)\}/)![1]!.split("\n").map((l) => l.trim()).filter((l) => /^[A-Z_]+$/.test(l));

describe("notification category labels", () => {
  it.each([["fa", fa], ["en", en]] as const)("%s labels every category", (_locale, messages) => {
    const labels = (messages as { notifications: { category: Record<string, string> } }).notifications.category;
    for (const c of DB_CATEGORIES) expect(labels[c], c).toBeTruthy();
  });
});
