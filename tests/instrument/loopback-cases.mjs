import {patientInsightBrowser} from './patient-insight-browser.mjs';
import {configuredSourcesBrowser} from './configured-sources-browser.mjs';
import {patientSearchBrowser} from './ai-patient-search-browser.mjs';
import {overviewBrowser} from './ai-overview-browser.mjs';
import {patientFollowUpPolicyBrowser,trustedPatientBrowser,trustedPatientInteractionsBrowser,patientBrowser} from './cohort-patient-browser.mjs';
import {applicationBrowser} from './cohort-application-browser.mjs';
import {entryBrowser} from './cohort-entry-browser.mjs';
import {exportBrowser,exportComparisonBrowser} from './cohort-export-browser.mjs';
import {applyBrowser} from './cohort-apply-browser.mjs';
import {parseBrowser} from './cohort-parse-browser.mjs';
import {comparisonBrowser,statisticsComparisonBrowser,retainedComparisonBrowser,invalidatedComparisonBrowser} from './cohort-comparison-browser.mjs';
import {privateBrowser,dynamicPrivateBrowser,commandsPrivateBrowser} from './cohort-private-browser.mjs';
import {clinicalBrowser} from './cohort-clinical-browser.mjs';
import {statisticsBrowser,literalStatistics} from './cohort-statistics-browser.mjs';
import {paginationBrowser} from './cohort-pagination-browser.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
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
    const privateRun=await owner.fixture(['--scenario=p03','--mode=schema-conflict-check']);const privateResult=await owner.bounded(privateRun.finished,30000,'private-schema-conflict');
    assert.equal(privateResult.code,0,'private second CREATE collision must preserve the preexisting sentinel');assert.equal(privateRun.port,null);
    assert.ok(privateRun.events.some(e=>e.type==='private-schema-ownership-observed'&&e.beforeFallback&&e.ownedTableAbsent&&e.sentinel===8675309));
    assert.deepEqual(privateRun.events.filter(e=>e.type==='table-owned').map(e=>e.table),['patient_basic_info','patient_relation_doctor','patient_follow_up_history','patient_comorbidity','ra_ai_analysis_run','ra_private_cohort_definition']);await owner.stop(privateRun);
    assert.equal((await owner.mysqlQuery("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='ra_synthetic_test' ORDER BY TABLE_NAME")).trim(),'');
    const comparisonRun=await owner.fixture(['--scenario=p04','--mode=schema-conflict-check']);const comparisonResult=await owner.bounded(comparisonRun.finished,30000,'comparison-schema-conflict');
    assert.equal(comparisonResult.code,0,'comparison CREATE collision must preserve the preexisting new-table sentinel before fallback');assert.equal(comparisonRun.port,null);
    assert.ok(comparisonRun.events.some(e=>e.type==='comparison-schema-ownership-observed'&&e.beforeFallback===true&&e.ownedTableAbsent===true&&e.sentinel===8675309));
    assert.deepEqual(comparisonRun.events.filter(e=>e.type==='table-owned').map(e=>e.table),['patient_basic_info','patient_relation_doctor','patient_follow_up_history','patient_comorbidity','ra_ai_analysis_run','ra_private_cohort_definition','ra_private_cohort_command']);await owner.stop(comparisonRun);
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

// P03仅三路私有Controller的真实37人浏览器消费，仍由原唯一owner关闭全部资源。
browserRegistry['cohort:browser-private-open']=async owner=>{
 const r=await owner.fixture(['--identity=synthetic','--scenario=p03']);const ready=await owner.ready(r,200);assert.equal(ready.json.data.n,37);assert.equal(ready.json.data.studyTotal,37);
 const port=await owner.proxy(r);await owner.browserScenario(port,'synthetic',undefined,(context,port,identity,owner,probe,pid)=>privateBrowser(context,port,identity,owner,probe,pid,'cohort:browser-private-open',r));
 for(const event of r.events.filter(e=>e.type==='http-observation')){assert.equal(event.active,0);assert.equal(event.borrowed,event.returned);}
};

