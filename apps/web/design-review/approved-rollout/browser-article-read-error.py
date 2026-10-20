"""Loopback-only article locale read failure/recovery; no mutations allowed."""
import hashlib,io,json,os,runpy,socket,time
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[4];g=runpy.run_path(str(root/'apps/web/design-review/approved-rollout/browser-fixtures.py'))
stage=os.environ.get('QA_STAGE','after');origin=os.environ.get('QA_WEB_ORIGIN','http://localhost:3037');u=urlparse(origin);assert u.hostname in ['localhost','127.0.0.1']
for _ in range(60):
 try:socket.create_connection((u.hostname,u.port),timeout=1).close();break
 except OSError:time.sleep(.25)
out=Path(os.environ['QA_EVIDENCE_DIR']);out.mkdir(parents=True,exist_ok=True);rows=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for locale in ['fa','en']:
  t=json.loads((root/f'apps/web/messages/{locale}.json').read_text())['admin']['content']['editor']
  for width in [390,1440]:
   page=browser.new_page(viewport={'width':width,'height':1000},reduced_motion='reduce');state={'recovered':False};errors=[];console=[];failed=[];assets=[];reads=[];blocked=[]
   page.on('pageerror',lambda e:errors.append(str(e)));page.on('requestfailed',lambda r:failed.append({'path':urlparse(r.url).path,'error':r.failure}))
   page.on('console',lambda m:console.append({'digest':hashlib.sha256(m.text.encode()).hexdigest(),'expected503':'503' in m.text}) if m.type=='error' else None)
   page.on('response',lambda r:assets.append({'path':urlparse(r.url).path,'status':r.status,'mime':r.headers.get('content-type','')}) if '/_next/static/' in r.url else None)
   def route(r):
    url=urlparse(r.request.url);assert url.hostname in ['localhost','127.0.0.1']
    if r.request.method not in ['GET','HEAD','OPTIONS']:blocked.append(url.path);r.abort();return
    if url.port!=4000:r.continue_();return
    reads.append(url.path);date='2026-01-01T00:00:00.000Z';title='محتوای واقعیِ پاسخ آزمایشی'
    if url.path=='/admin/me':data={'isAdmin':True,'adminUserId':'qa-admin','displayName':'QA','role':'ADMIN','permissions':['content.view','content.edit','content.create','content.publish','content.archive']}
    elif url.path in ['/admin/content/categories','/admin/content/authors','/admin/content/tags']:data=[]
    elif url.path=='/admin/content/articles/article-1':data={'id':'article-1','author':None,'category':None,'coverMediaAsset':None,'tags':[],'createdByAdmin':None,'createdAt':date,'updatedAt':date,'locales':[{'locale':'fa','status':'DRAFT','title':title,'slug':'qa-read','updatedAt':date}]}
    elif url.path=='/admin/content/articles/article-1/locales/fa':
     if not state['recovered']:r.fulfill(status=503,content_type='application/json',body=json.dumps({'error':{'code':'QA_UNAVAILABLE','message':'Controlled read failure','requestId':'qa'}}));return
     data={'articleId':'article-1','locale':'fa','status':'DRAFT','title':title,'slug':'qa-read','excerpt':None,'body':[{'type':'paragraph','content':[{'text':'متن پاسخ آزمایشی'}]}],'seoTitle':None,'seoDescription':None,'publishedAt':None,'lastEditedByAdmin':None,'createdAt':date,'updatedAt':date}
    elif url.path=='/settings/public':data={'platform.announcement':None}
    else:return g['mock'](r)
    r.fulfill(content_type='application/json',body=json.dumps(data))
   page.route('**/*',route);page.goto(origin+'/'+locale+'/admin/content/article-1',wait_until='networkidle',timeout=180000);main=page.locator('main');expect(main.get_by_role('heading',name=t['editTitle'],exact=True)).to_be_visible(timeout=60000)
   retry=main.get_by_role('button',name=t['retry'],exact=True)
   if stage=='after':
    expect(retry).to_be_visible();expect(main.get_by_role('button',name=t['save'],exact=True)).to_have_count(0);expect(main.get_by_label(t['titleField'],exact=True)).to_have_count(0)
   else:expect(main.get_by_label(t['titleField'],exact=True)).to_have_value('');expect(main.get_by_role('button',name=t['save'],exact=True)).to_be_visible()
   page.evaluate('document.fonts.ready');page.evaluate('window.scrollTo(0,0)');Image.open(io.BytesIO(page.screenshot(full_page=True))).save(out/f'{stage}-read-error-{locale}-{width}.webp',quality=85)
   if stage=='after':
    count=reads.count('/admin/content/articles/article-1/locales/fa');state['recovered']=True;retry.click();expect(main.get_by_label(t['titleField'],exact=True)).to_have_value('محتوای واقعیِ پاسخ آزمایشی');assert reads.count('/admin/content/articles/article-1/locales/fa')==count+1;expect(main.get_by_role('button',name=t['save'],exact=True)).to_be_visible();page.evaluate('window.scrollTo(0,0)');Image.open(io.BytesIO(page.screenshot(full_page=True))).save(out/f'{stage}-read-recovered-{locale}-{width}.webp',quality=85)
   row={'stage':stage,'locale':locale,'width':width,'errorSeparatedFromEmpty':stage=='after','retryRecovered':state['recovered'],'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'pageErrors':errors,'consoleErrors':console,'failedRequests':failed,'assets':assets,'reads':reads,'blockedMutations':blocked};rows.append(row);(out/f'{stage}-checks.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in row.items() if k not in ['assets','reads']}),flush=True)
   assert not errors and not failed and not blocked and not row['overflow'] and all(c['expected503'] for c in console)
   assert assets and all(a['status']==200 and ('javascript' in a['mime'] if a['path'].endswith('.js') else 'text/css' in a['mime'] if a['path'].endswith('.css') else True) for a in assets)
   page.close()
 browser.close()
