from pathlib import Path
exec((Path(__file__).parent / "browser-fixtures.py").read_text())
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);results=[]
 for lang,width in [('fa',390),('fa',1440),('en',390),('en',1440)]:
  page=b.new_page(viewport={'width':width,'height':844 if width==390 else 1000},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('http://localhost:4000/**',mock)
  for name,route,selector in [('clinic-list','services/VET','.disc'),('clinic','providers/p1','.pd'),('blog','blog','.editorial-index'),('article','blog/care','.editorial-article'),('contact','contact','.contact-scene'),('admin','admin','.approved-admin')]:
   errors.clear();start=len(requests)
   try:
    page.goto(f'http://127.0.0.1:3000/{lang}/{route}',wait_until='networkidle',timeout=120000)
    expect(page.locator(selector)).to_be_visible(timeout=30000)
    page.evaluate('document.fonts.ready');page.wait_for_function('() => { const imgs=Array.from(document.images); imgs.forEach(i=>i.loading="eager"); return imgs.every(i=>i.complete); }',timeout=20000)
    overflow=page.evaluate('document.documentElement.scrollWidth>innerWidth');page.screenshot(path=f'/tmp/rollout-{name}.png',full_page=True);Image.open(f'/tmp/rollout-{name}.png').save(out/f'{name}-{lang}-{width}.webp',quality=85)
    result={'page':name,'locale':lang,'width':width,'overflow':overflow,'pageErrors':errors.copy(),'pattern':page.locator('.design-root').get_attribute('data-pattern')}
   except Exception as e:result={'page':name,'locale':lang,'width':width,'failed':str(e),'pageErrors':errors.copy(),'requests':requests[start:]}
   results.append(result);print(json.dumps(result,ensure_ascii=False),flush=True);(out/'browser-checks.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
  page.close()
 b.close()
