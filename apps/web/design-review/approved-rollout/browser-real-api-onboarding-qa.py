import json,io,os
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image
from playwright.sync_api import sync_playwright,expect
root=Path(os.environ['QA_REPO_ROOT']);out=Path(os.environ['QA_EVIDENCE_DIR']);out.mkdir(parents=True,exist_ok=True)
private=Path(os.environ['QA_FIXTURES_FILE']).resolve();assert private.stat().st_mode & 0o077 == 0 and not private.is_relative_to(root.resolve())
fixtures=[f for f in json.loads(private.read_text()) if f['fault'] in ['lost-response','progress-failure','cached-response-edit']]
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for fixture in fixtures:
  locale,width,fault=fixture['locale'],fixture['width'],fixture['fault'];m=json.loads((root/f'apps/web/messages/{locale}.json').read_text());context=browser.new_context(viewport={'width':width,'height':900},reduced_motion='reduce')
  context.add_cookies([{'name':'petlife_session','value':fixture['session'],'domain':'127.0.0.1','path':'/','httpOnly':True,'sameSite':'Lax'},{'name':'petlife_csrf','value':fixture['csrf'],'domain':'127.0.0.1','path':'/','sameSite':'Lax'}])
  page=context.new_page();errors=[];mutations=[];injected=[];armed=True
  def route(r):
   global armed
   req=r.request;u=urlparse(req.url)
   assert u.hostname in ['127.0.0.1','localhost'],'External request forbidden in isolated write tests'
   if u.port==4141 and req.method not in ['GET','HEAD','OPTIONS']:
    body=req.post_data_json;mutations.append({'method':req.method,'path':u.path})
    if req.method=='POST' and u.path.endswith('/pets'):
     header=req.headers.get('idempotency-key','');assert header and header.isascii()
     assert body['name']=='کوکی' and body['species']=='CAT'
     if fault in ['progress-failure','cached-response-edit'] and armed:assert body['birthDate']=='2024-03-20'

    if armed and fault in ['lost-response','cached-response-edit'] and req.method=='POST' and u.path.endswith('/pets'):
     if fault=='lost-response':assert body=={'name':'کوکی','species':'CAT'},body
     response=r.fetch();assert response.status==201
     injected.append('POST response dropped after real commit');armed=False;r.abort('failed');return
    if armed and fault=='progress-failure' and req.method=='PUT' and u.path=='/onboarding/progress' and body.get('step')=='age':
     injected.append('Progress request failed before write');armed=False;r.fulfill(status=503,headers={'Access-Control-Allow-Origin':'http://127.0.0.1:3020','Access-Control-Allow-Credentials':'true'},content_type='application/json',body=json.dumps({'error':{'code':'QA_INJECTED_FAILURE','message':'Controlled isolated failure','requestId':'qa-isolated'}}));return
   r.continue_()
  page.route('**/*',route);page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:3020/{locale}/onboarding',wait_until='networkidle',timeout=180000)
  expect(page.get_by_role('heading',name=m['onboarding']['species']['title'],exact=True)).to_be_visible(timeout=30000)
  page.get_by_role('button',name='گربه' if locale=='fa' else 'Cat',exact=True).click()
  page.get_by_label(m['onboarding']['petName']['title'],exact=True).fill('کوکی')
  page.get_by_role('button',name=m['common']['continue'],exact=True).click()
  expect(page.get_by_role('heading',name=m['onboarding']['age']['title'],exact=True)).to_be_visible()
  bd=m['birthDateField']
  if fault in ['progress-failure','cached-response-edit']:
   page.get_by_label(bd['calendar'],exact=True).select_option('jalali')
   for key,val in [('year','1403'),('month','1'),('day','1')]:page.get_by_label(bd[key],exact=True).select_option(val)
   page.get_by_label(bd['calendar'],exact=True).select_option('gregorian');assert page.get_by_label(bd['year'],exact=True).input_value()=='2024'
   page.get_by_label(bd['calendar'],exact=True).select_option('jalali');assert page.get_by_label(bd['year'],exact=True).input_value()=='1403'
   page.get_by_role('button',name=m['common']['continue'],exact=True).click()
  else:page.get_by_role('button',name=m['onboarding']['age']['skip'],exact=True).click()
  expect(page.get_by_text(m['onboarding']['age']['saveFailed'],exact=True)).to_be_visible();assert len(injected)==1
  if fault in ['progress-failure','cached-response-edit']:assert page.get_by_label(bd['year'],exact=True).input_value()=='1403'
  Image.open(io.BytesIO(page.screenshot(full_page=True))).save(out/f'{fault}-error-{locale}-{width}.webp',quality=80)
  # A full document reload clears Zustand; all recovery information now comes from real API/DB state.
  if fault!='cached-response-edit':page.reload(wait_until='networkidle',timeout=60000)
  expect(page.get_by_role('heading',name=m['onboarding']['age']['title'],exact=True)).to_be_visible(timeout=30000)
  if fault in ['progress-failure','cached-response-edit']:
   page.get_by_role('button',name=m['onboarding']['age']['useApprox'],exact=True).click()
   page.get_by_label(m['onboarding']['age']['approxAgeLabel'],exact=True).fill('۰')
   page.get_by_role('button',name=m['common']['continue'],exact=True).click()
  else:page.get_by_role('button',name=m['onboarding']['age']['skip'],exact=True).click()
  expect(page.locator('input[type=file]')).to_have_count(1)
  pets=page.evaluate("""async hh => {const r=await fetch('http://127.0.0.1:4141/households/'+hh+'/pets',{credentials:'include'});if(!r.ok)throw Error('Pet read failed');return r.json()}""",fixture['householdId'])
  assert len(pets)==1 and pets[0]['name']=='کوکی',len(pets)
  if os.environ.get('QA_CASE')=='cached-baseline':
   (out/'baseline-cached-age.json').write_text(json.dumps({'expectedApproximateAgeMonths':0,'actualApproximateAgeMonths':pets[0]['approximateAgeMonths'],'actualBirthDate':pets[0]['birthDate'],'petCreateRequests':len([v for v in mutations if v['method']=='POST' and v['path'].endswith('/pets')])},indent=2))
   Image.open(io.BytesIO(page.screenshot(full_page=True))).save(out/'baseline-cached-age-fa-390.webp',quality=80)
  assert pets[0]['birthDate'] is None
  assert pets[0]['approximateAgeMonths']==(0 if fault in ['progress-failure','cached-response-edit'] else None)
  creates=[v for v in mutations if v['method']=='POST' and v['path'].endswith('/pets')];assert len(creates)==(2 if fault=='cached-response-edit' else 1)
  assert not errors,errors
  overflow=page.evaluate('document.documentElement.scrollWidth>innerWidth');assert not overflow
  Image.open(io.BytesIO(page.screenshot(full_page=True))).save(out/f'{fault}-recovered-{locale}-{width}.webp',quality=80)
  result={'locale':locale,'width':width,'fault':fault,'injected':injected,'createdPets':len(pets),'postPetRequests':len(creates),'asciiIdempotencyHeader':True,'persistedBirthDate':pets[0]['birthDate'],'persistedApproximateAgeMonths':pets[0]['approximateAgeMonths'],'pageErrors':errors,'overflow':overflow,'mutations':mutations};results.append(result);(out/'checks.json').write_text(json.dumps(results,indent=2));print(json.dumps({k:v for k,v in result.items() if k!='mutations'}),flush=True);context.close()
 browser.close()
