from pathlib import Path
exec((Path(__file__).parent/'browser-fixtures.py').read_text())
base=mock
stay={'id':'stay1','title':'اقامتگاه باغ تهران','city':'تهران','area':None,'stayType':'LODGE','province':None,'country':'IR','addressText':None,'capacity':4,'bedrooms':1,'beds':2,'amenities':[],'source':{'code':'source1','nameFa':'منبع عمومی','nameEn':'Public source','sourceType':'PUBLIC','sourceUrl':'https://example.com/stay1','partnership':'NONE','affiliateStatus':'NONE'},'sourceUrl':'https://example.com/stay1','lastSeenAt':'2026-10-15T10:00:00Z','dataFreshness':'FRESH','pet':{'policyStatus':'UNKNOWN','accepted':'UNKNOWN','authority':'SOURCE_OBSERVATION','evidenceType':None,'evidenceText':None,'evidenceObservedAt':None,'evidenceAgeHours':None,'policy':None,'summary':None},'rating':None,'reviewCount':None,'instantBooking':'UNKNOWN','descriptionSummary':'پیش از سفر، قوانین ورود حیوان و شرایط اقامت را از منبع بررسی کنید.','images':[],'status':'ACTIVE','lastCheckedAt':'2026-10-15T10:00:00Z','cta':'VIEW_SOURCE','outboundPath':'/travel/external/stays/stay1/out','canonicalAccommodationId':None,'externalDataDisclaimerRequired':True,'disclaimerFa':'','price':{'state':'DATES_REQUIRED','freshness':'UNKNOWN'},'fromPrice':None}
def fixture(r):
 path=urlparse(r.request.url).path
 if path=='/travel/external/stays':data={'items':[stay],'total':1,'page':1,'pageSize':20,'context':None}
 elif path=='/travel/external/stays/stay1':data=stay
 elif path=='/me/external-stays/favorites':data=[{'savedAt':'2026-10-15T10:00:00Z','available':True,'stay':stay}]
 elif path=='/pets/pet-1/trips/trip1/external-stays':data=[{'state':'SAVED','reservationConfirmed':False,'addedAt':'2026-10-15T10:00:00Z','stay':stay,'priceAtAttach':None}]
 elif path=='/pets/pet-1/trips/trip1':data={'id':'trip1','petId':'pet-1','destinationCity':'تهران','departAt':'2026-11-01T10:00:00Z','returnAt':'2026-11-03T10:00:00Z'}
 else:return base(r)
 r.fulfill(status=200,content_type='application/json',body=json.dumps(data))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);results=[]
 for lang,width in [('fa',390),('fa',1440),('en',390),('en',1440)]:
  page=b.new_page(viewport={'width':width,'height':900},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('http://localhost:4000/**',fixture)
  for key,route in [('external-stays','travel/external'),('external-stay','travel/external/stay1'),('external-favorites','travel/external/favorites'),('trip-external','pets/pet-1/travel/trip1/external-stays')]:
   errors.clear();page.goto(f'http://127.0.0.1:3000/{lang}/{route}',wait_until='networkidle',timeout=120000);expect(page.get_by_role('heading',name='اقامتگاه باغ تهران',exact=True)).to_be_visible(timeout=30000)
   page.evaluate('document.fonts.ready');page.screenshot(path='/tmp/external-travel.png',full_page=True);Image.open('/tmp/external-travel.png').save(out/f'{key}-{lang}-{width}.webp',quality=85)
   result={'page':key,'locale':lang,'width':width,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'pageErrors':errors.copy()};results.append(result);print(json.dumps(result),flush=True);(out/'external-travel-browser-checks.json').write_text(json.dumps(results,indent=2));assert not result['overflow'] and not errors,result
  page.close()
 b.close()
