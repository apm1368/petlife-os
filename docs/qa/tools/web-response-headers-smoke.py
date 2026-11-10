"""Read-only owned public HTML headers and disposable same/cross-origin frames.

No private routes, records, writes, credentials or external sites are used.
Only an existing empty public FAQ is captured; changed content blocks the check.
"""
import argparse
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.request import urlopen
from playwright.async_api import async_playwright

BASE = "https://opetlife.ir"
ROOT = Path(__file__).resolve().parents[3]


def version():
    with urlopen(BASE + "/api/health/version", timeout=20) as response:
        return json.loads(response.read()).get("sha")


async def run(args):
    if version() != args.expected_sha:
        raise SystemExit("BLOCKED: unexpected production SHA")
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    rows = []
    expected = {"X-Content-Type-Options": "nosniff", "X-Frame-Options": "SAMEORIGIN", "Referrer-Policy": "strict-origin-when-cross-origin", "Content-Security-Policy": "frame-ancestors 'self'"}
    for route in ["/en/help/faq", "/de/legal", "/es/register"]:
        with urlopen(BASE + route, timeout=20) as response:
            headers = {key: response.headers.get(key) for key in expected}
            rows.append({"testId": "QA-WEB-HEADERS-" + route, "route": route, "http": response.status, "expected": expected, "observed": headers, "status": "PASS" if response.status == 200 and headers == expected else "FAIL"})
    copy = json.loads((ROOT / "apps/web/messages/en.json").read_text())["publicHelp"]["noFaq"]
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox", "--disable-dev-shm-usage"])
        context = await browser.new_context(viewport={"width": 1024, "height": 900})
        mutations = []

        async def safe_request(route):
            if route.request.method not in ["GET", "HEAD", "OPTIONS"]:
                mutations.append(route.request.method)
                await route.abort()
            else:
                await route.continue_()

        await context.route("**/*", safe_request)
        same = await context.new_page()
        await same.goto(BASE + "/en/help/faq", wait_until="networkidle")
        await same.get_by_text(copy, exact=True).wait_for()
        await same.evaluate("""() => {const frame=document.createElement('iframe');frame.id='qa-same';frame.title='QA disposable same-origin frame';frame.src='/en/help/faq';document.body.append(frame)}""")
        same_loaded = False
        try:
            await same.frame_locator("#qa-same").get_by_text(copy, exact=True).wait_for(timeout=15000)
            same_loaded = True
        except Exception:
            pass
        rows.append({"testId": "QA-WEB-FRAME-SAME", "route": "/en/help/faq", "expected": "Same-origin public frame remains usable", "sameOriginLoaded": same_loaded, "status": "PASS" if same_loaded else "FAIL"})
        cross = await context.new_page()
        blocked = asyncio.Event()
        cross.on("console", lambda msg: blocked.set() if "frame-ancestors" in msg.text or "X-Frame-Options" in msg.text else None)
        # New about:blank parent is an opaque, non-site origin. set_content on
        # an already-owned page would retain that origin and be an invalid test.
        await cross.set_content('<h1>QA disposable cross-origin frame</h1><iframe id="qa-cross" title="QA frame" src="https://opetlife.ir/en/help/faq" width="800" height="700"></iframe>')
        load_task = asyncio.create_task(cross.frame_locator("#qa-cross").get_by_text(copy, exact=True).wait_for(timeout=15000))
        blocked_task = asyncio.create_task(blocked.wait())
        done, pending = await asyncio.wait([load_task, blocked_task], timeout=16, return_when=asyncio.FIRST_COMPLETED)
        loaded = load_task in done and not load_task.cancelled() and load_task.exception() is None
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        rows.append({"testId": "QA-WEB-FRAME-CROSS", "route": "/en/help/faq", "expected": "Actual browser refuses framing by a non-site origin", "crossOriginLoaded": loaded, "framePolicyBlocked": blocked.is_set(), "status": "PASS" if blocked.is_set() and not loaded else "FAIL", "limitation": "Public FAQ framing only; no private account, clickjacking exploit or clinical preview acceptance"})
        if loaded or blocked.is_set():
            await cross.screenshot(path=str(output / "disposable-cross-origin-frame.png"))
            rows[-1]["evidence"] = "disposable-cross-origin-frame.png"
        await context.close()
        await browser.close()
    if version() != args.expected_sha:
        raise SystemExit("BLOCKED: production changed during test")
    for row in rows:
        row.update({"sha": args.expected_sha, "environment": "production public read-only plus disposable browser-local frame parents", "dateUtc": datetime.now(timezone.utc).isoformat(), "mutationMethodsAborted": list(mutations)})
        if mutations:
            row["status"] = "FAIL"
    (output / "results.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2))
    failed = sum(row["status"] != "PASS" for row in rows)
    print(json.dumps({"cases": len(rows), "failed": failed, "output": str(output)}))
    return 1 if failed else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-sha", required=True)
    parser.add_argument("--output-dir", required=True)
    raise SystemExit(asyncio.run(run(parser.parse_args())))
