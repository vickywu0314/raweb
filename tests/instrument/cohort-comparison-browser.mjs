import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// 独立oracle只提供数值；Current §7.5的字段/枚举在本消费者明确绑定，绝不调用产品计算。
const oracle=JSON.parse(await readFile(new URL('../../../raapi/src/test/resources/ai-cohort/p04b/independent-oracles.json',import.meta.url)));
const metrics=['n','age','duration','das28At','crpAt','haqAt','female','sero','target','complete','activity','line'];
const before=oracle.mainComparison.beforeExclusion,after=oracle.mainComparison.afterExcludingIntersection;
const idsA=['1','2','3','4','5','6','7','8'],idsB=['7','8','9','10','11','12','13','14'];
const filters=ids=>({studyCode:'RA',at:'now',act:null,ids,sex:null,age:null,sero:null,cm:null,tx:null,data:null});
const policies={statistics:'dev-stats-v04',descriptive:'dev-descriptive-v04',qc:'dev-missing-v04',crp:'dev-crp-v04',now:'dev-now-v04',clinical:'dev-clinical-v04',serology:'dev-ever-serology-v04',treatment:'dev-timeline-v04',visitMatcher:'dev-visit-match-v04',drugDictionary:'dev-drug-v04',comparison:'dev-compare-v01'};
const disclosure='探索性分析，未作多重比较校正；组间差异不代表疗效或因果关系';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const keys=(value,expected,label)=>assert.deepEqual(Object.keys(value).sort(),[...expected].sort(),label);
const numeric=(actual,expected,label)=>{
 if(expected===null){assert.equal(actual,null,label);return;}
 assert.equal(typeof actual,'number',label);assert.ok(Number.isFinite(actual),label);
 assert.ok(Math.abs(actual-Number(expected))<=1e-12*Math.max(1,Math.abs(Number(expected))),`${label}: ${actual} != independent ${expected}`);
};
function testValue(actual,expected,denominator,contingency,swapped,label){
 keys(actual,['method','status','pValue','displayP','significant','nA','nB','reason','warnings','policyVersion','testDenominator',...(contingency?['expectedBelow5Cells','expectedCellCount']:[])],label);
 assert.equal(actual.method,expected.method,label);assert.equal(actual.status,expected.status,label);
 assert.equal(actual.reason,expected.status==='OVERLAP'?'COHORTS_OVERLAP':expected.reason,label);
 assert.equal(actual.nA,swapped?expected.nB:expected.nA,label);assert.equal(actual.nB,swapped?expected.nA:expected.nB,label);
 assert.equal(actual.testDenominator,denominator,label);assert.equal(actual.policyVersion,'dev-stats-v04',label);
 assert.deepEqual(actual.warnings,expected.warnings,label);assert.equal(actual.displayP,expected.displayP,label);
 assert.equal(actual.significant,expected.significantRawAtAlpha005,label);numeric(actual.pValue,expected.pValue,label+' P');
 if(contingency)for(const name of ['expectedBelow5Cells','expectedCellCount'])assert.equal(actual[name],expected.status==='OK'?expected[name]:null,label+' '+name);
}
export function literalComparison(data,{excludeOverlap=false,swapped=false,cohortId,trace}){
 const expected=excludeOverlap?after:before,n=excludeOverlap?6:8;
 keys(data,['compareResultId','studyTotal','a','b','overlapN','excludeOverlap','rows','meta'],'complete comparison data');
 assert.match(data.compareResultId,uuid);assert.equal(data.studyTotal,14);assert.equal(data.overlapN,2);assert.equal(data.excludeOverlap,excludeOverlap);
 for(const side of ['a','b']){
  const originalA=(side==='a')!==swapped,value=data[side];
  keys(value,['source','filters','cohortId','cohortVersion','nBeforeExclusion','n','evalN','submittedUniqueIdsN','effectiveIdsN'],'side '+side);
  assert.equal(value.source,originalA?'FILTERS':'SAVED');assert.deepEqual(value.filters,filters(originalA?idsA:idsB));
  assert.equal(value.cohortId,originalA?null:cohortId);assert.equal(value.cohortVersion,originalA?null:1);
  assert.equal(value.nBeforeExclusion,8);assert.equal(value.n,n);assert.equal(value.evalN,n);assert.equal(value.submittedUniqueIdsN,8);assert.equal(value.effectiveIdsN,8);
 }
 assert.equal(data.rows.length,12);assert.deepEqual(data.rows.map(row=>row.metric),metrics);
 for(const row of data.rows)keys(row,['metric','kind','a','b','difference','test'],'row '+row.metric);
 const count=data.rows[0];assert.equal(count.kind,'COUNT');assert.deepEqual(count.a,{n});assert.deepEqual(count.b,{n});assert.equal(count.difference,null);assert.equal(count.test,null);
 const continuous={age:'age',duration:'diseaseDurationYears',das28At:'das28',crpAt:'crp',haqAt:'haq'};
 for(const [metric,oracleMetric] of Object.entries(continuous)){
  const row=data.rows.find(value=>value.metric===metric),wanted=expected.continuous[oracleMetric];assert.equal(row.kind,'CONTINUOUS');
  for(const side of ['a','b']){
   const sample=wanted[(side==='a')!==swapped?'A':'B'];
   keys(row[side],['validN','unknownN','q1','median','q3','iqr','status'],metric+' '+side);
   assert.equal(row[side].validN,sample.n);assert.equal(row[side].unknownN,n-sample.n);assert.equal(row[side].status,'OK');
   for(const name of ['q1','median','q3','iqr'])numeric(row[side][name],sample[name],metric+' '+side+' '+name);
  }
  numeric(row.difference,Number(wanted.medianDifferenceAminusB)*(swapped?-1:1),metric+' difference');
  testValue(row.test,wanted.test,'NON_MISSING_METRIC',false,swapped,metric+' test');
 }
 const binary={female:'female',sero:'serologyPositive',target:'target',complete:'complete'};
 for(const [metric,oracleMetric] of Object.entries(binary)){
  const row=data.rows.find(value=>value.metric===metric),wanted=expected.binary[oracleMetric];assert.equal(row.kind,'BINARY');
  for(const side of ['a','b']){
   const key=(side==='a')!==swapped?'A':'B',sample=wanted.display[key];
   keys(row[side],['numerator','denominator','knownN','unknownN','value','status'],metric+' '+side);
   assert.equal(row[side].numerator,sample.numerator);assert.equal(row[side].denominator,sample.denominator);
   assert.equal(row[side].knownN,wanted.test['n'+key]);assert.equal(row[side].unknownN,sample.unknown);assert.equal(row[side].status,'OK');numeric(row[side].value,sample.rate,metric+' '+side+' ratio');
  }
  numeric(row.difference,Number(wanted.display.differenceAminusBPercentagePoints)*(swapped?-1:1),metric+' percentage points');
  testValue(row.test,wanted.test,metric==='target'?'EVALUABLE_TARGET':'KNOWN_CATEGORY',true,swapped,metric+' test');
 }
 for(const metric of ['activity','line']){
  const row=data.rows.find(value=>value.metric===metric),wanted=expected[metric+'Distribution'];assert.equal(row.kind,'DISTRIBUTION');assert.equal(row.difference,null);
  for(const side of ['a','b']){
   const key=(side==='a')!==swapped?'A':'B',sample=wanted[key];
   keys(row[side],['denominator','knownN','unknownN','status','groups'],metric+' '+side);
   assert.equal(row[side].denominator,n);assert.equal(row[side].knownN,wanted.test['n'+key]);assert.equal(row[side].unknownN,metric==='line'?sample.unknownLine:0);assert.equal(row[side].status,'OK');
   assert.equal(row[side].groups.length,wanted.categories.length);
   for(const [index,group] of row[side].groups.entries()){
    keys(group,['category','count','value'],metric+' '+side+' group');assert.equal(group.category,String(wanted.categories[index]));assert.equal(group.count,sample.counts[index]);numeric(group.value,sample.counts[index]/n,metric+' '+side+' group ratio');
   }
  }
  testValue(row.test,wanted.test,metric==='activity'?'EVALUABLE_ACTIVITY':'KNOWN_LINE',true,swapped,metric+' test');
 }
 keys(data.meta,['at','asOfDate','readStartedAt','readCompletedAt','computedAt','expiresAt','traceId','policyVersions','sourceDateCoverage','completion','statisticalDisclosure'],'full meta');
 assert.equal(data.meta.at,'now');assert.equal(data.meta.asOfDate,'2026-10-07');assert.equal(data.meta.traceId,trace);assert.equal(data.meta.completion,'P04_COMPARE');assert.deepEqual(data.meta.policyVersions,policies);assert.equal(data.meta.statisticalDisclosure,disclosure);
 for(const field of ['readStartedAt','readCompletedAt','computedAt'])assert.equal(data.meta[field],'2026-10-07T02:00:00Z',field+' original fixed Clock');
 assert.equal(data.meta.expiresAt,'2026-10-07T02:15:00Z');keys(data.meta.sourceDateCoverage,['a','b'],'coverage sides');
 for(const side of ['a','b']){
  keys(data.meta.sourceDateCoverage[side],metrics.slice(1),'full coverage '+side);
  for(const metric of metrics.slice(1)){
   const originalA=(side==='a')!==swapped,key=originalA?'A':'B';
   const validN=continuous[metric]?expected.continuous[continuous[metric]][key].n:binary[metric]?expected.binary[binary[metric]].test['n'+key]:expected[metric+'Distribution'].test['n'+key];
   const dated=['das28At','crpAt','haqAt','target','activity'].includes(metric);
   assert.deepEqual(data.meta.sourceDateCoverage[side][metric],{validN,datedN:dated?validN:0,undatedN:dated?0:validN,missingN:n-validN,minDate:dated?'2026-10-07':null,maxDate:dated?'2026-10-07':null,status:dated?'KNOWN':'UNKNOWN'},'independent original date coverage '+metric+' '+side);
  }
 }
}