browserRegistry['cohort:browser-private-dynamic']=async owner=>{
 const r=await owner.fixture(['--identity=synthetic','--scenario=p03']);const ready=await owner.ready(r,200);assert.equal(ready.json.data.n,37);assert.equal(ready.json.data.studyTotal,37);
 const port=await owner.proxy(r);await owner.browserScenario(port,'synthetic',undefined,(context,port,identity,owner,probe,pid)=>dynamicPrivateBrowser(context,port,identity,owner,probe,pid,'cohort:browser-private-dynamic',r));
 for(const event of r.events.filter(e=>e.type==='http-observation')){assert.equal(event.active,0);assert.equal(event.borrowed,event.returned);}
};

// P03b使用同一个registry/owner，仅扩真实元信息与删除消费者。
browserRegistry['cohort:browser-private-commands']=async owner=>{
 const r=await owner.fixture(['--identity=synthetic','--scenario=p03']);const ready=await owner.ready(r,200);assert.equal(ready.json.data.n,37);assert.equal(ready.json.data.studyTotal,37);
 const port=await owner.proxy(r);await owner.browserScenario(port,'synthetic',undefined,(context,port,identity,owner,probe,pid)=>commandsPrivateBrowser(context,port,identity,owner,probe,pid,'cohort:browser-private-commands',r));
 for(const event of r.events.filter(e=>e.type==='http-observation')){assert.equal(event.active,0);assert.equal(event.borrowed,event.returned);}
};

// P04普通14人同源比较；P04b按原owner准入保留重读。
browserRegistry['cohort:browser-comparison-create']=async owner=>{
 const r=await owner.fixture(['--identity=synthetic','--scenario=p04']);const ready=await owner.ready(r,200);assert.equal(ready.json.data.n,14);assert.equal(ready.json.data.studyTotal,14);
 assert.deepEqual(r.events.filter(e=>e.type==='table-owned').map(e=>e.table),['patient_basic_info','patient_relation_doctor','patient_follow_up_history','patient_comorbidity','ra_ai_analysis_run','ra_private_cohort_definition','ra_private_cohort_command','ra_ai_compare_run']);
 const port=await owner.proxy(r);await owner.browserScenario(port,'synthetic',undefined,(context,port,identity,owner,probe,pid)=>comparisonBrowser(context,port,identity,owner,probe,pid,'cohort:browser-comparison-create',r));
 for(const event of r.events.filter(e=>e.type==='http-observation')){assert.equal(event.active,0);assert.equal(event.borrowed,event.returned);}
};

// P04b仅扩原真实browser registry；默认五项、owner和seed机制不变。
for(const [id,callback] of [['cohort:browser-comparison-statistics',statisticsComparisonBrowser],['cohort:browser-comparison-retained',retainedComparisonBrowser],['cohort:browser-comparison-invalidated',invalidatedComparisonBrowser]]){
 browserRegistry[id]=async owner=>{
  const r=await owner.fixture(['--identity=synthetic','--scenario=p04']);const ready=await owner.ready(r,200);assert.equal(ready.json.data.n,14);assert.equal(ready.json.data.studyTotal,14);
  assert.deepEqual(r.events.filter(e=>e.type==='table-owned').map(e=>e.table),['patient_basic_info','patient_relation_doctor','patient_follow_up_history','patient_comorbidity','ra_ai_analysis_run','ra_private_cohort_definition','ra_private_cohort_command','ra_ai_compare_run']);
  const port=await owner.proxy(r);await owner.browserScenario(port,'synthetic',undefined,(context,port,identity,owner,probe,pid)=>callback(context,port,identity,owner,probe,pid,id,r));
  for(const event of r.events.filter(e=>e.type==='http-observation')){assert.equal(event.active,0);assert.equal(event.borrowed,event.returned);}
 };
}

