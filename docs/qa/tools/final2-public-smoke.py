"""Bounded read-only production checks, not full booking/localization acceptance.

Requires Playwright and Chromium. Never submits a booking or payment. Example:
python docs/qa/tools/final2-public-smoke.py --expected-sha SHA --output-dir /tmp/final2-SHA
"""
import argparse
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, build_opener, urlopen

from playwright.async_api import TimeoutError as BrowserTimeoutError, async_playwright

BASE = "https://opetlife.ir"
MISSING = "00000000-0000-4000-8000-000000000001"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def read_json(path):
    # urllib inherits the environment's proxy/CA policy; Playwright's standalone
    # request context may not. Do not log response headers/cookies or private bodies.
    with urlopen(BASE + path, timeout=20) as response:
        return json.loads(response.read(1_000_000))


async def run(args):
    version = read_json("/api/health/version")
    if version.get("sha") != args.expected_sha:
        raise SystemExit("NOT LIVE: production SHA differs from expected; no browser PASS recorded")
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    rows = []

    def record(test_id, actual, passed):
        rows.append({"testId": test_id, "environment": "production", "sha": args.expected_sha,
                     "dateUtc": datetime.now(timezone.utc).isoformat(), "role": "anonymous",
                     "status": "PASS" if passed else "FAIL", "actual": actual})

    ready = read_json("/api/health/ready")
    record("FINAL2-PROD-READY", ready, ready.get("status") == "ok")
    for path in ["/api/bookings", "/api/me/external-stays/favorites", f"/api/travel/external/stays/{MISSING}/out"]:
        expected = 404 if path.endswith("/out") else 401
        try:
            with build_opener(NoRedirect()).open(BASE + path, timeout=20) as response:
                status = response.status
        except HTTPError as error:
            status = error.code
        record("FINAL2-PROD-GUARD-" + str(len(rows)), {"path": path, "expectedHttp": expected, "http": status}, status == expected)

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(executable_path=args.chromium,
            args=["--no-sandbox", "--disable-dev-shm-usage"])
        modes = [("fa", 390, 844, "LIGHT"), ("en", 1440, 900, "LIGHT"),
                 ("de", 768, 1024, "DARK"), ("es", 390, 844, "DARK")]
        for locale, width, height, theme in modes:
            context = await browser.new_context(viewport={"width": width, "height": height}, reduced_motion="reduce")
            await context.add_init_script(f"localStorage.setItem('petlife-theme', '{theme}')")
            if locale == "es":
                await context.add_init_script("localStorage.setItem('petlife-display-mode','simple')")
            page = await context.new_page()
            for route in ["services", "travel/external"]:
                errors = []
                def on_error(error):
                    errors.append(str(error)[:180])
                page.on("pageerror", on_error)
                response = await page.goto(f"{BASE}/{locale}/{route}", wait_until="networkidle", timeout=45000)
                await page.wait_for_timeout(800)
                actual = await page.evaluate("""() => ({lang:document.documentElement.lang,
                  dir:document.documentElement.dir,theme:document.documentElement.dataset.theme,
                  display:document.documentElement.dataset.displayMode||'normal',
                  overflow:document.documentElement.scrollWidth>innerWidth})""")
                # These anonymous overview/empty-inventory routes contain owned
                # UI, not patient notes or user posts. Do not persist body text.
                text = await page.locator("main").inner_text()
                actual["persianChars"] = sum("\u0600" <= char <= "\u06ff" for char in text)
                name = f"{locale}-{route.replace('/', '-')}-{width}.png"
                await page.screenshot(path=str(output / name), full_page=True)
                actual.update(route=route, viewport=[width, height], browser="Chromium " + browser.version,
                              http=response.status, pageErrors=errors, evidence=name)
                passed = response.status == 200 and not errors and not actual["overflow"] and actual["lang"] == locale
                passed = passed and actual["dir"] == ("rtl" if locale == "fa" else "ltr") and actual["theme"] == theme.lower()
                if locale != "fa":
                    passed = passed and actual["persianChars"] == 0
                if locale == "es":
                    passed = passed and actual["display"] == "simple"
                record(f"FINAL2-PROD-RENDER-{locale}-{route}", actual, passed)
                page.remove_listener("pageerror", on_error)
            if args.legacy:
                titles = {"fa": "این خدمت در دسترس نیست", "en": "This service is unavailable",
                          "de": "Dieser Service ist nicht verfügbar", "es": "Este servicio no está disponible"}
                route = f"services/VET/{MISSING}/book"
                response = await page.goto(f"{BASE}/{locale}/{route}", wait_until="networkidle", timeout=45000)
                visible = True
                try:
                    await page.get_by_text(titles[locale], exact=True).wait_for(state="visible", timeout=10000)
                except BrowserTimeoutError:
                    visible = False
                name = f"{locale}-legacy-unavailable-{width}.png"
                await page.screenshot(path=str(output / name), full_page=True)
                record(f"FINAL2-PROD-LEGACY-{locale}", {"route": route, "http": response.status,
                    "expectedText": titles[locale], "visible": visible, "viewport": [width, height],
                    "browser": "Chromium " + browser.version, "evidence": name}, response.status == 200 and visible)
            if locale == "es":
                toggle = page.locator(".display-mode-toggle").first
                await toggle.click()
                off = await page.locator("html").get_attribute("data-display-mode")
                await toggle.click()
                on = await page.locator("html").get_attribute("data-display-mode")
                retained = await page.evaluate("() => ({theme:document.documentElement.dataset.theme,lang:document.documentElement.lang})")
                record("FINAL2-PROD-SIMPLE-REVERSIBLE", {"off": off, "on": on, **retained},
                       off is None and on == "simple" and retained == {"theme": "dark", "lang": "es"})
            await context.close()
        await browser.close()
    # Catch deployment races; an old PASS must not be attributed to a new release.
    stable = read_json("/api/health/version").get("sha") == args.expected_sha
    record("FINAL2-PROD-STABLE-SHA", {"unchanged": stable}, stable)
    (output / "results.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2))
    failures = sum(row["status"] == "FAIL" for row in rows)
    print(json.dumps({"sha": args.expected_sha, "checks": len(rows), "failed": failures, "output": str(output)}))
    return 1 if failures else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--expected-sha", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    parser.add_argument("--legacy", action="store_true", help="Check the four-language unavailable state after #235 deploys")
    raise SystemExit(asyncio.run(run(parser.parse_args())))
