"""Read-only browser witness for the public opetlife deployment. No auth/data writes."""
import hashlib
import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

ORIGIN = 'http://185.231.112.154'
EXPECTED_SHA = os.environ['EXPECTED_SHA']
assert re.fullmatch(r'[0-9a-f]{40}', EXPECTED_SHA)
OUT = Path(os.environ['QA_EVIDENCE_DIR'])
OUT.mkdir(parents=True, exist_ok=True)


def allowed(method, url):
    parsed = urlparse(url)
    return method in {'GET', 'HEAD', 'OPTIONS'} and parsed.scheme == 'http' and parsed.hostname == '185.231.112.154' and parsed.port in {None, 80} and parsed.username is None and parsed.password is None


def safe_path(url):
    return urlparse(url).path if allowed('GET', url) else '[outside-target]'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def health():
    # Default ProxyHandler and CA trust are retained; no direct-route override.
    opener = urllib.request.build_opener(NoRedirect())
    result = {}
    for name in ['version', 'ready']:
        with opener.open(ORIGIN + '/api/health/' + name, timeout=20) as response:
            assert response.status == 200
            data = json.load(response)
        if name == 'version':
            result[name] = {k: data.get(k) for k in ['version', 'sha', 'buildTime', 'deploymentId', 'environment']}
            assert data.get('sha') == EXPECTED_SHA, 'Live API SHA differs from the selected main commit'
        else:
            result[name] = {'status': data.get('status'), 'checks': {k: data.get('checks', {}).get(k) == 'up' for k in ['database', 'redis']}}
            assert data.get('status') == 'ok' and all(result[name]['checks'].values()), 'Database/Redis not ready'
    return result


def console_record(message):
    # Never persist console values, credentials, headers or response bodies.
    text = message.text
    return {'type': message.type, 'http401': bool(re.search(r'\b401\b', text) and 'Failed to load resource' in text), 'hydration': bool(re.search(r'hydrat|did not match|server HTML', text, re.I)), 'digest': hashlib.sha256(text.encode()).hexdigest(), 'source': safe_path(message.location.get('url', '')), 'line': message.location.get('lineNumber')}


report = {'expectedSha': EXPECTED_SHA, 'mutationsSent': 0, 'cases': []}
(OUT / 'health-before.json').write_text(json.dumps(health(), indent=2))
with sync_playwright() as p:
    options = {}
    if os.environ.get('HTTP_PROXY'):
        options['proxy'] = {'server': os.environ['HTTP_PROXY']}
    if os.environ.get('QA_CHROMIUM_PATH'):
        options['executable_path'] = os.environ['QA_CHROMIUM_PATH']
    browser = p.chromium.launch(**options)
    for locale in ['fa', 'en']:
        for width in [390, 1440]:
            for name, path in [('home', ''), ('login', '/account?method=password'), ('onboarding', '/onboarding'), ('add-pet', '/pets/new')]:
                context = browser.new_context(viewport={'width': width, 'height': 900}, reduced_motion='reduce', service_workers='block')
                page = context.new_page()
                errors, console, failed, responses, blocked = [], [], [], [], []
                page.on('pageerror', lambda error: errors.append({'digest': hashlib.sha256(str(error).encode()).hexdigest()}))
                page.on('console', lambda message: console.append(console_record(message)) if message.type in ['error', 'warning'] else None)
                page.on('requestfailed', lambda req: failed.append({'path': safe_path(req.url), 'type': req.resource_type, 'failure': req.failure}))
                page.on('response', lambda response: responses.append({'path': safe_path(response.url), 'status': response.status, 'type': response.request.resource_type, 'mime': response.headers.get('content-type', '')}))

                def route(request_route):
                    request = request_route.request
                    if not allowed(request.method, request.url):
                        blocked.append({'method': request.method, 'path': safe_path(request.url)})
                        request_route.abort()
                    else:
                        request_route.continue_()

                page.route('**/*', route)
                def reject_websocket(socket):
                    blocked.append({'method': 'WEBSOCKET', 'path': safe_path(socket.url)})
                    socket.close()
                page.route_web_socket('**/*', reject_websocket)
                row = {'page': name, 'locale': locale, 'width': width, 'failures': []}
                try:
                    response = page.goto(ORIGIN + '/' + locale + path, wait_until='networkidle', timeout=45000)
                    assert response is not None and response.status == 200, 'Page navigation was not HTTP 200'
                    page.wait_for_function("() => [...document.querySelectorAll('*')].some(e => Object.keys(e).some(k => k.startsWith('__reactFiber') || k.startsWith('__reactProps')))", timeout=30000)
                    row['reactBoundElements'] = page.evaluate("() => [...document.querySelectorAll('*')].filter(e => Object.keys(e).some(k => k.startsWith('__reactFiber') || k.startsWith('__reactProps'))).length")
                    if name == 'login':
                        field = page.locator('.auth-password-field').first
                        expect(field).to_be_visible()
                        password_input = field.locator('input')
                        assert password_input.input_value() == '', 'The test never supplies a credential'
                        toggle = field.locator('button.auth-password-toggle')
                        toggle.click()
                        expect(password_input).to_have_attribute('type', 'text')
                        expect(toggle).to_have_attribute('aria-pressed', 'true')
                        toggle.click()
                        expect(password_input).to_have_attribute('type', 'password')
                        row['emptyPasswordVisibilityToggle'] = True
                    row['overflow'] = page.evaluate('document.documentElement.scrollWidth > innerWidth')
                    assert not row['overflow'], 'Horizontal overflow'
                except Exception as error:
                    row['failures'].append(type(error).__name__)
                try:
                    page.screenshot(path=str(OUT / f'{name}-{locale}-{width}.jpg'), type='jpeg', quality=75, full_page=True, timeout=30000)
                except Exception as error:
                    row['failures'].append('screenshot:' + type(error).__name__)
                row.update(effectivePath=safe_path(page.url), pageErrors=errors, console=console, failedRequests=failed, responses=responses, blocked=blocked)
                assets = [r for r in responses if '/_next/static/' in r['path'] and r['type'] in ['script', 'stylesheet']]
                valid = lambda a: a['status'] == 200 and (('javascript' in a['mime']) if a['type'] == 'script' else ('text/css' in a['mime']))
                if not assets or not any(a['type'] == 'script' for a in assets) or not any(a['type'] == 'stylesheet' for a in assets) or not all(valid(a) for a in assets):
                    row['failures'].append('JS/CSS status or MIME')
                unexpected_http = [r for r in responses if r['status'] >= 400 and not (r['status'] == 401 and r['type'] in ['fetch', 'xhr'] and r['path'].startswith('/api/'))]
                unexpected_failed = [r for r in failed if not (r['failure'] == 'net::ERR_ABORTED' and r['type'] in ['fetch', 'xhr'] and r['path'] == '/api/settings/public')]
                if blocked or errors or unexpected_http or unexpected_failed or any(m['hydration'] or (m['type'] == 'error' and not m['http401']) for m in console):
                    row['failures'].append('Runtime/network error')
                report['cases'].append(row)
                (OUT / 'checks.json').write_text(json.dumps(report, indent=2))
                print(json.dumps({'page': name, 'locale': locale, 'width': width, 'reactBoundElements': row.get('reactBoundElements', 0), 'failures': row['failures']}), flush=True)
                context.close()
    browser.close()
(OUT / 'health-after.json').write_text(json.dumps(health(), indent=2))
assert len(report['cases']) == 16 and all(not case['failures'] for case in report['cases']), 'Read-only live browser QA failed; see the retained evidence'