// P05只开放parse，普通37人分析/页保留，合成peer与审计仍归既有owner。
for(const id of ['cohort:browser-parse-rule','cohort:browser-parse-safety']){
 browserRegistry[id]=async owner=>{
  const scenario=id==='cohort:browser-parse-rule'?'p05-rule':'p05-safety',r=await owner.fixture(['--identity=synthetic','--scenario='+scenario]);const ready=await owner.ready(r,200);assert.equal(ready.json.data.n,37);
  assert.deepEqual(r.events.filter(e=>e.type==='table-owned').map(e=>e.table),['patient_basic_info','patient_relation_doctor','patient_follow_up_history','patient_comorbidity','ra_ai_analysis_run','ra_ai_parse_audit']);
  const port=await owner.proxy(r);await owner.browserScenario(port,'synthetic',undefined,(context,port,identity,owner,probe,pid)=>parseBrowser(context,port,identity,owner,probe,pid,id,r));
  for(const e of r.events.filter(e=>e.type==='http-observation')){assert.equal(e.active,0);assert.equal(e.borrowed,e.returned);}
  const parseObservations=r.events.filter(e=>e.type==='parse-http-observation');assert.equal(parseObservations.length,scenario==='p05-rule'?7:1);for(const e of parseObservations){assert.equal(e.selectDelta,0);assert.equal(e.analysisInsertDelta,0);assert.equal(e.active,0);}
  const applyObservations=r.events.filter(e=>e.type==='apply-http-observation');assert.equal(applyObservations.length,scenario==='p05-rule'?2:1);for(const e of applyObservations){assert.equal(e.selectDelta,0);assert.equal(e.analysisInsertDelta,0);assert.equal(e.active,0);}
  if(scenario==='p05-safety'){const observed=r.events.find(e=>e.type==='parse-peer-observed');assert.ok(observed?.beforeDiscard);assert.equal(observed.requests,0);assert.equal(observed.received,1);assert.equal(observed.failure,null);}
  const record=owner.browserRecords.at(-1);await owner.closeBrowser(record);owner.browserRecords.splice(owner.browserRecords.indexOf(record),1);await owner.stop(r);assert.ok(r.events.some(e=>e.type==='parse-context-closed'&&e.active===false));assert.ok(r.events.some(e=>e.type==='table-released'&&e.table==='ra_ai_parse_audit'));assert.ok(r.events.some(e=>e.type==='closed'&&e.clean&&e.active===0));
  if(scenario==='p05-safety')assert.ok(r.events.some(e=>e.type==='parse-peer-closed'&&e.requests===0&&e.failure===null&&e.unusedDiscarded));
  assert.equal((await owner.mysqlQuery("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='ra_synthetic_test'")).trim(),'');
  if(scenario==='p05-rule'){
   const failed=await owner.fixture(['--identity=synthetic','--scenario=p05-rule','--mode=partial-start-fail']);const result=await owner.bounded(failed.finished,30000,'parse-partial-start');assert.notEqual(result.code,0);assert.ok(failed.events.some(e=>e.type==='failure'));assert.ok(failed.events.some(e=>e.type==='table-released'&&e.table==='ra_ai_parse_audit'));assert.ok(failed.events.some(e=>e.type==='closed'&&e.clean));assert.equal((await owner.mysqlQuery("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='ra_synthetic_test'")).trim(),'');await owner.stop(failed);
  }
 };
}

// P05b使用独立五人普通源，真实parse/apply不运行分析，只有后续cohort创建新结果。
for(const id of ['cohort:browser-parse-apply','cohort:browser-parse-apply-safety']){
 browserRegistry[id]=async owner=>{
  const safety=id==='cohort:browser-parse-apply-safety',scenario=safety?'p05-apply-safety':'p05-apply-rule',r=await owner.fixture(['--identity=synthetic','--scenario='+scenario]);const ready=await owner.ready(r,200);assert.equal(ready.json.data.n,4);
  assert.deepEqual(r.events.filter(e=>e.type==='table-owned').map(e=>e.table),['patient_basic_info','patient_relation_doctor','patient_follow_up_history','patient_comorbidity','ra_ai_analysis_run','ra_ai_parse_audit']);
  const port=await owner.proxy(r);await owner.browserScenario(port,'synthetic',undefined,(context,port,identity,owner,probe,pid)=>applyBrowser(context,port,identity,owner,probe,pid,id,r));
  for(const e of r.events.filter(e=>e.type==='http-observation')){assert.equal(e.active,0);assert.equal(e.borrowed,e.returned);}
  for(const [type,expected] of [['parse-http-observation',safety?1:10],['apply-http-observation',safety?1:6]]){const observations=r.events.filter(e=>e.type===type);assert.equal(observations.length,expected);for(const e of observations){assert.equal(e.selectDelta,0);assert.equal(e.analysisInsertDelta,0);assert.equal(e.active,0);}}
  if(safety){const observed=r.events.find(e=>e.type==='parse-peer-observed');assert.ok(observed?.beforeDiscard);assert.equal(observed.requests,0);assert.equal(observed.received,1);assert.equal(observed.failure,null);}
  const record=owner.browserRecords.at(-1);await owner.closeBrowser(record);owner.browserRecords.splice(owner.browserRecords.indexOf(record),1);await owner.stop(r);assert.ok(r.events.some(e=>e.type==='parse-context-closed'&&e.active===false));assert.ok(r.events.some(e=>e.type==='table-released'&&e.table==='ra_ai_parse_audit'));assert.ok(r.events.some(e=>e.type==='closed'&&e.clean&&e.active===0));
  if(safety)assert.ok(r.events.some(e=>e.type==='parse-peer-closed'&&e.requests===0&&e.failure===null&&e.unusedDiscarded));
  assert.equal((await owner.mysqlQuery("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='ra_synthetic_test'")).trim(),'');
  if(!safety){const failed=await owner.fixture(['--identity=synthetic','--scenario=p05-apply-rule','--mode=partial-start-fail']);const result=await owner.bounded(failed.finished,30000,'apply-partial-start');assert.notEqual(result.code,0);assert.ok(failed.events.some(e=>e.type==='failure'));assert.ok(failed.events.some(e=>e.type==='table-released'&&e.table==='ra_ai_parse_audit'));assert.ok(failed.events.some(e=>e.type==='closed'&&e.clean));assert.equal((await owner.mysqlQuery("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='ra_synthetic_test'")).trim(),'');await owner.stop(failed);}
 };
}

