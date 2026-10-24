"""Controlled read-only UI fixtures; never calls the deployed site or grants a real role."""
from pathlib import Path
import runpy,sys,json
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from PIL import Image
here=Path(__file__).resolve().parent
fixtures=runpy.run_path(str(here/'browser-fixtures.py'))
base=fixtures['mock'];pet=fixtures['pet']
before='--before' in sys.argv
port=3010 if before else 3012
out=here/'pet-dates-admin-screenshots';out.mkdir(exist_ok=True)
def fixture(r):
 path=urlparse(r.request.url).path
 if r.request.method not in ('GET','OPTIONS'):raise AssertionError('No browser mutations allowed')
 if path=='/settings/public':data={'platform.announcement':None}
 elif path=='/admin/me':data={'isAdmin':True,'adminUserId':'a1','role':'VERIFICATION','displayName':'بازبین','permissions':['verification.manage']}
 elif path=='/onboarding':data={'householdId':'h1','petId':'pet-1','chapter':'PET_IDENTITY','step':'age','status':'IN_PROGRESS','completedSteps':[]}
 elif path=='/pets/pet-1':data={**pet,'approximateAgeMonths':None,'birthDate':'2024-03-20'}
 elif path=='/admin/verification/queue':data=[{'subjectType':'PROVIDER','id':'org1','name':'کلینیک همراه','kind':'VET_CLINIC','status':'SUBMITTED','submittedAt':'2026-10-15T10:00:00Z','waitingHours':12,'documents':{'pending':1,'accepted':2,'rejected':0,'expired':0}}]
 else:return base(r)
 r.fulfill(status=200,content_type='application/json',body=json.dumps(data))
results=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for lang,width in ([('fa',390),('fa',1440)] if before else [('fa',390),('fa',1440),('en',390),('en',1440)]):
  page=b.new_page(viewport={'width':width,'height':900},reduced_motion='reduce');errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('http://localhost:4000/**',fixture)
  for key,route in [('birth-onboarding','onboarding'),('birth-add-pet','pets/new'),('verification-queue','admin/verification')]:
   errors.clear();page.goto(f'http://127.0.0.1:{port}/{lang}/{route}',wait_until='networkidle',timeout=180000)
   if key=='birth-add-pet':
    page.get_by_label('نام' if lang=='fa' else 'Name',exact=True).fill('کوکی')
    page.get_by_role('button',name='ادامه' if lang=='fa' else 'Continue',exact=True).click()
   if key=='verification-queue':expect(page.get_by_role('heading',name='کلینیک همراه',exact=True)).to_be_visible(timeout=30000)
   elif not before:expect(page.get_by_label('نوع تقویم' if lang=='fa' else 'Calendar',exact=True)).to_be_visible(timeout=30000)
   else:expect(page.get_by_role('heading').first).to_be_visible()
   if not before and key=='birth-onboarding':page.get_by_role('button',name='فعلاً نمی‌دانم؛ ادامه' if lang=='fa' else 'I don’t know yet; continue',exact=True).click(trial=True)
   page.evaluate('document.fonts.ready')
   name=f'{"before-" if before else ""}{key}-{lang}-{width}.webp'
   raw=page.screenshot(full_page=True)
   import io
   Image.open(io.BytesIO(raw)).save(out/name,quality=85)
   result={'page':key,'locale':lang,'width':width,'before':before,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'pageErrors':errors.copy()}
   results.append(result);print(json.dumps(result),flush=True)
   assert not result['overflow'] and not errors,result
   if not before and key=='birth-onboarding':
    iso_year=page.get_by_label('سال' if lang=='fa' else 'Year',exact=True)
    assert iso_year.input_value()==('1403' if lang=='fa' else '2024')
    page.get_by_label('نوع تقویم' if lang=='fa' else 'Calendar',exact=True).select_option('gregorian' if lang=='fa' else 'jalali')
    assert iso_year.input_value()==('2024' if lang=='fa' else '1403')
  page.close()
 b.close()
(out/('before-checks.json' if before else 'checks.json')).write_text(json.dumps(results,indent=2))
