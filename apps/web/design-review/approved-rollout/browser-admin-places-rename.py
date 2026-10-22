"""Controlled browser QA for the admin place-name editor; loopback fixtures only."""
import io,json,os,runpy
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image
from playwright.sync_api import sync_playwright,expect

root=Path(os.environ.get('QA_REPO_ROOT',str(Path(__file__).resolve().parents[4])))
mock=runpy.run_path(str(root/'apps/web/design-review/approved-rollout/browser-fixtures.py'))['mock']
out=Path(os.environ['QA_EVIDENCE_DIR']);out.mkdir(parents=True,exist_ok=True)
stage=os.environ.get('QA_STAGE','after');origin=os.environ['QA_WEB_ORIGIN'];assert urlparse(origin).hostname in ['localhost','127.0.0.1']
modes=['manager'] if stage=='before' else ['readonly','manager'];rows=[]

with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for mode in modes:
  permissions=['places.view']+(['places.manage'] if mode=='manager' else [])
  for locale in ['fa','en']:
   for width in [390,1440]:
    current_name=['پارک قدیمی' if locale=='fa' else 'Old park'];patches=[]
    page=browser.new_page(viewport={'width':width,'height':1000},reduced_motion='reduce');errors=[];console=[];assets=[];failed=[]
    page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:console.append(m.text) if m.type=='error' else None)
    page.on('requestfailed',lambda r:failed.append({'path':urlparse(r.url).path,'error':r.failure}))
    page.on('response',lambda r:assets.append({'path':urlparse(r.url).path,'status':r.status,'mime':r.headers.get('content-type','')}) if '/_next/static/' in r.url else None)
    def route(r):
     u=urlparse(r.request.url);assert u.hostname in ['localhost','127.0.0.1'],'Off-target request'
     if u.port!=4000:r.continue_();return
     if u.path=='/admin/me':data={'isAdmin':True,'adminUserId':'qa-admin','displayName':'QA','role':'OPERATIONS','permissions':permissions}
     elif u.path=='/admin/places/reports':data=[]
     elif u.path=='/admin/places' and r.request.method=='GET':data={'items':[{'id':'place-1','name':current_name[0],'description':None,'category':'PARK','country':'IR','city':'Tehran','address':None,'latitude':35.7,'longitude':51.4,'speciesAllowed':['DOG'],'sizeRestrictions':None,'indoorAllowed':False,'outdoorAllowed':True,'petPolicy':None,'imageUrls':[],'status':'VERIFIED','isPubliclyListed':True,'averageRating':None,'reviewCount':0,'isFavorited':False,'createdAt':'2026-01-01T00:00:00.000Z','updatedAt':'2026-01-01T00:00:00.000Z'}],'total':1,'page':1,'pageSize':20}
     elif u.path=='/admin/places/place-1' and r.request.method=='PATCH':
      body=json.loads(r.request.post_data or '{}');patches.append(body);current_name[0]=body['name'];data={'id':'place-1','name':current_name[0]}
     else:return mock(r)
     r.fulfill(status=200,content_type='application/json',body=json.dumps(data,ensure_ascii=False))
    page.route('**/*',route);page.goto(origin.rstrip('/')+'/'+locale+'/admin/places',wait_until='networkidle',timeout=180000)
    expect(page.get_by_role('heading',name='مکان‌های دوستدار حیوانات' if locale=='fa' else 'Pet-friendly places',exact=True)).to_be_visible(timeout=60000)
    edit_name='ویرایش نام' if locale=='fa' else 'Edit name';save_name='ذخیرهٔ نام' if locale=='fa' else 'Save name';field_name='نام مکان' if locale=='fa' else 'Place name';new_name='پارک تازه' if locale=='fa' else 'New park'
    if stage=='before':assert page.get_by_role('button',name=edit_name,exact=True).count()==0
    elif mode=='readonly':
     assert page.get_by_role('button',name=edit_name,exact=True).count()==0
     assert page.get_by_role('button',name='خروج از فهرست' if locale=='fa' else 'Unlist',exact=True).count()==0
    else:
     page.get_by_role('button',name=edit_name,exact=True).click();page.get_by_label(field_name,exact=True).fill(new_name);page.get_by_role('button',name=save_name,exact=True).click();expect(page.get_by_text(new_name,exact=True)).to_be_visible();assert patches==[{'name':new_name}]
     page.get_by_role('button',name=edit_name,exact=True).click();expect(page.get_by_label(field_name,exact=True)).to_have_value(new_name)
    page.evaluate('document.fonts.ready');page.evaluate('window.scrollTo(0,0)')
    row={'stage':stage,'mode':mode,'locale':locale,'width':width,'patches':patches,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'pageErrors':errors,'consoleErrors':console,'failedRequests':failed,'assets':assets};rows.append(row)
    Image.open(io.BytesIO(page.screenshot(full_page=True))).save(out/f'{stage}-{mode}-{locale}-{width}.webp',quality=85);(out/f'{stage}-checks.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in row.items() if k!='assets'},ensure_ascii=False),flush=True)
    assert not errors and not console and not failed and not row['overflow'] and assets and all(a['status']==200 for a in assets)
    page.close()
 browser.close()
