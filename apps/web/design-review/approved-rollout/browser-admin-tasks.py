import runpy,json,io,os
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image
from playwright.sync_api import sync_playwright,expect
root=Path(os.environ.get('QA_REPO_ROOT',str(Path(__file__).resolve().parents[4])));g=runpy.run_path(str(root/'apps/web/design-review/approved-rollout/browser-fixtures.py'));api=g['mock'];out=Path(os.environ.get('QA_EVIDENCE_DIR','/tmp/opetlife-task-design'));out.mkdir(parents=True,exist_ok=True);stage=os.environ.get('QA_STAGE','after');mode=os.environ.get('QA_MODE','list');results=[]
task={'id':'t1','title':'بررسی مدارک کلینیک نمونه و پیگیری جواز فعالیت','description':'مدارک ارسال شده‌اند؛ نتیجه بررسی و علت تصمیم در پرونده ثبت شود.','assigneeAdmin':{'id':'a1','displayName':'کارشناس نمونه','role':'VERIFICATION'},'dueAt':'2026-10-22T10:00:00Z','status':'BLOCKED','priority':'HIGH','relatedEntityType':'PROVIDER_ORGANIZATION','relatedEntityId':'org1','source':'PARTNER_VERIFICATION','team':'PARTNER_OPERATIONS','createdByAdmin':None,'completedAt':None,'createdAt':'2026-10-17T07:00:00Z','updatedAt':'2026-10-17T07:00:00Z'}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for locale in ['fa','en']:
  for width in [390,1440]:
   page=b.new_page(viewport={'width':width,'height':950},reduced_motion='reduce');errors=[];console=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:console.append(m.text) if m.type=='error' else None)
   def route(r):
    u=urlparse(r.request.url);assert u.hostname in ['localhost','127.0.0.1']
    if u.port==4000:
     if mode in ['create-error','status-error'] and r.request.method not in ['GET','OPTIONS'] and u.path.startswith('/admin/tasks'):
      r.fulfill(status=503,content_type='application/json',body=json.dumps({'error':{'code':'QA_SAVE_FAILED','message':'Controlled failure'}}));return
     if u.path=='/admin/me':r.fulfill(status=200,content_type='application/json',body=json.dumps({'isAdmin':True,'role':'VERIFICATION','displayName':'کارشناس نمونه','permissions':['customer.view','verification.manage','task.manage'],'adminUserId':'a1'}));return
     if u.path=='/admin/tasks':r.fulfill(status=200,content_type='application/json',body=json.dumps({'items':[] if mode=='empty' else [task,{**task,'id':'t2','title':'پیگیری درخواست دوم','description':None,'assigneeAdmin':None,'dueAt':None,'status':'OPEN','priority':'NORMAL'}],'total':0 if mode=='empty' else 2,'page':1,'pageSize':50}));return
     return api(r)
    r.continue_()
   page.route('**/*',route);page.goto(os.environ.get('QA_WEB_ORIGIN','http://127.0.0.1:3030').rstrip('/')+'/'+locale+'/admin/tasks',wait_until='networkidle',timeout=180000)
   expect(page.get_by_role('heading',name='وظایف' if locale=='fa' else 'Tasks',exact=True)).to_be_visible(timeout=30000)
   main=page.locator('.erp-main');messages=json.loads((root/f'apps/web/messages/{locale}.json').read_text())['admin']['tasks']
   if mode!='empty':expect(page.get_by_text(task['title'],exact=True)).to_be_visible()
   if mode=='create-error':
    page.get_by_role('button',name=messages['newTask'],exact=True).click();page.get_by_label(messages['form']['title'],exact=True).fill('پیگیری نمونه');page.get_by_label(messages['form']['description'],exact=True).fill('پیش‌نویس محفوظ');page.get_by_role('button',name=messages['form']['submit'],exact=True).click();expect(page.get_by_role('alert').filter(has_text=messages['createFailed'])).to_be_visible();expect(page.get_by_label(messages['form']['title'],exact=True)).to_have_value('پیگیری نمونه')
   if mode=='status-error':
    page.get_by_label(messages['changeStatus'],exact=True).first.select_option('DONE');expect(page.get_by_role('alert').filter(has_text=messages['updateFailed'])).to_be_visible();expect(page.get_by_label(messages['changeStatus'],exact=True).first).to_have_value('BLOCKED')
   page.evaluate('document.fonts.ready')
   row={'locale':locale,'width':width,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'pageErrors':errors,'consoleErrors':[e.split('\n')[0] for e in console],'mode':mode,'unexpectedConsoleErrors':[e.split('\n')[0] for e in console if not (mode in ['create-error','status-error'] and 'Failed to load resource' in e and '503' in e)]};results.append(row);Image.open(io.BytesIO(page.screenshot(full_page=True))).save(out/(stage+'-'+mode+'-'+locale+'-'+str(width)+'.webp'),quality=85);(out/(stage+'-'+mode+'-checks.json')).write_text(json.dumps(results,indent=2));print(json.dumps(row),flush=True);
   if stage=='after':assert not row['overflow'] and not errors and not row['unexpectedConsoleErrors']
   page.close()
 b.close()
