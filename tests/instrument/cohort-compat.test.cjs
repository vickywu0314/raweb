const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const source = readFileSync(resolve(__dirname, '../../js/common.js'), 'utf8');
function load(config) {
  const requests = [], replies = [];
  const context = vm.createContext({ window: config ? { RA_CONFIG: config } : {}, INITIAL_PATIENTS: [], localStorage: { getItem: () => null }, URLSearchParams,
    fetch: async (url, options) => { requests.push({url, options}); return replies.shift() || {ok:true, json:async()=>({success:true,data:{name:'合成患者'}})}; } });
  vm.runInContext(source, context);
  return {requests, replies, post:(path,params)=>context.apiPost(path,params), json:(path,body)=>context.apiPostJson(path,body)};
}
test('cohort:legacy-compat', async () => {
  assert.match(readFileSync(resolve(__dirname,'../../js/pages/patient-visits.js'),'utf8'), /apiPost\('\/api\/ra\/patient\/patientDetail',\{doctorId:currentDoctorId\(\),patientId\}\)/);
  assert.match(readFileSync(resolve(__dirname,'../../js/pages/visit-edit.js'),'utf8'), /apiPostJson\('\/api\/ra\/visit\/updateVisit',collect\(\)\)/);
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
  await assert.rejects(()=>same.post('/api/ra/patient/patientDetail', {}), /接口请求失败（HTTP 401）/);
  same.replies.push({ok:true,json:async()=>({success:false,message:'原错误'})});
  await assert.rejects(()=>same.json('/api/ra/visit/updateVisit', {}), /原错误/);
  const configured = load({apiBase:'http://127.0.0.1:9000'});
  await configured.post('/api/ra/patient/patientDetail', {}); await configured.json('/api/ra/visit/updateVisit', {});
  assert.deepEqual(configured.requests.map(r=>r.url), ['http://127.0.0.1:9000/api/ra/patient/patientDetail','http://127.0.0.1:9000/api/ra/visit/updateVisit']);
});
