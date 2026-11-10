import asyncio, json, argparse
from pathlib import Path
from urllib.request import urlopen
from playwright.async_api import async_playwright

async def run(args):
    def version():
        with urlopen('https://opetlife.ir/api/health/version', timeout=20) as response:
            return json.loads(response.read()).get('sha')
    if version() != args.sha:
        raise SystemExit('BLOCKED: production SHA differs before hero capture')
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    results = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
        for locale, width in [('fa',390),('de',390),('fa',1440),('de',1440)]:
            context = await browser.new_context(viewport={'width':width,'height':900}, reduced_motion='reduce')
            page = await context.new_page()
            response = await page.goto(f'https://opetlife.ir/{locale}',wait_until='networkidle')
            await page.evaluate('document.fonts.ready')
            hero = page.locator('.park-hero')
            await hero.wait_for()
            await page.screenshot(path=str(out/f'{locale}-{width}.png'))
            data = await hero.evaluate('''el=>{
                const box=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
                const image=el.querySelector('.park-scene__image'),copy=el.querySelector('.park-hero__copy'),title=el.querySelector('h1');
                return {hero:box(el),image:{src:image.getAttribute('src'),naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,...box(image)},copy:box(copy),title:{text:title.textContent,fontSize:getComputedStyle(title).fontSize,lineHeight:getComputedStyle(title).lineHeight,...box(title)}};
            }''')
            results.append({'locale':locale,'viewport':[width,900],'status':response.status,'layout':data})
            await context.close()
        await browser.close()
    if version()!=args.sha:
        raise SystemExit('BLOCKED: production SHA changed during hero capture')
    payload={'sha':args.sha,'cases':results}
    (out/'results.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2))
    if args.baseline:
        baseline=json.loads(Path(args.baseline).read_text())
        if baseline['cases']!=results:
            raise SystemExit('FAIL: rendered hero layout differs; inspect evidence')
    print(json.dumps({'sha':args.sha,'cases':len(results),'comparison':'PASS' if args.baseline else 'BASELINE','output':str(out)}))

parser=argparse.ArgumentParser()
parser.add_argument('--sha',required=True)
parser.add_argument('--output',required=True)
parser.add_argument('--baseline')
asyncio.run(run(parser.parse_args()))
