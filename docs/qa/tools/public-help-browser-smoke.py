"""Read-only public help/legal/status browser acceptance; no publication/vote/account creation."""
import argparse
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
from time import perf_counter
from urllib.parse import urlsplit
from urllib.request import urlopen
from playwright.async_api import async_playwright, expect

BASE = "https://opetlife.ir"
ROOT = Path(__file__).resolve().parents[3]


def version():
    with urlopen(BASE + "/api/health/version", timeout=20) as response:
        return json.loads(response.read()).get("sha")


async def run(args):
    if version() != args.expected_sha:
        raise SystemExit("BLOCKED: unexpected production SHA")
    catalogs = {}
    for locale in ["fa", "en", "de", "es"]:
        catalogs[locale] = json.loads((ROOT / f"apps/web/messages/{locale}.json").read_text()).get("publicHelp")
        if not catalogs[locale]:
            raise SystemExit("BLOCKED: publicHelp catalogs missing in checkout; update to the released revision")
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    with urlopen(BASE + "/api/status", timeout=20) as response:
        observed_indicator = json.loads(response.read()).get("indicator")
    results = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox", "--disable-dev-shm-usage"])
        for locale in ["fa", "en", "de", "es"]:
            copy = catalogs[locale]
            theme = "DARK" if locale in ["de", "es"] else "LIGHT"
            simple = locale == "es"
            context = await browser.new_context(viewport={"width": 390, "height": 844}, reduced_motion="reduce")
            await context.add_init_script(f"localStorage.setItem('petlife-theme','{theme}')")
            if simple:
                await context.add_init_script("localStorage.setItem('petlife-display-mode','simple')")
            for route, expected in [
                ("help", copy["noTopics"]), ("help/faq", copy["noFaq"]),
                ("help/categories/qa-readonly-no-such-topic", copy["noTopicArticles"]),
                ("help/articles/qa-readonly-no-such-article-20261110", copy["articleUnavailableDescription"]),
                ("legal", copy["unpublished"]), ("legal/privacy", copy["documentUnpublished"]),
                ("status", copy["indicators"].get(observed_indicator, copy["unknownState"])),
                ("status/incidents/00000000-0000-4000-8000-000000000000", copy["incidentFailure"]),
            ]:
                if args.only_search and route != "help":
                    continue
                page = await context.new_page()
                page_errors = []
                bad_assets = []
                mutations = []
                page.on("pageerror", lambda error: page_errors.append(str(error)[:180]))
                page.on("response", lambda r: bad_assets.append({"path": urlsplit(r.url).path, "http": r.status}) if r.status >= 400 and "/_next/static/" in r.url else None)
                page.on("request", lambda r: mutations.append(r.method) if r.method not in ["GET", "HEAD", "OPTIONS"] else None)
                started = perf_counter()
                response = await page.goto(f"{BASE}/{locale}/{route}", wait_until="networkidle")
                try:
                    await page.get_by_text(expected, exact=True).first.wait_for(timeout=15000)
                    expected_visible = True
                except Exception:
                    expected_visible = False
                search_pass = None
                search_http = None
                if route == "help" and expected_visible:
                    await page.get_by_role("textbox", name=copy["searchLabel"], exact=True).fill("qa-readonly-no-results")
                    async with page.expect_response(lambda r: urlsplit(r.url).path == "/api/help/search" and r.request.method == "GET", timeout=15000) as observed:
                        await page.get_by_role("button", name=copy["search"], exact=True).click()
                    search_response = await observed.value
                    search_payload = await search_response.json()
                    search_http = search_response.status
                    await expect(page.get_by_role("button", name=copy["search"], exact=True)).to_be_enabled()
                    await page.get_by_role("heading", name=copy["searchResults"], exact=True).wait_for()
                    await page.get_by_text(copy["noMatches"], exact=True).wait_for()
                    search_pass = search_http == 200 and isinstance(search_payload, list) and not search_payload
                direction = await page.locator("html").get_attribute("dir")
                main_count = await page.get_by_role("main").count()
                actual_theme = await page.locator("html").get_attribute("data-theme")
                actual_display = await page.locator("html").get_attribute("data-display-mode")
                overflow = await page.evaluate("document.documentElement.scrollWidth>innerWidth")
                screenshot = f"{locale}-{route.replace('/', '-')}-390.png"
                await page.screenshot(path=str(output / screenshot), full_page=True)
                timings = await page.evaluate("""()=>{const n=performance.getEntriesByType('navigation')[0];return n?{responseStartMs:n.responseStart-n.startTime,domContentLoadedMs:n.domContentLoadedEventEnd-n.startTime,loadEventMs:n.loadEventEnd-n.startTime}:null}""")
                passed = response.status == 200 and expected_visible and search_pass is not False and direction == ("rtl" if locale == "fa" else "ltr") and actual_theme == theme.lower() and (actual_display == "simple") == simple and (args.expected_main_count is None or main_count == args.expected_main_count) and not overflow and not page_errors and not bad_assets and not mutations
                results.append({"testId": f"QA-HELP-BROWSER-{locale}-{route}", "sha": args.expected_sha, "dateUtc": datetime.now(timezone.utc).isoformat(), "environment": "production, anonymous read-only", "browser": browser.version, "viewport": [390, 844], "theme": theme, "simple": simple, "route": f"/{locale}/{route}", "http": response.status, "expected": expected, "expectedStateVisible": expected_visible, "searchPass": search_pass, "direction": direction, "overflow": overflow, "pageErrors": page_errors, "badAssets": bad_assets, "mutationMethods": mutations, "observedWallMs": round((perf_counter() - started) * 1000), "navigationTimings": timings, "status": "PASS" if passed else "FAIL", "evidence": screenshot, "limitations": "Requires genuinely empty/unpublished content; a changed real publication needs change-impact review, not forced empty fixtures. No private/published article workflow or complete accessibility/performance acceptance."})
                results[-1].update({"actualTheme": actual_theme, "actualDisplayMode": actual_display, "searchHttp": search_http, "mainLandmarks": main_count})
                await page.close()
            await context.close()
        # Additional real empty-state layouts in tablet/desktop themes/simple mode.
        for locale, width, theme, simple in ([] if args.only_search else [("fa", 768, "DARK", True), ("de", 1440, "LIGHT", False), ("es", 1440, "DARK", False), ("en", 768, "LIGHT", True)]):
            context = await browser.new_context(viewport={"width": width, "height": 900}, reduced_motion="reduce")
            await context.add_init_script(f"localStorage.setItem('petlife-theme','{theme}')")
            if simple:
                await context.add_init_script("localStorage.setItem('petlife-display-mode','simple')")
            page = await context.new_page()
            response = await page.goto(f"{BASE}/{locale}/legal", wait_until="networkidle")
            try:
                await page.get_by_text(catalogs[locale]["unpublished"], exact=True).first.wait_for(timeout=15000)
                rendered = True
            except Exception:
                rendered = False
            overflow = await page.evaluate("document.documentElement.scrollWidth>innerWidth")
            main_count = await page.get_by_role("main").count()
            actual_theme = await page.locator("html").get_attribute("data-theme")
            actual_display = await page.locator("html").get_attribute("data-display-mode")
            evidence = f"{locale}-legal-{width}.png"
            await page.screenshot(path=str(output / evidence), full_page=True)
            passed = response.status == 200 and rendered and not overflow and actual_theme == theme.lower() and (actual_display == "simple") == simple and (args.expected_main_count is None or main_count == args.expected_main_count)
            results.append({"testId": f"QA-HELP-LAYOUT-{locale}-{width}", "sha": args.expected_sha, "dateUtc": datetime.now(timezone.utc).isoformat(), "environment": "production, anonymous read-only", "browser": browser.version, "viewport": [width, 900], "theme": theme, "simple": simple, "expectedStateVisible": rendered, "overflow": overflow, "status": "PASS" if passed else "FAIL", "evidence": evidence})
            results[-1].update({"actualTheme": actual_theme, "actualDisplayMode": actual_display, "mainLandmarks": main_count})
            await context.close()
        await browser.close()
    if version() != args.expected_sha:
        raise SystemExit("BLOCKED: production changed during browser capture")
    (output / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2))
    failed = sum(row["status"] != "PASS" for row in results)
    print(json.dumps({"cases": len(results), "failed": failed, "output": str(output)}))
    return 1 if failed else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--expected-sha", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--only-search", action="store_true", help="Retest only the four search flows after harness changes")
    parser.add_argument("--expected-main-count", type=int)
    raise SystemExit(asyncio.run(run(parser.parse_args())))
