import asyncio, argparse, json
from pathlib import Path
from urllib.request import urlopen
from datetime import datetime, timezone
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[3]
async def run(args):
    def version():
        with urlopen('https://opetlife.ir/api/health/version',timeout=20) as response:
            return json.loads(response.read()).get('sha')
    if version()!=args.sha: raise SystemExit('BLOCKED: unexpected production SHA')
    output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
    results=[]
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
        for locale in ['fa','en','de','es']:
            catalog=json.loads((ROOT/f'apps/web/messages/{locale}.json').read_text())['auth']['register']
            context=await browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
            page=await context.new_page();mutations=[];errors=[]
            page.on('request',lambda req:mutations.append(req.method) if req.method not in ['GET','HEAD','OPTIONS'] else None)
            page.on('pageerror',lambda err:errors.append(str(err)[:160]))
            response=await page.goto(f'https://opetlife.ir/{locale}/register',wait_until='networkidle')
            await page.evaluate('document.fonts.ready')
            await page.screenshot(path=str(output/f'{locale}-register-initial.png'),full_page=True)
            submit=page.get_by_role('button',name=catalog['submit'],exact=True)
            disabled=await submit.is_disabled()
            await page.get_by_label(catalog['passwordLabel'],exact=True).fill('fixture-password-a')
            await page.get_by_label(catalog['confirmPassword'],exact=True).fill('fixture-password-b')
            mismatch=await page.get_by_text(catalog['passwordMismatch'],exact=True).is_visible()
            disabled_after=await submit.is_disabled()
            mixed=await page.evaluate('''()=>{const out=[];const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){if(n.parentElement.closest('script,style,select,option'))continue;const t=n.textContent.trim();if(/[\u0600-\u06ff]/.test(t)&&n.parentElement.getBoundingClientRect().width>0)out.push(t.slice(0,150));}return out;}''')
            direction=await page.locator('html').get_attribute('dir')
            overflow=await page.evaluate('document.documentElement.scrollWidth>innerWidth')
            await page.get_by_role('link',name=catalog['haveAccount'],exact=True).click()
            await page.wait_for_url(f'**/{locale}/account?method=password',timeout=15000)
            await page.wait_for_load_state('networkidle')
            correct_route=f'/{locale}/account' in page.url and 'method=password' in page.url
            await page.screenshot(path=str(output/f'{locale}-login.png'),full_page=True)
            passed=response.status==200 and disabled and disabled_after and mismatch and direction==('rtl' if locale=='fa' else 'ltr') and not overflow and correct_route and not mutations and not errors
            results.append({'testId':f'QA-AUTH-READONLY-{locale}','sha':args.sha,'dateUtc':datetime.now(timezone.utc).isoformat(),'browser':browser.version,'viewport':[390,844],'role':'anonymous','fixture':'blank registration plus two mismatched dummy passwords; never submitted','status':'PASS' if passed else 'FAIL','http':response.status,'submitDisabledInitial':disabled,'submitDisabledMismatch':disabled_after,'localizedMismatchVisible':mismatch,'direction':direction,'overflow':overflow,'loginRoutePreserved':correct_route,'mutationMethods':mutations,'pageErrors':errors,'persianVisibleTextForReview':mixed,'evidence':[f'{locale}-register-initial.png',f'{locale}-login.png'],'limitations':'No account creation/login/session/language persistence or provider delivery tested; visible-text scan is not complete localization acceptance'})
            await context.close()
        await browser.close()
    if version()!=args.sha:raise SystemExit('BLOCKED: production SHA changed during capture')
    (output/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
    print(json.dumps({'cases':len(results),'failed':sum(row['status']!='PASS' for row in results),'output':str(output)}))
    if any(row['status']!='PASS' for row in results): raise SystemExit(1)

parser=argparse.ArgumentParser();parser.add_argument('--sha',required=True);parser.add_argument('--output',required=True)
asyncio.run(run(parser.parse_args()))
