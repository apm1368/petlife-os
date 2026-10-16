"""Read-only branding review. UI data is controlled, not a live admin session."""
from pathlib import Path
import runpy,json,sys,io
from urllib.parse import urlparse
from PIL import Image
from playwright.sync_api import sync_playwright,expect
here=Path(__file__).resolve().parent;fixtures=runpy.run_path(str(here/'browser-fixtures.py'));base=fixtures['mock']
before='--before' in sys.argv;port=3010 if before else 3014
out=here/'opetlife-brand-screenshots';out.mkdir(exist_ok=True)
def fixture(r):
 path=urlparse(r.request.url).path
 if r.request.method not in ('GET','OPTIONS'):raise AssertionError('Review must not write')
 if path=='/settings/public':data={'platform.announcement':None}
 elif path=='/admin/me':data={'isAdmin':True,'adminUserId':'a1','role':'VERIFICATION','displayName':'بازبین','permissions':['verification.manage']}
 elif path=='/admin/verification/queue':data=[]
 else:return base(r)
 r.fulfill(status=200,content_type='application/json',body=json.dumps(data))
results=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 variants=[('fa',390,'light'),('fa',1440,'light')] if before else [('fa',390,'light'),('fa',1440,'light'),('en',390,'light'),('en',1440,'light'),('fa',390,'dark'),('fa',1440,'dark')]
 for lang,width,theme in variants:
  page=b.new_page(viewport={'width':width,'height':900},reduced_motion='reduce',color_scheme=theme)
  page.add_init_script(f'localStorage.setItem("petlife-theme", "{theme.upper()}")')
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('http://localhost:4000/**',fixture)
  for key,route in [('landing',''),('password-login','account?method=password'),('member','pets/new'),('admin','admin/verification')]:
   errors.clear();page.goto(f'http://127.0.0.1:{port}/{lang}/{route}',wait_until='networkidle',timeout=180000)
   if key=='password-login':expect(page.locator('input[type="password"]').first).to_be_visible(timeout=30000)
   elif key=='admin':expect(page.get_by_role('heading').first).to_be_visible(timeout=30000)
   elif key=='member':expect(page.get_by_label('نام' if lang=='fa' else 'Name',exact=True)).to_be_visible(timeout=30000)
   if not before:
    if key=='admin':expect(page.locator('header').first).to_contain_text('opetlife')
    else:expect(page.get_by_text('opetlife',exact=True).first).to_be_visible(timeout=30000)
    assert 'opetlife' in page.title()
    icons=page.locator('link[rel=icon]').evaluate_all('(nodes)=>nodes.map(n=>n.getAttribute("href"))')
    assert '/brand/opetlife/04_app_icon_light.png' in icons and '/brand/opetlife/03_app_icon_dark.png' in icons
    assert page.locator('html').get_attribute('data-theme')==theme
    logo=page.locator('img[src*="02_symbol_only"]').first
    expect(logo).to_be_visible()
    assert logo.evaluate('(img)=>img.complete && img.naturalWidth>0')
   page.evaluate('document.fonts.ready')
   name=f'{"before-" if before else ""}{key}-{lang}-{width}-{theme}.webp'
   Image.open(io.BytesIO(page.screenshot(full_page=key!='landing'))).save(out/name,quality=85)
   result={'page':key,'locale':lang,'width':width,'theme':theme,'before':before,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'pageErrors':errors.copy()}
   results.append(result);print(json.dumps(result),flush=True);assert not result['overflow'] and not errors,result
  page.close()
 b.close()
(out/('before-checks.json' if before else 'checks.json')).write_text(json.dumps(results,indent=2))