export async function comparisonBrowser(context,port,identity,owner,probe,pid,id,fixture){
 assert.equal(id,'cohort:browser-comparison-create');assert.equal(identity,'synthetic');assert.equal(fixture.scenario,'p04');
 const started=Date.now(),origin=`http://127.0.0.1:${port}`,path='/api/ra/ai/compare';
 const requests=[],responses=[],reads=[],allowed=[],blocked=[],pageErrors=[],routeErrors=[],steps=[],pages=[];
 const proof={scope:'Synthetic Principal and ordinary owned 14-patient p04 SQL only; no real authentication/T4/external acceptance.',oracle:'raapi/src/test/resources/ai-cohort/p04b/independent-oracles.json',oracleHash:createHash('sha256').update(await readFile(new URL('../../../raapi/src/test/resources/ai-cohort/p04b/independent-oracles.json',import.meta.url))).digest('hex')};
 let drop=null;
 const counts=async()=>{
  const raw=(await owner.mysqlQuery('SELECT (SELECT COUNT(*) FROM ra_synthetic_test.ra_ai_compare_run),(SELECT COUNT(*) FROM ra_synthetic_test.ra_ai_analysis_run)')).trim().split('\t');return {compare:Number(raw[0]),analysis:Number(raw[1])};
 };
 const sourceHash=async()=>{
  const text=await owner.mysqlQuery(['patient_basic_info','patient_relation_doctor','patient_follow_up_history','patient_comorbidity'].map(table=>`SELECT * FROM ra_synthetic_test.${table} ORDER BY id`).join(';'));
  return createHash('sha256').update(text).digest('hex');
 };
 const stored=async data=>{
  assert.match(data.compareResultId,uuid);
  const raw=(await owner.mysqlQuery(`SELECT owner_doctor_id,payload_version,HEX(payload),payload_sha256,scope_fingerprint,created_at_ms,expires_at_ms FROM ra_synthetic_test.ra_ai_compare_run WHERE id='${data.compareResultId}'`)).trim();
  assert.ok(raw,'complete compare row must commit before public result');const [doctor,version,hex,hash,fingerprint,created,expires]=raw.split('\t'),bytes=Buffer.from(hex,'hex'),payload=JSON.parse(bytes);
  assert.equal(doctor,'101');assert.equal(version,'1');assert.match(fingerprint,/^[0-9a-f]{64}$/);assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);assert.equal(Object.hasOwn(payload,'compareResultId'),false);
  const {compareResultId,...retained}=data;assert.deepEqual(payload,retained,'SQL stores every actual row, source, original time and disclosure');
  assert.equal(Number(created),Date.parse(data.meta.computedAt));assert.equal(Number(expires),Date.parse(data.meta.expiresAt));return {compareResultId,hash,fingerprint,created:Number(created),expires:Number(expires),bytes:bytes.length};
 };
 const responseValue=async(response,status=200)=>{
  const json=await response.json(),trace=response.headers()['x-trace-id'];assert.equal(response.status(),status,JSON.stringify({actual:response.status(),code:json.code}));assert.ok(trace);assert.equal(json.success,status===200);if(status===200){assert.equal(json.code,'200');assert.equal(json.data.meta.traceId,trace);}else assert.equal(json.data,null);return {status,trace,json};
 };
 await context.addInitScript(()=>sessionStorage.setItem('ra-auth',JSON.stringify({name:'合成页面用户',role:'研究者',expires:0})));
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(owner.controller.signal.aborted||url.origin!==origin){blocked.push(request.url());return route.abort('blockedbyclient');}allowed.push(request.url());
  if(!url.pathname.startsWith('/api/'))return route.continue();
  const record={via:'ui',page:pages.indexOf(request.frame().page()),url:request.url(),method:request.method(),headers:request.headers(),body:request.postDataJSON()};requests.push(record);
  if(!drop||url.pathname!==path)return route.continue();const cut=drop;drop=null;
  try{
   // 此cut必须先到真实Servlet并在独立SQL看到整行commit，再丢原响应；不能fulfill模拟成功。
   const real=await route.fetch(),result=await responseValue(real),persisted=await stored(result.json.data),current=await counts();
   assert.equal(current.compare,cut.before.compare+1);assert.equal(current.analysis,cut.before.analysis);record.serverCommitted=true;
   const committed={...result,body:record.body,persisted,counts:current,via:'real-fetch-SQL-commit-then-drop'};responses.push(committed);cut.resolve(committed);await route.abort('failed');
  }catch(error){routeErrors.push(error.message);cut.reject(error);owner.fail(error.message);await route.abort('failed').catch(()=>{});}
 });
 const newPage=async label=>{
  const page=await context.newPage();page.setDefaultTimeout(5000);pages.push(page);owner.event('page-created',{pid,port,label});
  page.on('pageerror',error=>pageErrors.push({label,error:error.message}));
  page.on('response',response=>{if(new URL(response.url()).pathname.startsWith('/api/'))reads.push((async()=>{try{responses.push({via:'page',page:label,url:response.url(),body:response.request().postDataJSON(),status:response.status(),trace:response.headers()['x-trace-id'],json:await response.json()});}catch(error){routeErrors.push(error.message);}})());});return page;
 };
 const perform=async(page,action,url,status=200)=>{
  await page.bringToFront();const pending=page.waitForResponse(response=>new URL(response.url()).pathname===url&&response.request().method()==='POST',{timeout:5000});pending.catch(()=>{});await action();const response=await pending;return {...await responseValue(response,status),body:response.request().postDataJSON()};
 };
 const fresh=async(page,ids)=>{
  const result=await perform(page,()=>page.goto(origin+'/ai-cohort.html?ids='+ids.join(',')),'/api/ra/ai/cohort');assert.equal(result.json.data.n,8);assert.equal(result.json.data.studyTotal,14);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');await expect(page.locator('#cohort-n')).toHaveText('8');await expect(page.locator('#study-total')).toHaveText('14');return result;
 };
 const list=async page=>{
  const result=await perform(page,()=>page.locator('#private-list-load').click(),'/api/ra/cohort/list');await expect(page.locator('#private-list-state')).toHaveAttribute('data-state','success');await expect(page.locator('#private-items [data-compare-side="b"][data-compare-cohort]')).toHaveCount(1);return result;
 };
 const resource=page=>page.evaluate(()=>window.RACohortComparison.getResource());
 const noResource=async page=>{
  await expect(page.locator('#compare-result')).not.toHaveAttribute('data-compare-result-id',uuid);assert.equal(await resource(page),null);
 };
 const summary=async(page,data)=>{
  await expect(page.locator('#compare-state')).toHaveAttribute('data-state','success');await expect(page.locator('#compare-result')).toHaveAttribute('data-compare-result-id',data.compareResultId);assert.deepEqual(await resource(page),data,'complete readonly comparison resource mirrors the same real response');
  await expect(page.locator('#compare-summary')).toContainText('14');await expect(page.locator('#compare-summary')).toContainText('2');
  for(const side of ['a','b']){
   const text=await page.locator('#compare-side-'+side).innerText();assert.ok(text.includes(data[side].source),'summary identifies side source');
   for(const field of ['nBeforeExclusion','n','evalN'])assert.match(text,new RegExp(field+'\\s*[=:：]\\s*'+data[side][field]+'(?:\\D|$)'),side+' summary '+field);
   assert.ok(text.includes(JSON.stringify(data[side].filters)),'summary retains full normalized '+side+' filters');if(data[side].source==='SAVED')assert.ok(text.includes(data[side].cohortId));
  }
  const meta=await page.locator('#compare-policy').innerText();for(const field of ['at','asOfDate','readStartedAt','readCompletedAt','computedAt','expiresAt','traceId'])assert.ok(meta.includes(data.meta[field]),'same response '+field);
  for(const version of Object.values(policies))assert.ok(meta.includes(version),'same response policy '+version);assert.ok(meta.includes(disclosure));
  // 对外clone不允许调用方改写已发布资源。
  const copy=await page.evaluate(()=>{const value=window.RACohortComparison.getResource();try{value.rows.length=0;value.a.n=999;}catch(error){if(!(error instanceof TypeError))throw error;}return window.RACohortComparison.getResource();});assert.deepEqual(copy,data);
 };
 const compareRequests=()=>requests.filter(request=>new URL(request.url).pathname===path);
 const requestContract=body=>{
  keys(body,['a','b','excludeOverlap'],'compare exact root');assert.equal(typeof body.excludeOverlap,'boolean');
  for(const side of ['a','b']){keys(body[side],body[side].source==='FILTERS'?['source','filters']:['source','cohortId'],'compare exact '+side);if(body[side].source==='FILTERS'){keys(body[side].filters,['studyCode','at','act','ids','sex','age','sero','cm','tx','data'],'complete explicit FILTERS snapshot');assert.ok(body[side].filters.ids.every(value=>typeof value==='string'));}else assert.match(body[side].cohortId,uuid);}
 };
 const compare=async(page,expected,label)=>{
  const baseline=await counts(),requestN=compareRequests().length,result=await perform(page,()=>page.locator('#compare-start').click(),path),data=result.json.data;
  literalComparison(data,{...expected,trace:result.trace});requestContract(result.body);assert.equal(result.body.excludeOverlap,expected.excludeOverlap);
  await summary(page,data);const current=await counts();assert.equal(current.compare,baseline.compare+1,label+' exactly one comparison run');assert.equal(current.analysis,baseline.analysis,label+' zero analysis run');assert.equal(compareRequests().length,requestN+1,label+' exactly one compare request');
  const persisted=await stored(data);steps.push({label,baseline,current,body:result.body,compareResultId:data.compareResultId,trace:result.trace,persisted});return result;
 };
 try{
  const a=await newPage('A'),b=await newPage('Save B');await fresh(a,idsA);await fresh(b,idsB);proof.sourceHashBefore=await sourceHash();
  await a.bringToFront();await expect(a.locator('#compare-start')).toBeDisabled();await a.locator('#compare-current-a').click();await expect(a.locator('#compare-source-a')).toContainText('已选');
  const beforeSave=await counts();await b.bringToFront();await b.locator('#save-cohort').click();await b.locator('#private-name').fill('Comparison B');await b.locator('#private-note').fill('真实普通14人B定义');
  const saved=await perform(b,()=>b.locator('#private-save').click(),'/api/ra/cohort/save'),cohortId=saved.json.data.cohortId;assert.match(cohortId,uuid);assert.equal(saved.json.data.version,1);await expect(b.locator('#private-save-state')).toHaveAttribute('data-state','success');await expect(b.locator('#private-list-state')).toHaveAttribute('data-state','success');
  const listed=await list(a);assert.equal(listed.json.data.total,1);const item=listed.json.data.items[0];assert.equal(item.cohortId,cohortId);assert.equal(item.version,1);assert.equal(item.currentN,null);assert.deepEqual(item.filters,filters(idsB));assert.deepEqual(await counts(),beforeSave,'save and real list must not create analyses or comparisons');
  await a.locator(`[data-compare-side="b"][data-compare-cohort="${cohortId}"]`).click();await expect(a.locator('#compare-source-b')).toContainText(cohortId);await expect(a.locator('#compare-start')).toBeEnabled();await expect(a.locator('#compare-exclude')).not.toBeChecked();
  const definitionRaw=(await owner.mysqlQuery(`SELECT HEX(filters_utf8),filters_sha256,owner_doctor_id,version FROM ra_synthetic_test.ra_private_cohort_definition WHERE id='${cohortId}'`)).trim(),[hex,hash,doctor,version]=definitionRaw.split('\t');assert.equal(doctor,'101');assert.equal(version,'1');assert.equal(createHash('sha256').update(Buffer.from(hex,'hex')).digest('hex'),hash);assert.deepEqual(JSON.parse(Buffer.from(hex,'hex')),filters(idsB));proof.definition={cohortId,version:1,hash};
  const first=await compare(a,{cohortId,excludeOverlap:false,swapped:false},'overlap retained 8/8/2');
  await a.locator('#compare-exclude').check();await noResource(a);const second=await compare(a,{cohortId,excludeOverlap:true,swapped:false},'exclude both sides 6/6/2');assert.notEqual(second.json.data.compareResultId,first.json.data.compareResultId);
  const requestsBeforeSwap=compareRequests().length,countsBeforeSwap=await counts();await a.locator('#compare-swap').click();await noResource(a);assert.equal(compareRequests().length,requestsBeforeSwap);assert.deepEqual(await counts(),countsBeforeSwap,'swap waits for an explicit new comparison');
  const swapped=await compare(a,{cohortId,excludeOverlap:true,swapped:true},'swapped explicit same-source comparison');
  assert.deepEqual(swapped.json.data.a,second.json.data.b);assert.deepEqual(swapped.json.data.b,second.json.data.a);for(let index=0;index<12;index++){const row=swapped.json.data.rows[index],previous=second.json.data.rows[index];assert.deepEqual(row.a,previous.b);assert.deepEqual(row.b,previous.a);if(row.difference!==null)numeric(row.difference,-previous.difference,'swapped sign '+row.metric);if(row.test)numeric(row.test.pValue,previous.test.pValue,'swapped same two-sided P '+row.metric);}
  // 服务已真实commit的最高损失cut：无compare幂等key；显式新比较才可产生第2行和新ID。
  const baseline=await counts(),requestN=compareRequests().length;let resolve,reject;const committed=new Promise((yes,no)=>{resolve=yes;reject=no;});drop={before:baseline,resolve,reject};await a.locator('#compare-start').click();const lost=await committed;
  literalComparison(lost.json.data,{cohortId,excludeOverlap:true,swapped:true,trace:lost.trace});await expect(a.locator('#compare-state')).toHaveAttribute('data-state','error');await expect(a.locator('#compare-state')).toContainText('NETWORK_ERROR');await expect(a.locator('#compare-state')).toContainText('不能确定是否已提交');await noResource(a);
  assert.equal(compareRequests().length,requestN+1,'committed response loss must not trigger a hidden compare retry');assert.deepEqual(await counts(),{compare:baseline.compare+1,analysis:baseline.analysis},'SQL row exists but response authority is gone');
  const explicit=await compare(a,{cohortId,excludeOverlap:true,swapped:true},'explicit new compare after uncertain commit');assert.notEqual(explicit.json.data.compareResultId,lost.json.data.compareResultId);assert.equal(compareRequests().length,requestN+2);assert.deepEqual(await counts(),{compare:baseline.compare+2,analysis:baseline.analysis});proof.lost={...lost,baseline,explicitNewId:explicit.json.data.compareResultId};
  // 可信202仍不能访问101真实已保存定义；请求header101不能赋权。失败也不分析/回退/自动open。
  const beforeForeign=await counts(),beforeForeignRequests=compareRequests().length;await owner.control(fixture,'IDENTITY_202');await context.setExtraHTTPHeaders({'X-Doctor-Id':'101'});const foreign=await perform(a,()=>a.locator('#compare-start').click(),path,404);assert.equal(foreign.json.code,'RESOURCE_NOT_FOUND');await expect(a.locator('#compare-state')).toHaveAttribute('data-state','error');await expect(a.locator('#compare-state')).toContainText(foreign.trace);await noResource(a);assert.deepEqual(await counts(),beforeForeign);assert.equal(compareRequests().length,beforeForeignRequests+1);steps.push({label:'trusted 202 SAVED 101 gives 404 despite spoofed header101',...foreign});
  // 匿名在同一真实页面点击已选来源；401清资源/来源及等待权，Servlet不借业务连接。
  const observations=fixture.events.filter(event=>event.type==='http-observation'),borrowed=observations.at(-1).borrowed,beforeAnonymous=await counts();await owner.control(fixture,'IDENTITY_ANONYMOUS');const anonymous=await perform(a,()=>a.locator('#compare-start').click(),path,401);assert.equal(anonymous.json.code,'UNAUTHENTICATED');await noResource(a);await expect(a.locator('#login-return')).toBeVisible();await expect(a.locator('#compare-start')).toBeDisabled();await expect(a.locator('#compare-source-a')).not.toContainText(cohortId);await expect(a.locator('#compare-source-b')).not.toContainText(cohortId);
  await expect.poll(()=>fixture.events.filter(event=>event.type==='http-observation').length,{timeout:5000}).toBe(observations.length+1);const observed=fixture.events.filter(event=>event.type==='http-observation').at(-1);assert.equal(observed.borrowed,borrowed);assert.equal(observed.returned,borrowed);assert.equal(observed.active,0);assert.deepEqual(await counts(),beforeAnonymous);steps.push({label:'anonymous compare 401 no business connection despite spoofed header101',...anonymous,businessBorrowDelta:observed.borrowed-borrowed});
  await context.setExtraHTTPHeaders({});await owner.control(fixture,'IDENTITY_101');
  for(const future of ['/api/ra/ai/compareResult/','/api/ra/cohort/compare','/api/ra/cohort/export']){const response=await context.request.post(origin+future,{data:{}});assert.equal(response.status(),404,'test-only proxy does not expose deferred '+future);}
  proof.sourceHashAfter=await sourceHash();assert.equal(proof.sourceHashAfter,proof.sourceHashBefore,'save/list/compare/identity errors do not alter ordinary source rows');assert.equal((await owner.mysqlQuery(`SELECT HEX(filters_utf8),filters_sha256,owner_doctor_id,version FROM ra_synthetic_test.ra_private_cohort_definition WHERE id='${cohortId}'`)).trim(),definitionRaw);
  assert.equal(requests.filter(request=>new URL(request.url).pathname==='/api/ra/cohort/open').length,0,'comparison never opens or stitches two analyses');assert.equal(compareRequests().length,7,'three success + commit/drop + explicit new + 404 + 401');for(const request of compareRequests())requestContract(request.body);
  for(const request of requests){assert.equal(request.method,'POST');assert.equal(request.headers['content-type'],'application/json;charset=UTF-8');assert.ok(!request.headers.authorization);if(!request.headers['x-doctor-id'])continue;assert.equal(request.headers['x-doctor-id'],'101');assert.equal(new URL(request.url).pathname,path);}
  await Promise.all(reads);assert.deepEqual(blocked,[]);assert.deepEqual(pageErrors,[]);assert.deepEqual(routeErrors,[]);assert.ok(responses.every(response=>response.trace));proof.elapsedMs=Date.now()-started;proof.tabSelection='normal bringToFront before each corresponding page action';proof.viewports=pages.map(page=>page.viewportSize());
  owner.report.http.push(...responses.map(response=>({...response,port})));await writeFile(`${owner.dir}/browser-observation.json`,JSON.stringify({scenario:id,pid,identity,version:context.browser().version(),urls:pages.map(page=>page.url()),requests,responses,steps,proof,dom:await a.locator('main').innerText(),allowed,blocked,pageErrors,routeErrors},null,2)+'\n');
 }catch(error){owner.fail(error.message);throw error;}
 finally{await Promise.allSettled(reads);await writeFile(`${owner.dir}/network.json`,JSON.stringify({requests,responses,steps,proof,elapsedMs:Date.now()-started,allowed,blocked,pageErrors,routeErrors},null,2)+'\n');await Promise.allSettled(pages.map(page=>page.close()));}
}