browserRegistry['cohort:browser-export-cohort']=async owner=>{
 const r=await owner.fixture(['--identity=synthetic','--scenario=p06-cohort']);const ready=await owner.ready(r,200);assert.equal(ready.json.data.n,37);assert.equal(ready.json.data.studyTotal,37);
 const port=await owner.proxy(r);await owner.browserScenario(port,'synthetic',undefined,exportBrowser);
 for(const event of r.events.filter(e=>e.type==='http-observation')){assert.equal(event.active,0);assert.equal(event.borrowed,event.returned);}
};

browserRegistry['cohort:browser-export-comparison']=async owner=>{
 const r=await owner.fixture(['--identity=synthetic','--scenario=p06-comparison']);const ready=await owner.ready(r,200);assert.equal(ready.json.data.n,14);assert.equal(ready.json.data.studyTotal,14);
 assert.deepEqual(r.events.filter(event=>event.type==='table-owned').map(event=>event.table),['patient_basic_info','patient_relation_doctor','patient_follow_up_history','patient_comorbidity','ra_ai_analysis_run','ra_private_cohort_definition','ra_private_cohort_command','ra_ai_compare_run','ra_ai_export_audit']);
 const port=await owner.proxy(r);await owner.browserScenario(port,'synthetic',undefined,(context,port,identity,owner,probe,pid)=>exportComparisonBrowser(context,port,identity,owner,probe,pid,r));
 for(const event of r.events.filter(event=>event.type==='http-observation')){assert.equal(event.active,0);assert.equal(event.borrowed,event.returned);}
};

// P06c 每case真实两表/SMTP独立fixture，owner不复用上一case的资源。
for(const [id,scenario] of [['cohort:browser-application-replay','p06-application-replay'],['cohort:browser-notification-retry','p06-application-retry'],['cohort:browser-notification-unknown','p06-application-unknown']]){
 browserRegistry[id]=async owner=>{
  const r=await owner.fixture(['--identity=synthetic','--scenario='+scenario]);const ready=await owner.ready(r,200);assert.equal(ready.json.data.n,37);assert.equal(ready.json.data.studyTotal,37);assert.deepEqual(r.events.filter(e=>e.type==='table-owned').map(e=>e.table),['patient_basic_info','patient_relation_doctor','patient_follow_up_history','patient_comorbidity','ra_ai_analysis_run','ra_ai_export_audit','export_application','ra_ai_export_request']);
  r.applicationDropResponseOnce=id==='cohort:browser-application-replay';const port=await owner.proxy(r);await owner.browserScenario(port,'synthetic',undefined,(context,port,identity,owner,probe,pid)=>applicationBrowser(context,port,identity,owner,probe,pid,id,r));
  for(const e of r.events.filter(e=>e.type==='http-observation')){assert.equal(e.active,0);assert.equal(e.borrowed,e.returned);}
  const record=owner.browserRecords.at(-1);await owner.closeBrowser(record);owner.browserRecords.splice(owner.browserRecords.indexOf(record),1);await owner.stop(r);assert.ok(r.events.some(e=>e.type==='application-context-closed'&&e.active===false));assert.ok(r.events.some(e=>e.type==='application-peer-closed'&&e.failure===null));for(const table of ['export_application','ra_ai_export_request'])assert.ok(r.events.some(e=>e.type==='table-released'&&e.table===table));assert.ok(r.events.some(e=>e.type==='closed'&&e.clean&&e.active===0));assert.equal((await owner.mysqlQuery("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='ra_synthetic_test'")).trim(),'');
 };
}

