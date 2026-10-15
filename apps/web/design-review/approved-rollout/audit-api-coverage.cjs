/** Read-only, reproducible endpoint -> client -> UI inventory. Run from repository root. */
const fs = require('fs');
const path = require('path');
const ts = require('../../node_modules/typescript');
const root = process.cwd();
const web = path.join(root, 'apps/web');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const read = file => ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
const visit = (node, fn) => { fn(node); ts.forEachChild(node, child => visit(child, fn)); };
const decorators = node => ts.canHaveDecorators(node) ? ts.getDecorators(node) || [] : [];
function deco(node, name) { return decorators(node).map(d => d.expression).filter(e => ts.isCallExpression(e) && e.expression.getText() === name); }
function literals(n) {
  if (!n) return [''];
  if (ts.isStringLiteralLike(n)) return [n.text];
  if (ts.isArrayLiteralExpression(n)) return n.elements.flatMap(literals);
  return [];
}
function norm(s) { return ('/' + s).replace(/\/+/g, '/').replace(/\/$/, '').replace(/:[A-Za-z_][A-Za-z_0-9]*|\{[^}]+\}/g, ':param') || '/'; }
function requestPath(n) {
  if (!n) return null;
  if (ts.isStringLiteralLike(n)) return n.text.split('?')[0];
  if (!ts.isTemplateExpression(n)) return null;
  let p = n.head.text;
  for (const span of n.templateSpans) {
    // Query builders add no route segment. Other substitutions represent route parameters.
    if (!/toQueryString|queryString|params\.toString|searchParams|query\b/.test(span.expression.getText())) p += ':param';
    p += span.literal.text;
  }
  return p.split('?')[0];
}
const uiFiles = ['app', 'features', 'hooks', 'stores'].flatMap(d => walk(path.join(web, d))).filter(f => /\.tsx?$/.test(f) && !/\.(test|spec)\./.test(f));
const ui = uiFiles.map(f => ({ file: path.relative(root, f), text: fs.readFileSync(f, 'utf8') }));
const clients = [];
for (const file of walk(path.join(web, 'services')).filter(f => f.endsWith('.service.ts'))) {
  const sf = read(file);
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st) || !st.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const decl of st.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer || !ts.isObjectLiteralExpression(decl.initializer)) continue;
      for (const prop of decl.initializer.properties) {
        if (!prop.name) continue;
        const service = decl.name.text, method = prop.name.getText(sf).replace(/['"]/g, '');
        const re = new RegExp('\\b' + service + '\\s*\\.\\s*' + method + '\\b');
        const consumers = ui.filter(u => re.test(u.text)).map(u => u.file);
        visit(prop, n => {
          if (!ts.isCallExpression(n) || n.expression.getText(sf) !== 'apiFetch') return;
          const p = requestPath(n.arguments[0]);
          if (p === null) return;
          let verbs = ['GET'];
          const opts = n.arguments[1];
          if (opts && ts.isObjectLiteralExpression(opts)) {
            const m = opts.properties.find(p => p.name?.getText(sf) === 'method');
            if (m?.initializer) {
              if (ts.isStringLiteralLike(m.initializer)) verbs = [m.initializer.text];
              else if (ts.isConditionalExpression(m.initializer)) verbs = [...literals(m.initializer.whenTrue), ...literals(m.initializer.whenFalse)];
              else verbs = ['DYNAMIC'];
            }
          }
          for (const verb of verbs) clients.push({ service, method, verb, path: norm(p), source: path.relative(root, file), line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, consumers });
        });
      }
    }
  }
}
const endpoints = [];
const unresolvedDecorators = [];
for (const file of walk(path.join(root, 'apps/api/src')).filter(f => /\.controllers?\.ts$/.test(f))) {
  const sf = read(file);
  visit(sf, n => {
    if (ts.isDecorator(n) && ts.isCallExpression(n.expression)) {
      const e = n.expression;
      if (['Controller', 'Get', 'Post', 'Patch', 'Put', 'Delete', 'Head', 'Options', 'All', 'Sse'].includes(e.expression.getText(sf)) && !literals(e.arguments[0]).length) unresolvedDecorators.push({ source: path.relative(root, file), line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, expression: e.getText(sf) });
    }
    if (!ts.isClassDeclaration(n)) return;
    for (const c of deco(n, 'Controller')) for (const prefix of literals(c.arguments[0])) {
      for (const member of n.members) for (const verb of ['Get', 'Post', 'Patch', 'Put', 'Delete', 'Head', 'Options', 'All', 'Sse']) {
        for (const route of deco(member, verb)) for (const suffix of literals(route.arguments[0])) {
          const endpoint = norm(prefix + '/' + suffix);
          const matches = clients.filter(x => x.path === endpoint && x.verb === verb.toUpperCase());
          const group = path.relative(path.join(root, 'apps/api/src'), file).split('/').slice(0, 3).join('/');
          const system = /webhook|callback|^\/health$|^\/health\//i.test(endpoint);
          endpoints.push({ verb: verb.toUpperCase(), path: endpoint, controller: n.name?.text, handler: member.name?.getText(sf), source: path.relative(root, file), line: sf.getLineAndCharacterOfPosition(member.getStart(sf)).line + 1, group,
            status: matches.some(m => m.consumers.length) ? 'STATIC_UI_CHAIN_FOUND' : matches.length ? 'CLIENT_WITHOUT_DIRECT_UI_REFERENCE_REVIEW' : system ? 'SYSTEM_ENDPOINT_REVIEW_NOT_A_SCREEN' : 'NO_EXACT_CLIENT_MATCH_REVIEW',
            clients: matches.map(({ service, method, source, line, consumers }) => ({ service, method, source, line, consumers })) });
        }
      }
    }
  });
}
const counts = endpoints.reduce((acc, e) => { acc[e.status] = (acc[e.status] || 0) + 1; return acc; }, {});
const out = path.join(web, 'design-review/approved-rollout');
fs.writeFileSync(path.join(out, 'backend-ui-coverage.json'), JSON.stringify({ generated: new Date().toISOString().slice(0, 10), baseCommit: require('child_process').execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), scope: 'Static Nest controller decorators -> exact normalized HTTP verb/path in apiFetch service methods -> direct UI references. Not runtime proof or a completed feature audit. Dynamic decorators, aliases, query-dependent suffixes and generic actions need manual review. System/webhook endpoints do not require customer screens. Parameter names are normalized; ambiguous matches must be reviewed.', counts, unresolvedDecorators, endpoints }, null, 2) + '\n');
const groups = {};
for (const e of endpoints) { groups[e.group] ??= {}; groups[e.group][e.status] = (groups[e.group][e.status] || 0) + 1; }
const md = ['# Backend → frontend coverage inventory', '', 'Generated from actual source controllers and client methods. Each endpoint and its source line is in `backend-ui-coverage.json`. A static chain is evidence of wiring, not proof of permission correctness, complete UX or live API success. Missing exact matches are review candidates, not automatically missing features.', '', '| Backend group | Direct UI chain | Client needs review | No exact client match | System endpoint |', '| --- | ---: | ---: | ---: | ---: |'];
for (const [g, c] of Object.entries(groups).sort()) md.push(`| ${g} | ${c.STATIC_UI_CHAIN_FOUND || 0} | ${c.CLIENT_WITHOUT_DIRECT_UI_REFERENCE_REVIEW || 0} | ${c.NO_EXACT_CLIENT_MATCH_REVIEW || 0} | ${c.SYSTEM_ENDPOINT_REVIEW_NOT_A_SCREEN || 0} |`);
md.push('', `Unresolved dynamic route decorators: ${unresolvedDecorators.length}. Inspect these in the JSON before claiming a complete endpoint inventory.`, '', 'Do not add a public control for admin-only, worker, webhook, provider-only or internal operations. Verify role and entity scope before building. Do not declare full backend coverage until every review candidate is manually resolved and relevant flows are exercised.', '', 'Rerun: `node apps/web/design-review/approved-rollout/audit-api-coverage.cjs` from repository root.');
fs.writeFileSync(path.join(out, 'BACKEND-COVERAGE.md'), md.join('\n') + '\n');
console.log(JSON.stringify({ endpoints: endpoints.length, clientRequests: clients.length, counts }, null, 2));
