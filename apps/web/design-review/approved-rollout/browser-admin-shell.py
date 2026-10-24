import runpy,json,io,os
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image
from playwright.sync_api import sync_playwright,expect
root=Path(os.environ['QA_REPO_ROOT']);out=Path(os.environ.get('QA_EVIDENCE_DIR','/tmp/opetlife-admin-design'));out.mkdir(parents=True,exist_ok=True);stage=os.environ.get('QA_STAGE','after');origin=os.environ['QA_WEB_ORIGIN'];mock=runpy.run_path(str(root/'apps/web/design-review/approved-rollout/browser-fixtures.py'))['mock'];rows=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for locale in ['fa','en']:
  for width in [390,1440]:
   page=b.new_page(viewport={'width':width,'height':1050},reduced_motion='reduce');errors=[];console=[];bad=[];mutations=[]
   page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:console.append(m.text.split('\n')[0]) if m.type=='error' else None);page.on('response',lambda r:bad.append({'url':r.url,'status':r.status}) if r.status>=400 else None)
   def route(r):
    u=urlparse(r.request.url);assert u.hostname in ['localhost','127.0.0.1']
    if u.port==4000:
     if r.request.method not in ['GET','OPTIONS']:mutations.append(u.path)
     if u.path=='/admin/me':r.fulfill(status=200,content_type='application/json',body=json.dumps({'isAdmin':True,'role':'SUPER_ADMIN','displayName':'مدیر نمونه','adminUserId':'a1','permissions':['customer.view','support.view','trust.view','verification.manage','finance.view','content.view','task.manage','settings.view']}));return
     return mock(r)
    r.continue_()
   page.route('**/*',route);page.goto(origin+'/'+locale+'/admin',wait_until='networkidle',timeout=180000);expect(page.locator('.erp-main')).to_be_visible();page.evaluate('document.fonts.ready')
   for view in ['page','navigation']:
    if view=='navigation':
     if width==390:page.get_by_role('button',name='باز کردن منو' if locale=='fa' else 'Open menu',exact=True).click();expect(page.get_by_role('dialog')).to_be_visible()
     else:page.get_by_role('button',name='شبکه و بازار' if locale=='fa' else 'Network',exact=True).click()
     expect(page.get_by_role('link',name='ارائه‌دهندگان' if locale=='fa' else 'Providers',exact=True)).to_be_visible()
     assert page.get_by_role('link',name='CRM',exact=True).count()==0
    row={'locale':locale,'width':width,'view':view,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'pageErrors':list(errors),'consoleErrors':list(console),'failedResponses':list(bad),'mutations':list(mutations)};rows.append(row)
    Image.open(io.BytesIO(page.screenshot(full_page=True))).save(out/f'{stage}-{view}-{locale}-{width}.webp',quality=85);(out/f'{stage}-checks.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n');print(json.dumps(row),flush=True)
    assert not row['overflow'] and not errors and not console and not bad and not mutations
   page.close()
 b.close()
