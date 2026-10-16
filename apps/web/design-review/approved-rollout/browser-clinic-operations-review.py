from pathlib import Path
exec((Path(__file__).parent / 'browser-fixtures.py').read_text())
base=mock
member={'providerUserId':'pu1','providerOrganizationId':'org1','organizationName':'کلینیک مهر','organizationType':'VET_CLINIC','verificationStatus':'VERIFIED','role':'OWNER'}
staff={'items':[{'providerUserId':'pu1','displayName':'پدرام','role':'OWNER','displayTitle':None,'joinedAt':'2026-10-15T10:00:00Z'},{'providerUserId':'pu2','displayName':'دامپزشک کلینیک','role':'VET','displayTitle':'دامپزشک','joinedAt':'2026-10-15T10:00:00Z'}],'pendingInvitations':[],'usage':{'used':2,'pending':0,'limit':4}}
branches={'items':[{'id':f'b{i}','name':f'شعبه {i}','addressLine':'تهران، خیابان نمونه، پلاک ۱','city':'تهران','region':'ونک','latitude':None,'longitude':None,'phone':'+982100000000','timezone':'Asia/Tehran'} for i in [1,2]],'usage':{'used':2,'limit':3}}
reminder={'id':'r1','petId':'pet1','kind':'CHECKUP','title':'یادآوری معاینه دوره‌ای','note':'برای هماهنگی زمان مراجعه با کلینیک همراه باشید.','dueAt':'2026-10-20T10:00:00Z','status':'SCHEDULED','sentAt':None,'recipientCount':0,'cancelledAt':None,'createdAt':'2026-10-15T10:00:00Z'}
finance={'from':'2026-10-01T00:00:00Z','to':'2026-10-15T00:00:00Z','bookings':{'total':12,'completed':8,'cancelled':2,'noShow':1,'refunded':1},'billedAmount':[{'currency':'IRR','amount':'84000000'}],'payAtClinic':[{'currency':'IRR','amount':'24000000'}],'collectedOnline':[{'currency':'IRR','amount':'60000000'}],'ledgerPosted':[{'currency':'IRR','amount':'60000000'}],'byService':[{'providerServiceId':'s1','name':'معاینه عمومی','count':8,'amount':'84000000','currency':'IRR'}],'daily':[]}
def fixture(r):
 path=urlparse(r.request.url).path
 if path=='/provider/me/context':data={'active':member,'memberships':[member]}
 elif path=='/provider/clinic/subscription':data={'status':'ACTIVE','plan':{'code':'CLINIC_PRO','nameFa':'کلینیک حرفه‌ای','nameEn':'Clinic Pro','descriptionFa':'ابزارهای مدیریت کلینیک','descriptionEn':'Clinic operations','entitlements':[{'key':k,'type':'BOOLEAN','enabled':True,'limit':None} for k in ['clinic.customers','clinic.reminders','clinic.bulk_reminders','clinic.exports']]},'currentPeriodEndsAt':None,'usage':{'remindersThisMonth':0}}
 elif path=='/provider/clinic/queue':data={'date':'2026-10-15','buckets':{}}
 elif path=='/provider/clinic/staff':data=staff
 elif path=='/provider/clinic/branches':data=branches
 elif path=='/provider/clinic/contacts':data=[{'id':'c1','name':'صاحب پت','phone':'+989120000000','email':'owner@example.com','petName':'همراه کوچک','species':'DOG','notes':'مخاطب واردشده توسط کلینیک','createdAt':'2026-10-15T10:00:00Z'}]
 elif path=='/provider/clinic/reminders':data={'items':[reminder],'total':1,'page':1,'pageSize':20}
 elif path=='/provider/clinic/campaigns/preview':data={'segment':'APPOINTMENTS_TOMORROW','count':3,'recipientCount':3,'excludedCount':1,'exclusionReasons':[{'reason':'DUPLICATE_PET','count':1}],'alreadySentToday':False,'sample':[{'petId':'p1','petName':'همراه کوچک','detail':'معاینه دوره‌ای'}]}
 elif path=='/provider/clinic/reports/finance':data=finance
 else:return base(r)
 r.fulfill(status=200,content_type='application/json',body=json.dumps(data))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);results=[]
 for lang,width in [('fa',390),('fa',1440),('en',390),('en',1440)]:
  page=b.new_page(viewport={'width':width,'height':900},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('http://localhost:4000/**',fixture)
  page.goto(f'http://127.0.0.1:3000/{lang}/provider/clinic',wait_until='networkidle',timeout=120000)
  for key,fa,en,content in [('staff','تیم کلینیک','Clinic team','Owner One'),('branches','شعب کلینیک','Clinic branches',''),('contacts','مخاطبان کلینیک','Clinic contacts',''),('reminders','یادآوری‌های کلینیک','Clinic reminders',''),('campaigns','یادآوری گروهی','Reminder campaigns',''),('finance','گزارش مالی کلینیک','Clinic finance report','')]:
   errors.clear();page.get_by_role('navigation',name='مدیریت کلینیک' if lang=='fa' else 'Clinic workspace').get_by_role('button',name=fa if lang=='fa' else en,exact=True).click()
   expect(page.get_by_role('heading',name=fa if lang=='fa' else en,exact=True)).to_be_visible(timeout=20000)
   page.wait_for_load_state('networkidle')
   if key=='campaigns':page.get_by_role('button',name='بررسی مخاطبان' if lang=='fa' else 'Preview audience',exact=True).click();expect(page.get_by_label('عنوان پیام' if lang=='fa' else 'Message title',exact=True)).to_be_visible()
   page.evaluate('document.fonts.ready');page.screenshot(path='/tmp/clinic-operations.png',full_page=True);Image.open('/tmp/clinic-operations.png').save(out/f'clinic-{key}-{lang}-{width}.webp',quality=85)
   result={'page':key,'locale':lang,'width':width,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'pageErrors':errors.copy()};results.append(result);print(json.dumps(result),flush=True)
  page.close()
 (out/'clinic-operations-browser-checks.json').write_text(json.dumps(results,indent=2));b.close()
