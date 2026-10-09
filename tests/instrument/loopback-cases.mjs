import {clinicalBrowser} from './cohort-clinical-browser.mjs';
import {statisticsBrowser,literalStatistics} from './cohort-statistics-browser.mjs';
import {paginationBrowser} from './cohort-pagination-browser.mjs';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {cohortBrowserScenario} from './cohort-browser.mjs';
export const browserCases=['instrument:browser-cohort-loopback','instrument:browser-anonymous-loopback'];
export function literalSuccess(response) {
  assert.equal(response.status,200);assert.ok(response.trace);assert.equal(response.json.success,true);assert.equal(response.json.code,'200');
  const data=response.json.data;assert.equal(data.n,5);assert.equal(data.studyTotal,5);
  assert.deepEqual(data.patients.items.map(p=>p.patientId),['5','3','1','7','6']);assert.match(data.analysisId,/^[0-9a-f]{8}-[0-9a-f-]{27}$/);
  assert.equal(data.meta.traceId,response.trace);assert.equal(data.meta.policyVersions.drugDictionary,'dev-drug-v04');
}
export function failure(response,status,code) {assert.equal(response.status,status);assert.ok(response.trace);assert.equal(response.json.success,false);assert.equal(response.json.code,code);assert.equal(response.json.data,null);}
export const cases={
  'instrument:cohort-loopback':async(owner,probe)=>{
    const mode=probe==='startup-never-ready'||probe==='ignore-stop'||probe==='partial-start-fail'?probe:'normal';
    const r=await owner.fixture(['--identity=synthetic',`--mode=${mode}`],{JAVA_TOOL_OPTIONS:'-Dra.ai.api.enabled=false -Dra.ai.gateway.enabled=true -Dra.export.xlsx.enabled=true'});const response=await owner.ready(r,200);literalSuccess(response);
    if(probe==='suite-timeout')await owner.bounded(new Promise(()=>{}),120000,'business-suite');
    if(probe==='ignore-stop'){await owner.stop(r);return;}
    if(probe==='assert-fail')assert.equal(response.json.data.n,6,'temporary wrong literal after real HTTP success');
    const port=await owner.proxy(r);literalSuccess(await owner.post(port,{},r));
    const observation=r.events.filter(e=>e.type==='http-observation').at(-1);assert.equal(observation.active,0);assert.equal(observation.borrowed,observation.returned);assert.ok(observation.borrowed>0);
    await owner.stop(r);
    const next=await owner.fixture(['--identity=synthetic']);literalSuccess(await owner.ready(next,200));await owner.stop(next);
  },
  'instrument:anonymous-loopback':async(owner)=>{
    const r=await owner.fixture(['--identity=anonymous']);failure(await owner.ready(r,401),401,'UNAUTHENTICATED');
    const port=await owner.proxy(r);failure(await owner.post(port,{doctorId:'101'},r),401,'UNAUTHENTICATED');
    for(const e of r.events.filter(e=>e.type==='http-observation')){assert.equal(e.borrowed,0);assert.equal(e.active,0);}
    assert.ok(r.events.some(e=>e.type==='schema-ready'&&e.preparationConnections>0));await owner.stop(r);
  },
  'instrument:sql-failure':async(owner)=>{
    const r=await owner.fixture(['--identity=synthetic','--sql-failure']);failure(await owner.ready(r,503),503,'SERVICE_UNAVAILABLE');
    const e=r.events.filter(e=>e.type==='http-observation').at(-1);assert.ok(e.mysqlFailures>0);assert.equal(e.mysqlError,1146);assert.equal(e.sqlState,'42S02');assert.equal(e.active,0);assert.equal(e.borrowed,e.returned);await owner.stop(r);
  },
  'instrument:guard':async(owner)=>{
    const invalid=[{RA_TEST_MYSQL_URL:''},{RA_TEST_MYSQL_USER:''},{RA_TEST_MYSQL_PASSWORD:''},{RA_TEST_MYSQL_URL:'jdbc:mysql://example.invalid:43306/ra_synthetic_test'},{RA_TEST_MYSQL_URL:'jdbc:mysql://127.0.0.1:43306/other_schema'},{RA_TEST_MYSQL_URL:'jdbc:mysql://user@127.0.0.1:43306/ra_synthetic_test'}];
    for(const overrides of invalid){const r=await owner.fixture(['--mode=guard-only'],overrides);const result=await owner.bounded(r.finished,30000,'guard');assert.notEqual(result.code,0);assert.ok(!r.events.some(e=>['datasource-created','table-owned'].includes(e.type)));assert.equal(r.port,null);await owner.stop(r);}
    const r=await owner.fixture(['--mode=guard-only']);assert.equal((await owner.bounded(r.finished,30000,'guard')).code,0);assert.ok(r.events.some(e=>e.type==='datasource-created'));assert.ok(!r.events.some(e=>e.type==='table-owned'));await owner.stop(r);
  },
  'instrument:schema-ownership':async(owner)=>{
    const r=await owner.fixture(['--mode=schema-conflict-check']);const result=await owner.bounded(r.finished,30000,'schema-conflict');
    assert.equal(result.code,0,'fixture must preserve preexisting sentinel at highest-loss CREATE cut');assert.equal(r.port,null);
    assert.ok(r.events.some(e=>e.type==='create-conflict'&&e.mysqlError===1050));
    assert.ok(r.events.some(e=>e.type==='schema-ownership-observed'&&e.beforeFallback===true&&e.ownedTableAbsent===true&&e.sentinel===8675309));await owner.stop(r);
    assert.equal((await owner.mysqlQuery("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='ra_synthetic_test' ORDER BY TABLE_NAME")).trim(),'');
  }
};

