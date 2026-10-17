from pathlib import Path
exec((Path(__file__).parent/'browser-finance-insurance-review.py').read_text().split('\nwith sync_playwright()')[0])
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);results=[]
 for lang,width in [('fa',390),('fa',1440),('en',390),('en',1440)]:
  page=b.new_page(viewport={'width':width,'height':900},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('http://localhost:4000/**',fixture)
  page.goto(f'http://127.0.0.1:3000/{lang}/admin/insurance/providers/ins1/products',wait_until='networkidle',timeout=120000)
  expect(page.get_by_role('heading',name='طرح‌های بیمه' if lang=='fa' else 'Insurance products',exact=True)).to_be_visible(timeout=30000)
  for key in ['insurance-products','insurance-product-edit']:
   if key=='insurance-product-edit':page.get_by_role('button',name='ویرایش طرح بیمه' if lang=='fa' else 'Edit insurance product',exact=True).click();expect(page.get_by_role('form',name='ویرایش طرح بیمه' if lang=='fa' else 'Edit insurance product')).to_be_visible()
   page.evaluate('document.fonts.ready');page.screenshot(path='/tmp/insurance-products.png',full_page=True);Image.open('/tmp/insurance-products.png').save(out/f'{key}-{lang}-{width}.webp',quality=85)
   result={'page':key,'locale':lang,'width':width,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'pageErrors':errors.copy()};results.append(result);print(json.dumps(result),flush=True)
  page.close()
 (out/'insurance-products-browser-checks.json').write_text(json.dumps(results,indent=2));b.close()
