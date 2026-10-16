from pathlib import Path
exec((Path(__file__).parent / 'browser-fixtures.py').read_text())
base=mock
member={'providerUserId':'pu1','providerOrganizationId':'org1','organizationName':'کلینیک مهر','organizationType':'VET_CLINIC','verificationStatus':'VERIFIED','role':'OWNER'}
def clinic_mock(r):
 path=urlparse(r.request.url).path
 if path=='/provider/me/context':data={'active':member,'memberships':[member]}
 elif path=='/provider/clinic/subscription':data={'status':'ACTIVE','plan':{'code':'CLINIC_BASIC','nameFa':'کلینیک پایه','nameEn':'Clinic Basic','descriptionFa':'ابزارهای مدیریت روزانه کلینیک','descriptionEn':'Daily clinic management tools','entitlements':[{'key':'clinic.customers','type':'BOOLEAN','enabled':True,'limit':None}]},'currentPeriodEndsAt':None,'usage':{'remindersThisMonth':0}}
 elif path=='/provider/clinic/queue':data={'date':'2026-10-15','buckets':{'SCHEDULED':[{'bookingId':'b1','bookingNumber':'BK-1','startAt':'2026-10-15T10:00:00Z','serviceName':'معاینه دوره‌ای','ownerDisplayName':'پدرام','pet':{'id':'pet-1','name':'همراه کوچک'},'assignedTo':None}]}}
 elif path=='/provider/clinic/tasks':data=[{'id':'task1','title':'پیگیری نتیجه آزمایش','type':'FOLLOW_UP_LAB','status':'OPEN','dueAt':None,'overdue':False}]
 else:return base(r)
 r.fulfill(status=200,content_type='application/json',body=json.dumps(data))
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);results=[]
 for lang,width in [('fa',390),('fa',1440),('en',390),('en',1440)]:
  page=browser.new_page(viewport={'width':width,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('http://localhost:4000/**',clinic_mock)
  page.goto(f'http://127.0.0.1:3000/{lang}/provider/clinic',wait_until='networkidle',timeout=120000)
  expect(page.get_by_role('heading',name='مدیریت کلینیک' if lang=='fa' else 'Clinic workspace',exact=True)).to_be_visible(timeout=30000)
  page.evaluate('document.fonts.ready');page.screenshot(path='/tmp/clinic-workspace.png',full_page=True);Image.open('/tmp/clinic-workspace.png').save(out/f'clinic-workspace-{lang}-{width}.webp',quality=85)
  result={'locale':lang,'width':width,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'pageErrors':errors};results.append(result);print(json.dumps(result),flush=True);page.close()
 (out/'clinic-browser-checks.json').write_text(json.dumps(results,indent=2));browser.close()
