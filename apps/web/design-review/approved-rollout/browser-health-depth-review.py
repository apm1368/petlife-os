from pathlib import Path
exec((Path(__file__).parent/'browser-fixtures.py').read_text())
base=mock
member={'providerUserId':'pu1','providerOrganizationId':'org1','organizationName':'کلینیک مهر','organizationType':'VET_CLINIC','verificationStatus':'VERIFIED','role':'OWNER'}
snapshot={'petId':'pet-1','activeConditions':[{'id':'c1','name':'پیگیری وضعیت مفاصل','since':'2026-10-01T10:00:00Z'}],'activeMedications':[],'allergies':[{'id':'a1','name':'حساسیت غذایی ثبت‌شده','severity':'MILD','reaction':'مطابق پرونده بررسی شود'}],'latestWeight':{'value':8.5,'unit':'KG','recordedAt':'2026-10-15T10:00:00Z','source':'CLINIC'},'vaccinationStatus':'UP_TO_DATE','upcomingVaccinations':[],'recentVisits':[{'id':'v1','startedAt':'2026-10-10T10:00:00Z','status':'COMPLETED','reason':'معاینه دوره‌ای','organization':{'id':'org1','name':'کلینیک مهر'}}],'recentLabs':[],'recentImaging':[],'documentsCount':2}
share={'id':'share1','state':'ACTIVE','label':'پرونده برای ویزیت','sections':['ALLERGIES'],'labResultIds':[],'clinicalVisitIds':[],'imagingStudyIds':[],'tokenHint':'demo','expiresAt':'2026-10-20T10:00:00Z','revokedAt':None,'createdAt':'2026-10-15T10:00:00Z','accessCount':2,'lastAccessedAt':'2026-10-15T12:00:00Z'}
suggestion={'id':'suggest1','petId':'pet-1','title':'پیگیری معاینه دوره‌ای','type':'FOLLOW_UP','notes':'پیشنهاد کلینیک برای برنامه مراقبت؛ پذیرش با صاحب پت است.','suggestedDueAt':'2026-10-20T10:00:00Z','recurrence':'ONCE','intervalDays':None,'status':'PENDING','source':{'kind':'VISIT','id':'v1'},'careReminderId':None,'decidedAt':None,'createdAt':'2026-10-15T10:00:00Z','organization':{'id':'org1','name':'کلینیک مهر'}}
booking={'booking':{'id':'booking1','petId':'pet-1','petName':'همراه کوچک','petSpecies':'DOG','ownerDisplayName':'پدرام','category':'GROOMING','serviceName':'مراقبت و نظافت','startAt':'2026-10-14T10:00:00Z','endAt':'2026-10-14T11:00:00Z','timezone':'Asia/Tehran','locationLabel':'کلینیک مهر','bookingStatus':'COMPLETED','paymentStatus':'NOT_REQUIRED','providerUserId':'pu1','bookingNumber':'PL-B-001','variantName':None,'requestExpiresAt':None,'resourceId':None,'paymentMode':'PAY_AT_PROVIDER','reasonForVisit':None,'ownerNotes':None,'cancelledAt':None,'cancelledReason':None,'completedAt':'2026-10-14T11:00:00Z','completedByProviderUserId':'pu1','completionNote':'مراقبت انجام شد.','createdAt':'2026-10-12T10:00:00Z','updatedAt':'2026-10-14T11:00:00Z'},'pet':{'id':'pet-1','name':'همراه کوچک','species':'DOG','breed':None,'photoUrl':None},'access':{'state':'NO_GRANT','scopePreset':None,'reason':None,'startsAt':None,'expiresAt':None,'canViewCareProfile':False,'canViewHealth':False},'careProfile':None,'healthSummary':None,'providerNotes':[]}
def fixture(r):
 path=urlparse(r.request.url).path
 if path=='/provider/me/context':data={'active':member,'memberships':[member]}
 elif path=='/provider/bookings/booking1':data=booking
 elif path=='/pets/pet-1/health/snapshot':data=snapshot
 elif path=='/pets/pet-1/health/feed':data={'items':[{'id':'event1','type':'VISIT','recordType':'CLINICAL_VISIT','recordId':'v1','occurredAt':'2026-10-10T10:00:00Z','recordedAt':None,'source':'CLINIC','author':{'providerUserId':'pu1','displayTitle':'دامپزشک','userId':None},'organization':{'id':'org1','name':'کلینیک مهر'},'summary':'معاینه دوره‌ای و برنامه پیگیری','deepLink':'/pets/pet-1/health/visits/v1'}],'nextCursor':None}
 elif path=='/pets/pet-1/health-shares':data=[share]
 elif path=='/pets/pet-1/care-suggestions':data=[suggestion]
 elif path=='/public/health-shares/controlled-health-share-demo':data={'label':'پرونده برای ویزیت','expiresAt':'2026-10-20T10:00:00Z','pet':{'name':'همراه کوچک','species':'DOG','breed':None,'sex':'UNKNOWN','birthDate':None,'approximateAgeMonths':36},'allergies':[{'name':'حساسیت غذایی ثبت‌شده','severity':'MILD','reaction':'مطابق پرونده بررسی شود'}],'labs':[],'visits':[],'imaging':[]}
 else:return base(r)
 r.fulfill(status=200,content_type='application/json',body=json.dumps(data))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);results=[]
 for lang,width in [('fa',390),('fa',1440),('en',390),('en',1440)]:
  page=b.new_page(viewport={'width':width,'height':900},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('http://localhost:4000/**',fixture)
  for key,route,fa,en in [('health-activity','pets/pet-1/health/activity','سابقه یکپارچه سلامت','Unified health history'),('health-links','pets/pet-1/health/links','لینک موقت پرونده سلامت','Temporary health record links'),('care-suggestions','pets/pet-1/care/suggestions','پیشنهادهای مراقبتی کلینیک','Clinic care suggestions'),('public-health-share','health-share/controlled-health-share-demo','پرونده سلامت اشتراک‌گذاری‌شده','Shared health record'),('provider-care-suggestion','provider/bookings/booking1','پیشنهاد مراقبت برای صاحب پت','Suggest care to the pet’s owner')]:
   errors.clear();page.goto(f'http://127.0.0.1:3000/{lang}/{route}',wait_until='networkidle',timeout=120000);expect(page.get_by_role('heading',name=fa if lang=='fa' else en,exact=True)).to_be_visible(timeout=30000)
   page.evaluate('document.fonts.ready');page.screenshot(path='/tmp/health-depth.png',full_page=True);Image.open('/tmp/health-depth.png').save(out/f'{key}-{lang}-{width}.webp',quality=85)
   result={'page':key,'locale':lang,'width':width,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'pageErrors':errors.copy()};results.append(result);print(json.dumps(result),flush=True);(out/'health-depth-browser-checks.json').write_text(json.dumps(results,indent=2))
  page.close()
 b.close()