function literalComparisonP(data){
 const expected={age:0.0021645021645021645,duration:0.0021645021645021645,das28At:0.0021645021645021645,crpAt:0.0021645021645021645,haqAt:0.004998124765082457,female:0.08008658008658008,sero:1,target:0.060606060606060615,complete:1,activity:0.007383160505359769,line:0.7659283383646487};
 for(const row of data.rows.slice(1)){if(!data.excludeOverlap){assert.equal(row.test.pValue,null);continue;}const wanted=expected[row.metric],difference=Math.abs(row.test.pValue-wanted);assert.ok(difference<=1e-12&&difference/Math.abs(wanted)<=1e-10,'independent absolute/relative P '+row.metric);}
}

async function p04bBrowserProof(context,port,identity,owner,pid,id,fixture,work){
 assert.equal(identity,'synthetic');assert.equal(fixture.scenario,'p04');
 const started=Date.now(),origin=`http://127.0.0.1:${port}`,comparePath='/api/ra/ai/compare',readPath='/api/ra/ai/compareResult';
 const requests=[],responses=[],reads=[],allowed=[],blocked=[],pageErrors=[],routeErrors=[],steps=[],pages=[];
 const proof={scope:'本run owned普通14人p04合成SQL；不构成真实身份/T4或外部验收',sql:[],oracle:'raapi/src/test/resources/ai-cohort/p04b/independent-oracles.json',oracleHash:createHash('sha256').update(await readFile(new URL('../../../raapi/src/test/resources/ai-cohort/p04b/independent-oracles.json',import.meta.url))).digest('hex')};
 const sql=async command=>{const result=await owner.mysqlQuery(command);proof.sql.push({command,result});return result;};
 const counts=async()=>{const raw=(await sql('SELECT (SELECT COUNT(*) FROM ra_synthetic_test.ra_ai_compare_run),(SELECT COUNT(*) FROM ra_synthetic_test.ra_ai_analysis_run)')).trim().split('\t');return {compare:Number(raw[0]),analysis:Number(raw[1])};};
 const stored=async data=>{
  assert.match(data.compareResultId,uuid);const raw=(await sql(`SELECT owner_doctor_id,payload_version,HEX(payload),payload_sha256,scope_fingerprint,created_at_ms,expires_at_ms FROM ra_synthetic_test.ra_ai_compare_run WHERE id='${data.compareResultId}'`)).trim();assert.ok(raw,'保留比较行必须已真实commit');
  const [doctor,version,hex,hash,fingerprint,created,expires]=raw.split('\t'),bytes=Buffer.from(hex,'hex'),payload=JSON.parse(bytes);
  assert.equal(doctor,'101');assert.equal(version,'1');assert.match(fingerprint,/^[0-9a-f]{64}$/);assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);assert.equal(Object.hasOwn(payload,'compareResultId'),false);
  const clean=JSON.parse(JSON.stringify(data));delete clean.compareResultId;delete clean.meta.comparisonTraceId;
  if(data.meta.comparisonTraceId)clean.meta.traceId=data.meta.comparisonTraceId;
  assert.deepEqual(payload,clean,'SQL完整payload保持创建时源/12行/时间/政策/coverage');assert.equal(Number(created),Date.parse(data.meta.computedAt));assert.equal(Number(expires),Date.parse(data.meta.expiresAt));return {raw,hash,fingerprint,created:Number(created),expires:Number(expires),bytes:bytes.length};
 };
 const responseValue=async(response,status=200)=>{const json=await response.json(),trace=response.headers()['x-trace-id'];assert.equal(response.status(),status,JSON.stringify({status:response.status(),code:json.code}));assert.ok(trace);assert.equal(json.success,status===200);if(status===200){assert.equal(json.code,'200');if(json.data.meta)assert.equal(json.data.meta.traceId,trace);}else assert.equal(json.data,null);return {status,trace,json};};
 await context.addInitScript(()=>sessionStorage.setItem('ra-auth',JSON.stringify({name:'合成页面用户',role:'研究者',expires:0})));
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());if(owner.controller.signal.aborted||url.origin!==origin){blocked.push(request.url());return route.abort('blockedbyclient');}allowed.push(request.url());
  if(url.pathname.startsWith('/api/'))requests.push({via:'ui',page:pages.indexOf(request.frame().page()),url:request.url(),method:request.method(),headers:request.headers(),body:request.postDataJSON()});
  return route.continue();
 });
 const newPage=async label=>{const page=await context.newPage();await page.setViewportSize({width:1280,height:720});page.setDefaultTimeout(5000);pages.push(page);owner.event('page-created',{pid,port,label});page.on('pageerror',error=>pageErrors.push({label,error:error.message}));page.on('response',response=>{if(new URL(response.url()).pathname.startsWith('/api/'))reads.push((async()=>{try{responses.push({via:'page',page:label,url:response.url(),body:response.request().postDataJSON(),status:response.status(),trace:response.headers()['x-trace-id'],json:await response.json()});}catch(error){routeErrors.push(error.message);}})());});return page;};
 const perform=async(page,action,path,status=200)=>{await page.bringToFront();const pending=page.waitForResponse(response=>new URL(response.url()).pathname===path&&response.request().method()==='POST',{timeout:5000});pending.catch(()=>{});await action();const response=await pending;return {...await responseValue(response,status),body:response.request().postDataJSON()};};
 const fresh=async(page,ids)=>{const result=await perform(page,()=>page.goto(origin+'/ai-cohort.html?ids='+ids.join(',')),'/api/ra/ai/cohort');assert.equal(result.json.data.n,ids.length);assert.equal(result.json.data.studyTotal,14);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');await expect(page.locator('#cohort-n')).toHaveText(String(ids.length));return result;};
 const list=async page=>{const result=await perform(page,()=>page.locator('#private-list-load').click(),'/api/ra/cohort/list');await expect(page.locator('#private-list-state')).toHaveAttribute('data-state',result.json.data.total?'success':'empty');return result;};
 const setup=async(aIds=idsA,bIds=idsB)=>{
  const a=await newPage('Comparison A'),b=await newPage('Save B');await fresh(a,aIds);await fresh(b,bIds);
  await a.bringToFront();await a.locator('#compare-current-a').click();
  await b.bringToFront();await b.locator('#save-cohort').click();await b.locator('#private-name').fill('P04b Comparison B');await b.locator('#private-note').fill('本run普通14人真实条件定义');
  const beforeSave=await counts(),saved=await perform(b,()=>b.locator('#private-save').click(),'/api/ra/cohort/save'),cohortId=saved.json.data.cohortId;assert.match(cohortId,uuid);assert.equal(saved.json.data.version,1);await expect(b.locator('#private-save-state')).toHaveAttribute('data-state','success');
  const listed=await list(a);assert.equal(listed.json.data.total,1);assert.deepEqual(listed.json.data.items[0].filters,filters(bIds));assert.deepEqual(await counts(),beforeSave,'保存/list不创建分析或比较');
  await a.bringToFront();await a.locator(`[data-compare-side="b"][data-compare-cohort="${cohortId}"]`).click();await expect(a.locator('#compare-start')).toBeEnabled();return {a,b,cohortId};
 };
 const resource=page=>page.evaluate(()=>window.RACohortComparison.getResource());
 const noResource=async page=>{await expect(page.locator('#compare-result')).toBeHidden();assert.equal(await page.locator('#compare-result').getAttribute('data-compare-result-id'),null);await expect(page.locator('#compare-rows tr')).toHaveCount(0);await expect(page.locator('#compare-read')).toBeHidden();await expect(page.locator('#compare-read')).toBeDisabled();assert.equal(await resource(page),null);};
 const escaped=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const field=async(cell,key,value,nullText)=>{const text=value===null?nullText:Array.isArray(value)?(value.join(', ')||'无'):String(value);await expect(cell).toContainText(new RegExp('(?:^|[ ·\\n])'+escaped(key)+'='+escaped(text)+'(?=[ ·\\n]|来源覆盖|$)'));};
 const table=async(page,data)=>{
  await expect(page.locator('#compare-state')).toHaveAttribute('data-state','success');await expect(page.locator('#compare-result')).toHaveAttribute('data-compare-result-id',data.compareResultId);await expect(page.locator('#compare-read')).toBeVisible();await expect(page.locator('#compare-read')).toBeEnabled();assert.deepEqual(await resource(page),data);
  const rows=page.locator('#compare-rows tr[data-metric]');await expect(rows).toHaveCount(12);assert.deepEqual(await rows.evaluateAll(elements=>elements.map(row=>row.dataset.metric)),metrics);
  for(const row of data.rows){const tr=page.locator(`#compare-rows tr[data-metric="${row.metric}"]`);await expect(tr).toHaveAttribute('data-kind',row.kind);
   for(const side of ['a','b']){const cell=tr.locator(`[data-side="${side}"]`);for(const [key,value] of Object.entries(row[side]))if(key!=='groups')await field(cell,key,value,'缺失');for(const group of row[side].groups||[])await expect(cell).toContainText(`${group.category}: count=${group.count} · value=${group.value}`);if(row.kind!=='COUNT')for(const [key,value] of Object.entries(data.meta.sourceDateCoverage[side][row.metric]))await field(cell.locator('.comparison-coverage'),key,value,'未提供');}
   await expect(tr.locator('[data-difference]')).toHaveText(row.difference===null?'不适用':`${row.difference}${row.kind==='BINARY'?' 百分点':''}`);
   const test=tr.locator('[data-test]');if(row.test){for(const [key,value] of Object.entries(row.test))await field(test,key,value,'不可用');await expect(test.locator('.stat-significant')).toHaveCount(row.test.significant===true?1:0);}else{await expect(test).toHaveText('不适用');await expect(test.locator('.stat-significant')).toHaveCount(0);}
  }
  for(const side of ['a','b']){const text=await page.locator('#compare-side-'+side).innerText();assert.ok(text.includes(data[side].source));assert.ok(text.includes(JSON.stringify(data[side].filters)));if(data[side].cohortId)assert.ok(text.includes(data[side].cohortId));for(const key of ['nBeforeExclusion','n','evalN','cohortVersion','submittedUniqueIdsN','effectiveIdsN'])await field(page.locator('#compare-side-'+side),key,data[side][key],'null');}
  const meta=page.locator('#compare-policy');for(const key of ['at','asOfDate','readStartedAt','readCompletedAt','computedAt','expiresAt','traceId','completion'])await field(meta,key,data.meta[key],'不可用');for(const [key,value] of Object.entries(data.meta.policyVersions))await field(meta,key,value,'不可用');await expect(meta).toContainText(disclosure);await field(meta,'comparisonTraceId',data.meta.comparisonTraceId||data.meta.traceId,'不可用');
 };
 const selected=()=>requests.filter(request=>new URL(request.url).pathname===comparePath);
 const fallbackSnapshot=()=>requests.filter(request=>['/api/ra/ai/compare','/api/ra/ai/cohort','/api/ra/cohort/open'].includes(new URL(request.url).pathname)).length;
 const compare=async(page,label,check)=>{
  const baseline=await counts(),requestN=selected().length,previous=(await sql('SELECT id,expires_at_ms FROM ra_synthetic_test.ra_ai_compare_run ORDER BY expires_at_ms,id')).trim();
  const result=await perform(page,()=>page.locator('#compare-start').click(),comparePath),data=result.json.data;keys(result.body,['a','b','excludeOverlap'],'compare body');
  for(const side of ['a','b'])keys(result.body[side],result.body[side].source==='SAVED'?['source','cohortId']:['source','filters'],'compare side');assert.match(data.compareResultId,uuid);assert.equal(data.rows.length,12);assert.deepEqual(data.rows.map(row=>row.metric),metrics);if(check)check(data,result);if(id==='cohort:browser-comparison-statistics')literalComparisonP(data);
  await table(page,data);const current=await counts(),cleaned=previous?previous.split('\n').filter(line=>Number(line.split('\t')[1])<=Date.parse(data.meta.computedAt)).slice(0,1000).length:0;
  assert.equal(current.compare,baseline.compare-cleaned+1,label+'一个新run与Current有界过期清理');assert.equal(current.analysis,baseline.analysis,label+'零分析run');assert.equal(selected().length,requestN+1);const persisted=await stored(data);steps.push({label,baseline,current,cleaned,body:result.body,compareResultId:data.compareResultId,trace:result.trace,persisted});return result;
 };
 const read=async(page,original,label,status=200,code)=>{
  const baseline=await counts(),fall= fallbackSnapshot(),readN=requests.filter(request=>new URL(request.url).pathname===readPath).length;
  const result=await perform(page,()=>page.locator('#compare-read').click(),readPath,status);assert.deepEqual(result.body,{compareResultId:original.compareResultId},'重读唯一原ID；无source/filters/版本/时间');assert.equal(requests.filter(request=>new URL(request.url).pathname===readPath).length,readN+1);assert.equal(fallbackSnapshot(),fall,'零隐藏compare/cohort/open');assert.deepEqual(await counts(),baseline,'read不创建/清理run');
  if(status===200){assert.notEqual(result.trace,original.meta.traceId);assert.equal(result.json.data.meta.comparisonTraceId,original.meta.comparisonTraceId||original.meta.traceId);const expected=JSON.parse(JSON.stringify(original));expected.meta.traceId=result.trace;expected.meta.comparisonTraceId=original.meta.comparisonTraceId||original.meta.traceId;assert.deepEqual(result.json.data,expected,'除本次trace与创建trace字段外全部原payload逐字段保持');await table(page,result.json.data);}
  else{assert.equal(result.json.code,code);await expect(page.locator('#compare-state')).toHaveAttribute('data-state','error');await expect(page.locator('#compare-state')).toContainText(code);await expect(page.locator('#compare-state')).toContainText(result.trace);await noResource(page);}
  steps.push({label,...result,baseline,current:await counts(),fallbackRequests:fall});return result;
 };
 const command=async(page,cohortId,action)=>{
  await page.bringToFront();await page.locator(`#private-items [data-${action==='rename'?'edit':'delete'}-cohort="${cohortId}"]`).click();await expect(page.locator('#private-command-dialog')).toBeVisible();if(action==='rename')await page.locator('#private-edit-name').fill('P04b 真正改名后的定义');
  const pending=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/ra/cohort/list'&&response.request().method()==='POST',{timeout:5000});pending.catch(()=>{});
  const result=await perform(page,()=>page.locator('#private-command-confirm').click(),'/api/ra/cohort/'+action);await pending;await expect(page.locator('#private-command-state')).toHaveAttribute('data-state','success');await expect(page.locator('#private-command-dialog')).toBeHidden();steps.push({label:'real P03 UI '+action,...result});return result;
 };
 try{
  await work({origin,requests,responses,steps,proof,sql,counts,stored,newPage,perform,fresh,list,setup,resource,noResource,table,compare,read,command,selected,fallbackSnapshot});
  await Promise.all(reads);assert.deepEqual(blocked,[]);assert.deepEqual(pageErrors,[]);assert.deepEqual(routeErrors,[]);assert.ok(responses.every(response=>response.trace));for(const request of requests){assert.equal(request.method,'POST');assert.equal(request.headers['content-type'],'application/json;charset=UTF-8');assert.ok(!request.headers.authorization);}
  proof.elapsedMs=Date.now()-started;proof.tabSelection='每个对应页面动作先正常bringToFront';proof.viewports=pages.map(page=>page.viewportSize());assert.ok(proof.viewports.every(viewport=>viewport.width===1280&&viewport.height===720));assert.ok(proof.elapsedMs<30000,'原30秒case期限');owner.report.http.push(...responses.map(response=>({...response,port})));
 }catch(error){owner.fail(error.message);throw error;}
 finally{
  await Promise.allSettled(reads);const dom=await Promise.all(pages.map(async page=>({url:page.url(),text:await page.locator('main').innerText().catch(()=>null)})));
  await writeFile(`${owner.dir}/browser-observation.json`,JSON.stringify({scenario:id,pid,identity,version:context.browser().version(),requests,responses,steps,proof,dom,allowed,blocked,pageErrors,routeErrors},null,2)+'\n');
  await writeFile(`${owner.dir}/network.json`,JSON.stringify({requests,responses,steps,proof,elapsedMs:Date.now()-started,allowed,blocked,pageErrors,routeErrors},null,2)+'\n');await Promise.allSettled(pages.map(page=>page.close()));
 }
}