// 浏览器专用选择不进入原五项默认集合。
export const browserRegistry=Object.fromEntries(browserCases.map(id=>[id,async(owner,probe)=>{
  const identity=id==='instrument:browser-anonymous-loopback'?'anonymous':'synthetic';
  const r=await owner.fixture([`--identity=${identity}`]);await owner.ready(r,identity==='anonymous'?401:200);
  const port=await owner.proxy(r);await owner.browserScenario(port,identity,probe);
  const observations=r.events.filter(e=>e.type==='http-observation');
  assert.ok(observations.length>=2);for(const e of observations){assert.equal(e.active,0);assert.equal(e.borrowed,e.returned);if(identity==='anonymous')assert.equal(e.borrowed,0);}
}]));

// 真实产品页面case显式加入registry；原五项默认与两instrument断言不变。
for(const id of ['cohort:browser-firstscreen','cohort:browser-unauthenticated','cohort:browser-unavailable']) {
  browserRegistry[id]=async owner=>{
    const identity=id==='cohort:browser-unauthenticated'?'anonymous':'synthetic';
    const r=await owner.fixture([`--identity=${identity}`,...(id==='cohort:browser-unavailable'?['--sql-failure']:[])]);
    const status=identity==='anonymous'?401:id==='cohort:browser-unavailable'?503:200;
    const ready=await owner.ready(r,status);
    if(status===200)literalSuccess(ready);else failure(ready,status,status===401?'UNAUTHENTICATED':'SERVICE_UNAVAILABLE');
    const port=await owner.proxy(r);
    await owner.browserScenario(port,identity,undefined,(context,port,identity,owner,probe,pid)=>cohortBrowserScenario(context,port,identity,owner,probe,pid,id));
    await expect.poll(()=>r.events.filter(event=>event.type==='http-observation').length,{timeout:5000}).toBe(id==='cohort:browser-firstscreen'?4:2);
    const observations=r.events.filter(event=>event.type==='http-observation');
    for(const event of observations){assert.equal(event.active,0);assert.equal(event.borrowed,event.returned);if(identity==='anonymous')assert.equal(event.borrowed,0);}
    if(id==='cohort:browser-unavailable'){assert.ok(observations.every(event=>event.mysqlFailures>0));assert.ok(observations.every(event=>event.mysqlError===1146&&event.sqlState==='42S02'));}
  };
}

// P01b独立37人场景；仅owned stdin改变合成上下文，原默认五项与两仪器case不变。
for(const id of ['cohort:browser-pagination','cohort:browser-ids','cohort:browser-resource-errors']) {
  browserRegistry[id]=async owner=>{
    const r=await owner.fixture(['--identity=synthetic','--scenario=p01b']);const ready=await owner.ready(r,200);
    assert.equal(ready.json.data.n,37);assert.equal(ready.json.data.studyTotal,37);
    const port=await owner.proxy(r);
    await owner.browserScenario(port,'synthetic',undefined,(context,port,identity,owner,probe,pid)=>paginationBrowser(context,port,identity,owner,probe,pid,id,r));
    for(const observation of r.events.filter(event=>event.type==='http-observation')){assert.equal(observation.active,0);assert.equal(observation.borrowed,observation.returned);}
  };
}

// P02普通六人场景，无额外stdin控制或HTTP路径。
browserRegistry['cohort:browser-statistics']=async owner=>{
 const r=await owner.fixture(['--identity=synthetic','--scenario=p02']);const ready=await owner.ready(r,200);literalStatistics(ready.json.data);
 const port=await owner.proxy(r);await owner.browserScenario(port,'synthetic',undefined,statisticsBrowser);
 for(const event of r.events.filter(e=>e.type==='http-observation')){assert.equal(event.active,0);assert.equal(event.borrowed,event.returned);}
};

// 本run普通六人owned库内追加两个普通访视，实际SQL核准后走真实页面请求。
browserRegistry['cohort:browser-clinical-source']=async owner=>{
 const r=await owner.fixture(['--identity=synthetic','--scenario=p02']);const ready=await owner.ready(r,200);assert.equal(ready.json.data.n,6);assert.equal(ready.json.data.studyTotal,6);
 await owner.mysqlQuery(`INSERT INTO ra_synthetic_test.patient_follow_up_history (id,patient_basic_info_id,research_type,follow_up_date,bqpg,fzjc,zlfa) VALUES
 (130,1,0,'2026-10-07','{"result":{"crpScore":3,"ytgjs":2,"zzgjs":1},"hqaScore":1.2,"tjScore":15}','{"cfydb":8}','{"xyList":[{"drugName":"甲氨蝶呤","startTime":"2026-04-06","endTime":null}]}'),
 (131,1,0,'2026-10-07','{"result":{"ytgjs":2,"zzgjs":1},"hqaScore":1.2,"tjScore":15}','{"cfydb":12}','{"xyList":[{"drugName":"甲氨蝶呤","startTime":"2026-04-06","endTime":null}]}')`);
 const observed=await owner.mysqlQuery("SELECT id,patient_basic_info_id,DATE(follow_up_date),JSON_UNQUOTE(JSON_EXTRACT(bqpg,'$.result.crpScore')),JSON_UNQUOTE(JSON_EXTRACT(fzjc,'$.cfydb')) FROM ra_synthetic_test.patient_follow_up_history WHERE id IN (130,131) ORDER BY id");assert.equal(observed.trim(),'130\t1\t2026-10-07\t3\t8\n131\t1\t2026-10-07\tNULL\t12');
 const port=await owner.proxy(r);await owner.browserScenario(port,'synthetic',undefined,clinicalBrowser);
 for(const event of r.events.filter(e=>e.type==='http-observation')){assert.equal(event.active,0);assert.equal(event.borrowed,event.returned);}
};
