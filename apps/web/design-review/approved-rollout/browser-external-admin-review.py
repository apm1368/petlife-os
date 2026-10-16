from pathlib import Path
exec((Path(__file__).parent/'browser-fixtures.py').read_text())
base=mock
source={'code':'source1','nameFa':'منبع عمومی سفر','nameEn':'Public travel source','allowedHosts':['example.com'],'mode':'AUTOMATED','automationStatus':'SUPPORTED','health':'HEALTHY','healthReason':None,'status':'ACTIVE','adapter':{'strategy':'PUBLIC','parserReady':True},'robots':{'checkedAt':None,'result':None},'terms':{'checkedAt':None,'url':None},'config':{'syncIntervalMinutes':60,'priceTtlMinutes':60,'metadataTtlMinutes':1440,'maxRequestsPerRun':10,'timeoutMs':10000,'retryCount':1,'requestDelayMinMs':1000,'requestDelayMaxMs':2000,'priceFreshHours':24,'priceAgingHours':72,'staleAfterMissedRuns':3,'removeAfterMissedRuns':7,'rawRetentionDays':7,'imagePolicy':'NO_IMAGES','cityScopes':['Tehran'],'autoPublish':False,'concurrency':1,'anomalyDropRatio':0.5},'lastRunAt':None,'lastSuccessAt':None,'lastFailureAt':None,'lastError':None,'lastRunStatus':None,'lastListingsSeen':None,'lastDurationMs':None,'circuitOpenUntil':None,'nextRunAt':None,'consecutiveFailures':0,'listingCount':2,'lastRun':None,'listings':[],'runs':[]}
policy={'sourceObservation':'UNKNOWN','adminConfirmed':None,'effective':'UNKNOWN','adminNote':None,'adminReviewedAt':None}
stay={'normalized':{'id':'stay1','title':'باغ اقامت تهران','city':'تهران','province':'تهران','area':'شمال','addressText':'نشانی نمونه برای بررسی رابط','stayType':'VILLA','capacity':4,'descriptionSummary':'اقامتگاهی برای بررسی شرایط سفر همراه حیوان خانگی.','status':'ACTIVE','publishState':'DRAFT'},'source':{'code':'source1','sourceUrl':'https://example.com/stay/1','lastCheckedAt':'2026-10-15T10:00:00Z','lastSuccessfulSyncAt':None},'lifecycle':{'firstSeenAt':'2026-10-01T10:00:00Z','lastSeenAt':'2026-10-15T10:00:00Z','lastChangedAt':None,'missedRuns':0},'petEvidence':{'type':'SOURCE_POLICY_TEXT','text':'ورود حیوان فقط پس از هماهنگی با میزبان بررسی می‌شود.','observedAt':'2026-10-15T10:00:00Z','summary':None},'petPolicy':policy,'overrides':{},'priceHistory':[],'petEvidenceHistory':[],'changes':[],'canonicalAccommodationId':'canonical1','publishBlockers':[],'engagement':{'outboundClicks':2,'favorites':1,'tripAttachments':0}}
listing={'id':'stay1','source':'source1','title':stay['normalized']['title'],'city':'تهران','status':'ACTIVE','publishState':'DRAFT','petPolicy':policy,'lastCheckedAt':'2026-10-15T10:00:00Z','canonicalAccommodationId':'canonical1','hasOverrides':False}
metric={'code':'source1','status':'ACTIVE','listings':2,'newLast24h':1,'changesLast24h':2,'petPolicy':{'confirmedAllowed':0,'confirmedNotAllowed':0,'ambiguous':0,'unknown':2,'petQualifiedPercent':0,'unknownPercent':100},'priceCoveragePercent':None,'priceFreshness':{'FRESH':0,'AGING':0,'STALE':0},'runsLast7d':0,'errorRatePercent':None,'blockRatePercent':None}
def fixture(r):
 path=urlparse(r.request.url).path
 if path=='/admin/me':data={'isAdmin':True,'adminUserId':'admin1','displayName':'پدرام','role':'SUPER_ADMIN','permissions':['travel.source.view','travel.source.manage','travel.sync.run','travel.listing.manage','travel.override.manage','access.view','admin.manage']}
 elif path=='/admin/access/roles':data=[{'role':'SUPER_ADMIN','protected':True,'permissions':['admin.manage'],'activeMembers':1,'suspendedMembers':0},{'role':'READ_ONLY','protected':False,'permissions':['access.view'],'activeMembers':1,'suspendedMembers':0}]
 elif path=='/admin/access/permissions':data=[{'permission':'access.view','domain':'access','roles':['SUPER_ADMIN','READ_ONLY']}]
 elif path=='/admin/access/admins':data={'items':[{'id':'member1','userId':'colleague1','displayName':'همکار پشتیبانی','emailMasked':'su***@example.com','role':'SUPPORT','status':'ACTIVE','createdAt':'2026-10-01T10:00:00Z','updatedAt':'2026-10-01T10:00:00Z','lastActiveAt':None}],'total':1,'page':1,'pageSize':20}
 elif path=='/admin/access/admins/member1':data={'id':'member1','userId':'colleague1','displayName':'همکار پشتیبانی','emailMasked':'su***@example.com','role':'SUPPORT','status':'ACTIVE','createdAt':'2026-10-01T10:00:00Z','updatedAt':'2026-10-01T10:00:00Z','lastActiveAt':None,'permissions':['support.view']}
 elif path=='/admin/travel/external/sources':data=[source]
 elif path=='/admin/travel/external/sources/source1':data=source
 elif path=='/admin/travel/external/listings':data={'items':[listing],'total':1,'page':1,'pageSize':20}
 elif path=='/admin/travel/external/listings/stay1':data=stay
 elif path=='/admin/travel/external/listings/stay2':data={**stay,'normalized':{**stay['normalized'],'id':'stay2','title':'مشاهدهٔ منبع دوم'}}
 elif path=='/admin/travel/external/matches':data=[{'id':'match1','stayAId':'stay1','stayBId':'stay2','score':0.8,'status':'PENDING','reviewedAt':None}]
 elif path=='/admin/travel/external/canonical/canonical1':data={'id':'canonical1','title':stay['normalized']['title'],'city':'تهران','listings':[{**listing,'petPolicy':'UNKNOWN'}]}
 elif path=='/admin/travel/external/metrics':data=[metric]
 elif path=='/admin/travel/external/parser-health':data=[{'code':'source1','status':'ACTIVE','parserReady':True,'strategy':'PUBLIC','baselineListings':None,'lastDiscovered':None,'anomalyRuns':0,'itemFailureRate':None,'runFailureRate':None,'recentRuns':[]}]
 elif path in ['/admin/travel/external/errors','/admin/travel/external/pet-evidence']:data={'items':[],'total':0,'page':1,'pageSize':20}
 elif path=='/admin/travel/external/tasks':data=[]
 elif path=='/admin/travel/external/daily-diff':data={'date':'2026-10-15','newListings':[],'removedListings':[],'markedStale':[],'reappeared':[],'priceChanges':[],'petPolicyChanges':[],'fieldChanges':0,'listingFailures':0,'staleListingsNow':0,'sourceErrors':[],'runs':[]}
 else:return base(r)
 r.fulfill(status=200,content_type='application/json',body=json.dumps(data))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);results=[]
 for lang,width in [('fa',390),('fa',1440),('en',390),('en',1440)]:
  page=b.new_page(viewport={'width':width,'height':900},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('http://localhost:4000/**',fixture)
  for key,route,fa,en in [('admin-access','admin/access','مدیریت دسترسی ادمین‌ها','Admin access management'),('admin-access-detail','admin/access/member1','جزئیات دسترسی ادمین','Admin access details'),('external-source','admin/travel/external/sources/source1','منبع عمومی سفر','Public travel source'),('external-listings','admin/travel/external/listings','مدیریت اقامتگاه‌های سفر','External stay management'),('external-manual','admin/travel/external/listings/new','ثبت یا به‌روزرسانی دستی','Register or update manually'),('external-inspect','admin/travel/external/listings/stay1','باغ اقامت تهران','باغ اقامت تهران'),('external-matches','admin/travel/external/matches','بررسی اقامتگاه‌های تکراری','Duplicate stay review'),('external-canonical','admin/travel/external/canonical/canonical1','گروه اقامتگاه یکسان','Canonical accommodation group'),('external-reports','admin/travel/external/reports','گزارش و بررسی منابع سفر','Travel source reports')]:
   errors.clear();page.goto(f'http://127.0.0.1:3000/{lang}/{route}',wait_until='networkidle',timeout=120000);expect(page.get_by_role('heading',name=fa if lang=='fa' else en,exact=True).first).to_be_visible(timeout=30000)
   if key=='external-matches':page.get_by_role('button',name='مقایسهٔ دو اقامتگاه' if lang=='fa' else 'Compare stays').click();expect(page.get_by_text('مشاهدهٔ منبع دوم',exact=True)).to_be_visible()
   page.evaluate('document.fonts.ready');page.screenshot(path='/tmp/external-admin.png',full_page=True);Image.open('/tmp/external-admin.png').save(out/f'{key}-{lang}-{width}.webp',quality=85)
   result={'page':key,'locale':lang,'width':width,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'pageErrors':errors.copy()};results.append(result);print(json.dumps(result),flush=True);(out/'external-admin-browser-checks.json').write_text(json.dumps(results,indent=2))
   assert not result['overflow'] and not errors,result
  page.close()
 b.close()
