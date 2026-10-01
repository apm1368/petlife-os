# EN purity: keep only Persian fragments that are NOT QA data (not found in any stored text value).
import json,re,sys
corpus='\n'.join(open('/opt/petlife-qa/qa-data-corpus.txt').read().split('\n'))
d=json.load(open(sys.argv[1]))
runs=re.compile(r'[؀-ۿ‌][؀-ۿ‌\s«»،؛:\-–—()0-9۰-۹]*[؀-ۿ‌»)]|[؀-ۿ]')
real={}
for r in d:
    if r['locale']!='en': continue
    for issue in r['issues']:
        text=issue.split('] ',1)[1] if '] ' in issue else issue
        bad=[s.strip() for s in runs.findall(text) if s.strip() and s.strip() not in corpus]
        if bad: real.setdefault(r['name'],set()).add(f"{issue[:90]}  ⟶ not data: {bad[:3]}")
print(sum(len(v) for v in real.values()),"EN contamination candidates on",len(real),"pages")
for k,v in real.items():
    print("--",k); [print("   ",x) for x in sorted(v)[:6]]