export async function statisticsComparisonBrowser(context,port,identity,owner,probe,pid,id,fixture){
 assert.equal(id,'cohort:browser-comparison-statistics');return p04bBrowserProof(context,port,identity,owner,pid,id,fixture,async h=>{
  const {a,cohortId}=await h.setup();
  const first=await h.compare(a,'before overlap independent 12 rows',(data,result)=>literalComparison(data,{cohortId,trace:result.trace}));
  await a.bringToFront();await a.locator('#compare-exclude').check();await h.noResource(a);
  const second=await h.compare(a,'excluded independent 12 rows',(data,result)=>literalComparison(data,{cohortId,excludeOverlap:true,trace:result.trace}));assert.notEqual(first.json.data.compareResultId,second.json.data.compareResultId);
  const baseline=await h.counts(),requestN=h.selected().length;await a.bringToFront();await a.locator('#compare-swap').click();await h.noResource(a);assert.deepEqual(await h.counts(),baseline);assert.equal(h.selected().length,requestN);
  const swapped=await h.compare(a,'swapped independent 12 rows',(data,result)=>literalComparison(data,{cohortId,excludeOverlap:true,swapped:true,trace:result.trace}));
  assert.deepEqual(swapped.json.data.a,second.json.data.b);assert.deepEqual(swapped.json.data.b,second.json.data.a);for(let index=0;index<12;index++){const actual=swapped.json.data.rows[index],previous=second.json.data.rows[index];assert.deepEqual(actual.a,previous.b);assert.deepEqual(actual.b,previous.a);if(actual.difference!==null)numeric(actual.difference,-previous.difference,'交换差反号 '+actual.metric);if(actual.test)numeric(actual.test.pValue,previous.test.pValue,'交换双侧P保持 '+actual.metric);}
  assert.equal(h.selected().length,3);assert.equal(h.requests.filter(request=>new URL(request.url).pathname==='/api/ra/ai/compareResult').length,0);assert.equal(h.requests.filter(request=>new URL(request.url).pathname==='/api/ra/cohort/open').length,0);
 });
}

