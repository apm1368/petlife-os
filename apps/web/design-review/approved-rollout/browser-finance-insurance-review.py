from pathlib import Path
exec((Path(__file__).parent/'browser-fixtures.py').read_text())
base=mock
insurer={'id':'ins1','name':'بیمه همراه','description':'خدمات بیمه و بررسی پوشش‌های حیوانات خانگی','logoObjectKey':None,'logoUrl':None,'country':'IR','status':'VERIFIED','contactEmail':'insurance@example.com','contactPhone':'+982100000000','websiteUrl':None,'isPubliclyListed':True,'createdAt':'2026-10-15T10:00:00Z'}
product={'id':'ip1','providerId':'ins1','providerName':'بیمه همراه','providerLogoUrl':None,'name':'طرح مراقبت همراه','country':'IR','speciesEligibility':['DOG','CAT'],'minAgeMonths':3,'maxAgeMonths':120,'coverageTypes':['ACCIDENT','ILLNESS'],'coverageSummary':'پوشش‌های ثبت‌شده مطابق شرایط بیمه‌گر بررسی می‌شوند.','waitingPeriodDays':30,'deductibleAmountIrr':1000000,'annualLimitIrr':100000000,'coinsurancePercent':20,'premiumMinIrr':5000000,'premiumMaxIrr':10000000,'exclusions':['بیماری‌های پیشین طبق شرایط بیمه‌گر'],'termsSource':'شرایط رسمی بیمه‌گر','termsUrl':None,'status':'VERIFIED','isPubliclyListed':True,'createdAt':'2026-10-15T10:00:00Z'}
statement={'id':'s1','provider':'TOROB','marketplaceChannelAccountId':'a1','sellerOrganizationId':'seller1','source':'CSV_IMPORT','periodStart':'2026-10-01T00:00:00Z','periodEnd':'2026-10-15T00:00:00Z','currency':'IRR','totalAmount':15000000,'importedByAdmin':{'id':'admin1','displayName':'پدرام','role':'SUPER_ADMIN'},'createdAt':'2026-10-15T10:00:00Z','lines':[{'id':f'l{i}','externalOrderId':f'ORDER-00{i}','amount':5000000,'feeAmount':None if i==1 else 100000,'feeConfidence':'UNKNOWN' if i==1 else 'KNOWN','description':'ردیف واردشده از صورت‌حساب','createdAt':'2026-10-15T10:00:00Z'} for i in [1,2,3]]}
def fixture(r):
 path=urlparse(r.request.url).path
 if path=='/admin/me':data={'isAdmin':True,'adminUserId':'admin1','displayName':'پدرام','role':'SUPER_ADMIN','permissions':['insurance.view','insurance.manage','sellerFinance.view']}
 elif path=='/admin/insurance/providers':data={'items':[insurer],'total':1,'page':1,'pageSize':20}
 elif path=='/admin/insurance/providers/ins1':data=insurer
 elif path=='/admin/insurance/providers/ins1/members':data=[{'id':'m1','userId':'u1','displayName':'کارشناس بیمه','email':'colleague@example.com','role':'UNDERWRITING','isActive':True}]
 elif path=='/admin/insurance/products':data={'items':[product],'total':1,'page':1,'pageSize':20}
 elif path=='/admin/insurance/products/ip1':data=product
 elif path=='/admin/marketplace-settlements':data=[statement]
 elif path=='/admin/marketplace-settlements/s1':data=statement
 else:return base(r)
 r.fulfill(status=200,content_type='application/json',body=json.dumps(data))
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);results=[]
 for lang,width in [('fa',390),('fa',1440),('en',390),('en',1440)]:
  page=browser.new_page(viewport={'width':width,'height':900},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('http://localhost:4000/**',fixture)
  for key,route,fa,en in [('statements','admin/marketplace-statements','صورت‌حساب‌های بازارگاه','Marketplace statements'),('statement','admin/marketplace-statements/s1','جزئیات صورت‌حساب بازارگاه','Marketplace statement details'),('insurers','admin/insurance/providers','مدیریت شرکت‌های بیمه','Insurance provider management'),('insurer','admin/insurance/providers/ins1','بیمه همراه','بیمه همراه')]:
   errors.clear();page.goto(f'http://127.0.0.1:3000/{lang}/{route}',wait_until='networkidle',timeout=120000);expect(page.get_by_role('heading',name=fa if lang=='fa' else en,exact=True)).to_be_visible(timeout=30000)
   page.evaluate('document.fonts.ready');page.screenshot(path='/tmp/finance-insurance.png',full_page=True);Image.open('/tmp/finance-insurance.png').save(out/f'{key}-{lang}-{width}.webp',quality=85)
   result={'page':key,'locale':lang,'width':width,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'pageErrors':errors.copy()};results.append(result);print(json.dumps(result),flush=True);(out/'finance-insurance-browser-checks.json').write_text(json.dumps(results,indent=2))
  page.close()
 browser.close()
