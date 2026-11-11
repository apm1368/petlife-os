"""Static route inventory, not a functional/localization/security acceptance test.

Only tracked page sources are read. No environment variables, source bodies,
dynamic identifiers or production/user data are written to the generated matrix.
"""
import argparse
from collections import Counter
import json
from pathlib import Path, PurePosixPath
import re
import subprocess

ROOT = Path(__file__).resolve().parents[3]
APP = "apps/web/app/"
PAGE = re.compile(r"(?:^|/)page\.(?:tsx|jsx|ts|js)$")


def describe(source):
    if not source.startswith(APP) or not PAGE.search(source):
        raise ValueError("Expected an app page source")
    parts = PurePosixPath(source[len(APP):]).parts[:-1]
    segments, groups, slots = [], [], []
    interception = False
    for part in parts:
        if part.startswith("@"):
            slots.append(part)
        elif part.startswith("(.)") or part.startswith("(..)") or part.startswith("(...)"):
            # Interception depends on navigation context, not an extra public URL.
            interception = True
            segments.append(part)
        elif part.startswith("(") and part.endswith(")"):
            groups.append(part)
        else:
            segments.append(part)
    kind = "intercepted" if interception else "parallel-slot" if slots else "page"
    template = "/" + "/".join(segments) if kind == "page" else None
    role_hint = next((name for name in ["admin", "seller", "provider", "app", "auth", "public"] if f"({name})" in groups), "unspecified")
    domain_segment = next((part for part in segments if part != "[locale]"), "landing")
    if kind != "page":
        domain_segment = "navigation-overlay"
    return {
        "source": source,
        "kind": kind,
        "routeTemplate": template,
        "routeGroups": groups,
        "parallelSlots": slots,
        "localized": "[locale]" in segments,
        "dynamic": any("[" in part and part != "[locale]" for part in segments),
        "familyHint": domain_segment,
        "roleHint": role_hint,
        "roleHintPolicy": "Path grouping only; not evidence of server authorization or public accessibility",
        "implementation": "SOURCE_PRESENT_NOT_RENDER_VERIFIED",
        "permissions": "NOT_INSPECTED",
        "apiDependencies": "NOT_INSPECTED",
        "actionsAndStates": "NOT_INSPECTED",
        "localization": {locale: "NOT_TESTED" for locale in ["fa", "en", "de", "es"]},
        "responsive": {mode: "NOT_TESTED" for mode in ["mobile", "tablet", "desktop"]},
        "display": {mode: "NOT_TESTED" for mode in ["light", "dark", "simplified"]},
        "designReference": "NOT_MAPPED",
        "functional": "NOT_TESTED",
        "accessibility": "NOT_TESTED",
        "security": "NOT_TESTED",
        "evidence": [],
        "nextAction": "Read linked dated QA evidence and perform change-impact analysis, then inspect permissions/actions/dependencies and test missing states; never replace NOT_TESTED from source presence alone",
    }


def build(root, sha):
    # Refuse to stamp a matrix with an unrelated revision or dirty app source.
    actual = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    if actual != sha:
        raise ValueError("Expected SHA differs from checkout HEAD")
    changed = subprocess.check_output(["git", "status", "--porcelain", "--", APP], cwd=root, text=True)
    if changed:
        raise ValueError("App sources have local changes; cannot assign clean revision evidence")
    files = subprocess.check_output(["git", "ls-files", "-z", "--", APP], cwd=root).decode().split("\0")
    rows = [describe(path) for path in sorted(files) if PAGE.search(path)]
    return {
        "schemaVersion": 1,
        "sourceSha": sha,
        "method": "Tracked Next app page files only; no browser/API test executed by this generator",
        "acceptancePolicy": "This is a discovery backlog, not a PASS matrix. Dates, fixtures, state results, tested SHAs and evidence must be recorded by actual tests. Reconcile existing evidence before running tests; do not blindly restart from zero.",
        "existingEvidence": ["https://github.com/apm1368/petlife-os/blob/ca325530/docs/qa/final6-followup-2026-11-10.json", "final6-release-results-2026-11-10.json", "final-6-2026-11-10.md", "../product/localization-rollout.md"],
        "pageSourceCount": len(rows),
        "kinds": dict(sorted(Counter(row["kind"] for row in rows).items())),
        "familyHints": dict(sorted(Counter(row["familyHint"] for row in rows).items())),
        "limitation": "Templates are not confirmed routable URLs. Dynamic parameters need authorized fixtures; parallel/intercepted pages require navigation-context testing. Group-derived role hints must not be used as permission rules. Existing scoped PASS evidence is not automatically expanded to every state of a matching route.",
        "routes": rows,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    matrix = build(ROOT, args.sha)
    Path(args.output).write_text(json.dumps(matrix, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"sources": matrix["pageSourceCount"], "kinds": matrix["kinds"], "status": "INVENTORY_ONLY_NOT_ACCEPTANCE"}))
