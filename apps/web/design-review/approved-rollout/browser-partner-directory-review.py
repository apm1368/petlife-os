# Controlled read-only directory capture; no live mutation.
from pathlib import Path
exec((Path(__file__).parent/'browser-fixtures.py').read_text())
import os
original_mock=mock
out=Path(__file__).parent/'partner-directory-screenshots';out.mkdir(exist_ok=True)
before='--before' in sys.argv
origin=os.environ.get('REVIEW_ORIGIN','http://127.0.0.1:3006')
def fixture(r):
 path=urlparse(r.request.url).path
 if r.request.method not in ['GET','OPTIONS']:raise AssertionError('Read-only visual fixture: '+path)
 if path=='/admin/me':data={'isAdmin':True,'adminUserId':'a1','displayName':'مدیر شبکه','role':'ADMIN','permissions':['verification.manage','customer.view']}
 elif path in ['/admin/providers','/admin/sellers']:
  seller=path.endswith('sellers');data={'items':[{'id':'org1','name':'فروشگاه همراه' if seller else 'کلینیک مهر',**({'status':'ACTIVE'} if seller else {'type':'VET_CLINIC'}),'verificationStatus':'VERIFIED','createdAt':'2026-10-16T00:00:00Z'}],'total':61,'page':1,'pageSize':30}
 else:return original_mock(r)
 r.fulfill(status=200,content_type='application/json',body=json.dumps(data))
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for lang,width in [('fa',390),('fa',1440),('en',390),('en',1440)]:
  if before and lang!='fa':continue
  page=browser.new_page(viewport={'width':width,'height':900},reduced_motion='reduce');errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)));page.route('http://localhost:4000/**',fixture)
  for kind in ['providers','sellers']:
   page.goto(f'{origin}/{lang}/admin/{kind}',wait_until='networkidle',timeout=180000)
   expect(page.get_by_role('heading',name=({'providers':'ارائه‌دهندگان','sellers':'فروشندگان'}[kind] if lang=='fa' else kind.title()),exact=True)).to_be_visible(timeout=60000)
   if before:page.get_by_role('textbox').press('Enter')
   expect(page.get_by_text('کلینیک مهر' if kind=='providers' else 'فروشگاه همراه',exact=True)).to_be_visible(timeout=60000)
   page.evaluate('document.fonts.ready');page.evaluate('window.scrollTo(0,0)')
   page.screenshot(path='/tmp/petlife-partner-review.png',full_page=True);Image.open('/tmp/petlife-partner-review.png').save(out/f'{"before-" if before else ""}{kind}-{lang}-{width}.webp',quality=85)
   result={'page':kind,'locale':lang,'width':width,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'pageErrors':errors.copy()};results.append(result);print(json.dumps(result),flush=True);assert not result['overflow'] and not errors,result
   (out/f'{"before-" if before else ""}checks.json').write_text(json.dumps(results,indent=2))
  page.close()
 browser.close()
