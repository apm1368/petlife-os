"""Controlled Chromium review. Only loopback HTTP; no live data or private files."""
import io,json,os,runpy
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image
from playwright.sync_api import sync_playwright,expect
ROOT=Path(os.environ['QA_REPO_ROOT']);OUT=Path(os.environ['QA_EVIDENCE_DIR']);OUT.mkdir(parents=True,exist_ok=True)
STAGE=os.environ.get('QA_STAGE','after');MODE=os.environ.get('QA_MODE','normal');ORIGIN=os.environ['QA_WEB_ORIGIN']
base=runpy.run_path(str(ROOT/'apps/web/design-review/approved-rollout/browser-fixtures.py'))['mock']
submitted='2026-10-15T21:00:00Z'
doc={'id':'doc1','kind':'LICENSE','status':'PENDING','mimeType':'application/pdf','fileSizeBytes':51200,'expiresAt':'2027-10-15T21:00:00Z','expiryState':'VALID','reviewNote':None,'rejectionReason':None,'submittedAt':submitted,'createdAt':submitted,'reviewedAt':None,'reviewedByAdminId':None}
policy={'version':'2026-10-15.1','mode':'MANUAL_DOCUMENT_REVIEW','officialLookup':'NOT_CONNECTED','requiredDocumentKinds':['IDENTITY','LICENSE'],'missingForSubmission':['IDENTITY'],'missingForApproval':['IDENTITY','LICENSE']}
detail={'policy':policy,'subjectType':'PROVIDER','id':'org1','name':'کلینیک نمونهٔ مراقبت و درمان حیوانات همراه','kind':'VET_CLINIC','status':'SUBMITTED','lifecycle':'PENDING','submittedAt':submitted,'note':'مدارک هویتی و مجوز فعالیت برای بررسی ارسال شده است.','canSubmit':False,'documents':[doc,{**doc,'id':'doc2','kind':'BANK_INFO','status':'REJECTED','reviewNote':'تصویر مدرک خوانا نیست؛ لطفاً نسخهٔ واضح ارسال کنید.','rejectionReason':'تصویر مدرک خوانا نیست؛ لطفاً نسخهٔ واضح ارسال کنید.','reviewedAt':'2026-10-16T10:00:00Z'}],'allowedTransitions':['UNDER_REVIEW','NEEDS_INFORMATION','REJECTED','VERIFIED']}
queue=[{'subjectType':'PROVIDER','id':'org1','name':detail['name'],'kind':'VET_CLINIC','status':'SUBMITTED','submittedAt':submitted,'waitingHours':12,'documents':{'pending':1,'accepted':2,'rejected':1,'expired':0}},{'subjectType':'SELLER','id':'seller1','name':'فروشگاه نمونهٔ خوراک و لوازم پت','kind':'SELLER','status':'NEEDS_INFORMATION','submittedAt':None,'waitingHours':None,'documents':{'pending':0,'accepted':1,'rejected':2,'expired':0}}]
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for locale in ['fa','en']:
  messages=json.loads((ROOT/f'apps/web/messages/{locale}.json').read_text())['partnerVerification']
  for width in [390,1440]:
   for view,path in [('queue','admin/verification'),('detail','admin/verification/provider/org1'),('provider','provider/verification'),('seller','seller/verification')]:
    if MODE!='normal' and view in ['provider','seller']:continue
    if MODE=='empty' and view!='queue':continue
    if MODE=='save-error' and view!='detail':continue
    lost={'value':False};reads=[];writes=[];errors=[];console=[];http=[]
    page=browser.new_page(viewport={'width':width,'height':1000},timezone_id='UTC',reduced_motion='reduce')
    page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:console.append(m.text.split('\n')[0]) if m.type=='error' else None);page.on('response',lambda r:http.append(r.status) if r.status>=400 else None)
    def route(r):
     req=r.request;u=urlparse(req.url);assert u.hostname in ['localhost','127.0.0.1'],'Non-loopback request blocked'
     if u.port!=4000:r.continue_();return
     if req.method not in ['GET','OPTIONS']:
      writes.append({'path':u.path,'method':req.method})
      assert MODE=='save-error' and u.path=='/admin/verification/documents/doc1/review','Unexpected mutation'
      lost['value']=True;r.fulfill(status=503,content_type='application/json',body=json.dumps({'error':{'code':'QA_RESPONSE_LOST','message':'Controlled response failure'}}));return
     if u.path=='/admin/me':data={'isAdmin':True,'adminUserId':'a1','displayName':'کارشناس نمونه','role':'VERIFICATION','permissions':[] if MODE=='forbidden' else ['verification.manage','task.manage']}
     elif u.path.startswith('/admin/verification/'):
      reads.append(u.path)
      if MODE=='load-error':r.fulfill(status=503,content_type='application/json',body=json.dumps({'error':{'code':'QA_LOAD_FAILED','message':'Controlled read failure'}}));return
      if u.path.endswith('/queue'):data=[] if MODE=='empty' else queue
      elif u.path=='/admin/verification/PROVIDER/org1':data={**detail,'documents':[{**d,'status':'REJECTED','reviewNote':'تصویر مدرک خوانا نیست'} if lost['value'] and d['id']=='doc1' else d for d in detail['documents']]}
      else:raise AssertionError('Unexpected private case path')
     elif u.path=='/provider/me/context':
      membership={'providerUserId':'pu1','providerOrganizationId':'org1','organizationName':detail['name'],'organizationType':'VET_CLINIC','verificationStatus':'SUBMITTED','role':'OWNER'};data={'active':membership,'memberships':[membership]}
     elif u.path=='/seller-context':
      membership={'sellerMembershipId':'sm1','sellerOrganizationId':'seller1','organizationName':'فروشگاه نمونه','verificationStatus':'SUBMITTED','role':'OWNER','sellerStatus':'ACTIVE'};data={'active':membership,'memberships':[membership]}
     elif u.path in ['/provider/verification','/seller-organizations/seller1/verification']:data=detail
     else:return base(r)
     r.fulfill(status=200,content_type='application/json',body=json.dumps(data))
    page.route('**/*',route);page.goto(ORIGIN.rstrip('/')+'/'+locale+'/'+path,wait_until='networkidle',timeout=180000)
    expect(page.locator('main').first).to_be_visible(timeout=30000)
    if MODE=='forbidden':
     expect(page.get_by_text(messages['forbidden'],exact=True)).to_be_visible();assert not reads and not writes
     assert page.get_by_role('button',name=messages['acceptDocument'],exact=True).count()==0
    elif MODE=='load-error':expect(page.get_by_role('alert').filter(has_text=messages['loadFailed'])).to_be_visible()
    elif MODE=='empty':expect(page.get_by_text(messages['emptyQueue'],exact=True)).to_be_visible()
    elif view in ['provider','seller']:
     expect(page.get_by_role('heading',name=messages['portalTitle'],exact=True)).to_be_visible();expect(page.get_by_role('heading',name=messages['documents'],exact=True)).to_be_visible()
    else:expect(page.get_by_role('heading',name=detail['name'],exact=True)).to_be_visible()
    initial_reads=len(reads)
    if MODE=='save-error':
     page.get_by_role('button',name=messages['rejectDocument'],exact=True).click();page.get_by_label(messages['reason'],exact=True).fill('تصویر مدرک خوانا نیست');page.get_by_role('checkbox').check();page.get_by_role('button',name=messages['confirm'],exact=True).click();expect(page.get_by_role('alert').filter(has_text=messages['saveFailed'])).to_be_visible();expect(page.get_by_label(messages['reason'],exact=True)).to_have_value('تصویر مدرک خوانا نیست')
     if STAGE=='after':
      expect(page.get_by_role('button',name=messages['confirm'],exact=True)).to_be_disabled();page.get_by_role('button',name=messages['recheckCase'],exact=True).click();expect(page.get_by_text(messages['actionChanged'],exact=True)).to_be_visible();expect(page.get_by_label(messages['reason'],exact=True)).to_have_value('تصویر مدرک خوانا نیست');expect(page.get_by_role('button',name=messages['confirm'],exact=True)).to_be_disabled();assert len(writes)==1 and len(reads)==initial_reads+1
    page.evaluate('document.fonts.ready');unexpected=[e for e in console if not (MODE in ['save-error','load-error'] and 'Failed to load resource' in e and '503' in e)]
    row={'locale':locale,'width':width,'view':view,'mode':MODE,'browserTimezone':'UTC','overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'pageErrors':list(errors),'consoleErrors':list(console),'unexpectedConsoleErrors':unexpected,'httpErrors':list(http),'mutations':list(writes),'caseReads':len(reads),'manualRecheckReads':len(reads)-initial_reads};results.append(row)
    Image.open(io.BytesIO(page.screenshot(full_page=True))).save(OUT/f'{STAGE}-{MODE}-{view}-{locale}-{width}.webp',quality=85);(OUT/f'{STAGE}-{MODE}-checks.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n');print(json.dumps(row),flush=True)
    assert not row['overflow'] and not errors and not unexpected
    if MODE not in ['save-error','load-error']:assert not http and not writes
    page.close()
 browser.close()
