import {installUnavailableAuthBootstrapObserver} from '../fixtures/auth-bootstrap-observer.cjs';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

// P07普通seed的独立字面oracle；不由页面、resolver或cohort返回构造期望。
const LONG='9007199254740993',FEMALE_IDS=['11',LONG],SCOPE_IDS=['11','21','22',LONG];
const FEMALE_FILTERS={studyCode:'RA',at:'now',act:null,ids:null,sex:'F',age:null,sero:null,cm:null,tx:null,data:null};
const OLD_FILTERS={studyCode:'RA',sex:'M',age:'',sero:'',tx:'TNFi',at:'now',act:'',cm:'',data:''};
const FEMALE_ORDINARY={sex:'F',age:null,sero:null,tx:null,at:'now',act:null,cm:null,data:null};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ordered=values=>values.slice().sort((a,b)=>a.length-b.length||a.localeCompare(b));
const keys=(value,expected)=>assert.deepEqual(Object.keys(value).sort(),expected.slice().sort());

export async function entryBrowser(context,port,identity,owner,probe,pid,id,fixture){
 const origin=`http://127.0.0.1:${port}`,requests=[],responses=[],reads=[],allowed=[],blocked=[],pageErrors=[],observations=[];
 let sqlOracle=null;
 // 此调用仅限已核 non-typed SQL fixture；真实404明确不等于认证通过。
 const auth=await installUnavailableAuthBootstrapObserver(context,{origin});
 await context.addInitScript(()=>sessionStorage.setItem('ra-auth',JSON.stringify({name:'合成页面用户',role:'研究者',expires:0})));
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(owner.controller.signal.aborted||url.origin!==origin){blocked.push(request.url());return route.abort('blockedbyclient');}
  allowed.push(request.url());
  if(await auth.handle(route))return;if(url.pathname.startsWith('/api/'))requests.push({url:request.url(),path:url.pathname,method:request.method(),headers:request.headers(),body:request.postDataJSON()});
  return route.continue();
 });
 const page=await context.newPage();await page.bringToFront();owner.event('page-created',{pid,port});
 page.on('pageerror',error=>pageErrors.push(error.message));
 page.on('response',response=>{if(!auth.isHandled(response.request())&&new URL(response.url()).pathname.startsWith('/api/'))reads.push((async()=>responses.push({url:response.url(),status:response.status(),trace:response.headers()['x-trace-id'],json:await response.json()}))());});
 const wire=path=>requests.filter(request=>request.path===`/api/ra/ai/${path}`);
 const count=async table=>Number((await owner.mysqlQuery(`SELECT COUNT(*) FROM ra_synthetic_test.${table}`)).trim());
 const counts=async()=>({analysis:await count('ra_ai_analysis_run'),audit:await count('ra_ai_parse_audit')});
 const rows=()=>page.locator('#patient-rows .ai-row').evaluateAll(nodes=>nodes.map(node=>node.dataset.patientId));
 const waitResponse=path=>page.waitForResponse(response=>new URL(response.url()).pathname===`/api/ra/ai/${path}`&&response.request().method()==='POST');
 async function envelope(response,status=200,code='200'){
  assert.equal(response.status(),status);assert.match(response.headers()['content-type'],/^application\/json(?:;|$)/i);
  const trace=response.headers()['x-trace-id'];assert.match(trace,UUID);
  const json=await response.json();assert.equal(json.success,status===200);assert.equal(json.code,code);
  if(status!==200)assert.equal(json.data,null);
  return {trace,json};
 }
 async function analyzed(response,expectedIds,stage,before,exactFilters=null){
  const {trace,json}=await envelope(response),data=json.data;
  assert.equal(data.n,expectedIds.length);assert.equal(data.studyTotal,4);assert.equal(data.meta.traceId,trace);assert.match(data.analysisId,UUID);
  assert.deepEqual(ordered(data.patients.items.map(patient=>patient.patientId)),expectedIds);
  assert.ok(data.patients.items.every(patient=>typeof patient.patientId==='string'&&patient.patientId!=='23'&&patient.patientId!=='24'));
  await expect(page.locator('#cohort-state')).toHaveAttribute('data-state',expectedIds.length?'success':'empty');
  await expect(page.locator('#cohort-n')).toHaveText(String(expectedIds.length));await expect(page.locator('#study-total')).toHaveText('4');
  assert.deepEqual(ordered(await rows()),expectedIds);assert.equal(await page.locator('#results').getAttribute('data-analysis-id'),data.analysisId);
  const stored=(await owner.mysqlQuery(`SELECT id,owner_doctor_id FROM ra_synthetic_test.ra_ai_analysis_run WHERE id='${data.analysisId}'`)).trim();
  assert.equal(stored,`${data.analysisId}\t101`);const after=await counts();assert.equal(after.analysis,before.analysis+1);
  if(exactFilters)assert.deepEqual(wire('cohort').at(-1).body,{filters:exactFilters});
  observations.push({stage,trace,analysisId:data.analysisId,ids:expectedIds,n:data.n,studyTotal:data.studyTotal,stored,before,after});
  return {trace,json};
 }
 async function similar(indexPatientId,expectedStatus,http=200){
  const before=await counts(),start=requests.length,waitEntry=waitResponse('resolveEntry');
  const waitCohort=expectedStatus==='PARTIAL_BASIS'?waitResponse('cohort'):null;
  await page.goto(`${origin}/ai-cohort.html?preset=similar&id=${indexPatientId}`);await auth.verify(page);
  const result=await envelope(await waitEntry,http,http===200?'200':'RESOURCE_NOT_FOUND');
  assert.deepEqual(wire('resolveEntry').at(-1).body,{source:'SIMILAR',indexPatientId});
  if(http===200){
   const data=result.json.data;keys(data,['source','filters','missingBasis','status','canApply','reason','meta']);
   assert.equal(data.source,'SIMILAR');assert.equal(data.status,expectedStatus);assert.equal(data.reason,null);
   keys(data.meta,['asOf','readStartedAt','readCompletedAt','traceId','policyVersion']);
   assert.equal(data.meta.traceId,result.trace);assert.equal(data.meta.policyVersion,'dev-similar-v01');assert.equal(data.meta.asOf,'2026-10-07');
   for(const key of ['readStartedAt','readCompletedAt']){assert.match(data.meta[key],/Z$/);assert.ok(Number.isFinite(Date.parse(data.meta[key])));}
   assert.ok(Date.parse(data.meta.readStartedAt)<=Date.parse(data.meta.readCompletedAt));
   if(expectedStatus==='PARTIAL_BASIS'){
    assert.deepEqual(data.filters,FEMALE_FILTERS);assert.deepEqual(data.missingBasis,['age','sero']);assert.equal(data.canApply,true);
    await analyzed(await waitCohort,FEMALE_IDS,`similar-${indexPatientId}`,before,FEMALE_FILTERS);
    await expect(page.locator('#entry-state')).toHaveAttribute('data-state','success');await expect(page.locator('#entry-state')).toContainText('部分依据缺失');
    await expect(page.locator('#entry-state')).toContainText('缺少依据：年龄、血清学');await expect(page.locator('#parse-apply')).toBeHidden();
    assert.deepEqual(requests.slice(start).map(request=>request.path),['/api/ra/ai/resolveEntry','/api/ra/ai/cohort']);
    assert.equal((await counts()).audit,before.audit);
    const url=new URL(page.url());assert.equal(url.searchParams.get('sex'),'F');assert.equal(url.searchParams.has('preset'),false);assert.equal(url.searchParams.has('id'),false);
   }else{
    assert.deepEqual(data.missingBasis,['sex','age','sero']);assert.equal(data.canApply,false);assert.equal(data.filters,null);
    await expect(page.locator('#entry-state')).toHaveAttribute('data-state','empty');await expect(page.locator('#entry-state')).toContainText('缺少筛选依据');
   }
  }else{
   await expect(page.locator('#entry-state')).toHaveAttribute('data-state','error');await expect(page.locator('#entry-state')).toContainText('所需记录不存在或当前账号无法访问');
   await expect(page.locator('#entry-state')).toContainText('所需记录不存在或当前账号无法访问');await expect(page.locator('#entry-state')).not.toContainText(result.trace);
  }
  if(!waitCohort){
   assert.deepEqual(await counts(),before);assert.deepEqual(requests.slice(start).map(request=>request.path),['/api/ra/ai/resolveEntry']);
   await expect(page.locator('#results')).toBeHidden();await expect(page.locator('#patient-rows .ai-row')).toHaveCount(0);await expect(page.locator('#export')).toBeDisabled();
   assert.equal(await page.locator('#results').getAttribute('data-analysis-id'),null);
   observations.push({stage:`similar-${indexPatientId}`,http,trace:result.trace,status:expectedStatus,before,after:await counts()});
  }
 }
 try{
  const scope=(await owner.mysqlQuery('SELECT CAST(p.id AS CHAR) FROM ra_synthetic_test.patient_basic_info p JOIN ra_synthetic_test.patient_relation_doctor r ON r.patient_id=p.id WHERE r.doctor_id=101 AND r.research_type IN (0,1,2,3,4,7) GROUP BY p.id ORDER BY p.id')).trim().split('\n');
  const female=(await owner.mysqlQuery('SELECT CAST(p.id AS CHAR) FROM ra_synthetic_test.patient_basic_info p JOIN ra_synthetic_test.patient_relation_doctor r ON r.patient_id=p.id WHERE r.doctor_id=101 AND r.research_type IN (0,1,2,3,4,7) AND p.gender=2 GROUP BY p.id ORDER BY p.id')).trim().split('\n');
  const source=(await owner.mysqlQuery('SELECT CAST(p.id AS CHAR),p.gender,p.card_no,r.doctor_id,r.research_type FROM ra_synthetic_test.patient_basic_info p JOIN ra_synthetic_test.patient_relation_doctor r ON r.patient_id=p.id ORDER BY p.id')).trim();
  assert.deepEqual(scope,SCOPE_IDS);assert.deepEqual(female,FEMALE_IDS);
  assert.equal(source,`11\t2\tNULL\t101\t0\n21\t1\tNULL\t101\t0\n22\tNULL\tNULL\t101\t0\n23\t2\tNULL\t202\t0\n24\t2\tNULL\t101\t6\n${LONG}\t2\tNULL\t101\t0`);
  sqlOracle={scope,female,source};assert.deepEqual(await counts(),{analysis:1,audit:0});
  await similar('11','PARTIAL_BASIS');await similar('22','NO_BASIS');
  for(const indexPatientId of ['23','24','999999'])await similar(indexPatientId,'RESOURCE_NOT_FOUND',404);
  const before=await counts(),start=requests.length,parseWait=waitResponse('parse'),applyWait=waitResponse('applyParse'),cohortWait=waitResponse('cohort');
  await page.goto(`${origin}/ai-cohort.html?q=${encodeURIComponent('女性')}&sex=M&tx=TNFi`);await auth.verify(page);
  const parsed=await envelope(await parseWait),applied=await envelope(await applyWait);
  const p=parsed.json.data,a=applied.json.data;assert.match(p.questionRef,UUID);
  keys(p,['questionRef','candidateFilters','parseStatus','applyMode','engine','matched','unrecognized','rejectedFields','warnings','notice','fallbackReason','meta']);
  assert.deepEqual({candidateFilters:p.candidateFilters,parseStatus:p.parseStatus,applyMode:p.applyMode,engine:p.engine,matched:p.matched,unrecognized:p.unrecognized,rejectedFields:p.rejectedFields,warnings:p.warnings,notice:p.notice,fallbackReason:p.fallbackReason},{candidateFilters:{sex:'F'},parseStatus:'OK',applyMode:'REPLACE_EXCEPT_IDS',engine:'RULE',matched:[{field:'sex',value:'F'}],unrecognized:[],rejectedFields:[],warnings:['AI_NOT_ENABLED'],notice:'AI未启用，已使用规则解析。已生成候选条件，尚未应用。',fallbackReason:'AI_NOT_ENABLED'});
  for(const [data,trace] of [[p,parsed.trace],[a,applied.trace]]){keys(data.meta,['traceId','ruleVersion','schemaVersion','modelVersion','promptVersion','durationMs']);assert.equal(data.meta.traceId,trace);assert.equal(data.meta.ruleVersion,'dev-parse-rules-v02');assert.equal(data.meta.schemaVersion,'dev-parse-schema-v01');assert.equal(data.meta.modelVersion,null);assert.equal(data.meta.promptVersion,null);assert.ok(Number.isSafeInteger(data.meta.durationMs)&&data.meta.durationMs>=0);}
  keys(a,['questionRef','parseStatus','applyMode','applied','filters','meta']);assert.equal(a.questionRef,p.questionRef);assert.equal(a.parseStatus,'OK');assert.equal(a.applyMode,'REPLACE_EXCEPT_IDS');assert.equal(a.applied,true);assert.deepEqual(a.filters,FEMALE_FILTERS);
  assert.deepEqual(wire('parse')[0].body,{question:'女性'});
  assert.deepEqual(wire('applyParse')[0].body,{currentFilters:OLD_FILTERS,candidateFilters:{sex:'F'},parseStatus:'OK',questionRef:p.questionRef});
  await analyzed(await cohortWait,FEMALE_IDS,'url-question',before,FEMALE_FILTERS);
  assert.deepEqual(requests.slice(start).map(request=>request.path),['/api/ra/ai/parse','/api/ra/ai/applyParse','/api/ra/ai/cohort']);assert.deepEqual(await counts(),{analysis:3,audit:2});
  const audit=(await owner.mysqlQuery(`SELECT actor_doctor_id,action,question_ref,trace_id,parse_status,applied,condition_summary,engine,fallback_reason,model_version,prompt_version FROM ra_synthetic_test.ra_ai_parse_audit WHERE question_ref='${p.questionRef}' ORDER BY action DESC`)).trim().split('\n').map(line=>line.split('\t'));
  assert.deepEqual(audit[0].slice(0,6),['101','PARSE',p.questionRef,parsed.trace,'OK','0']);assert.deepEqual(JSON.parse(audit[0][6]),{candidate:{sex:'F'},effective:null});assert.deepEqual(audit[0].slice(7),['RULE','AI_NOT_ENABLED','NULL','NULL']);
  assert.deepEqual(audit[1].slice(0,6),['101','APPLY',p.questionRef,applied.trace,'OK','1']);assert.deepEqual(JSON.parse(audit[1][6]),{candidate:{sex:'F'},effective:FEMALE_ORDINARY});assert.deepEqual(audit[1].slice(7),['NONE','NULL','NULL','NULL']);
  observations.push({stage:'question-audit',questionRef:p.questionRef,parseTrace:parsed.trace,applyTrace:applied.trace,audit});
  await expect(page.locator('#f-sex')).toHaveValue('F');await expect(page.locator('#f-tx')).toHaveValue('');assert.equal(new URL(page.url()).searchParams.has('q'),false);
  for(const [query,expectedIds] of [['?ids=',[]],[`?ids=${LONG}`,[LONG]]]){
   const before=await counts(),start=requests.length,wait=waitResponse('cohort');await page.goto(`${origin}/ai-cohort.html${query}`);await auth.verify(page);
   await analyzed(await wait,expectedIds,expectedIds.length?'ids-long':'ids-empty',before);
   assert.deepEqual(wire('cohort').at(-1).body.filters.ids,expectedIds);assert.deepEqual(requests.slice(start).map(request=>request.path),['/api/ra/ai/cohort']);assert.equal((await counts()).audit,2);
  }
  assert.deepEqual(await counts(),{analysis:5,audit:2});assert.equal(wire('resolveEntry').length,5);assert.equal(wire('parse').length,1);assert.equal(wire('applyParse').length,1);assert.equal(wire('cohort').length,4);assert.equal(requests.length,11);
  for(const request of requests){assert.equal(request.method,'POST');assert.equal(request.headers.authorization,undefined);assert.equal(request.headers['x-doctor-id'],undefined);assert.equal(request.body.doctorId,undefined);}
  assert.ok(!fixture.events.some(event=>event.type==='parse-peer-planned'));assert.deepEqual(blocked,[]);await auth.verifyAll();assert.deepEqual(pageErrors,[]);
 }finally{
  await Promise.allSettled(reads);
  const observation={authRequests:auth.requests,authenticationVerified:false,scenario:id,version:owner.report.browser.at(-1)?.version,url:page.url(),sqlOracle,requests,responses,observations,allowed,blocked,pageErrors,dom:await page.locator('main').innerText().catch(()=>null)};
  for(const name of ['network.json','browser-observation.json'])await writeFile(`${owner.dir}/${name}`,JSON.stringify(observation,null,2)+'\n');
 }
}
