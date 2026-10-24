"""Loopback-only controlled photo partial-save QA. No live API/storage requests."""
import hashlib,io,json,os,runpy
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[4]
g=runpy.run_path(str(root/'apps/web/design-review/approved-rollout/browser-fixtures.py'))
out=Path(os.environ['QA_EVIDENCE_DIR']);out.mkdir(parents=True,exist_ok=True)
stage=os.environ.get('QA_STAGE','after');origin=os.environ.get('QA_WEB_ORIGIN','http://localhost:3038');assert urlparse(origin).hostname in ['localhost','127.0.0.1']
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for locale in ['fa','en']:
  for width in [390,1440]:
   page=browser.new_page(viewport={'width':width,'height':1000},reduced_motion='reduce');errors=[];assets=[];network=[];failed=[];responses=[];console=[];state={'uploads':0,'patches':0};pet=dict(g['pet']);pet['photoUrl']=None
   page.on('pageerror',lambda e:errors.append(e.stack))
   page.on('console',lambda m:console.append({'digest':hashlib.sha256(m.text.encode()).hexdigest(),'expected503':'503' in m.text}) if m.type=='error' else None)
   page.on('response',lambda r:responses.append({'path':urlparse(r.url).path,'status':r.status,'mime':r.headers.get('content-type','')}))
   page.on('response',lambda r:assets.append({'path':urlparse(r.url).path,'status':r.status,'mime':r.headers.get('content-type','')}) if '/_next/static/' in r.url else None)
   page.on('requestfailed',lambda r:failed.append({'path':urlparse(r.url).path,'error':r.failure,'rsc':r.headers.get('rsc')=='1'}))
   def route(r):
    u=urlparse(r.request.url);assert u.hostname in ['localhost','127.0.0.1'],'Off-target request'
    method=r.request.method
    if u.port!=4000:
     assert method in ['GET','HEAD'];r.continue_();return
    network.append({'method':method,'path':u.path})
    if u.path=='/__qa-upload' and method=='PUT':
     state['uploads']+=1;r.fulfill(status=503 if state['uploads']==1 else 200,json={'ok':state['uploads']>1});return
    if u.path=='/pets/pet-1' and method=='PATCH':
     state['patches']+=1;pet.update(r.request.post_data_json);r.fulfill(content_type="application/json",json=pet);return
    if u.path=='/pets/pet-1/photo-upload-url' and method=='POST':
     r.fulfill(content_type="application/json",json={'uploadUrl':'http://localhost:4000/__qa-upload','publicUrl':'/images/landing/home/cookie.webp','method':'PUT','headers':{}});return
    assert method in ['GET','OPTIONS'],'Unexpected mutation'
    if u.path=='/settings/public':data={'platform.announcement':None}
    elif u.path=='/pets/pet-1/access':data=g['access']
    elif u.path=='/pets/pet-1/overview':data={'pet':pet,'householdName':'خانواده نمونه','attention':[],'upcoming':[],'recentHealth':[],'recentActivity':[],'recentMemory':None}
    elif u.path=='/pets/pet-1/care-items':data=[]
    else:return g['mock'](r)
    r.fulfill(content_type="application/json",json=data)
   page.route('**/*',route)
   page.goto(origin+'/'+locale+'/pets/pet-1?edit=identity',wait_until='networkidle',timeout=180000)
   editor=page.locator('.pet-edit');expect(editor).to_be_visible(timeout=60000)
   name=editor.get_by_label('نام' if locale=='fa' else 'Name',exact=True);name.fill('کوکی ویرایش‌شده' if locale=='fa' else 'Cookie edited')
   image=io.BytesIO();Image.open(root/'apps/web/public/images/landing/home/cookie.webp').save(image,format='PNG')
   editor.locator('input[type=file]').set_input_files({'name':'pet.png','mimeType':'image/png','buffer':image.getvalue()})
   editor.get_by_role('button',name='ذخیره' if locale=='fa' else 'Save',exact=True).click()
   page.wait_for_function("!document.querySelector('.pet-edit') || document.querySelector('.pet-edit [role=alert]')",timeout=30000)
   if stage=='after':
    expect(editor.get_by_role('alert')).to_have_text('عکس بارگذاری نشد؛ بقیهٔ تغییرها ذخیره شد.' if locale=='fa' else "The photo didn't upload; the other changes were saved.")
    expect(name).to_have_value('کوکی ویرایش‌شده' if locale=='fa' else 'Cookie edited')
   else:
    page.wait_for_load_state('networkidle');expect(editor.get_by_role('alert')).to_have_count(0)
   page.evaluate('document.fonts.ready');page.evaluate('window.scrollTo(0,0)')
   Image.open(io.BytesIO(page.screenshot(full_page=True))).save(out/f'{stage}-photo-error-{locale}-{width}.webp',quality=85)
   assert state['uploads']==1,'Unexpected automatic upload retry'
   row={'locale':locale,'width':width,'stage':stage,'formRetained':editor.count()>0,'photoErrorVisible':editor.get_by_role('alert').count()>0,'selectedPhotoCount':editor.locator('input[type=file]').evaluate('(e)=>e.files.length') if editor.count() else 0,'uploadsBeforeExplicitRetry':state['uploads'],'pageErrors':errors,'consoleErrors':console,'responses':responses,'failedRequests':failed,'assets':assets,'network':network,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth')}
   if stage=='after':
    editor.get_by_role('button',name='ذخیره' if locale=='fa' else 'Save',exact=True).click();expect(editor).to_have_count(0,timeout=30000);expect(page.locator('.pet-overview')).to_be_visible(timeout=30000);page.wait_for_load_state('networkidle');assert state['uploads']==2 and state['patches']==3
    row['explicitRetryRecovered']=True;page.evaluate('window.scrollTo(0,0)')
    Image.open(io.BytesIO(page.screenshot(full_page=True))).save(out/f'{stage}-photo-recovered-{locale}-{width}.webp',quality=85)
   results.append(row);(out/f'{stage}-checks.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in row.items() if k not in ['assets','network','responses']}),flush=True)
   assert not errors and not row['overflow'] and assets and all(a['status']==200 for a in assets)
   assert all(e['expected503'] for e in console)
   for f in failed:
    assert f['error']=='net::ERR_ABORTED' and (
     (f['path']=='/settings/public' and any(r['path']==f['path'] and r['status']==200 for r in responses)) or
     (f['path']=='/'+locale+'/pets/pet-1' and f['rsc'] and any(r['path']==f['path'] and r['status']==200 and 'text/x-component' in r['mime'] for r in responses))
    ),f
   page.close()
 browser.close()
