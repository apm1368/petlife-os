import runpy,json,os,io
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image
from playwright.sync_api import sync_playwright,expect
root=Path(os.environ['QA_REPO_ROOT']);g=runpy.run_path(str(root/'apps/web/design-review/approved-rollout/browser-fixtures.py'));api=g['mock'];pet=g['pet'];other={**pet,'id':'pet-2','name':'پیشی مهربان خانواده با نام طولانی برای نمایش','species':'CAT','breed':None,'photoUrl':None};out=Path(os.environ['QA_EVIDENCE_DIR']);out.mkdir(parents=True,exist_ok=True);stage=os.environ.get('QA_STAGE','after');mode=os.environ.get('QA_MODE','list');results=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for locale in ['fa','en']:
  for width in [390,1440]:
   page=b.new_page(viewport={'width':width,'height':950},reduced_motion='reduce');errors=[];console=[];badResponses=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:console.append(m.text) if m.type=='error' else None);page.on('response',lambda r:badResponses.append({'path':urlparse(r.url).path,'status':r.status}) if r.status>=400 else None)
   def route(r):
    u=urlparse(r.request.url)
    assert u.hostname in ['localhost','127.0.0.1']
    if u.port==4000:
     if mode=='clean' and u.path=='/settings/public':r.fulfill(status=200,content_type='application/json',body='{}');return
     if u.path=='/households/h1/active-pet' and r.request.method not in ['GET','OPTIONS']:
      r.fulfill(status=503,content_type='application/json',body=json.dumps({'error':{'code':'QA_SAVE_FAILED','message':'Controlled failure'}}));return
     if u.path=='/households/h1/pets':r.fulfill(status=200,content_type='application/json',body=json.dumps([] if mode=='empty' else [pet,other]));return
     return api(r)
    r.continue_()
   page.route('**/*',route);page.goto(os.environ.get('QA_WEB_ORIGIN','http://127.0.0.1:3030').rstrip('/')+'/'+locale+'/pets',wait_until='networkidle',timeout=180000)
   expect(page.get_by_role('heading',name=json.loads((root/f'apps/web/messages/{locale}.json').read_text())['pets']['myPets'])).to_be_visible(timeout=30000)
   main=page.locator('#member-main-content')
   if mode!='empty':expect(main.get_by_text(other['name'],exact=True)).to_be_visible()
   if mode=='error':
    messages=json.loads((root/f'apps/web/messages/{locale}.json').read_text())['pets'];page.get_by_role('button',name=messages['setActive'],exact=True).click();expect(main.get_by_role('alert').filter(has_text=messages['switchFailed'])).to_have_text(messages['switchFailed']);expect(main.get_by_text(pet['name'],exact=True)).to_be_visible()
   page.evaluate('document.fonts.ready')
   overflow=page.evaluate('document.documentElement.scrollWidth>innerWidth');row={'locale':locale,'width':width,'overflow':overflow,'pageErrors':errors,'mode':mode,'consoleErrors':console,'failedHttp':badResponses,'clippedButtons':main.locator('button').evaluate_all('(buttons)=>buttons.filter(b=>b.offsetParent!==null && b.scrollHeight>b.clientHeight+1).map(b=>b.textContent)'), 'headingClipped':page.get_by_role('heading',name=json.loads((root/f'apps/web/messages/{locale}.json').read_text())['pets']['myPets']).evaluate('(h)=>h.scrollWidth>h.clientWidth+1')};results.append(row)
   Image.open(io.BytesIO(page.screenshot(full_page=True))).save(out/(stage+'-'+mode+'-'+locale+'-'+str(width)+'.webp'),quality=85)
   (out/(stage+'-'+mode+'-checks.json')).write_text(json.dumps(results,indent=2));print(json.dumps(row),flush=True)
   if mode=='clean':assert not console and not badResponses
   if stage=='after':assert not overflow and not errors and not row['clippedButtons'] and not row['headingClipped']
   page.close()
 b.close()