// P07普通六人fixture只读相似依据；每一次发布均走现Servlet/Service/MyBatis/SQL。
browserRegistry['cohort:browser-entry']=async owner=>{
 const id='cohort:browser-entry',r=await owner.fixture(['--identity=synthetic','--scenario=p07-entry']);
 const ready=await owner.ready(r,200);assert.equal(ready.json.data.n,4);assert.equal(ready.json.data.studyTotal,4);
 assert.deepEqual(r.events.filter(event=>event.type==='table-owned').map(event=>event.table),['patient_basic_info','patient_relation_doctor','patient_follow_up_history','patient_comorbidity','ra_ai_analysis_run','ra_ai_parse_audit']);
 const port=await owner.proxy(r);await owner.browserScenario(port,'synthetic',undefined,(context,port,identity,owner,probe,pid)=>entryBrowser(context,port,identity,owner,probe,pid,id,r));
 await expect.poll(()=>r.events.filter(event=>event.type==='http-observation').length,{timeout:5000}).toBe(12);
 for(const event of r.events.filter(event=>event.type==='http-observation')){assert.equal(event.active,0);assert.equal(event.borrowed,event.returned);assert.equal(event.mysqlFailures,0);}
 const observation=JSON.parse(await readFile(`${owner.dir}/browser-observation.json`,'utf8'));
 const responses=observation.responses.filter(response=>new URL(response.url).pathname==='/api/ra/ai/resolveEntry');
 const resolved=r.events.filter(event=>event.type==='resolve-http-observation');assert.equal(resolved.length,5);assert.equal(responses.length,5);
 for(const event of resolved){assert.equal(event.selectDelta,5);assert.equal(event.analysisInsertDelta,0);assert.equal(event.active,0);assert.equal(responses.filter(response=>response.trace===event.traceId&&response.status===event.status).length,1);}
 assert.deepEqual(resolved.map(event=>event.status),[200,200,404,404,404]);
 for(const type of ['parse-http-observation','apply-http-observation']){const events=r.events.filter(event=>event.type===type);assert.equal(events.length,1);assert.equal(events[0].selectDelta,0);assert.equal(events[0].analysisInsertDelta,0);assert.equal(events[0].active,0);}
 assert.ok(!r.events.some(event=>event.type==='parse-peer-planned'));
 const record=owner.browserRecords.at(-1);await owner.closeBrowser(record);owner.browserRecords.splice(owner.browserRecords.indexOf(record),1);
 await owner.stop(r);assert.ok(r.events.some(event=>event.type==='parse-context-closed'&&event.active===false));
 assert.ok(r.events.some(event=>event.type==='table-released'&&event.table==='ra_ai_parse_audit'));assert.ok(r.events.some(event=>event.type==='closed'&&event.clean&&event.active===0));
 assert.equal((await owner.mysqlQuery("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='ra_synthetic_test' ORDER BY TABLE_NAME")).trim(),'');
 owner.event('entry-normal-owner-exit',{beforeFallback:true,contextActive:false,tablesAbsent:true});
};

