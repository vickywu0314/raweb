const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const diagnostics = /HTTP\s*\d|API_BASE|后端|\/api\/|SERVICE_UNAVAILABLE|[{}]|Failed to fetch|Unexpected token/;
function apiContext(fetch) {
  const source = read('js/common.js'), start = source.indexOf('function apiErrorMessage');
  const c = vm.createContext({ fetch, API_BASE: '', URLSearchParams, markDataChanged: () => {} });
  vm.runInContext(source.slice(start < 0 ? source.indexOf('async function apiPost(') : start, source.indexOf('// ===== 提示：')), c);
  return c;
}
const response = (status, payload, broken = false) => ({ status, ok: status >= 200 && status < 300, json: async () => { if (broken) throw new SyntaxError('Unexpected token { raw JSON'); return payload; } });
test('legacy:api-visible-error-contract', async () => {
  for (const fn of ['apiPost', 'apiPostJson']) {
    for (const [status, text] of [[401, '登录'], [403, '权限'], [400, '检查'], [409, '刷新'], [503, '稍后']]) {
      const c = apiContext(async () => response(status, null, true));
      await assert.rejects(c[fn]('/synthetic', { name: 'DAS28-CRP' }), e => {
        assert.match(e.message, new RegExp(text), `${fn} ${status} gives actionable Chinese`);
        assert.doesNotMatch(e.message, diagnostics); assert.equal(e.status, status); return true;
      });
    }
    for (const [status, code, message, expected] of [
      [200, '400', '请填写 DAS28-CRP 评分', '请填写 DAS28-CRP 评分'],
      [200, '400', '请填写 anti_CCP 结果', '请填写 anti_CCP 结果'],
      [200, '401', '', '登录'], [200, '403', '', '权限'], [200, '400', '', '检查'],
      [200, '409', '', '刷新'], [200, '500', '', '稍后'],
      [200, '500', '内部失败 java.lang.RuntimeException', '稍后'],
      [200, '500', '<html>服务出错</html>', '稍后'],
      [409, 'IDEMPOTENCY_CONFLICT', '申请参数与原请求不同', '申请参数与原请求不同'],
      [200, 'FORBIDDEN', 'FORBIDDEN', '权限'],
      [200, 'SERVICE_UNAVAILABLE', '{"message":"内部错误"}', '稍后'],
      [503, 'SERVICE_UNAVAILABLE', '服务失败 HTTP 503 /api/ra/test', '稍后']
    ]) {
      const c = apiContext(async () => response(status, { success: false, code, message }));
      await assert.rejects(c[fn]('/synthetic', {}), e => {
        assert.match(e.message, new RegExp(expected)); assert.doesNotMatch(e.message, diagnostics);
        assert.equal(e.code, code); assert.equal(e.status, status); return true;
      });
    }
    const bad = apiContext(async () => { throw new TypeError('Failed to fetch'); });
    await assert.rejects(bad[fn]('/synthetic', {}), e => { assert.match(e.message, /网络|连接/); assert.doesNotMatch(e.message, diagnostics); return true; });
    const empty = apiContext(async () => response(200, null));
    await assert.rejects(empty[fn]('/synthetic', {}), e => { assert.match(e.message, /稍后重试/); assert.doesNotMatch(e.message, diagnostics); return true; });
    const parse = apiContext(async () => response(200, null, true));
    await assert.rejects(parse[fn]('/synthetic', {}), e => { assert.match(e.message, /稍后重试/); assert.doesNotMatch(e.message, diagnostics); return true; });
    let request, changed;
    const ok = apiContext(async (...args) => { request = args; return response(200, { success: true, data: { value: 'MTX' } }); });
    ok.markDataChanged = p => { changed = p; };
    assert.equal((await ok[fn]('/synthetic', { name: 'MTX' })).value, 'MTX');
    assert.equal(request[0], '/synthetic'); assert.equal(request[1].method, 'POST'); assert.equal(changed, '/synthetic');
    assert.equal(String(request[1].body), fn === 'apiPost' ? 'name=MTX' : '{"name":"MTX"}');
  }
});
function nodes() {
  const all = new Map();
  const node = key => { if (!all.has(key)) all.set(key, { textContent: '', innerHTML: '', hidden: false, disabled: false, value: '', checked: false, events: {}, addEventListener(n, f) { this.events[n] = f; }, focus() {}, select() {}, setAttribute() {} }); return all.get(key); };
  return { node, all };
}
test('legacy:page-error-copy', async () => {
  for (const page of ['projects', 'dashboard', 'followups', 'data-quality']) for (const reason of ['服务错误 HTTP 503 API_BASE /api/ra/test', '请补全患者随访周期']) {
    const { node } = nodes(), c = apiContext(async () => {});
    Object.assign(c, { $: node, D: null, console: { error() {} }, currentDoctorId: () => 1, shell() {}, escapeHTML: String,
      apiPost: async () => { throw new Error(reason); },
      document: { getElementById: id => node('#' + id), addEventListener(n, f) { this.ready = f; } } });
    const source = read(`js/pages/${page}.js`);
    if (page === 'projects') { vm.runInContext(source, c); await c.document.ready(); }
    else { vm.runInContext(source.slice(source.indexOf('async function load(')), c); await flush(); }
    const text = node(page === 'projects' ? '#pv-error' : page === 'dashboard' ? '#dashboard' : '#rows');
    assert.match(text.textContent + text.innerHTML, reason === '请补全患者随访周期' ? /失败.*请补全患者随访周期/ : /失败.*(稍后|重试|网络)/);
    assert.doesNotMatch(text.textContent + text.innerHTML, diagnostics, page);
    if (page === 'data-quality') { assert.equal(node('#run-check').disabled, false); assert.equal(node('#run-check').textContent, '运行质控检查'); }
  }
  assert.doesNotMatch(read('js/pages/data-quality.js'), /记录表还没建/);
  assert.match(read('js/pages/data-quality.js'), /err.textContent = apiErrorMessage\(ex\)/, 'resolve failure uses the same safe Chinese mapper');
});
async function loginRun(res, rejection) {
  const { node } = nodes(); let ready, request, signed = false, went = false;
  const c = vm.createContext({ URLSearchParams, currentUser: () => null, window: {}, localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    document: { getElementById: id => node('#' + id), querySelector: node, addEventListener(n, f) { ready = f; } },
    location: { search: '', replace() { went = true; } }, signIn() { signed = true; },
    fetch: async (...args) => { request = args; if (rejection) throw rejection; return res; } });
  vm.runInContext(read('js/pages/login.js'), c); ready(); node('#username').value = 'synthetic'; node('#password').value = 'synthetic';
  node('#login-form').events.submit({ preventDefault() {} }); await flush();
  assert.equal(node('#login-submit').disabled, false); assert.equal(node('#login-submit').textContent, '登 录');
  assert.equal(request[0], '/api/ra/auth/login'); assert.equal(request[1].credentials, 'same-origin');
  return { message: node('#login-error').textContent, signed, went };
}
test('legacy:login-error-copy', async () => {
  for (const [status, payload, broken, expected] of [
    [401, null, true, '用户名或密码'], [403, null, true, '权限'], [400, null, true, '检查'], [409, null, true, '重试'], [503, null, true, '稍后'],
    [200, { success: false, code: '400', message: '请填写用户名' }, false, '请填写用户名'],
    [200, { success: false, code: '401', message: '' }, false, '用户名或密码'],
    [200, { success: false, code: '403', message: '' }, false, '权限'],
    [200, null, false, '稍后'],
    [200, { success: false, code: 'SERVICE_UNAVAILABLE', message: 'HTTP 503 {"raw":"内部错误"}' }, false, '稍后'],
    [200, null, true, '稍后']
  ]) {
    const r = await loginRun(response(status, payload, broken)); assert.match(r.message, new RegExp(expected)); assert.doesNotMatch(r.message, diagnostics); assert.equal(r.signed, false); assert.equal(r.went, false);
  }
  const network = await loginRun(null, Error('Failed to fetch')); assert.match(network.message, /网络|连接/); assert.doesNotMatch(network.message, diagnostics);
  const ok = await loginRun(response(200, { success: true, data: { doctorId: 1 } })); assert.equal(ok.signed, true); assert.equal(ok.went, true);
});
test('legacy:ocr-upload-error-copy', async () => {
  for (const [status, payload, broken, expected] of [[403, null, true, '权限'], [503, null, true, '稍后'], [200, { success: false, code: '400', message: '图片不能为空' }, false, '图片不能为空'], [200, { success: false, code: '500', message: 'HTTP 500' }, false, '稍后'], [200, null, true, '稍后']]) {
    const c = apiContext(async () => response(status, payload, broken)); c.FormData = class { append() {} };
    const source = read('js/shared/ocr-import.js'); vm.runInContext(source.slice(source.indexOf('async function ocrUpload('), source.indexOf('function openOcrImport(')), c);
    await assert.rejects(c.ocrUpload({ name: 'synthetic.png' }), e => { assert.match(e.message, new RegExp(expected)); assert.doesNotMatch(e.message, diagnostics); assert.equal(e.status, status); return true; });
  }
  assert.match(read('js/shared/ocr-import.js'), /escapeHTML\(apiErrorMessage\(e\)\)/, 'OCR upload and recognition status sanitizes errors');
  assert.match(read('js/shared/ocr-import.js'), /toastNext\(`对应关系没有记住：\$\{apiErrorMessage\(e\)\}/, 'alias notification uses safe Chinese mapper');
});
