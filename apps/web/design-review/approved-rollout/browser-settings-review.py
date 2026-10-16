# Controlled UI review; no real settings are changed.
from pathlib import Path
exec((Path(__file__).parent/'browser-fixtures.py').read_text())
import os
original_mock=mock
out=Path(__file__).parent/'settings-screenshots';out.mkdir(exist_ok=True)
labels=[('platform.announcement','platform','localizedText',{'fa':'به پت‌لایف خوش آمدید','en':'Welcome to PET LIFE'},False),('booking.holdTtlSeconds','booking','integer',600,True),('commerce.refundApprovalThresholdIrr','commerce','integer',10000001,True),('commerce.settlementApprovalThresholdIrr','commerce','integer',50000000,True),('support.firstResponseSlaHours','support','integer',24,False),('trust.highSeveritySlaHours','support','integer',4,False),('trust.standardSlaHours','support','integer',48,False),('privacy.exportsPerDay','privacy','integer',3,False)]
bounds={'booking.holdTtlSeconds':(120,1800),'support.firstResponseSlaHours':(1,168),'trust.highSeveritySlaHours':(1,72),'trust.standardSlaHours':(1,336),'privacy.exportsPerDay':(1,10)}
settings=[{'key':key,'category':category,'type':kind,'scope':'PUBLIC' if kind=='localizedText' else 'INTERNAL','highImpact':impact,'constraints':({'maxLength':280} if kind=='localizedText' else dict(zip(('min','max'),bounds.get(key,(0,2000000000))))),'description':'Controlled review setting','value':value,'defaultValue':value,'source':'OVERRIDE','version':2,'updatedAt':None,'pendingChanges':1 if key in ['booking.holdTtlSeconds','commerce.refundApprovalThresholdIrr'] else 0} for key,category,kind,value,impact in labels]
changes=[{'id':'ch1','key':'commerce.refundApprovalThresholdIrr','status':'PENDING','previousValue':10000001,'proposedValue':20000000,'baseVersion':2,'reason':'بازبینی آستانه بر اساس سیاست مالی مصوب','reviewNote':None,'requestedBy':{'id':'a2','displayName':'کارشناس مالی','role':'ADMIN'},'reviewedBy':None,'createdAt':'2026-10-16T06:00:00Z','reviewedAt':None},{'id':'ch2','key':'booking.holdTtlSeconds','status':'PENDING','previousValue':600,'proposedValue':900,'baseVersion':2,'reason':'زمان بیشتر برای تکمیل رزرو مشتری','reviewNote':None,'requestedBy':{'id':'a1','displayName':'مدیر سامانه','role':'ADMIN'},'reviewedBy':None,'createdAt':'2026-10-16T05:00:00Z','reviewedAt':None}]
def fixture(r):
 path=urlparse(r.request.url).path
 if r.request.method not in ['GET','OPTIONS']:raise AssertionError('Read-only visual capture: '+path)
 if path=='/admin/me':data={'isAdmin':True,'adminUserId':'a1','displayName':'مدیر سامانه','role':'ADMIN','permissions':['settings.view','settings.manage','settings.approve']}
 elif path=='/settings/public':data={'platform.announcement':{'fa':'پیش از رزرو، زمان و شرایط خدمت را بررسی کنید.','en':'Review service times and policies before booking.'}}
 elif path=='/account/activity':data={'items':[],'nextCursor':None}
 elif path=='/admin/settings':data=settings
 elif path=='/admin/settings/changes':data={'items':changes,'total':2,'page':1,'pageSize':20}
 else:return original_mock(r)
 r.fulfill(status=200,content_type='application/json',body=json.dumps(data))
before='--before' in sys.argv
announcement='--announcement' in sys.argv
origin=os.environ.get('REVIEW_ORIGIN','http://127.0.0.1:3004')
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for lang,width in [('fa',390),('fa',1440),('en',390),('en',1440)]:
  if before and lang!='fa':continue
  page=browser.new_page(viewport={'width':width,'height':900},reduced_motion='reduce');errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)));page.route('http://localhost:4000/**',fixture)
  route='profile/activity' if announcement else 'admin'+('' if before else '/settings')
  page.goto(f'{origin}/{lang}/{route}',wait_until='networkidle',timeout=180000)
  if announcement:
   expect(page.get_by_role('heading',name='فعالیت‌های حساب' if lang=='fa' else 'Account activity',exact=True)).to_be_visible(timeout=60000)
   banner=page.get_by_role('complementary',name='اعلان سامانه' if lang=='fa' else 'Platform announcement',exact=True)
   if before:expect(banner).to_have_count(0)
   else:expect(banner).to_be_visible(timeout=60000)
   page.evaluate('document.fonts.ready');page.screenshot(path='/tmp/petlife-settings-review.png',full_page=True);Image.open('/tmp/petlife-settings-review.png').save(out/f'{"before-" if before else ""}announcement-{lang}-{width}.webp',quality=85)
   result={'page':'announcement-before' if before else 'announcement','locale':lang,'width':width,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'pageErrors':errors.copy()};results.append(result);print(json.dumps(result),flush=True);assert not result['overflow'] and not errors,result
  elif before:
   expect(page.locator('.erp-bar')).to_be_visible(timeout=60000)
   page.locator('.erp-bar').screenshot(path='/tmp/petlife-settings-review.png');Image.open('/tmp/petlife-settings-review.png').save(out/f'before-admin-navigation-{lang}-{width}.webp',quality=85)
   results.append({'page':'admin-navigation-before','locale':lang,'width':width,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'pageErrors':errors.copy()})
  else:
   expect(page.get_by_role('heading',name='تنظیمات سامانه' if lang=='fa' else 'Platform settings',exact=True)).to_be_visible(timeout=60000)
   expect(page.get_by_role('heading',name='سابقه و درخواست‌های تغییر' if lang=='fa' else 'Changes and approval history',exact=True)).to_be_visible()
   for scene in ['settings','settings-editor']:
    if scene=='settings-editor':
     panel=page.locator('section').filter(has=page.get_by_role('heading',name='آستانهٔ تأیید دوم بازپرداخت' if lang=='fa' else 'Refund second-approval threshold',level=2,exact=True)).first
     panel.get_by_role('button',name='ویرایش مقدار' if lang=='fa' else 'Edit value',exact=True).click()
    page.evaluate('document.fonts.ready');page.evaluate('window.scrollTo(0,0)');assert 'NaN' not in page.inner_text('body') and 'undefined' not in page.inner_text('body')
    page.screenshot(path='/tmp/petlife-settings-review.png',full_page=True);Image.open('/tmp/petlife-settings-review.png').save(out/f'{scene}-{lang}-{width}.webp',quality=85)
    result={'page':scene,'locale':lang,'width':width,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'pageErrors':errors.copy()};results.append(result);print(json.dumps(result),flush=True);assert not result['overflow'] and not errors,result
  (out/f'{"announcement-" if announcement else ""}{"before-" if before else ""}checks.json').write_text(json.dumps(results,indent=2));page.close()
 browser.close()