// P07b真实患者零详情链与独立统一context组合，沿既有owner串行释放。
for(const [id,scenario,callback] of [
 ['cohort:browser-patient-entry-closed','p00-trusted',patientBrowser],
 ['cohort:browser-feature-gates','p07-composition',async(...args)=>(await import('./cohort-composition-browser.mjs')).featureGatesBrowser(...args)],
 ['cohort:browser-composition-time','p07-composition-time',async(...args)=>(await import('./cohort-composition-browser.mjs')).compositionTimeBrowser(...args)]
]){
 browserRegistry[id]=async owner=>{
  const r=await owner.fixture(['--identity=synthetic','--scenario='+scenario]);const ready=await owner.ready(r,scenario==='p00-trusted'?401:200);if(scenario!=='p00-trusted')assert.equal(ready.json.data.n,37);
  const port=await owner.proxy(r);await owner.browserScenario(port,'synthetic',undefined,(context,port,identity,owner,probe,pid)=>callback(context,port,identity,owner,probe,pid,id,r));
  for(const e of r.events.filter(e=>e.type==='http-observation')){assert.equal(e.active,0);assert.equal(e.borrowed,e.returned);if(scenario!=='p00-trusted')assert.equal(e.mysqlFailures,0);}
  const record=owner.browserRecords.at(-1);await owner.closeBrowser(record);owner.browserRecords.splice(owner.browserRecords.indexOf(record),1);await owner.stop(r);
  assert.ok(r.events.some(e=>e.type==='closed'&&e.clean&&e.active===0));
  assert.equal((await owner.mysqlQuery("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='ra_synthetic_test' ORDER BY TABLE_NAME")).trim(),'');
  if(scenario!=='p00-trusted'){
   assert.ok(r.events.some(e=>e.type==='composition-context-closed'&&e.active===false&&e.sqlActive===0&&e.clean&&e.finalOwnerClose===true));assert.ok(r.events.some(e=>e.type==='application-peer-closed'&&e.failure===null));
   const owned=r.events.filter(e=>e.type==='table-owned').map(e=>e.table),released=r.events.filter(e=>e.type==='table-released').map(e=>e.table);assert.deepEqual(released.slice().sort(),owned.slice().sort());assert.equal(new Set(owned).size,owned.length);
  }
  owner.event('p07b-normal-owner-exit',{case:id,beforeFallback:true,tablesAbsent:true});
 };
}

// P00a is browser-only; preserve the original five default integration cases.
browserRegistry['patient:trusted-detail-loopback']=async(owner,probe)=>{
 const r=await owner.fixture(['--identity=synthetic','--scenario=p00-trusted']);failure(await owner.ready(r,401),401,'UNAUTHENTICATED');const port=await owner.proxy(r);
 await owner.browserScenario(port,'synthetic',probe,(context,p,i,o,pr,pid)=>trustedPatientBrowser(context,p,i,o,pr,pid,'patient:trusted-detail-loopback',r));
 const record=owner.browserRecords.at(-1);await owner.closeBrowser(record);owner.browserRecords.splice(owner.browserRecords.indexOf(record),1);await owner.stop(r);
 assert.ok(r.events.some(e=>e.type==='closed'&&e.clean&&e.active===0));assert.equal((await owner.mysqlQuery("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='ra_synthetic_test'")).trim(),'');
};

browserRegistry['patient:trusted-interactions-loopback']=async(owner,probe)=>{
 const r=await owner.fixture(['--identity=synthetic','--scenario=p00-trusted']);failure(await owner.ready(r,401),401,'UNAUTHENTICATED');const port=await owner.proxy(r);
 await owner.browserScenario(port,'synthetic',probe,(context,p,i,o,pr,pid)=>trustedPatientInteractionsBrowser(context,p,i,o,pr,pid,'patient:trusted-interactions-loopback',r));
 const record=owner.browserRecords.at(-1);await owner.closeBrowser(record);owner.browserRecords.splice(owner.browserRecords.indexOf(record),1);await owner.stop(r);
 assert.ok(r.events.some(e=>e.type==='closed'&&e.clean&&e.active===0));assert.equal((await owner.mysqlQuery("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='ra_synthetic_test'")).trim(),'');
};

browserRegistry['patient:followup-policy-loopback']=async(owner,probe)=>{
 const r=await owner.fixture(['--identity=synthetic','--scenario=p00-trusted']);failure(await owner.ready(r,401),401,'UNAUTHENTICATED');const port=await owner.proxy(r);
 await owner.browserScenario(port,'synthetic',probe,(context,p,i,o,pr,pid)=>patientFollowUpPolicyBrowser(context,p,i,o,pr,pid,'patient:followup-policy-loopback',r));
 const record=owner.browserRecords.at(-1);await owner.closeBrowser(record);owner.browserRecords.splice(owner.browserRecords.indexOf(record),1);await owner.stop(r);
 assert.ok(r.events.some(e=>e.type==='closed'&&e.clean&&e.active===0));assert.equal((await owner.mysqlQuery("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='ra_synthetic_test'")).trim(),'');
};

