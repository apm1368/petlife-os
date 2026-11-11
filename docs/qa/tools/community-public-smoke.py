"""Real public community GET/search/filter flow, no mocked responses or writes.

Captures only a confirmed empty filtered result, not users' existing posts.
"""
import argparse
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from urllib.request import urlopen
from playwright.async_api import async_playwright, expect

BASE = "https://opetlife.ir"
ROOT = Path(__file__).resolve().parents[3]
QUERY = "qa-readonly-no-such-community-post-20261110"


def version():
    with urlopen(BASE + "/api/health/version", timeout=20) as response:
        return json.loads(response.read()).get("sha")


async def run(args):
    if version() != args.expected_sha:
        raise SystemExit("BLOCKED: unexpected production SHA")
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    rows = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox", "--disable-dev-shm-usage"])
        for locale, width, height, theme, simple in [("fa",390,844,"LIGHT",False),("en",1440,900,"LIGHT",False),("de",768,1024,"DARK",False),("es",390,844,"DARK",True)]:
            catalog = json.loads((ROOT / f"apps/web/messages/{locale}.json").read_text())["community"]
            feed = catalog["feed"]
            context = await browser.new_context(viewport={"width":width,"height":height}, reduced_motion="reduce")
            await context.add_init_script(f"localStorage.setItem('petlife-theme','{theme}')")
            if simple:
                await context.add_init_script("localStorage.setItem('petlife-display-mode','simple')")
            mutations = []
            errors = []

            async def safe_request(route):
                if route.request.method not in ["GET","HEAD","OPTIONS"]:
                    mutations.append(route.request.method)
                    await route.abort()
                else:
                    await route.continue_()

            await context.route("**/*", safe_request)
            page = await context.new_page()
            page.on("pageerror", lambda error: errors.append(type(error).__name__))
            response = await page.goto(BASE + f"/{locale}/community", wait_until="networkidle")
            await page.get_by_label(feed["searchLabel"], exact=True).wait_for()
            await page.get_by_label(feed["searchLabel"], exact=True).fill(QUERY)

            def matching(response, topic):
                parsed = urlsplit(response.url)
                query = parse_qs(parsed.query)
                return parsed.netloc == "opetlife.ir" and parsed.path == "/api/community/posts" and query.get("q") == [QUERY] and query.get("type", [""]) == [topic]

            async with page.expect_response(lambda r: matching(r, "")) as search_pending:
                await page.get_by_role("button", name=feed["search"], exact=True).click()
            search_response = await search_pending.value
            search_payload = await search_response.json()
            if search_response.status != 200 or search_payload.get("items") != [] or search_payload.get("total") != 0:
                raise SystemExit("BLOCKED: search did not return a genuine empty result; no user-content screenshot retained")
            await page.get_by_text(feed["noResults"], exact=True).wait_for()
            async with page.expect_response(lambda r: matching(r, "QUESTION")) as filter_pending:
                await page.get_by_label(feed["typeLabel"], exact=True).select_option("QUESTION")
            filter_response = await filter_pending.value
            filter_payload = await filter_response.json()
            if filter_response.status != 200 or filter_payload.get("items") != [] or filter_payload.get("total") != 0:
                raise SystemExit("BLOCKED: filtered result changed; no user-content screenshot retained")
            await expect(page.get_by_role("button", name=feed["search"], exact=True)).to_be_enabled()
            await page.get_by_text(feed["noResults"], exact=True).wait_for()
            selected = await page.get_by_label(feed["typeLabel"], exact=True).input_value()
            await expect(page.locator("html")).to_have_attribute("data-theme", theme.lower())
            if simple:
                await expect(page.locator("html")).to_have_attribute("data-display-mode", "simple")
            html = await page.locator("html").evaluate("el=>({lang:el.lang,dir:el.dir,theme:el.dataset.theme,display:el.dataset.displayMode||null})")
            text = await page.locator("main").inner_text()
            mixed_persian = locale != "fa" and any("\u0600" <= char <= "\u06ff" for char in text)
            overflow = await page.evaluate("document.documentElement.scrollWidth>innerWidth")
            evidence = f"{locale}-{width}-empty-filter.png"
            await page.screenshot(path=str(output / evidence), full_page=True)
            passed = response.status == 200 and selected == "QUESTION" and html["lang"] == locale and html["dir"] == ("rtl" if locale=="fa" else "ltr") and html["theme"] == theme.lower() and (html["display"] == "simple") == simple and not overflow and not mixed_persian and not errors and not mutations
            rows.append({"testId":f"QA-COMMUNITY-PUBLIC-{locale}","sha":args.expected_sha,"dateUtc":datetime.now(timezone.utc).isoformat(),"environment":"Production public real GETs, anonymous, no mocked responses","browser":browser.version,"viewport":[width,height],"route":f"/{locale}/community","expected":"Real empty search/filter, localized owned UI/direction/display, no overflow/errors/writes","http":response.status,"searchHttp":search_response.status,"filterHttp":filter_response.status,"emptyResponsesConfirmed":True,"selectedType":selected,"observedHtml":html,"mixedPersianUi":mixed_persian,"overflow":overflow,"pageErrorTypes":errors,"mutationMethodsAborted":mutations,"status":"PASS" if passed else "FAIL","evidence":evidence,"limitations":"No post creation, moderation, real login, private messages or entire published/error/accessibility acceptance. Persian scan does not prove every translation key correct."})
            await context.close()
        await browser.close()
    if version() != args.expected_sha:
        raise SystemExit("BLOCKED: production changed during test")
    (output / "results.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2))
    failed = sum(row["status"] != "PASS" for row in rows)
    print(json.dumps({"cases":len(rows),"failed":failed,"output":str(output)}))
    return 1 if failed else 0


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-sha",required=True)
    parser.add_argument("--output-dir",required=True)
    raise SystemExit(asyncio.run(run(parser.parse_args())))
