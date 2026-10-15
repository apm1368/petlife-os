from pathlib import Path
exec((Path(__file__).parent / "browser-fixtures.py").read_text())
base=mock
need={'id':'need1','organizationId':None,'organizationName':None,'organizationVerified':False,'creatorUserId':None,'title':'خانهٔ موقت برای یک همراه نجات‌یافته','description':'به یک فضای امن و آرام برای مراقبت موقت نیاز داریم.','category':'TEMPORARY_HOME','urgency':'NORMAL','status':'PUBLISHED','province':'تهران','city':'تهران','neighborhood':'ونک','latitude':None,'longitude':None,'imageObjectKeys':[],'imageUrls':['/images/experience/shop-companions.webp'],'neededQuantity':1,'targetAmountIrr':None,'fulfilledQuantity':0,'quantityUnit':None,'campaignId':None,'contactMode':'OFFER_HELP','animalType':'DOG','reviewNote':None,'publishedAt':'2026-10-10T10:00:00Z','fulfilledAt':None,'closedAt':None,'expiresAt':None,'createdAt':'2026-10-10T10:00:00Z','updatedAt':'2026-10-10T10:00:00Z'}
def extra(r):
 path=urlparse(r.request.url).path;data=None
 if path=='/discovery/providers/p1':
  data={**provider,'galleryUrls':[],'policiesText':None,'faqs':[],'phone':None,'websiteUrl':None,'locations':[],'services':[dict(provider['services'][0],providerOrganizationId='p1',locationId='l1',priceAmount=1000000,isActive=True,variants=[],staffIds=[],paymentMode='PAY_AT_PROVIDER',depositAmount=None,description=None,cancellationPolicy=None,freeCancellationHours=24,lateCancellationRefundPercent=0,preparationNotes=None,maxPetsPerBooking=1,requiredResourceType=None)],'team':[],'reviews':[]}
 elif path=='/animal-support/needs':data={'items':[need,dict(need,id='need2',title='همراهی برای تأمین غذای حیوانات',category='FOOD',neededQuantity=10,fulfilledQuantity=4,quantityUnit='کیلوگرم')],'total':2,'page':1,'pageSize':20}
 elif path=='/animal-support/needs/locations':data=[{'province':'تهران','city':'تهران'}]
 elif path=='/pets/pet-1/clinical/problems':data=[{'id':'problem1','name':'پیگیری معاینهٔ دوره‌ای','status':'ACTIVE','notes':'طبق برنامهٔ ثبت‌شدهٔ دامپزشک پیگیری شود.','source':{'providerOrganizationName':'کلینیک مهر'},'petId':'pet-1'}]
 elif path in ['/pets/pet-1/clinical/prescriptions','/pets/pet-1/health/care-plans','/pets/pet-1/health/senior-care','/pets/pet-1/health/corrections']:data=[]
 elif path=='/pets/pet-1/health/end-of-life':
  return r.fulfill(status=200,content_type='application/json',body='null')
 if data is None:return base(r)
 r.fulfill(status=200,content_type='application/json',body=json.dumps(data))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);results=[]
 for lang,width in [('fa',390),('fa',1440),('en',390),('en',1440)]:
  page=b.new_page(viewport={'width':width,'height':844 if width==390 else 1000},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('http://localhost:4000/**',extra)
  for name,route,selector in [('booking','providers/p1/book','.flow-layout'),('support-board','animal-support/needs','.need-rows'),('taxi-list','services/PET_TAXI','.disc'),('clinical-records','pets/pet-1/health/clinical','h1')]:
   errors.clear();start=len(requests)
   try:
    page.goto(f'http://127.0.0.1:3000/{lang}/{route}',wait_until='networkidle',timeout=120000);expect(page.locator(selector)).to_be_visible(timeout=30000);page.evaluate('document.fonts.ready');page.wait_for_function('()=>{const imgs=Array.from(document.images);imgs.forEach(i=>i.loading="eager");return imgs.every(i=>i.complete)}',timeout=20000)
    page.screenshot(path='/tmp/rollout-extra.png',full_page=True);Image.open('/tmp/rollout-extra.png').save(out/f'{name}-{lang}-{width}.webp',quality=85);result={'page':name,'locale':lang,'width':width,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'pageErrors':errors.copy()}
   except Exception as e:result={'page':name,'locale':lang,'width':width,'failed':str(e),'pageErrors':errors.copy(),'requests':requests[start:]}
   results.append(result);print(json.dumps(result,ensure_ascii=False),flush=True);(out/'extra-browser-checks.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
  page.close()
 b.close()