browserRegistry['analysis:overview-loopback']=async(owner,probe)=>{
 const r=await owner.fixture(['--identity=synthetic','--scenario=p01-overview']);failure(await owner.ready(r,401),401,'UNAUTHENTICATED');const port=await owner.proxy(r);
 await owner.browserScenario(port,'synthetic',probe,(context,p,i,o,pr,pid)=>overviewBrowser(context,p,i,o,pr,pid,'analysis:overview-loopback',r));
 const record=owner.browserRecords.at(-1);await owner.closeBrowser(record);owner.browserRecords.splice(owner.browserRecords.indexOf(record),1);await owner.stop(r);
 assert.ok(r.events.some(e=>e.type==='closed'&&e.clean&&e.active===0));assert.equal((await owner.mysqlQuery("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='ra_synthetic_test'")).trim(),'');
};

browserRegistry['analysis:patient-search-loopback']=async(owner,probe)=>{
 const r=await owner.fixture(['--identity=synthetic','--scenario=p00-trusted']);failure(await owner.ready(r,401),401,'UNAUTHENTICATED');const port=await owner.proxy(r);
 await owner.browserScenario(port,'synthetic',probe,(context,p,i,o,pr,pid)=>patientSearchBrowser(context,p,i,o,pr,pid,'analysis:patient-search-loopback',r));
 const record=owner.browserRecords.at(-1);await owner.closeBrowser(record);owner.browserRecords.splice(owner.browserRecords.indexOf(record),1);await owner.stop(r);
 assert.ok(r.events.some(e=>e.type==='closed'&&e.clean&&e.active===0));assert.equal((await owner.mysqlQuery("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='ra_synthetic_test'")).trim(),'');
};

// 两份生产配置的精确场景，沿原typed owner关闭浏览器后再关闭结果owner。
browserRegistry['cohort:configured-sources-loopback']=async(owner,probe)=>{
 const r=await owner.fixture(['--identity=synthetic','--scenario=p03-sources']);failure(await owner.ready(r,401),401,'UNAUTHENTICATED');const port=await owner.proxy(r);
 await owner.browserScenario(port,'synthetic',probe,(context,p,i,o,pr,pid)=>configuredSourcesBrowser(context,p,i,o,pr,pid,'cohort:configured-sources-loopback',r));
 const record=owner.browserRecords.at(-1);await owner.closeBrowser(record);owner.browserRecords.splice(owner.browserRecords.indexOf(record),1);await owner.stop(r);
 assert.ok(r.events.some(e=>e.type==='closed'&&e.clean&&e.active===0));assert.deepEqual(r.events.filter(e=>e.type==='table-released').map(e=>e.table),r.events.filter(e=>e.type==='table-owned').map(e=>e.table).reverse());assert.equal((await owner.mysqlQuery("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='ra_synthetic_test'")).trim(),'');
};

browserRegistry['patient:insight-loopback']=async(owner,probe)=>{
 const r=await owner.fixture(['--identity=synthetic','--scenario=p03-sources']);failure(await owner.ready(r,401),401,'UNAUTHENTICATED');const port=await owner.proxy(r);
 await owner.browserScenario(port,'synthetic',probe,(context,p,i,o,pr,pid)=>patientInsightBrowser(context,p,i,o,pr,pid,'patient:insight-loopback',r));
 const record=owner.browserRecords.at(-1);await owner.closeBrowser(record);owner.browserRecords.splice(owner.browserRecords.indexOf(record),1);await owner.stop(r);
 assert.ok(r.events.some(e=>e.type==='closed'&&e.clean&&e.active===0));assert.deepEqual(r.events.filter(e=>e.type==='table-released').map(e=>e.table),r.events.filter(e=>e.type==='table-owned').map(e=>e.table).reverse());assert.equal((await owner.mysqlQuery("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='ra_synthetic_test'")).trim(),'');
};
