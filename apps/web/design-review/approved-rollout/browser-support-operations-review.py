# Controlled fixtures only; no live writes or financial operations.
from pathlib import Path
exec((Path(__file__).parent/'browser-fixtures.py').read_text())
import os
base_mock=mock
out=Path(__file__).parent/'support-operations-screenshots';out.mkdir(exist_ok=True)
org={'id':'o1','type':'SHELTER','name':'پناهگاه همراه حیوانات','description':'مراقبت و حمایت از حیوانات نیازمند درمان','verificationStatus':'VERIFIED','location':'تهران','latitude':None,'longitude':None,'contactEmail':None,'contactPhone':None,'logoObjectKey':None,'logoUrl':None,'imageObjectKeys':[],'imageUrls':[],'isPubliclyListed':True,'createdAt':'2026-10-16T06:00:00Z'}
rescue={'id':'r1','organizationId':'o1','organizationName':org['name'],'title':'درمان و مراقبت از کوکی','description':'پیگیری درمان و تأمین غذای حیوان نجات‌یافته؛ گزارش هزینه‌ها و پیشرفت درمان در این پرونده ثبت می‌شود.','animalType':'سگ','status':'IN_TREATMENT','location':'تهران، ونک','latitude':None,'longitude':None,'estimatedNeedIrr':25000000,'evidenceObjectKeys':[],'evidenceUrls':[],'createdAt':'2026-10-16T06:00:00Z','closedAt':None}
campaign={'id':'c1','organizationId':'o1','organizationName':org['name'],'rescueCaseId':'r1','title':'تأمین هزینهٔ درمان و غذای کوکی','description':'کمک‌ها فقط برای هدف مشخص‌شدهٔ این کمپین مصرف می‌شوند. مقادیر این بررسی دادهٔ کنترل‌شده‌اند.','fundType':'RESTRICTED','targetAmountIrr':25000000,'raisedAmountIrr':12500000,'status':'ACTIVE','createdAt':'2026-10-16T06:00:00Z','startsAt':'2026-10-16T06:00:00Z','endsAt':None}
def fixture(r):
 path=urlparse(r.request.url).path
 if r.request.method not in ['GET','OPTIONS']:raise AssertionError('Visual capture must not mutate: '+path)
 if path=='/admin/me':data={'isAdmin':True,'adminUserId':'admin1','displayName':'کارشناس حمایت','role':'ADMIN','permissions':['animalSupport.view','animalSupport.manage','animalSupport.payout','trust.view']}
 elif path=='/admin/animal-support/organizations':data={'items':[org],'total':1,'page':1,'pageSize':100}
 elif path=='/admin/animal-support/organizations/o1':data=org
 elif path=='/admin/animal-support/organizations/o1/members':data=[{'id':'m1','userId':'u2','displayName':'هماهنگ‌کنندهٔ پناهگاه','email':'coordinator@example.test','role':'COORDINATOR','isActive':True}]
 elif path=='/admin/animal-support/organizations/o1/fund-balance':data={'organizationId':'o1','generalAvailableIrr':45000000,'restrictedAvailableIrr':12500000}
 elif path=='/admin/animal-support/rescue-cases':data={'items':[rescue],'total':1,'page':1,'pageSize':20}
 elif path=='/admin/animal-support/rescue-cases/r1':data=rescue
 elif path=='/admin/animal-support/campaigns':data={'items':[campaign],'total':1,'page':1,'pageSize':20}
 elif path=='/admin/animal-support/campaigns/c1':data=campaign
 elif path=='/admin/animal-support/campaigns/c1/updates':data=[{'id':'up1','campaignId':'c1','title':'آغاز مراقبت و درمان','body':'معاینه انجام شد و مراقبت ادامه دارد. گزارش بعدی پس از ثبت هزینه‌ها منتشر می‌شود.','evidenceObjectKeys':[],'evidenceUrls':[],'createdAt':'2026-10-16T07:00:00Z'}]
 elif path=='/admin/animal-support/donations':data={'items':[{'id':'d1','amountIrr':12500000,'fundType':'RESTRICTED','status':'SUCCEEDED','campaign':{'id':'c1','title':campaign['title']},'organization':{'id':'o1','name':org['name']},'donorName':'حامی حیوانات','publicDisplayName':None,'createdAt':'2026-10-16T06:00:00Z','succeededAt':'2026-10-16T06:00:00Z','refundedAt':None}],'total':1,'page':1,'pageSize':25}
 else:return base_mock(r)
 r.fulfill(status=200,content_type='application/json',body=json.dumps(data))
scenes=[('rescues','admin/animal-support/rescue-cases','پرونده‌های نجات','Rescue cases'),('rescue-detail','admin/animal-support/rescue-cases/r1',rescue['title'],rescue['title']),('campaigns','admin/animal-support/campaigns','کمپین‌های حمایتی','Support campaigns'),('campaign-detail','admin/animal-support/campaigns/c1',campaign['title'],campaign['title']),('organization','admin/animal-support/organizations/o1',org['name'],org['name']),('donations','admin/animal-support/donations','کمک‌های مالی','Donations')]
before='--before' in sys.argv
if before:scenes=scenes[-2:]
url=os.environ.get('REVIEW_ORIGIN','http://127.0.0.1:3000')
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for lang,width in [('fa',390),('fa',1440),('en',390),('en',1440)]:
  if before and lang!='fa':continue
  for key,route,fa,en in scenes:
   page=browser.new_page(viewport={'width':width,'height':900},reduced_motion='reduce');errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)));page.route('http://localhost:4000/**',fixture)
   page.goto(f'{url}/{lang}/{route}',wait_until='networkidle',timeout=180000)
   expect(page.get_by_role('heading',name=fa if lang=='fa' else en,exact=True).first).to_be_visible(timeout=60000)
   page.evaluate('document.fonts.ready');page.screenshot(path='/tmp/petlife-support-review.png',full_page=True)
   Image.open('/tmp/petlife-support-review.png').save(out/f'{"before-" if before else ""}{key}-{lang}-{width}.webp',quality=85)
   result={'page':key,'locale':lang,'width':width,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'pageErrors':errors.copy()};results.append(result);print(json.dumps(result),flush=True)
   (out/f'{"before-" if before else ""}checks.json').write_text(json.dumps(results,indent=2));assert not result['overflow'] and not errors,result
   page.close()
 browser.close()
