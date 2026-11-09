import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Source inventory only. Presence must never be confused with acceptance evidence.
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const rows = [];
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) visit(path);
    else if (/^page\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      const route = path.replace(/^apps\/web\/app/, '').replace(/\/page\.[^.]+$/, '').replace(/\/\([^/]+\)/g, '') || '/';
      const role = path.match(/\((admin|seller|provider|app|auth)\)/)?.[1] ?? 'public';
      rows.push({ route, source: path, role, checks: 'NOT_TESTED' });
    }
  }
}
visit('apps/web/app');
console.log(JSON.stringify({ kind: 'source-inventory-not-acceptance', sha, dimensions: ['functionality','design','fa','en','de','es','responsive','accessibility','authorization'], nextAction: 'Map APIs/actions and reuse prior evidence after change-impact review; test authenticated roles where required.', routes: rows.sort((a,b) => a.route.localeCompare(b.route)) }));
