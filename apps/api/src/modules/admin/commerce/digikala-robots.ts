/** Minimal fail-closed robots matcher for the exact source paths this importer visits. */
export function robotsDisallowsPath(robotsText: string, pathnameAndQuery: string, userAgent = "PetLifeDemoTravelCrawler"): boolean {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let current: { agents: string[]; rules: Array<{ allow: boolean; path: string }> } | null = null;
  for (const raw of robotsText.split(/\r?\n/)) {
    const line = raw.split("#", 1)[0]?.trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "user-agent") {
      if (!current || current.rules.length) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
    } else if ((key === "disallow" || key === "allow") && current && value) {
      current.rules.push({ allow: key === "allow", path: value });
    }
  }
  const agent = userAgent.toLowerCase();
  const matching = groups.filter((g) => g.agents.some((a) => a === "*" || a !== "*" && agent.includes(a)));
  const specificity = Math.max(0, ...matching.flatMap((g) => g.agents.filter((a) => a !== "*").map((a) => a.length)));
  const selected = matching.filter((g) => g.agents.some((a) => a === "*" || a.length === specificity));
  const rules = selected.flatMap((g) => g.rules)
    .map((rule) => ({ ...rule, regex: new RegExp(`^${rule.path.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}`) }))
    .filter((rule) => rule.regex.test(pathnameAndQuery))
    .sort((a, b) => b.path.length - a.path.length);
  if (!rules.length) return false;
  const longest = rules[0]!.path.length;
  const mostSpecific = rules.filter((r) => r.path.length === longest);
  return !mostSpecific.some((r) => r.allow);
}
