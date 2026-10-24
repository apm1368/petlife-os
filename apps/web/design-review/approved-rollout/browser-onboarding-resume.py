"""Regression review with controlled localhost API responses only. Never uses a live account."""
from pathlib import Path
import runpy,json,sys,io,hashlib
from urllib.parse import urlparse
from PIL import Image
from playwright.sync_api import sync_playwright,expect
here=Path(__file__).resolve().parent;root=here.parents[3]
base=runpy.run_path(str(here/'browser-fixtures.py'))['mock']
before='--before' in sys.argv;port=3010 if before else 3016
out=here/'onboarding-resume-screenshots';out.mkdir(exist_ok=True)
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for locale,width in ([('fa',390),('fa',1440)] if before else [('fa',390),('fa',1440),('en',390),('en',1440)]):
  messages=json.loads((root/f'apps/web/messages/{locale}.json').read_text())
  progress={'userId':'u1','householdId':'h1','petId':None,'chapter':'PET_IDENTITY','step':'age','status':'IN_PROGRESS','completedSteps':[]}
  writes=[];created=[];errors=[]
  def api(route):
   path=urlparse(route.request.url).path;method=route.request.method;status=200
   if method not in ['GET','OPTIONS']:
    assert not before,'Before-state skip unexpectedly submitted a request'
    payload=route.request.post_data_json;writes.append({'method':method,'path':path})
    if method=='PUT' and path=='/onboarding/progress':progress.update(payload);data=progress
    elif method=='POST' and path=='/households/h1/pets':
     assert payload=={'name':'کوکی','species':'CAT'},payload
     created.append(payload);status=201;data={'id':'new-pet','householdId':'h1',**payload,'birthDate':None,'approximateAgeMonths':None,'photoUrl':None}
    else:raise AssertionError('Unexpected UI mutation: '+method+' '+path)
   elif path=='/onboarding':data=progress
   elif path=='/households/h1/pets':data=[]
   elif path=='/households/h1/active-pet':data=None
   elif path=='/settings/public':data={'platform.announcement':None}
   elif path=='/health/live':data={'status':'ok'}
   else:return base(route)
   route.fulfill(status=status,content_type='application/json',body=json.dumps(data))
  page=browser.new_page(viewport={'width':width,'height':900},reduced_motion='reduce');page.on('pageerror',lambda e:errors.append(str(e)));page.route('http://localhost:4000/**',api)
  page.goto(f'http://127.0.0.1:{port}/{locale}/onboarding',wait_until='networkidle',timeout=180000)
  expected=messages['onboarding']['age']['title'] if before else messages['onboarding']['species']['title']
  expect(page.get_by_role('heading',name=expected,exact=True)).to_be_visible(timeout=30000)
  if before:
   page.get_by_role('button',name=messages['onboarding']['age']['skip'],exact=True).click()
   page.wait_for_load_state('networkidle');assert not writes and not created
  else:expect(page.get_by_text(messages['onboarding']['resumeIdentity'],exact=True)).to_be_visible()
  def capture(stage):
   page.evaluate('document.fonts.ready')
   name=f'{"before-" if before else ""}{stage}-{locale}-{width}.webp'
   Image.open(io.BytesIO(page.screenshot(full_page=True))).save(out/name,quality=85)
   result={'stage':stage,'locale':locale,'width':width,'before':before,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'pageErrors':errors.copy(),'petCreates':len(created)}
   results.append(result);print(json.dumps(result),flush=True);assert not result['overflow'] and not errors,result
  capture('cold-reentry')
  if not before:
   page.get_by_role('button',name='گربه' if locale=='fa' else 'Cat',exact=True).click()
   name=messages['onboarding']['petName']['title'];page.get_by_label(name,exact=True).fill('کوکی')
   page.get_by_role('button',name=messages['common']['continue'],exact=True).click()
   expect(page.get_by_role('heading',name=messages['onboarding']['age']['title'],exact=True)).to_be_visible()
   page.get_by_role('button',name=messages['onboarding']['age']['skip'],exact=True).click()
   try: expect(page.locator('input[type=file]')).to_have_count(1)
   except Exception:
    print(json.dumps({'debugBody':page.locator('body').inner_text(),'writes':writes,'created':created},ensure_ascii=False),flush=True)
    raise
   assert len(created)==1 and len([w for w in writes if w['method']=='POST'])==1
   capture('after-unknown-age-skip')
  page.close()
 browser.close()
(out/('before-checks.json' if before else 'checks.json')).write_text(json.dumps(results,indent=2))
if not before:
 files=['apps/web/features/onboarding/OnboardingWizard.tsx','apps/web/features/onboarding/steps/AgeStep.tsx','apps/web/messages/fa.json','apps/web/messages/en.json']
 (out/'source-hashes.json').write_text(json.dumps({'baseline':'98b61188fa86b77cbfbcc300356a3a0280f7cc3d','source':{f:hashlib.sha256((root/f).read_bytes()).hexdigest() for f in files},'scope':'Controlled localhost responses, including simulated progress and pet creation. No live mutation.'},indent=2))
