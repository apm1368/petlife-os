import json,io,os
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image
from playwright.sync_api import sync_playwright,expect
root=Path(os.environ['QA_REPO_ROOT']);out=Path(os.environ['QA_EVIDENCE_DIR']);out.mkdir(parents=True,exist_ok=True)
private=Path(os.environ['QA_FIXTURES_FILE']).resolve();assert private.stat().st_mode & 0o077 == 0 and not private.is_relative_to(root.resolve())
fixtures=[f for f in json.loads(private.read_text()) if f['fault'] in ['draft-family-switch']]
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for f in fixtures:
  locale,width=f['locale'],f['width'];m=json.loads((root/f'apps/web/messages/{locale}.json').read_text())
  context=browser.new_context(viewport={'width':width,'height':900},reduced_motion='reduce');context.add_cookies([{'name':'petlife_session','value':f['session'],'domain':'127.0.0.1','path':'/','httpOnly':True,'sameSite':'Lax'},{'name':'petlife_csrf','value':f['csrf'],'domain':'127.0.0.1','path':'/','sameSite':'Lax'}]);page=context.new_page();errors=[];creates=[]
  def route(r):
   u=urlparse(r.request.url);assert u.hostname in ['localhost','127.0.0.1']
   if u.port==4141 and r.request.method=='POST' and u.path.endswith('/pets'):
    creates.append(u.path);assert r.request.headers['idempotency-key'].isascii()
   r.continue_()
  page.route('**/*',route);page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:3020/{locale}/onboarding',wait_until='networkidle',timeout=180000)
  expect(page.get_by_role('heading',name=m['onboarding']['species']['title'],exact=True)).to_be_visible(timeout=30000)
  page.get_by_role('button',name='گربه' if locale=='fa' else 'Cat',exact=True).click();page.get_by_role('textbox').fill('کوکی');page.get_by_role('button',name=m['common']['continue'],exact=True).click()
  expect(page.get_by_role('heading',name=m['onboarding']['age']['title'],exact=True)).to_be_visible();page.evaluate('window.__qaDraftNavigationMarker=1')
  page.locator('a.member-header__brand').click();page.wait_for_url('**/'+locale+'/home',timeout=60000);page.go_back(wait_until='networkidle',timeout=60000)
  assert page.evaluate('window.__qaDraftNavigationMarker')==1,'Navigation reloaded the document; cannot prove in-memory draft preservation'
  expect(page.get_by_role('heading',name=m['onboarding']['age']['title'],exact=True)).to_be_visible()
  Image.open(io.BytesIO(page.screenshot(full_page=True))).save(out/f'same-family-draft-{locale}-{width}.webp',quality=80)
  page.locator('a.member-header__brand').click();page.wait_for_url('**/'+locale+'/home',timeout=60000)
  h=context.request.post('http://127.0.0.1:4141/households',data={},headers={'x-csrf-token':f['csrf']});assert h.status==201;new=h.json()['id']
  changed=context.request.put('http://127.0.0.1:4141/onboarding/progress',data={'chapter':'PET_IDENTITY','step':'age','status':'IN_PROGRESS','householdId':new},headers={'x-csrf-token':f['csrf']});assert changed.status==200 and changed.json()['petId'] is None
  page.go_back(wait_until='networkidle',timeout=60000);assert page.evaluate('window.__qaDraftNavigationMarker')==1
  expect(page.get_by_role('heading',name=m['onboarding']['species']['title'],exact=True)).to_be_visible(timeout=30000);expect(page.locator('.add-pet-species button[aria-pressed="true"]')).to_have_count(0)
  page.get_by_role('button',name='سگ' if locale=='fa' else 'Dog',exact=True).click();field=page.get_by_role('textbox');expect(field).to_have_value('');field.fill('دوم');page.get_by_role('button',name=m['common']['continue'],exact=True).click()
  expect(page.get_by_role('heading',name=m['onboarding']['age']['title'],exact=True)).to_be_visible();page.get_by_role('button',name=m['onboarding']['age']['skip'],exact=True).click();expect(page.locator('input[type=file]')).to_have_count(1)
  old=context.request.get('http://127.0.0.1:4141/households/'+f['householdId']+'/pets');pets=context.request.get('http://127.0.0.1:4141/households/'+new+'/pets');assert old.status==pets.status==200;assert old.json()==[];assert len(pets.json())==1 and pets.json()[0]['name']=='دوم' and pets.json()[0]['species']=='DOG';assert len(creates)==1
  hydrated=page.evaluate("[...document.querySelectorAll('*')].filter(e=>Object.keys(e).some(k=>k.startsWith('__reactFiber')||k.startsWith('__reactProps'))).length");assert hydrated>0
  overflow=page.evaluate('document.documentElement.scrollWidth>innerWidth');assert not overflow and not errors
  Image.open(io.BytesIO(page.screenshot(full_page=True))).save(out/f'new-family-recovered-{locale}-{width}.webp',quality=80)
  row={'locale':locale,'width':width,'clientNavigationPreservedDocument':True,'sameHouseholdDraftPreserved':True,'otherHouseholdDraftCleared':True,'oldHouseholdPets':0,'newHouseholdPets':1,'petCreateRequests':1,'reactBoundElements':hydrated,'overflow':overflow,'pageErrors':errors};results.append(row);(out/'checks.json').write_text(json.dumps(results,indent=2));print(json.dumps(row),flush=True);context.close()
 browser.close()
