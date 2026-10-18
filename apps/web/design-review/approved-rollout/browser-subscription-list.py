"""Loopback-only synthetic subscription fixtures; never writes live data."""
import io,json,os,runpy
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from PIL import Image
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[4]
api=runpy.run_path(str(root/'apps/web/design-review/approved-rollout/browser-fixtures.py'))['mock']
out=Path(os.environ['QA_EVIDENCE_DIR']);out.mkdir(parents=True,exist_ok=True)
stage=os.environ.get('QA_STAGE','after');mode=os.environ.get('QA_MODE','list');results=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for locale in ['fa','en']:
  for width in [390,1440]:
   page=b.new_page(viewport={'width':width,'height':950},reduced_motion='reduce');errors=[];requests=[];console=[];failed=[];assets=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.on('console',lambda m:console.append(m.text.split('\n')[0]) if m.type=='error' else None)
   page.on('requestfailed',lambda r:failed.append({'url':r.url,'error':r.failure}))
   page.on('response',lambda r:assets.append({'path':urlparse(r.url).path,'status':r.status,'type':r.headers.get('content-type','')}) if '/_next/static/' in r.url else None)
   def route(r):
    u=urlparse(r.request.url);assert u.hostname in ['localhost','127.0.0.1']
    if u.port==4000:
     assert r.request.method in ['GET','OPTIONS'],r.request.method
     if u.path=='/admin/me':r.fulfill(json={'isAdmin':True,'role':'SUPPORT','displayName':'کارشناس نمونه','permissions':['subscription.view'],'adminUserId':'qa-admin'});return
     if u.path=='/admin/subscriptions/households':
      requests.append(parse_qs(u.query));n=int(parse_qs(u.query).get('page',['1'])[0])
      if mode=='error':r.fulfill(status=503,json={'error':{'code':'QA_UNAVAILABLE','message':'Controlled failure'}});return
      row={'id':'sub-'+str(n),'household':{'id':'family-'+str(n),'name':('خانواده نمونه با نام طولانی برای بررسی نمایش در موبایل ' if locale=='fa' else 'Example household with a long name for mobile review ')+str(n)},'plan':{'id':'plan','code':'plus','nameFa':'اشتراک پلاس','nameEn':'Plus'},'status':'ACTIVE','currentPeriodEndAt':'2026-10-22T10:00:00Z','updatedAt':'2026-10-17T10:00:00Z'}
      r.fulfill(json={'items':[] if mode=='empty' else [row],'total':0 if mode=='empty' else 51,'page':n,'pageSize':50});return
     return api(r)
    r.continue_()
   page.route('**/*',route)
   page.goto(os.environ.get('QA_WEB_ORIGIN','http://localhost:3035')+'/'+locale+'/admin/subscriptions/households',wait_until='networkidle',timeout=180000)
   title=json.loads((root/f'apps/web/messages/{locale}.json').read_text())['admin']['subscriptions']['householdsTitle']
   expect(page.get_by_role('heading',name=title,exact=True,level=1)).to_be_visible(timeout=60000)
   if mode=='empty':expect(page.get_by_text(json.loads((root/f'apps/web/messages/{locale}.json').read_text())['admin']['common']['empty'],exact=True)).to_be_visible()
   if mode=='error':expect(page.get_by_role('button',name=json.loads((root/f'apps/web/messages/{locale}.json').read_text())['admin']['common']['retry'],exact=True)).to_be_visible()
   if stage=='after' and mode=='list':
    page.get_by_role('button',name='بعدی' if locale=='fa' else 'Next',exact=True).click()
    expect(page.get_by_text('2',exact=False).filter(has_text='Example household' if locale=='en' else 'خانواده نمونه').first).to_be_visible()
    assert requests[-1].get('page')==['2']
   page.evaluate('document.fonts.ready')
   result={'locale':locale,'width':width,'mode':mode,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'pageErrors':errors,'requests':requests,'consoleErrors':console,'failedRequests':failed,'assets':assets}
   results.append(result);Image.open(io.BytesIO(page.screenshot(full_page=True))).save(out/f'{stage}-{mode}-{locale}-{width}.webp',quality=85)
   (out/f'{stage}-{mode}-checks.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
   if stage=='after':assert not result['overflow'] and not errors and not failed and all(a['status']==200 for a in assets) and not [e for e in console if not (mode=='error' and '503' in e)]
   print(json.dumps(result),flush=True);page.close()
 b.close()
