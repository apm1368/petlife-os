import argparse, hashlib, json
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import urlopen

parser=argparse.ArgumentParser()
parser.add_argument('--manifest',required=True)
parser.add_argument('--expected-sha',required=True)
parser.add_argument('--output-dir',required=True)
args=parser.parse_args()
def version():
    with urlopen('https://opetlife.ir/api/health/version',timeout=20) as response:
        return json.loads(response.read()).get('sha')
if version()!=args.expected_sha:raise SystemExit('BLOCKED: unexpected production SHA')
manifest=json.loads(Path(args.manifest).read_text())
output=Path(args.output_dir);output.mkdir(parents=True,exist_ok=False)
rows=[];total=0
for index,(url,verified) in enumerate(manifest['assets'].items()):
    parsed=urlsplit(url)
    if parsed.scheme!='https' or parsed.netloc!='opetlife.ir' or not parsed.path.startswith('/_next/static/') or parsed.query or verified.get('status')!='PASS':
        raise SystemExit('BLOCKED: non-owned/unverified asset reference')
    extension='.js' if parsed.path.endswith('.js') else '.css' if parsed.path.endswith('.css') else None
    if extension is None:raise SystemExit('BLOCKED: unexpected asset type')
    with urlopen(url,timeout=20) as response:
        if response.geturl()!=url or response.status!=200:raise SystemExit('BLOCKED: non-direct asset response')
        content_type=response.headers.get('Content-Type','').split(';')[0].strip().lower()
        expected_types=['text/css'] if extension=='.css' else ['application/javascript','text/javascript']
        if content_type not in expected_types:raise SystemExit('BLOCKED: unexpected asset MIME type')
        data=response.read(8*1024*1024+1)
    total+=len(data)
    if len(data)>8*1024*1024 or total>32*1024*1024:raise SystemExit('BLOCKED: bounded asset-size budget exceeded')
    name=f'asset-{index:02}{extension}'
    (output/name).write_bytes(data)
    rows.append({'file':name,'url':url,'bytes':len(data),'contentType':content_type,'sha256':hashlib.sha256(data).hexdigest()})
if version()!=args.expected_sha:raise SystemExit('BLOCKED: production changed during download')
(output/'manifest.json').write_text(json.dumps({'sha':args.expected_sha,'sampledPublicAssets':rows},indent=2))
print(json.dumps({'assets':len(rows),'bytes':total,'scope':'Owned bundles referenced by sampled public routes, not every private/lazy bundle'}))
