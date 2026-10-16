/** Read-only service-consumer inventory. Visual verification lives in route-design-status.json. */
const fs=require('fs'),path=require('path'),ts=require('../../node_modules/typescript');
const root=path.resolve(__dirname,'../..');
function walk(p){return fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]);}
const clients=['features','hooks','app','stores'].flatMap(d=>walk(path.join(root,d))).filter(p=>/\.tsx?$/.test(p)&&!p.includes('.test.'));
const cache=clients.map(p=>({file:path.relative(root,p),text:fs.readFileSync(p,'utf8')}));
const methods=[];
for(const file of walk(path.join(root,'services')).filter(p=>p.endsWith('.service.ts'))){
 const sf=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 for(const statement of sf.statements){
  if(!ts.isVariableStatement(statement)||!statement.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))continue;
  for(const d of statement.declarationList.declarations){
   if(!ts.isIdentifier(d.name)||!d.initializer||!ts.isObjectLiteralExpression(d.initializer))continue;
   for(const prop of d.initializer.properties){
    if(!prop.name||(!ts.isIdentifier(prop.name)&&!ts.isStringLiteral(prop.name)))continue;
    const service=d.name.text,method=prop.name.text;
    const re=new RegExp('\\b'+service+'\\s*\\.\\s*'+method+'\\b');
    const consumers=cache.filter(c=>re.test(c.text)).map(c=>c.file);
    methods.push({service,method,source:path.relative(root,file),consumers,status:consumers.length?'UI_CONSUMER_FOUND':'REVIEW_REQUIRED_NOT_PROOF_OF_MISSING_UI'});
   }
  }
 }
}
const routes=walk(path.join(root,'app')).filter(p=>p.endsWith('/page.tsx')).map(file=>({file:path.relative(root,file),route:path.relative(path.join(root,'app'),file).replace(/\/page\.tsx$/,'').split('/').map(s=>s.replace(/^\(\.{1,3}\)/,'')).filter(s=>!s.startsWith('(')&&!s.startsWith('@')).join('/')}));
const out=path.join(root,'design-review/approved-rollout');
fs.writeFileSync(path.join(out,'ui-coverage-audit.json'),JSON.stringify({generated:new Date().toISOString().slice(0,10),scope:'Static service consumer scan, excluding tests. Aliases, generic action dispatch and legacy wrappers require manual review; no automatic feature claims.',routes,methods},null,2)+'\n');
const unused=methods.filter(m=>!m.consumers.length);
console.log(JSON.stringify({routes:routes.length,serviceMethods:methods.length,withUI:methods.length-unused.length,reviewCandidates:unused.length,candidates:unused.map(x=>x.service+'.'+x.method)},null,2));
