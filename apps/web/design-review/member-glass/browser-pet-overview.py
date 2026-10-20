"""Synthetic, loopback-only pet overview QA; rejects every mutation."""
import io,json,os,runpy
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[4];g=runpy.run_path(str(root/'apps/web/design-review/approved-rollout/browser-fixtures.py'));api=g['mock'];pet=g['pet']
out=Path(os.environ['QA_EVIDENCE_DIR']);out.mkdir(parents=True,exist_ok=True);stage=os.environ.get('QA_STAGE','after');mode=os.environ.get('QA_MODE','care-error');results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for locale in ['fa','en']:
  for width in [390,1440]:
   page=browser.new_page(viewport={'width':width,'height':950},reduced_motion='reduce',timezone_id='UTC');errors=[];console=[];failed=[];reads=[];assets=[];apiResponses=[];recover={'value':False}
   page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:console.append(m.text.split('\n')[0]) if m.type=='error' else None);page.on('requestfailed',lambda r:failed.append({'path':urlparse(r.url).path,'error':r.failure}));page.on('response',lambda r:assets.append({'path':urlparse(r.url).path,'status':r.status,'type':r.headers.get('content-type','')}) if '/_next/static/' in r.url else None)
   page.on('response',lambda r:apiResponses.append({'path':urlparse(r.url).path,'status':r.status}) if urlparse(r.url).port==4000 else None)
   def route(r):
    u=urlparse(r.request.url);assert u.hostname in ['localhost','127.0.0.1']
    if u.port!=4000:r.continue_();return
    assert r.request.method in ['GET','OPTIONS'],'Unexpected mutation'
    reads.append(u.path)
    if u.path=='/settings/public':data={'platform.announcement':None}
    elif u.path=='/pets/pet-1/access':data={**g['access'],'canViewCareProfile':mode!='no-care-permission'}
    elif u.path=='/pets/pet-1/overview':
     if mode=='load-error':r.fulfill(status=503,json={'error':{'code':'QA_UNAVAILABLE','message':'Controlled overview failure'}});return
     data={'pet':pet,'householdName':'خانواده نمونه','attention':[],'upcoming':[],'recentHealth':[],'recentActivity':[],'recentMemory':None}
    elif u.path=='/pets/pet-1/care-items':
     if mode in ['care-error','recover'] and not recover['value']:r.fulfill(status=503,json={'error':{'code':'QA_UNAVAILABLE','message':'Controlled care failure'}});return
     data=[] if mode in ['empty','no-care-permission'] else [{'id':'care-qa','petId':'pet-1','title':'پیگیری مراقبت ثبت‌شده','type':'CUSTOM','source':'OWNER','sourceId':None,'state':'OVERDUE','dueAt':'2026-10-01T10:00:00Z','originalDueAt':'2026-10-01T10:00:00Z','snoozedUntil':None,'recurrence':'NONE','intervalDays':None,'completedAt':None,'notifiedAt':None,'cancelledAt':None,'parentId':None}]
    else:return api(r)
    r.fulfill(content_type="application/json",body=json.dumps(data))
   page.route('**/*',route);page.goto(os.environ.get('QA_WEB_ORIGIN','http://localhost:3036')+'/'+locale+'/pets/pet-1',wait_until='networkidle',timeout=180000)
   main=page.locator('#member-main-content');expect(main).to_be_visible(timeout=60000)
   if mode=='load-error':expect(main.get_by_role('button',name='تلاش دوباره' if locale=='fa' else 'Try again',exact=True)).to_be_visible()
   else:expect(page.locator('.pet-overview')).to_be_visible(timeout=30000)
   if stage=='after' and mode in ['care-error','recover']:
    expect(main.get_by_role('alert')).to_be_visible()
    assert main.get_by_text('No actionable item was found in the recorded data.',exact=True).count()==0
    if mode=='recover':
     recover['value']=True;main.get_by_role('button',name='تلاش دوباره' if locale=='fa' else 'Try again',exact=True).click();expect(main.get_by_text('پیگیری مراقبت ثبت‌شده',exact=True)).to_be_visible();expect(main.get_by_role('alert')).to_have_count(0)
   if mode=='no-care-permission':assert '/pets/pet-1/care-items' not in reads
   page.evaluate('document.fonts.ready');row={'locale':locale,'width':width,'mode':mode,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'pageErrors':errors,'consoleErrors':console,'failedRequests':failed,'reads':reads,'apiResponses':apiResponses,'assets':assets};results.append(row);Image.open(io.BytesIO(page.screenshot(full_page=True))).save(out/f'{stage}-{mode}-{locale}-{width}.webp',quality=85);(out/f'{stage}-{mode}-checks.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in row.items() if k not in ['assets','reads']}),flush=True)
   if stage=='after':assert not row['overflow'] and not errors and not [f for f in failed if not (f["path"]=="/settings/public" and f["error"]=="net::ERR_ABORTED" and {"path":"/settings/public","status":200} in apiResponses)] and all(a['status']==200 for a in assets) and not [e for e in console if not (mode in ['care-error','recover','load-error'] and '503' in e)]
   page.close()
 browser.close()
