"""Cached PR #51 UI permission QA; loopback fixtures only, every mutation rejected."""
import hashlib,io,json,os,runpy
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[4];g=runpy.run_path(str(root/'apps/web/design-review/approved-rollout/browser-fixtures.py'))
out=Path(os.environ['QA_EVIDENCE_DIR']);out.mkdir(parents=True,exist_ok=True)
stage=os.environ.get('QA_STAGE','after');origin=os.environ.get('QA_WEB_ORIGIN','http://localhost:3037');assert urlparse(origin).hostname in ['localhost','127.0.0.1']
roles={'readonly':('READ_ONLY',['content.view'],'DRAFT'),'editor-draft':('EDITOR',['content.view','content.edit','content.create'],'DRAFT'),'editor-live':('EDITOR',['content.view','content.edit','content.create'],'VISIBLE'),'publisher':('ADMIN',['content.view','content.edit','content.create','content.publish','content.archive'],'VISIBLE')};results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for mode in (['readonly'] if stage=='before' else roles):
  role,permissions,status=roles[mode]
  for locale in ['fa','en']:
   t=json.loads((root/f'apps/web/messages/{locale}.json').read_text())['admin']['content']['editor']
   for width in [390,1440]:
    page=browser.new_page(viewport={'width':width,'height':1000},reduced_motion='reduce');errors=[];assets=[];requests=[];blocked=[];failed=[];responses=[];console=[]
    page.on('console',lambda m:console.append(hashlib.sha256(m.text.encode()).hexdigest()) if m.type=='error' else None)
    page.on('pageerror',lambda e:errors.append(str(e)));page.on('requestfailed',lambda r:failed.append({'path':urlparse(r.url).path,'error':r.failure}));page.on('response',lambda r:responses.append({'path':urlparse(r.url).path,'status':r.status}))
    page.on('response',lambda r:assets.append({'path':urlparse(r.url).path,'status':r.status,'mime':r.headers.get('content-type','')}) if '/_next/static/' in r.url else None)
    def route(r):
     u=urlparse(r.request.url);assert u.hostname in ['localhost','127.0.0.1'],'Off-target request'
     if r.request.method not in ['GET','HEAD','OPTIONS']:blocked.append(u.path);r.abort();return
     if u.port!=4000:r.continue_();return
     requests.append(u.path)
     date='2026-01-01T00:00:00.000Z';text='مقالهٔ نمونه برای بررسی مجوزها'
     if u.path=='/admin/me':data={'isAdmin':True,'adminUserId':'qa-admin','displayName':'QA','role':role,'permissions':permissions}
     elif u.path in ['/admin/content/categories','/admin/content/authors','/admin/content/tags']:data=[]
     elif u.path=='/admin/content/articles/article-1':data={'id':'article-1','author':None,'category':None,'coverMediaAsset':None,'tags':[],'createdByAdmin':None,'createdAt':date,'updatedAt':date,'locales':[{'locale':'fa','status':status,'title':text,'slug':'qa-article','updatedAt':date}]}
     elif u.path=='/admin/content/articles/article-1/locales/fa':data={'articleId':'article-1','locale':'fa','status':status,'title':text,'slug':'qa-article','excerpt':None,'body':[{'type':'paragraph','content':[{'text':'متن کنترل‌شدهٔ بررسی'}]}],'seoTitle':None,'seoDescription':None,'publishedAt':date if status=='VISIBLE' else None,'lastEditedByAdmin':None,'createdAt':date,'updatedAt':date}
     elif u.path=='/settings/public':data={'platform.announcement':None}
     else:return g['mock'](r)
     r.fulfill(content_type='application/json',body=json.dumps(data))
    page.route('**/*',route);page.goto(origin+'/'+locale+'/admin/content/article-1',wait_until='networkidle',timeout=180000)
    main=page.locator('main');expect(main.get_by_role('heading',name=t['editTitle'],exact=True)).to_be_visible(timeout=60000)
    title=main.get_by_label(t['titleField'],exact=True);expect(title).to_have_value('مقالهٔ نمونه برای بررسی مجوزها',timeout=30000)
    def count(key):return main.get_by_role('button',name=t[key],exact=True).count()
    controls={key:count(key) for key in ['save','saveLive','saveSharedFields','publish','hide','archive']}
    if stage=='before':assert controls['save']==1 and controls['publish']==1
    elif mode=='readonly':assert not any(controls.values()) and title.evaluate('(e)=>e.readOnly')
    elif mode=='editor-draft':assert controls['save']==1 and controls['saveSharedFields']==1 and controls['publish']==controls['hide']==controls['archive']==0
    elif mode=='editor-live':assert controls['saveLive']==0 and controls['saveSharedFields']==1 and controls['publish']==controls['hide']==controls['archive']==0 and title.evaluate('(e)=>e.readOnly')
    elif mode=='publisher':assert controls['saveLive']==1 and controls['hide']==1 and not title.evaluate('(e)=>e.readOnly')
    page.evaluate('document.fonts.ready');page.evaluate('window.scrollTo(0,0)')
    Image.open(io.BytesIO(page.screenshot(full_page=True))).save(out/f'{stage}-{mode}-{locale}-{width}.webp',quality=85)
    row={'stage':stage,'mode':mode,'locale':locale,'width':width,'controls':controls,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'pageErrors':errors,'consoleErrors':console,'failedRequests':failed,'assets':assets,'reads':requests,'blockedMutations':blocked};results.append(row);(out/f'{stage}-checks.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in row.items() if k not in ['assets','reads']}),flush=True)
    assert not console and not errors and not row['overflow'] and not blocked and assets and all(a['status']==200 for a in assets)
    assert all(('javascript' in a['mime']) if a['path'].endswith('.js') else ('text/css' in a['mime']) if a['path'].endswith('.css') else True for a in assets)
    assert all(f['path']=='/settings/public' and f['error']=='net::ERR_ABORTED' and any(r['path']==f['path'] and r['status']==200 for r in responses) for f in failed)
    page.close()
 browser.close()
