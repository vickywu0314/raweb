const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const boot = readFileSync(resolve(__dirname, '../../js/boot.js'), 'utf8');
const source = readFileSync(resolve(__dirname, '../../js/common.js'), 'utf8');
function load(config) {
  const requests = [], replies = [];
  const context = vm.createContext({ RA_CONFIG: config, INITIAL_PATIENTS: [], localStorage: { getItem: () => null }, sessionStorage:{getItem:()=>null},location:{pathname:'/login.html'},document:{addEventListener(){}},addEventListener(){},URLSearchParams,
    fetch: async (url, options) => { requests.push({url, options}); return replies.shift() || {ok:true, json:async()=>({success:true,data:{name:'合成患者'}})}; } });
  context.window=context;vm.runInContext(boot,context);vm.runInContext(source, context);
  return {requests, replies, post:(path,params)=>context.apiPost(path,params), json:(path,body)=>context.apiPostJson(path,body)};
}
test('cohort:legacy-compat', async () => {
  const {harness,flush}=require('../fixtures/issue1-patient-detail.cjs');const page=harness();await flush();
  assert.equal(page.requests[0].url,'/api/ra/patient/patientDetail');assert.deepEqual(Object.fromEntries(new URLSearchParams(page.requests[0].options.body)),{patientId:'9007199254740993'});await page.event('pagehide');
  const fixture=require('../fixtures/issue1-patient-detail.cjs'),edit=harness('visit-edit');await flush();
  await edit.answer(0,fixture.detail());await edit.answer(1,fixture.form());
  let finishValidation;edit.context.vfPrepareSubmission=()=>new Promise(resolve=>{finishValidation=resolve});
  await edit.submit();assert.equal(edit.requests.filter(r=>r.url.endsWith('/updateVisit')).length,0,'legacy JSON save waits for asynchronous field validation');
  finishValidation();await flush();
  const update=edit.requests.find(r=>r.url.endsWith('/updateVisit'));assert.ok(update,'validated visit uses existing updateVisit endpoint');
  assert.equal(update.options.headers['Content-Type'],'application/json;charset=UTF-8');
  assert.deepEqual(JSON.parse(update.options.body),{doctorId:'101',visitId:fixture.VISIT,version:'synthetic-version',visitDate:'2026-10-01',modules:{}});
  await edit.event('pagehide');
  const same = load();
  assert.deepEqual(await same.post('/api/ra/patient/patientDetail', {patientId:'9223372036854775807',doctorId:101}), {name:'合成患者'});
  assert.equal(same.requests[0].url, '/api/ra/patient/patientDetail');
  assert.equal(same.requests[0].options.body.toString(), 'patientId=9223372036854775807&doctorId=101');
  assert.equal(same.requests[0].options.headers['Content-Type'], 'application/x-www-form-urlencoded;charset=UTF-8');
  await same.json('/api/ra/visit/updateVisit', {patientId:'9',fields:{name:'合成甲'}});
  assert.equal(same.requests[1].url, '/api/ra/visit/updateVisit');
  assert.equal(same.requests[1].options.body, '{"patientId":"9","fields":{"name":"合成甲"}}');
  assert.equal(same.requests[1].options.headers['Content-Type'], 'application/json;charset=UTF-8');
  same.replies.push({ok:false,status:401});
  await assert.rejects(()=>same.post('/api/ra/patient/patientDetail', {}), error => {
    assert.equal(error.message, '登录已失效，请重新登录后再试。');
    assert.equal(error.status, 401);
    assert.doesNotMatch(error.message, /HTTP|API_BASE/);
    return true;
  });
  same.replies.push({ok:true,json:async()=>({success:false,message:'原错误'})});
  await assert.rejects(()=>same.json('/api/ra/visit/updateVisit', {}), /原错误/);
  const configured = load({apiBase:'http://127.0.0.1:9000'});
  await configured.post('/api/ra/patient/patientDetail', {}); await configured.json('/api/ra/visit/updateVisit', {});
  assert.deepEqual(configured.requests.map(r=>r.url), ['http://127.0.0.1:9000/api/ra/patient/patientDetail','http://127.0.0.1:9000/api/ra/visit/updateVisit']);
});
