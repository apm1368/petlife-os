"""Adversarial browser-local internal GET fixtures on deployed JS; NOT real feed/API acceptance.

No account, post or provider record is created. Every unsafe request is aborted.
The synthetic list responses exist only inside this disposable browser context.
"""
import argparse
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from urllib.request import urlopen
from playwright.async_api import async_playwright

BASE = "https://opetlife.ir"


def version():
    with urlopen(BASE + "/api/health/version", timeout=20) as response:
        return json.loads(response.read()).get("sha")


def fixture(title):
    return {"items": [{"id": "qa-browser-local-only", "authorDisplayName": "QA fixture — not a real user", "type": "GENERAL", "title": title, "body": "Synthetic browser-local fixture; not published or imported.", "pet": None, "createdAt": "2026-01-01T00:00:00.000Z", "commentCount": 0, "reactionCount": 0}], "total": 1, "page": 1, "pageSize": 20}


async def run(args):
    if version() != args.expected_sha:
        raise SystemExit("BLOCKED: unexpected production SHA")
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    rows = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox", "--disable-dev-shm-usage"])
        for locale in args.locales:
            context = await browser.new_context(viewport={"width": 390, "height": 844}, reduced_motion="reduce")
            older_started, release_older = asyncio.Event(), asyncio.Event()
            mutations = []

            async def intercept(route):
                request = route.request
                if request.method not in ["GET", "HEAD", "OPTIONS"]:
                    mutations.append(request.method)
                    await route.abort()
                    return
                parsed = urlsplit(request.url)
                if parsed.netloc == "opetlife.ir" and parsed.path == "/api/community/posts":
                    topic = parse_qs(parsed.query).get("type", [""])[0]
                    if topic == "QUESTION":
                        older_started.set()
                        await release_older.wait()
                    title = "Obsolete fixture result" if topic == "QUESTION" else "Newest fixture result" if topic == "GENERAL" else "Initial fixture result"
                    await route.fulfill(status=200, content_type="application/json", body=json.dumps(fixture(title)))
                    return
                await route.continue_()

            await context.route("**/*", intercept)
            page = await context.new_page()
            await page.goto(f"{BASE}/{locale}/community", wait_until="networkidle")
            await page.get_by_text("Initial fixture result", exact=True).wait_for()
            topic = page.locator("main select").first
            await topic.select_option("QUESTION")
            await asyncio.wait_for(older_started.wait(), timeout=10)
            await topic.select_option("GENERAL")
            await page.get_by_text("Newest fixture result", exact=True).wait_for()
            async with page.expect_response(lambda r: urlsplit(r.url).path == "/api/community/posts" and "type=QUESTION" in r.url) as pending:
                release_older.set()
            await (await pending.value).json()
            # Wait for browser rendering after the old JSON promise resolves;
            # do not accept the still-current pre-response DOM as a race PASS.
            await page.evaluate("()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))")
            latest = await page.get_by_text("Newest fixture result", exact=True).is_visible()
            obsolete = await page.get_by_text("Obsolete fixture result", exact=True).is_visible()
            selected = await topic.input_value()
            screenshot = f"{locale}-browser-local-fixture.png"
            await page.screenshot(path=str(output / screenshot), full_page=True)
            rows.append({"testId": f"QA-COMMUNITY-RACE-BROWSER-{locale}", "dateUtc": datetime.now(timezone.utc).isoformat(), "sha": args.expected_sha, "environment": "Deployed JS plus isolated browser-local mocked internal GET responses; NOT real API/feed acceptance", "browser": browser.version, "viewport": [390, 844], "route": f"/{locale}/community", "expected": "GENERAL selected, newest result remains, obsolete result absent after older response completes", "selectedTopic": selected, "newestVisible": latest, "obsoleteVisible": obsolete, "mutationMethodsAborted": list(mutations), "status": "PASS" if selected == "GENERAL" and latest and not obsolete and not mutations else "FAIL", "verification": "FIXTURE_ONLY_NOT_LIVE_FLOW", "evidence": screenshot})
            await context.close()
        await browser.close()
    if version() != args.expected_sha:
        raise SystemExit("BLOCKED: production changed during test")
    (output / "results.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2))
    failed = sum(row["status"] != "PASS" for row in rows)
    print(json.dumps({"cases": len(rows), "failed": failed, "verification": "FIXTURE_ONLY_NOT_LIVE_FLOW", "output": str(output)}))
    return 1 if failed else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-sha", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--locales", nargs="+", choices=["fa", "en", "de", "es"], default=["fa", "en", "de", "es"])
    raise SystemExit(asyncio.run(run(parser.parse_args())))