export async function retainedComparisonBrowser(context,port,identity,owner,probe,pid,id,fixture){
 assert.equal(id,'cohort:browser-comparison-retained');return p04bBrowserProof(context,port,identity,owner,pid,id,fixture,async h=>{
  const {a,cohortId}=await h.setup();await a.bringToFront();await a.locator('#compare-exclude').check();
  const created=await h.compare(a,'real mixed SAVED retained original',(data,result)=>literalComparison(data,{cohortId,excludeOverlap:true,trace:result.trace})),original=created.json.data,persisted=await h.stored(original);
  const definition=(await h.sql(`SELECT HEX(filters_utf8),filters_sha256,owner_doctor_id,version FROM ra_synthetic_test.ra_private_cohort_definition WHERE id='${cohortId}'`)).trim();
  assert.equal((await h.sql("SELECT JSON_UNQUOTE(JSON_EXTRACT(fzjc,'$.cfydb')) FROM ra_synthetic_test.patient_follow_up_history WHERE id=101 AND patient_basic_info_id=1")).trim(),'0.4');
  await h.sql("UPDATE ra_synthetic_test.patient_follow_up_history SET fzjc=JSON_SET(fzjc,'$.cfydb',99) WHERE id=101 AND patient_basic_info_id=1; UPDATE ra_synthetic_test.patient_basic_info SET name='synthetic-p04b-changed-name' WHERE id=1");
  assert.equal((await h.sql("SELECT JSON_UNQUOTE(JSON_EXTRACT(fzjc,'$.cfydb')) FROM ra_synthetic_test.patient_follow_up_history WHERE id=101 AND patient_basic_info_id=1")).trim(),'99');assert.equal((await h.sql('SELECT name FROM ra_synthetic_test.patient_basic_info WHERE id=1')).trim(),'synthetic-p04b-changed-name');
  await h.command(a,cohortId,'rename');assert.equal((await h.sql(`SELECT name,version,deleted_at_ms FROM ra_synthetic_test.ra_private_cohort_definition WHERE id='${cohortId}'`)).trim(),'P04b 真正改名后的定义\t2\tNULL');
  const reread=await h.read(a,original,'after clinical/name mutation and actual UI rename');assert.deepEqual(await h.stored(reread.json.data),persisted);assert.equal(reread.json.data.b.cohortVersion,1);
  // 显式另页新compare才消费改变后的临床数据/当前版本；不动原页的保留资源。
  const c=await h.newPage('Explicit clinical refresh');await h.fresh(c,idsA);await c.bringToFront();await c.locator('#compare-current-a').click();await h.list(c);await c.locator(`[data-compare-side="b"][data-compare-cohort="${cohortId}"]`).click();await c.locator('#compare-exclude').check();
  const fresh=await h.compare(c,'explicit fresh comparison sees clinical mutation',(data)=>{assert.equal(data.b.cohortVersion,2);numeric(data.rows.find(row=>row.metric==='crpAt').a.median,1.8,'independent changed CRP median');});assert.notEqual(fresh.json.data.compareResultId,original.compareResultId);numeric(original.rows.find(row=>row.metric==='crpAt').a.median,1.4,'independent retained CRP median');
  await h.command(a,cohortId,'delete');await expect(a.locator(`#private-items [data-compare-cohort="${cohortId}"]`)).toHaveCount(0);await expect(a.locator('#compare-start')).toBeDisabled();assert.ok((await h.sql(`SELECT deleted_at_ms FROM ra_synthetic_test.ra_private_cohort_definition WHERE id='${cohortId}'`)).trim()!=='NULL');
  const deleted=await h.read(a,reread.json.data,'after actual source definition deletion'),again=await h.read(a,deleted.json.data,'repeated originalId read preserves creation trace');assert.deepEqual(await h.stored(again.json.data),persisted);assert.equal(again.json.data.meta.comparisonTraceId,created.trace);assert.notEqual(again.trace,deleted.trace);
  const afterDefinition=(await h.sql(`SELECT HEX(filters_utf8),filters_sha256,owner_doctor_id,version FROM ra_synthetic_test.ra_private_cohort_definition WHERE id='${cohortId}'`)).trim().split('\t'),beforeDefinition=definition.split('\t');assert.deepEqual(afterDefinition.slice(0,3),beforeDefinition.slice(0,3));assert.equal(afterDefinition[3],'3');
  const baseline=await h.counts(),requestN=h.selected().length;await a.bringToFront();assert.equal(await a.locator('#compare-start').isEnabled(),false);assert.equal(h.selected().length,requestN);assert.deepEqual(await h.counts(),baseline,'删定义不可暗中FILTERS回退');assert.equal(h.selected().length,2,'原创建与一次明确临床新比较');assert.equal(h.requests.filter(request=>new URL(request.url).pathname==='/api/ra/cohort/open').length,0);
  h.proof.retained={originalId:original.compareResultId,creationTrace:created.trace,persisted,definitionBefore:definition,definitionAfter:afterDefinition};
 });
}

