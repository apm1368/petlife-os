import os,json,time,ipaddress,io
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
from PIL import Image
out=Path(os.environ.get('QA_EVIDENCE_DIR',Path(__file__).resolve().parent/'onboarding-qa-screenshots/live'));out.mkdir(parents=True,exist_ok=True)
origin='http://185.231.112.154';results=[]
def safeurl(url):
 p=urlparse(url);return p.scheme+'://'+p.netloc+p.path
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',proxy={'server':os.environ['HTTP_PROXY']},args=['--no-sandbox'])
 for locale in ['fa','en']:
  for width in [390,1440]:
   context=browser.new_context(viewport={'width':width,'height':900},reduced_motion='reduce')
   for name,path in [('home',''),('login','/account?method=password'),('onboarding','/onboarding'),('add-pet','/pets/new')]:
    page=context.new_page();errors=[];console=[];failures=[];responses=[];blocked=[]
    def route(r):
     req=r.request;u=urlparse(req.url)
     try:private=ipaddress.ip_address(u.hostname).is_private
     except ValueError:private=u.hostname in ['localhost','proxy']
     if (private and u.hostname!='185.231.112.154') or req.method not in ['GET','HEAD','OPTIONS']:
      blocked.append({'url':safeurl(req.url) if not private else 'private redirect destination','method':req.method});r.abort();return
     r.continue_()
    page.route('**/*',route)
    page.on('pageerror',lambda e:errors.append(str(e)[:300]))
    page.on('console',lambda m:console.append({'type':m.type,'text':m.text[:300]}) if m.type in ['error','warning'] else None)
    page.on('requestfailed',lambda r:failures.append({'url':safeurl(r.url),'type':r.resource_type,'failure':r.failure}))
    page.on('response',lambda r:responses.append({'url':safeurl(r.url),'status':r.status,'type':r.request.resource_type}))
    navigation=None
    try:page.goto(origin+'/'+locale+path,wait_until='domcontentloaded',timeout=25000)
    except Exception as e:navigation=type(e).__name__
    page.wait_for_timeout(2000)
    hydration=page.evaluate("() => [...document.querySelectorAll('*')].filter(e => Object.keys(e).some(k => k.startsWith('__reactFiber') || k.startsWith('__reactProps'))).length")
    Image.open(io.BytesIO(page.screenshot(full_page=True,timeout=10000))).save(out/f'{name}-{locale}-{width}.webp',quality=80)
    row={'page':name,'locale':locale,'width':width,'effectiveUrl':safeurl(page.url),'navigationError':navigation,'reactBoundElements':hydration,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'buildMeta':page.locator('meta[name="petlife-build"]').get_attribute('content') if page.locator('meta[name="petlife-build"]').count() else None,'pageErrors':errors,'console':console,'failedRequests':failures,'responses':responses,'blockedByReadOnlyQA':blocked}
    results.append(row);(out/'checks.json').write_text(json.dumps(results,indent=2));print(json.dumps({'page':name,'locale':locale,'width':width,'reactBoundElements':hydration,'failed':len(failures),'errors':len(errors),'overflow':row['overflow']}),flush=True);page.close()
   context.close()
 browser.close()
