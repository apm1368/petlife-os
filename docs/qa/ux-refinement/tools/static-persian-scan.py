# Persian literals in consumer/partner UI code that will also render in English.
# Skips: fa/en pairs on one line (t("…","…"), ["…","…"], fa ? "…" : "…"), properties of locale-keyed copy
# objects (file defines an `en:` block), and comments. What remains needs a human look.
import re,os,sys
root=sys.argv[1]; hits=[]
PER=re.compile(r'[؀-ۿ]')
LAT_LIT=re.compile(r'["`\'][^"`\']*[A-Za-z]{3,}[^"`\']*["`\']')
cue=re.compile(r'(\bfa\b\s*\?|locale\s*===?\s*"fa"|lang\s*===?\s*"fa"|isFa|\bfa\s*&&|messages/fa)')
for dp,_,fs in os.walk(root):
    if any(x in dp for x in ['/admin','node_modules','.next','/content']): continue
    for f in fs:
        if not f.endswith(('.tsx','.ts')) or '.test.' in f: continue
        p=os.path.join(dp,f); src=open(p,encoding='utf8').read(); lines=src.split('\n')
        has_en_block=bool(re.search(r'\ben\s*:\s*[\{\[]',src))
        for i,l in enumerate(lines):
            s=l.strip()
            if not PER.search(l) or s.startswith(('//','*','/*')): continue
            if LAT_LIT.search(l) or cue.search(l) or cue.search('\n'.join(lines[max(0,i-2):i])): continue
            if has_en_block and re.match(r'^[\w"\']+\s*:\s*["`\[(]',s): continue
            hits.append(f"{p}:{i+1}: {s[:120]}")
print(len(hits)); print('\n'.join(hits[:int(sys.argv[2]) if len(sys.argv)>2 else 60]))