export async function invalidatedComparisonBrowser(context,port,identity,owner,probe,pid,id,fixture){
 assert.equal(id,'cohort:browser-comparison-invalidated');return p04bBrowserProof(context,port,identity,owner,pid,id,fixture,async h=>{
  const {a,cohortId}=await h.setup(['1','2','3','4','5','6'],['9','10','11','12']);
  const create=label=>h.compare(a,label,(data)=>{assert.equal(data.studyTotal,14);assert.equal(data.overlapN,0);assert.deepEqual(data.a.filters.ids,['1','2','3','4','5','6']);assert.deepEqual(data.b.filters.ids,['9','10','11','12']);assert.equal(data.a.n,6);assert.equal(data.b.n,4);assert.equal(data.b.cohortId,cohortId);assert.ok(!data.a.filters.ids.includes('14')&&!data.b.filters.ids.includes('14'));});
  const scoped=await create('scope cut original U contains14 outside A/B'),scopeRaw=await h.stored(scoped.json.data);
  const relation=(await h.sql('SELECT doctor_id,patient_id,research_type,miss FROM ra_synthetic_test.patient_relation_doctor WHERE doctor_id=101 AND patient_id=14')).trim();assert.equal(relation,'101\t14\t0\t0');await h.sql('DELETE FROM ra_synthetic_test.patient_relation_doctor WHERE doctor_id=101 AND patient_id=14');assert.equal((await h.sql('SELECT COUNT(*) FROM ra_synthetic_test.patient_relation_doctor WHERE doctor_id=101 AND patient_id=14')).trim(),'0');
  await h.read(a,scoped.json.data,'real409 complete U revoke14 outside selected A/B',409,'SCOPE_CHANGED');assert.deepEqual(await h.stored(scoped.json.data),scopeRaw,'409不改保留payload');
  await h.sql('INSERT INTO ra_synthetic_test.patient_relation_doctor (doctor_id,patient_id,research_type,miss) VALUES (101,14,0,0)');assert.equal((await h.sql('SELECT doctor_id,patient_id,research_type,miss FROM ra_synthetic_test.patient_relation_doctor WHERE doctor_id=101 AND patient_id=14')).trim(),relation);
  const expired=await create('independent original expiry resource'),expiryRaw=await h.stored(expired.json.data);assert.notEqual(expired.json.data.compareResultId,scoped.json.data.compareResultId);await owner.control(fixture,'ADVANCE_TTL');
  await h.read(a,expired.json.data,'real410 requestedAt original expiry via owned Clock',410,'COMPARE_EXPIRED');assert.deepEqual(await h.stored(expired.json.data),expiryRaw,'真实Clock到期不伪删metadata');
  const missing=await create('independent fresh run after original expiry'),missingId=missing.json.data.compareResultId;assert.notEqual(missingId,expired.json.data.compareResultId);assert.equal(missing.json.data.meta.computedAt,expired.json.data.meta.expiresAt);
  const beforeDelete=await h.counts();await h.sql(`DELETE FROM ra_synthetic_test.ra_ai_compare_run WHERE id='${missingId}' AND owner_doctor_id=101`);assert.equal((await h.sql(`SELECT COUNT(*) FROM ra_synthetic_test.ra_ai_compare_run WHERE id='${missingId}'`)).trim(),'0');assert.deepEqual(await h.counts(),{compare:beforeDelete.compare-1,analysis:beforeDelete.analysis});await h.read(a,missing.json.data,'real404 physically absent owned compare row',404,'RESOURCE_NOT_FOUND');
  const foreign=await create('independent owner101 resource for trusted202');await owner.control(fixture,'IDENTITY_202');await context.setExtraHTTPHeaders({'X-Doctor-Id':'101'});await h.read(a,foreign.json.data,'trusted202 exact101Id gives404 despite spoofed header101',404,'RESOURCE_NOT_FOUND');await context.setExtraHTTPHeaders({});await owner.control(fixture,'IDENTITY_101');
  const anonymous=await create('independent owner101 resource for anonymous');const observationN=fixture.events.filter(event=>event.type==='http-observation').length,previousObservation=fixture.events.filter(event=>event.type==='http-observation').at(-1);await owner.control(fixture,'IDENTITY_ANONYMOUS');await h.read(a,anonymous.json.data,'anonymous real401 clears ownership and UI',401,'UNAUTHENTICATED');await expect(a.locator('#login-return')).toBeVisible();await expect(a.locator('#compare-start')).toBeDisabled();
  await expect.poll(()=>fixture.events.filter(event=>event.type==='http-observation').length,{timeout:5000}).toBe(observationN+1);const observed=fixture.events.filter(event=>event.type==='http-observation').at(-1);assert.equal(observed.borrowed,previousObservation.borrowed);assert.equal(observed.returned,observed.borrowed);assert.equal(observed.active,0);h.proof.anonymousBusinessBorrowDelta=observed.borrowed-previousObservation.borrowed;await owner.control(fixture,'IDENTITY_101');
  assert.equal(h.selected().length,5,'每个失效cut独立真实创建，无隐藏回退');assert.equal(h.requests.filter(request=>new URL(request.url).pathname==='/api/ra/ai/compareResult').length,5);assert.equal(h.requests.filter(request=>new URL(request.url).pathname==='/api/ra/cohort/open').length,0);
 });
}
