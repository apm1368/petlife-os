# English UI literals that would render on Persian pages: JSX text nodes and label/title/placeholder/aria-label
# string props with Latin words, on lines without a locale switch (fa ? … : …, t(…), pairs).
import re,os,sys
root=sys.argv[1]; hits=[]
PROP=re.compile(r'\b(label|title|placeholder|aria-label|alt|description|actionLabel|retryLabel|message)="([^"{}]*[A-Za-z]{3,}[^"{}]*)"')
TEXT=re.compile(r'>\s*([A-Z][A-Za-z ,.\'’!?-]{2,})\s*</')
CUE=re.compile(r'(\bfa\b\s*\?|locale\s*===?\s*"fa"|lang\s*===?\s*"fa"|\bt\(|\btCommon\(|[؀-ۿ])')
for dp,_,fs in os.walk(root):
    if any(x in dp for x in ['/admin','node_modules','.next','/content','/local-preview','/landing']): continue
    for f in fs:
        if not f.endswith('.tsx') or '.test.' in f: continue
        p=os.path.join(dp,f)
        lines=open(p,encoding='utf8').read().split('\n')
        for i,l in enumerate(lines):
            prev=lines[i-1].rstrip() if i else ''
            if prev.endswith('>') and re.match(r'^\s+[A-Z][A-Za-z]+(?: [A-Za-z’\'.,!?-]+)*\s*$',l) and not CUE.search(prev):
                hits.append(f"{p}:{i+1}: text-line \"{l.strip()[:50]}\"")
            if CUE.search(l): continue
            for m in PROP.finditer(l):
                if m.group(2).strip() not in ('PET LIFE','PET LIFE OS'): hits.append(f"{p}:{i+1}: {m.group(1)}=\"{m.group(2)[:50]}\"")
            for m in TEXT.finditer(l):
                if m.group(1).strip() not in ('PET LIFE','PET LIFE OS','OK'): hits.append(f"{p}:{i+1}: text \"{m.group(1)[:50]}\"")
print(len(hits)); print('\n'.join(hits[:int(sys.argv[2]) if len(sys.argv)>2 else 80]))
