import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
const MAX='9223372036854775807';
const firstIds=['1','2','3','4','5','6','7','8','9','10'];
const middleIds=['11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30'];
const lastIds=['31','32','33','34','35','36',MAX];
const targetFilters={studyCode:'RA',at:'now',act:'target',ids:null,sex:null,age:null,sero:null,cm:null,tx:null,data:null};
export async function privateBrowser(context,port,identity,owner,probe,pid,id,fixture){
 const origin=`http://127.0.0.1:${port}`,requests=[],responses=[],reads=[],allowed=[],blocked=[],pageErrors=[],proof={};let dropNextSave=false,commitResolve;
 const commitRead=new Promise(resolve=>commitResolve=resolve);
 await context.addInitScript(()=>sessionStorage.setItem('ra-auth',JSON.stringify({name:'合成页面用户',role:'研究者',expires:0})));
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(owner.controller.signal.aborted||url.origin!==origin){blocked.push(request.url());await route.abort('blockedbyclient');return;}
  allowed.push(request.url());
  if(url.pathname.startsWith('/api/')){
   const record={url:request.url(),method:request.method(),headers:request.headers(),body:request.postDataJSON()};requests.push(record);
   if(dropNextSave&&url.pathname==='/api/ra/cohort/save'){
    dropNextSave=false;const real=await route.fetch();assert.equal(real.status(),200);const json=await real.json(),trace=real.headers()['x-trace-id'];
    const committed=(await owner.mysqlQuery(`SELECT COUNT(*) FROM ra_synthetic_test.ra_private_cohort_command WHERE owner_doctor_id=101 AND action='SAVE' AND request_id='${record.body.requestId}'`)).trim();assert.equal(committed,'1','SQL must prove actual commit before the response is dropped');
    assert.equal((await owner.mysqlQuery(`SELECT COUNT(*) FROM ra_synthetic_test.ra_private_cohort_definition WHERE id='${json.data.cohortId}' AND owner_doctor_id=101 AND name='Lost response'`)).trim(),'1');
    record.serverCommitted=true;responses.push({status:real.status(),trace,json,via:'real-fetch-then-drop'});proof.lost={body:record.body,json,trace,receiptCount:committed};commitResolve(proof.lost);await route.abort('failed');return;
   }
  }
  await route.continue();
 });
 const page=await context.newPage();owner.event('page-created',{pid,port});page.on('pageerror',error=>pageErrors.push(error.message));
 page.on('response',response=>{if(new URL(response.url()).pathname.startsWith('/api/'))reads.push((async()=>responses.push({status:response.status(),trace:response.headers()['x-trace-id'],json:await response.json(),via:'page'}))());});
 const perform=async(action,path,status=200)=>{const awaited=page.waitForResponse(response=>new URL(response.url()).pathname===path&&response.request().method()==='POST');await action();const response=await awaited,json=await response.json();assert.equal(response.status(),status,JSON.stringify({path,actual:response.status(),code:json.code}));return {json,trace:response.headers()['x-trace-id']};};
 const fresh=async(query='?act=target')=>{const r=await perform(()=>page.goto(origin+'/ai-cohort.html'+query),'/api/ra/ai/cohort');await expect(page.locator('#cohort-state')).toHaveAttribute('data-state',r.json.data.n===0?'empty':'success');return r.json.data;};
 const counts=async(n,total)=>{await expect(page.locator('#cohort-n')).toHaveText(String(n));await expect(page.locator('#study-total')).toHaveText(String(total));await expect(page.locator('#cohort-state')).toHaveAttribute('data-state',n===0?'empty':'success');};
 const rows=()=>page.locator('#patient-rows [data-patient-id]').evaluateAll(ns=>ns.map(n=>n.dataset.patientId));
 const list=async()=>{const r=await perform(()=>page.locator('#private-list-load').click(),'/api/ra/cohort/list');await expect(page.locator('#private-list-state')).toHaveAttribute('data-state',r.json.data.items.length?'success':'empty');return r.json.data;};
 const beginSave=async name=>{await page.locator('#save-cohort').click();await page.locator('#private-name').fill(name);await page.locator('#private-note').fill('');};
 const save=async name=>{await beginSave(name);const r=await perform(()=>page.locator('#private-save').click(),'/api/ra/cohort/save');await expect(page.locator('#private-save-state')).toHaveAttribute('data-state','success');await expect(page.locator('#private-list-state')).toHaveAttribute('data-state','success');return r;};
 const open=async()=>{const r=await perform(()=>page.locator('#private-items [data-open-cohort]').first().click(),'/api/ra/cohort/open');await counts(r.json.data.analysis.n,r.json.data.analysis.studyTotal);return r.json.data;};
 const more=async()=>{const r=await perform(()=>page.locator('#more').click(),'/api/ra/ai/cohortPatients');return r.json.data;};
 const sqlCount=async table=>Number((await owner.mysqlQuery(`SELECT COUNT(*) FROM ra_synthetic_test.${table}`)).trim());
 const definition=async cohortId=>{
  const line=(await owner.mysqlQuery(`SELECT HEX(filters_utf8),filters_sha256,owner_doctor_id,study_code FROM ra_synthetic_test.ra_private_cohort_definition WHERE id='${cohortId}'`)).trim();const [hex,hash,doctor,study]=line.split('\t'),bytes=Buffer.from(hex,'hex');assert.equal(doctor,'101');assert.equal(study,'RA');assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);const filters=JSON.parse(bytes);assert.deepEqual(Object.keys(filters).sort(),['act','age','at','cm','data','ids','sero','sex','studyCode','tx']);return {hex,hash,filters};
 };
 try{
  await fresh();await counts(37,37);assert.deepEqual(await rows(),firstIds);assert.equal(requests.filter(r=>r.url.endsWith('/list')).length,0,'new page must not automatically read private definitions');
  const before=await sqlCount('ra_ai_analysis_run'),saved=await save('  Trial  '),cohortId=saved.json.data.cohortId;
  assert.deepEqual(Object.keys(saved.json.data).sort(),['cohortId','meta','version']);assert.equal(saved.json.data.version,1);const stored=await definition(cohortId);assert.deepEqual(stored.filters,targetFilters);proof.definition={cohortId,...stored};
  const listed=await list();assert.equal(await sqlCount('ra_ai_analysis_run'),before,'save/list must not generate analyses');assert.equal(listed.total,1);assert.equal(listed.page,1);assert.equal(listed.size,20);assert.equal(listed.items[0].name,'Trial');assert.equal(listed.items[0].note,'');assert.equal(listed.items[0].currentN,null);assert.deepEqual(listed.items[0].filters,targetFilters);await expect(page.locator('#private-items')).toContainText('打开后计算');
  const opened=await open(),analysis=opened.analysis;assert.equal(opened.cohort.cohortId,cohortId);assert.deepEqual(opened.cohort.filters,targetFilters);assert.equal(analysis.n,37);assert.equal(analysis.studyTotal,37);assert.deepEqual(analysis.patients.items.map(p=>p.patientId),firstIds);assert.deepEqual(await rows(),firstIds);await expect(page.locator('#results')).toHaveAttribute('data-analysis-id',analysis.analysisId);await expect(page.locator('#target-rate')).toHaveText('100%');await expect(page.locator('#complete-rate')).toHaveText('0%');await expect(page.locator('#clinical-panels')).toBeVisible();await expect(page.locator('#numeric-computed-at')).toHaveText('数值计算时间：'+analysis.meta.computedAt);
  const middle=await more();assert.equal(middle.analysisId,analysis.analysisId);assert.deepEqual(middle.patients.items.map(p=>p.patientId),middleIds);assert.equal(requests.at(-1).body.cursor,analysis.patients.nextCursor);assert.equal(middle.patients.returnedCount,20);
  const last=await more();assert.deepEqual(last.patients.items.map(p=>p.patientId),lastIds);assert.equal(requests.at(-1).body.cursor,middle.patients.nextCursor);assert.equal(last.patients.returnedCount,7);assert.equal(last.patients.nextCursor,null);assert.deepEqual(await rows(),[...firstIds,...middleIds,...lastIds]);await expect(page.locator('#more')).toBeHidden();await expect(page.locator('#display-read-at')).toHaveText('名单显示字段读取时间：'+last.meta.displayReadCompletedAt);proof.pagination={analysisId:analysis.analysisId,first:firstIds,middle:middleIds,last:lastIds};
  // 服务器真提交后阻断本次回包：页面只见网络未知，然后原命令重放。
  await beginSave('Lost response');dropNextSave=true;await page.locator('#private-save').click();const lost=await commitRead;await expect(page.locator('#private-save-state')).toHaveAttribute('data-state','error');await expect(page.locator('#private-save-state')).toContainText('NETWORK_ERROR');await expect(page.locator('#private-save-state')).toContainText('不能确定是否已提交');await expect(page.locator('#private-retry')).toBeVisible();
  const replay=await perform(()=>page.locator('#private-retry').click(),'/api/ra/cohort/save');await expect(page.locator('#private-save-state')).toHaveAttribute('data-state','success');await expect(page.locator('#private-list-state')).toHaveAttribute('data-state','success');assert.deepEqual(replay.json.data,{...lost.json.data,meta:{traceId:replay.trace}});assert.notEqual(replay.trace,lost.trace);assert.deepEqual(requests.filter(r=>r.url.endsWith('/save')).at(-1).body,lost.body);
  assert.equal((await owner.mysqlQuery(`SELECT COUNT(*) FROM ra_synthetic_test.ra_private_cohort_command WHERE owner_doctor_id=101 AND action='SAVE' AND request_id='${lost.body.requestId}'`)).trim(),'1');assert.equal((await owner.mysqlQuery(`SELECT COUNT(*) FROM ra_synthetic_test.ra_private_cohort_definition WHERE owner_doctor_id=101 AND name='Lost response'`)).trim(),'1');assert.equal(await sqlCount('ra_private_cohort_definition'),2);proof.replay={cohortId:replay.json.data.cohortId,version:replay.json.data.version,trace:replay.trace,oneReceipt:true,oneDefinition:true};
  // 每路以真实页面动作验证anonymous；固定stdin控制不授予header身份。
  for(const action of ['open','list','save']){
   await owner.control(fixture,'IDENTITY_101');await fresh();await list();await owner.control(fixture,'IDENTITY_ANONYMOUS');
   const observations=fixture.events.filter(e=>e.type==='http-observation'),borrowed=observations.at(-1).borrowed;
   if(action==='save')await beginSave('Anonymous');
   const r=await perform(()=>action==='open'?page.locator('#private-items [data-open-cohort]').first().click():action==='list'?page.locator('#private-list-load').click():page.locator('#private-save').click(),'/api/ra/cohort/'+action,401);
   assert.equal(r.json.code,'UNAUTHENTICATED');assert.equal(r.json.data,null);await expect(page.locator('#private-items > *')).toHaveCount(0);await expect(page.locator('#private-open-meta')).toHaveText('');await expect(page.locator('#private-name')).toHaveValue('');await expect(page.locator('#login-return')).toBeVisible();await expect.poll(()=>fixture.events.filter(e=>e.type==='http-observation').length).toBe(observations.length+1);assert.equal(fixture.events.filter(e=>e.type==='http-observation').at(-1).borrowed,borrowed);
  }
  await owner.control(fixture,'IDENTITY_101');await fresh();await list();await owner.control(fixture,'IDENTITY_202');const foreign=await perform(()=>page.locator('#private-items [data-open-cohort]').first().click(),'/api/ra/cohort/open',404);assert.equal(foreign.json.code,'RESOURCE_NOT_FOUND');await expect(page.locator('#cohort-n')).toHaveText('—');const other=await list();assert.equal(other.total,0);assert.deepEqual(other.items,[]);await expect(page.locator('#private-list-state')).toHaveAttribute('data-state','empty');
  for(const path of ['compare','export']){const r=await fetch(origin+'/api/ra/cohort/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,404,'test-only proxy must not expose future private routes');}
  assert.deepEqual(await definition(cohortId),stored);
  await Promise.all(reads);assert.deepEqual(blocked,[]);assert.deepEqual(pageErrors,[]);assert.ok(requests.every(r=>r.method==='POST'&&r.headers['content-type']==='application/json;charset=UTF-8'&&!r.headers['x-doctor-id']&&!r.headers.authorization));
  for(const r of requests.filter(r=>r.url.includes('/api/ra/cohort/'))){const method=r.url.split('/').at(-1);assert.deepEqual(Object.keys(r.body).sort(),method==='save'?['filters','name','note','requestId']:method==='open'?['cohortId']:['page','size']);}
  assert.ok(responses.every(r=>r.trace));owner.report.http.push(...responses.map(r=>({...r,port,via:r.via})));proof.browserLimit='Synthetic Principal and ordinary owned SQL only; no real authentication/T4/external acceptance.';
  await writeFile(`${owner.dir}/browser-observation.json`,JSON.stringify({scenario:id,pid,identity,version:context.browser().version(),url:page.url(),requests,responses,proof,dom:await page.locator('main').innerText(),allowed,blocked,pageErrors},null,2)+'\n');
 }catch(error){owner.fail(error.message);throw error;}finally{await Promise.allSettled(reads);await writeFile(`${owner.dir}/network.json`,JSON.stringify({requests,responses,proof,allowed,blocked,pageErrors},null,2)+'\n');await page.close();}
}

// 独立p03库：仅变更本run普通合成源，重新open读取当前U/访视；不读过期旧页绕授权。
export async function dynamicPrivateBrowser(context,port,identity,owner,probe,pid,id,fixture){
 const origin=`http://127.0.0.1:${port}`,requests=[],responses=[],reads=[],allowed=[],blocked=[],pageErrors=[],steps=[];
 await context.addInitScript(()=>sessionStorage.setItem('ra-auth',JSON.stringify({name:'合成页面用户',role:'研究者',expires:0})));
 await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(owner.controller.signal.aborted||url.origin!==origin){blocked.push(request.url());return route.abort('blockedbyclient');}allowed.push(request.url());if(url.pathname.startsWith('/api/'))requests.push({url:request.url(),method:request.method(),headers:request.headers(),body:request.postDataJSON()});return route.continue();});
 const page=await context.newPage();owner.event('page-created',{pid,port});page.on('pageerror',error=>pageErrors.push(error.message));
 page.on('response',response=>{if(new URL(response.url()).pathname.startsWith('/api/'))reads.push((async()=>responses.push({status:response.status(),trace:response.headers()['x-trace-id'],json:await response.json()}))());});
 const perform=async(action,path)=>{const awaited=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='POST');await action();const response=await awaited;assert.equal(response.status(),200);return (await response.json()).data;};
 const navigate=query=>perform(()=>page.goto(origin+'/ai-cohort.html'+query),'/api/ra/ai/cohort');
 const counts=async(n,total)=>{await expect(page.locator('#cohort-n')).toHaveText(String(n));await expect(page.locator('#study-total')).toHaveText(String(total));await expect(page.locator('#cohort-state')).toHaveAttribute('data-state',n===0?'empty':'success');};
 const save=async name=>{await page.locator('#save-cohort').click();await page.locator('#private-name').fill(name);await page.locator('#private-note').fill('');const saved=await perform(()=>page.locator('#private-save').click(),'/api/ra/cohort/save');await expect(page.locator('#private-save-state')).toHaveAttribute('data-state','success');await expect(page.locator('#private-list-state')).toHaveAttribute('data-state','success');return saved.cohortId;};
 const definition=cohortId=>owner.mysqlQuery(`SELECT HEX(filters_utf8),filters_sha256 FROM ra_synthetic_test.ra_private_cohort_definition WHERE id='${cohortId}' AND owner_doctor_id=101`);
 const retained=analysisId=>owner.mysqlQuery(`SELECT HEX(payload),payload_sha256 FROM ra_synthetic_test.ra_ai_analysis_run WHERE id='${analysisId}' AND owner_doctor_id=101`);
 const allIds=[...firstIds,...middleIds,...lastIds],seenIds=new Set();let originalDefinition,originalRetained,originalAnalysisId,definitionId;
 const openAll=async(cohortId,n,total,expected,label)=>{
  const data=await perform(()=>page.locator(`#private-items [data-open-cohort="${cohortId}"]`).click(),'/api/ra/cohort/open'),analysis=data.analysis;
  assert.equal(data.cohort.cohortId,cohortId);assert.equal(data.cohort.currentN,null);assert.equal(analysis.n,n);assert.equal(analysis.studyTotal,total);await counts(n,total);assert.ok(!seenIds.has(analysis.analysisId),'every open must create a new analysisId');seenIds.add(analysis.analysisId);const patients=[...analysis.patients.items];let cursor=analysis.patients.nextCursor;
  assert.deepEqual(analysis.patients.items.map(p=>p.patientId),expected.slice(0,10));
  while(cursor){const previous=cursor,pageData=await perform(()=>page.locator('#more').click(),'/api/ra/ai/cohortPatients');assert.equal(pageData.analysisId,analysis.analysisId);assert.equal(requests.at(-1).body.cursor,previous);assert.equal(pageData.patients.total,n);patients.push(...pageData.patients.items);cursor=pageData.patients.nextCursor;}
  assert.deepEqual(patients.map(p=>p.patientId),expected);assert.ok(patients.every(p=>typeof p.patientId==='string'&&p.das28At===1));assert.deepEqual(await page.locator('#patient-rows [data-patient-id]').evaluateAll(ns=>ns.map(node=>node.dataset.patientId)),expected);await expect(page.locator('#more')).toBeHidden();await expect(page.locator('#export')).toBeEnabled();const exportRequests=requests.length;await page.locator('#export').click();await expect(page.locator('#export-dialog')).toBeVisible();assert.equal(requests.length,exportRequests);await page.locator('#export-cancel').click();
  if(n){await expect(page.locator('#target-rate')).toHaveText('100%');await expect(page.locator('#clinical-panels')).toBeVisible();await expect(page.locator('#numeric-computed-at')).toHaveText('数值计算时间：'+analysis.meta.computedAt);}
  if(originalDefinition)assert.equal(await definition(definitionId),originalDefinition,'saved condition bytes/hash must never track members');
  if(originalAnalysisId!==undefined&&originalRetained!==undefined)assert.equal(await retained(originalAnalysisId),originalRetained,'old retained numerical payload must remain unchanged after dynamic opens');
  steps.push({label,n,total,analysisId:analysis.analysisId,patientIds:expected,definitionBytesUnchanged:Boolean(originalDefinition),retainedPayloadUnchanged:Boolean(originalRetained)});return {data,patients};
 };
 try{
  await navigate('?act=target');await counts(37,37);definitionId=await save('Dynamic target');originalDefinition=await definition(definitionId);const filtersBytes=Buffer.from(originalDefinition.trim().split('\t')[0],'hex'),filtersHash=originalDefinition.trim().split('\t')[1];assert.equal(createHash('sha256').update(filtersBytes).digest('hex'),filtersHash);assert.deepEqual(JSON.parse(filtersBytes),targetFilters);
  const initial=await openAll(definitionId,37,37,allIds,'initial target');originalAnalysisId=initial.data.analysis.analysisId;originalRetained=await retained(originalAnalysisId);assert.ok(originalRetained.trim().length>64);assert.ok(initial.patients.some(p=>p.patientId==='11'&&p.scoreProvenance.sourceVisitId==='1011'));assert.ok(initial.patients.some(p=>p.patientId==='12'&&p.scoreProvenance.sourceVisitId==='1012'));
  await owner.mysqlQuery("UPDATE ra_synthetic_test.patient_follow_up_history SET bqpg='{\"result\":{\"crpScore\":4.5}}' WHERE id=1011 AND patient_basic_info_id=11");const changed11=JSON.parse((await owner.mysqlQuery('SELECT bqpg FROM ra_synthetic_test.patient_follow_up_history WHERE id=1011 AND patient_basic_info_id=11')).trim());assert.equal(changed11.result.crpScore,4.5);
  await openAll(definitionId,36,37,allIds.filter(id=>id!=='11'),'11 score 4.5');
  await owner.mysqlQuery("INSERT INTO ra_synthetic_test.patient_follow_up_history(id,patient_basic_info_id,research_type,follow_up_date,bqpg) VALUES(2012,12,0,'2026-10-07','{\"result\":{\"crpScore\":4.5}}')");const visit=(await owner.mysqlQuery('SELECT id,DATE(follow_up_date),bqpg FROM ra_synthetic_test.patient_follow_up_history WHERE patient_basic_info_id=12 ORDER BY id DESC LIMIT 1')).trim().split('\t');assert.equal(visit[0],'2012');assert.equal(visit[1],'2026-10-07');assert.equal(JSON.parse(visit[2]).result.crpScore,4.5);
  await openAll(definitionId,35,37,allIds.filter(id=>!['11','12'].includes(id)),'12 newer same-day visit 2012');
  await owner.mysqlQuery('DELETE FROM ra_synthetic_test.patient_follow_up_history WHERE id=2012 AND patient_basic_info_id=12');assert.equal((await owner.mysqlQuery('SELECT COUNT(*) FROM ra_synthetic_test.patient_follow_up_history WHERE id=2012')).trim(),'0');const restored=await openAll(definitionId,36,37,allIds.filter(id=>id!=='11'),'delete 2012 restores 12');const patient12=restored.patients.find(p=>p.patientId==='12');assert.equal(patient12.das28At,1);assert.equal(patient12.scoreProvenance.sourceVisitId,'1012');
  await owner.mysqlQuery('DELETE FROM ra_synthetic_test.patient_basic_info WHERE id=13');assert.equal((await owner.mysqlQuery('SELECT COUNT(*) FROM ra_synthetic_test.patient_basic_info WHERE id=13')).trim(),'0');await openAll(definitionId,35,36,allIds.filter(id=>!['11','13'].includes(id)),'physical patient 13 deletion');
  await owner.mysqlQuery('DELETE FROM ra_synthetic_test.patient_relation_doctor WHERE doctor_id=101 AND patient_id=14');assert.equal((await owner.mysqlQuery('SELECT COUNT(*) FROM ra_synthetic_test.patient_relation_doctor WHERE doctor_id=101 AND patient_id=14')).trim(),'0');await openAll(definitionId,34,35,allIds.filter(id=>!['11','13','14'].includes(id)),'revoke 101 to 14');
  await navigate('?act=target&ids=11,14,9223372036854775807,999');await counts(1,35);const explicitId=await save('Explicit IDs'),submitted=requests.filter(r=>r.url.endsWith('/save')).at(-1).body.filters.ids;assert.deepEqual(submitted,['11','14',MAX,'999']);assert.ok(submitted.every(id=>typeof id==='string'));const restricted=await openAll(explicitId,1,35,[MAX],'explicit IDs intersect current U');assert.deepEqual(restricted.data.cohort.filters.ids,['11','14','999',MAX]);assert.equal(new URL(page.url()).searchParams.get('ids'),'11,14,999,'+MAX);
  await navigate('?act=target&ids=');await counts(0,35);const emptyId=await save('Explicit empty'),empty=await openAll(emptyId,0,35,[],'ids [] remains empty');assert.deepEqual(requests.filter(r=>r.url.endsWith('/save')).at(-1).body.filters.ids,[]);assert.deepEqual(empty.data.cohort.filters.ids,[]);assert.equal(new URL(page.url()).searchParams.get('ids'),'');await expect(page.locator('#no-result')).toBeVisible();
  const unlimited=await openAll(definitionId,34,35,allIds.filter(id=>!['11','13','14'].includes(id)),'omitted IDs remains unrestricted');assert.equal(unlimited.data.cohort.filters.ids,null);assert.equal(new URL(page.url()).searchParams.has('ids'),false);assert.equal(await definition(definitionId),originalDefinition);assert.equal(await retained(originalAnalysisId),originalRetained);
  await Promise.all(reads);assert.deepEqual(blocked,[]);assert.deepEqual(pageErrors,[]);assert.ok(responses.every(r=>r.status===200&&r.trace&&r.json.success===true));assert.ok(requests.every(r=>r.method==='POST'&&!r.headers['x-doctor-id']&&!r.headers.authorization));
  owner.report.http.push(...responses.map(r=>({...r,port,via:'page'})));await writeFile(`${owner.dir}/browser-observation.json`,JSON.stringify({scenario:id,pid,identity,version:context.browser().version(),url:page.url(),requests,responses,steps,definitionId,originalAnalysisId,definitionHash:filtersHash,oldPayloadHash:originalRetained.trim().split('\t')[1],dom:await page.locator('main').innerText(),allowed,blocked,pageErrors},null,2)+'\n');
 }catch(error){owner.fail(error.message);throw error;}finally{await Promise.allSettled(reads);await writeFile(`${owner.dir}/network.json`,JSON.stringify({requests,responses,steps,allowed,blocked,pageErrors},null,2)+'\n');await page.close();}
}


// 草案只使用真实页面、原owner及普通p03数据库。协议对手单独记录，不能当成UI请求。
export async function commandsPrivateBrowser(context,port,identity,owner,probe,pid,id,fixture){
 const expectedCase='cohort:browser-private-commands';
 assert.equal(id,expectedCase);assert.equal(identity,'synthetic');assert.ok(fixture);
 const started=Date.now(),origin=`http://127.0.0.1:${port}`;
 const filters={studyCode:'RA',at:'now',act:'target',ids:null,sex:null,age:null,sero:null,cm:null,tx:null,data:null};
 const uiRequests=[],uiResponses=[],protocolStimuli=[],reads=[],allowed=[],blocked=[],pageErrors=[],routeErrors=[],steps=[],pages=[];
 const active=target=>target.bringToFront();
 const proof={scope:'Synthetic Principal and ordinary owned p03 SQL; no real authentication/T4/external acceptance.'};
 let drop=null;
 const path=action=>'/api/ra/cohort/'+action;
 const requestsFor=action=>uiRequests.filter(request=>new URL(request.url).pathname===path(action));
 const responseValue=async(response,expectedStatus)=>{
  const json=await response.json(),trace=response.headers()['x-trace-id'],status=response.status();
  assert.equal(status,expectedStatus,JSON.stringify({status,code:json.code}));assert.ok(trace);
  assert.equal(json.success,expectedStatus===200);assert.equal(typeof json.code,'string');
  if(expectedStatus===200)assert.equal(json.code,'200');else assert.notEqual(json.code,'200');
  if(expectedStatus===200)assert.equal(json.data.meta.traceId,trace);else assert.equal(json.data,null);
  return {status,trace,json};
 };
 const state=async(cohortId)=>{
  assert.match(cohortId,/^[0-9a-f]{8}-[0-9a-f-]{27}$/);
  const raw=(await owner.mysqlQuery(`SELECT HEX(name),IF(note IS NULL,'NULL',HEX(note)),version,IF(deleted_at_ms IS NULL,0,1),HEX(filters_utf8),filters_sha256,owner_doctor_id,study_code FROM ra_synthetic_test.ra_private_cohort_definition WHERE id='${cohortId}'`)).trim();
  assert.ok(raw,'definition must exist in owned SQL');
  const [nameHex,noteHex,version,deleted,hex,hash,doctor,study]=raw.split('\t');
  const bytes=Buffer.from(hex,'hex');assert.equal(doctor,'101');assert.equal(study,'RA');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);assert.deepEqual(JSON.parse(bytes),filters);
  return {cohortId,name:Buffer.from(nameHex,'hex').toString('utf8'),note:noteHex==='NULL'?null:Buffer.from(noteHex,'hex').toString('utf8'),version:Number(version),deleted:deleted==='1',hex,hash};
 };
 const receipt=async(action,body,result)=>{
  assert.match(body.requestId,/^[0-9a-f]{8}-[0-9a-f-]{27}$/);
  const raw=(await owner.mysqlQuery(`SELECT COUNT(*),MIN(cohort_id),MIN(result_version),MIN(trace_id) FROM ra_synthetic_test.ra_private_cohort_command WHERE owner_doctor_id=101 AND action='${action.toUpperCase()}' AND request_id='${body.requestId}'`)).trim();
  const [count,cohortId,version,firstTrace]=raw.split('\t');assert.equal(count,'1');
  assert.equal(cohortId,result.json.data.cohortId);assert.equal(Number(version),result.json.data.version);assert.ok(firstTrace);
  return {count:1,cohortId,version:Number(version),firstTrace};
 };
 await context.addInitScript(()=>sessionStorage.setItem('ra-auth',JSON.stringify({name:'合成页面用户',role:'研究者',expires:0})));
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(owner.controller.signal.aborted||url.origin!==origin){blocked.push(request.url());await route.abort('blockedbyclient');return;}
  allowed.push(request.url());
  if(!url.pathname.startsWith('/api/')){await route.continue();return;}
  const record={via:'ui',page:pages.indexOf(request.frame().page()),url:request.url(),method:request.method(),headers:request.headers(),body:request.postDataJSON()};uiRequests.push(record);
  if(!drop||url.pathname!==path(drop.action)||record.page!==drop.page){await route.continue();return;}
  const cut=drop;drop=null;
  try{
   // 所有成功来自真实Servlet；SQL先证commit，再让页面失去原回包。绝不fulfill假成功。
   const real=await route.fetch(),result=await responseValue(real,200),persisted=await state(cut.cohortId),storedReceipt=await receipt(cut.action,record.body,result);
   assert.equal(result.json.data.cohortId,cut.cohortId);assert.equal(result.json.data.version,cut.version);
   assert.equal(persisted.version,cut.version);assert.equal(persisted.deleted,cut.action==='delete');assert.equal(storedReceipt.firstTrace,result.trace);
   record.serverCommitted=true;
   const committed={action:cut.action,body:record.body,...result,persisted,receipt:storedReceipt,via:'real-fetch-SQL-commit-then-drop'};
   uiResponses.push(committed);cut.resolve(committed);await route.abort('failed');
  }catch(error){routeErrors.push(error.message);cut.reject(error);owner.fail(error.message);await route.abort('failed').catch(()=>{});}
 });
 const page=async label=>{
  const result=await context.newPage();result.setDefaultTimeout(5000);pages.push(result);owner.event('page-created',{pid,port,label});
  result.on('pageerror',error=>pageErrors.push({label,error:error.message}));
  result.on('response',response=>{if(new URL(response.url()).pathname.startsWith('/api/'))reads.push((async()=>{
   try{uiResponses.push({via:'page',page:label,url:response.url(),body:response.request().postDataJSON(),status:response.status(),trace:response.headers()['x-trace-id'],json:await response.json()});}
   catch(error){routeErrors.push('page-response:'+error.message);}
  })());});
  return result;
 };
 const perform=async(target,action,url,status=200)=>{
  await active(target);
  const pending=target.waitForResponse(response=>new URL(response.url()).pathname===url&&response.request().method()==='POST',{timeout:5000});pending.catch(()=>{});
  await action();const response=await pending;return {...await responseValue(response,status),body:response.request().postDataJSON()};
 };
 const listPending=target=>{const pending=target.waitForResponse(response=>new URL(response.url()).pathname===path('list')&&response.request().method()==='POST',{timeout:5000});pending.catch(()=>{});return pending;};
 const listRendered=async(target,pending)=>{
  const result=await responseValue(await pending,200),data=result.json.data;
  await expect(target.locator('#private-list-state')).toHaveAttribute('data-state',data.items.length?'success':'empty');
  await expect(target.locator('#private-items [data-open-cohort]')).toHaveCount(data.items.length);
  for(const item of data.items){assert.equal(item.currentN,null);assert.deepEqual(item.filters,filters);}
  return result;
 };
 const list=async target=>{await active(target);const pending=listPending(target);await target.locator('#private-list-load').click({timeout:5000});return listRendered(target,pending);};
 const fresh=async target=>{
  const result=await perform(target,()=>target.goto(origin+'/ai-cohort.html?act=target'),'/api/ra/ai/cohort');
  assert.equal(result.json.data.n,37);assert.equal(result.json.data.studyTotal,37);
  await expect(target.locator('#cohort-n')).toHaveText('37');await expect(target.locator('#study-total')).toHaveText('37');
  await expect(target.locator('#cohort-state')).toHaveAttribute('data-state','success');
  assert.deepEqual(await target.locator('#patient-rows [data-patient-id]').evaluateAll(rows=>rows.map(row=>row.dataset.patientId)),['1','2','3','4','5','6','7','8','9','10']);
  return result;
 };
 const save=async(target,name,note)=>{
  await active(target);
  await target.locator('#save-cohort').click();await target.locator('#private-name').fill(name);await target.locator('#private-note').fill(note);
  const pending=listPending(target),result=await perform(target,()=>target.locator('#private-save').click(),path('save'));
  await expect(target.locator('#private-save-state')).toHaveAttribute('data-state','success');await listRendered(target,pending);
  assert.equal(result.json.data.version,1);assert.deepEqual(Object.keys(result.body).sort(),['filters','name','note','requestId']);
  return result;
 };
 const edit=async(target,cohortId,action='rename')=>{
  await active(target);
  await target.locator(`#private-items [data-${action==='rename'?'edit':'delete'}-cohort="${cohortId}"]`).click();
  await expect(target.locator('#private-command-dialog')).toBeVisible();await expect(target.locator('#private-command-target')).toContainText('条件');
  await expect(target.locator('#private-command-target')).toContainText('target');
 };
 const confirm=async(target,action,status=200,retry=false)=>{
  const pending=status===200?listPending(target):null;
  const result=await perform(target,()=>target.locator(retry?'#private-command-retry':'#private-command-confirm').click(),path(action),status);
  if(pending){result.list=await listRendered(target,pending);await expect(target.locator('#private-command-dialog')).toBeHidden();await expect(target.locator('#private-command-state')).toHaveAttribute('data-state','success');}
  else{await expect(target.locator('#private-command-state')).toHaveAttribute('data-state','error');await expect(target.locator('#private-command-state')).toContainText(result.json.code);await expect(target.locator('#private-command-state')).toContainText(result.trace);}
  return result;
 };
 const armDrop=(target,action,cohortId,version)=>{
  assert.equal(drop,null);let resolve,reject;const committed=new Promise((yes,no)=>{resolve=yes;reject=no;});
  drop={page:pages.indexOf(target),action,cohortId,version,resolve,reject};return committed;
 };
 const immutable=(current,initial)=>{assert.equal(current.hex,initial.hex);assert.equal(current.hash,initial.hash);};
 const checked=async(cohortId,initial,name,note,version,deleted=false)=>{
  const result=await state(cohortId);immutable(result,initial);assert.equal(result.name,name);assert.equal(result.note,note);assert.equal(result.version,version);assert.equal(result.deleted,deleted);return result;
 };
 const listedItem=(result,cohortId)=>{const item=result.json.data.items.find(item=>item.cohortId===cohortId);assert.ok(item);return item;};
 const protocol=async(label,action,body,status,code)=>{
  // 明确协议对手：只用于历史回执、新delete键或同键异参/已删资源，不形成正常UI命令。
  const response=await context.request.post(origin+path(action),{data:body,headers:{'Content-Type':'application/json;charset=UTF-8'},timeout:5000}),result=await responseValue(response,status);
  if(code)assert.equal(result.json.code,code);
  protocolStimuli.push({label,via:'protocol-adversary',action,url:origin+path(action),body,...result});return result;
 };
 const noTarget=async(target,cohortId)=>{await expect(target.locator(`#private-items [data-open-cohort="${cohortId}"],#private-items [data-edit-cohort="${cohortId}"],#private-items [data-delete-cohort="${cohortId}"]`)).toHaveCount(0);};
 const analysisCount=async()=>Number((await owner.mysqlQuery('SELECT COUNT(*) FROM ra_synthetic_test.ra_ai_analysis_run')).trim());
 const observeCount=()=>fixture.events.filter(event=>event.type==='http-observation').length;
 const anonymousCommand=async(target,action,cohortId)=>{
  await owner.control(fixture,'IDENTITY_101');await fresh(target);await list(target);await edit(target,cohortId,action);
  if(action==='rename')await target.locator('#private-edit-name').fill('Anonymous edit');
  const beforeCount=observeCount(),borrowed=fixture.events.filter(event=>event.type==='http-observation').at(-1).borrowed;
  await owner.control(fixture,'IDENTITY_ANONYMOUS');
  // 401清身份会关闭dialog，故这里不要求普通错误保留dialog/state。
  const result=await perform(target,()=>target.locator('#private-command-confirm').click(),path(action),401);assert.equal(result.json.code,'UNAUTHENTICATED');
  await expect(target.locator('#private-items > *')).toHaveCount(0);await expect(target.locator('#private-command-dialog')).toBeHidden();await expect(target.locator('#login-return')).toBeVisible();
  await expect.poll(observeCount,{timeout:5000}).toBe(beforeCount+1);
  const after=fixture.events.filter(event=>event.type==='http-observation').at(-1);assert.equal(after.borrowed,borrowed);assert.equal(after.returned,borrowed);assert.equal(after.active,0);
  steps.push({label:'anonymous-'+action,body:result.body,status:401,trace:result.trace,businessBorrowDelta:after.borrowed-borrowed});
 };
 try{
  const a=await page('A'),b=await page('B');await fresh(a);await fresh(b);
  const beforeMetadataAnalyses=await analysisCount();
  const saved=await save(a,'Trial','  原备注  '),cohortId=saved.json.data.cohortId,other=await save(a,'Other','其它备注'),otherId=other.json.data.cohortId;
  const initial=await state(cohortId),otherInitial=await state(otherId);assert.equal(initial.version,1);assert.equal(initial.note,'  原备注  ');
  const listA=await list(a),listB=await list(b);assert.equal(listA.json.data.total,2);assert.equal(listB.json.data.total,2);
  assert.equal(listedItem(listA,cohortId).version,1);assert.equal(listedItem(listB,cohortId).version,1);
  await edit(a,cohortId);await edit(b,cohortId);
  await active(a);await a.locator('#private-edit-name').fill('Trial2');const renamed=await confirm(a,'rename');assert.equal(renamed.body.version,1);assert.equal(renamed.json.data.version,2);assert.equal(Object.hasOwn(renamed.body,'note'),false);assert.equal(listedItem(renamed.list,cohortId).note,'  原备注  ');assert.equal(listedItem(renamed.list,cohortId).name,'Trial2');
  steps.push({label:'name-only-omits-note',body:renamed.body,...await checked(cohortId,initial,'Trial2','  原备注  ',2)});
  await active(b);await b.locator('#private-edit-name').fill('Stale edit');const renameCount=requestsFor('rename').length,stale=await confirm(b,'rename',409);
  assert.equal(stale.json.code,'VERSION_CONFLICT');assert.equal(stale.body.cohortId,cohortId);assert.equal(stale.body.version,1);assert.equal(requestsFor('rename').length,renameCount+1);await expect(b.locator('#private-edit-name')).toHaveValue('Stale edit');await expect(b.locator('#private-version-refresh')).toBeVisible();await expect(b.locator('#private-command-retry')).toBeHidden();
  await checked(cohortId,initial,'Trial2','  原备注  ',2);
  const refreshed=listPending(b);await b.locator('#private-version-refresh').click();const newList=await listRendered(b,refreshed);assert.equal(listedItem(newList,cohortId).version,2);await expect(b.locator('#private-edit-name')).toHaveValue('Stale edit');
  const accepted=await confirm(b,'rename');assert.equal(accepted.body.version,2);assert.notEqual(accepted.body.requestId,stale.body.requestId);assert.equal(accepted.json.data.version,3);await checked(cohortId,initial,'Stale edit','  原备注  ',3);
  steps.push({label:'two-real-pages-same-v1-stale-409-explicit-refresh',first:renamed,stale,accepted});
  await edit(b,cohortId);await b.locator('#private-edit-name').fill('Other');const nameCount=requestsFor('rename').length,conflict=await confirm(b,'rename',409);
  assert.equal(conflict.json.code,'NAME_CONFLICT');assert.equal(conflict.body.version,3);assert.equal(requestsFor('rename').length,nameCount+1);await expect(b.locator('#private-edit-name')).toHaveValue('Other');await expect(b.locator('#private-command-retry')).toBeHidden();await checked(cohortId,initial,'Stale edit','  原备注  ',3);
  await b.locator('#private-edit-name').fill('Trial3');const changed=await confirm(b,'rename');assert.notEqual(changed.body.requestId,conflict.body.requestId);assert.equal(changed.json.data.version,4);await checked(cohortId,initial,'Trial3','  原备注  ',4);
  await edit(b,cohortId);await b.locator('#private-edit-note-mode').selectOption('clear');const cleared=await confirm(b,'rename');assert.equal(cleared.body.note,null);assert.equal(Object.hasOwn(cleared.body,'name'),false);assert.equal(cleared.json.data.version,5);await checked(cohortId,initial,'Trial3',null,5);assert.equal(listedItem(cleared.list,cohortId).note,null);
  await edit(b,cohortId);await b.locator('#private-edit-note').fill('');await b.locator('#private-edit-note-mode').selectOption('value');const empty=await confirm(b,'rename');assert.equal(empty.body.note,'');assert.equal(Object.hasOwn(empty.body,'name'),false);assert.equal(empty.json.data.version,6);await checked(cohortId,initial,'Trial3','',6);assert.equal(listedItem(empty.list,cohortId).note,'');
  steps.push({label:'note-preserve-null-empty-SQL-and-list',preserved:initial.note,clear:cleared,empty});
  await edit(b,cohortId);await b.locator('#private-edit-name').fill('Lost metadata');const renameCommit=armDrop(b,'rename',cohortId,7);await b.locator('#private-command-confirm').click();const lostRename=await renameCommit;
  await expect(b.locator('#private-command-state')).toHaveAttribute('data-state','error');await expect(b.locator('#private-command-state')).toContainText('NETWORK_ERROR');await expect(b.locator('#private-command-state')).toContainText('不能确定是否已提交');await expect(b.locator('#private-command-retry')).toBeVisible();
  await checked(cohortId,initial,'Lost metadata','',7);
  // B页暂不重试：让A页真实删除后再用B页的原命令接收历史rename回执。
  await protocol('rename-same-key-omitted-note-versus-null','rename',{...lostRename.body,note:null},409,'IDEMPOTENCY_CONFLICT');await checked(cohortId,initial,'Lost metadata','',7);
  assert.equal(await analysisCount(),beforeMetadataAnalyses,'save/list/rename must not analyze or open');
  await list(a);const opened=await perform(a,()=>a.locator(`#private-items [data-open-cohort="${cohortId}"]`).click(),path('open'));assert.equal(opened.json.data.cohort.version,7);assert.equal(opened.json.data.analysis.n,37);assert.equal(opened.json.data.analysis.studyTotal,37);
  const analysisId=opened.json.data.analysis.analysisId;await expect(a.locator('#results')).toHaveAttribute('data-analysis-id',analysisId);await expect(a.locator('#cohort-n')).toHaveText('37');
  const retainedSql=`SELECT HEX(payload),payload_sha256 FROM ra_synthetic_test.ra_ai_analysis_run WHERE id='${analysisId}' AND owner_doctor_id=101`,retained=await owner.mysqlQuery(retainedSql),beforeDeleteAnalyses=await analysisCount();
  await edit(a,cohortId,'delete');await expect(a.locator('#private-command-target')).toContainText('Lost metadata');const deletesBeforeCancel=requestsFor('delete').length;await a.locator('#private-command-cancel').click();await expect(a.locator('#private-command-dialog')).toBeHidden();assert.equal(requestsFor('delete').length,deletesBeforeCancel);await checked(cohortId,initial,'Lost metadata','',7);
  await edit(a,cohortId,'delete');const deleteCommit=armDrop(a,'delete',cohortId,8);await a.locator('#private-command-confirm').click();const lostDelete=await deleteCommit;
  await expect(a.locator('#private-command-state')).toHaveAttribute('data-state','error');await expect(a.locator('#private-command-state')).toContainText('NETWORK_ERROR');await expect(a.locator('#private-command-retry')).toBeVisible();
  assert.deepEqual(Object.keys(lostDelete.body).sort(),['cohortId','requestId','version']);assert.equal(lostDelete.body.version,7);immutable(lostDelete.persisted,initial);
  const deleteReplay=await confirm(a,'delete',200,true);assert.deepEqual(deleteReplay.body,lostDelete.body);assert.equal(deleteReplay.json.data.version,8);assert.notEqual(deleteReplay.trace,lostDelete.trace);assert.deepEqual(deleteReplay.json.data,{...lostDelete.json.data,meta:{traceId:deleteReplay.trace}});assert.equal((await receipt('delete',deleteReplay.body,deleteReplay)).firstTrace,lostDelete.trace);
  await noTarget(a,cohortId);await checked(cohortId,initial,'Lost metadata','',8,true);await expect(a.locator('#results')).toHaveAttribute('data-analysis-id',analysisId);await expect(a.locator('#cohort-n')).toHaveText('37');await expect(a.locator('#private-open-meta')).toContainText('已删除');assert.equal(await owner.mysqlQuery(retainedSql),retained);assert.equal(await analysisCount(),beforeDeleteAnalyses);
  steps.push({label:'delete-highest-loss-SQL-commit-before-drop-original-UI-retry-no-revival',lost:lostDelete,replay:deleteReplay,retainedAnalysisId:analysisId});
  const renameReplay=await confirm(b,'rename',200,true);assert.deepEqual(renameReplay.body,lostRename.body);assert.equal(renameReplay.json.data.version,7);assert.notEqual(renameReplay.trace,lostRename.trace);assert.deepEqual(renameReplay.json.data,{...lostRename.json.data,meta:{traceId:renameReplay.trace}});assert.equal((await receipt('rename',renameReplay.body,renameReplay)).firstTrace,lostRename.trace);
  await noTarget(a,cohortId);await noTarget(b,cohortId);await checked(cohortId,initial,'Lost metadata','',8,true);assert.equal(await analysisCount(),beforeDeleteAnalyses);
  steps.push({label:'rename-real-commit-drop-delete-then-original-UI-historical-retry-no-revival',lost:lostRename,replay:renameReplay,currentDeletedVersion:8});
  const deletedAgain=await protocol('deleted-new-legal-key-old-version','delete',{cohortId,version:1,requestId:randomUUID()},200);assert.equal(deletedAgain.json.data.version,8);await receipt('delete',protocolStimuli.at(-1).body,deletedAgain);
  await protocol('delete-same-key-different-version','delete',{...lostDelete.body,version:1},409,'IDEMPOTENCY_CONFLICT');
  await protocol('deleted-open-404','open',{cohortId},404,'RESOURCE_NOT_FOUND');await protocol('deleted-rename-404','rename',{cohortId,version:7,name:'Cannot revive',requestId:randomUUID()},404,'RESOURCE_NOT_FOUND');
  const oldSave=await protocol('historical-save-receipt-after-delete','save',saved.body,200);assert.equal(oldSave.json.data.cohortId,cohortId);assert.equal(oldSave.json.data.version,1);assert.notEqual(oldSave.trace,saved.trace);assert.equal((await receipt('save',saved.body,oldSave)).firstTrace,saved.trace);
  const oldRename=await protocol('historical-rename-receipt-after-delete','rename',renamed.body,200);assert.equal(oldRename.json.data.cohortId,cohortId);assert.equal(oldRename.json.data.version,2);assert.notEqual(oldRename.trace,renamed.trace);assert.equal((await receipt('rename',renamed.body,oldRename)).firstTrace,renamed.trace);
  await checked(cohortId,initial,'Lost metadata','',8,true);const afterHistory=await list(a);assert.equal(afterHistory.json.data.total,1);assert.equal(afterHistory.json.data.items[0].cohortId,otherId);await noTarget(a,cohortId);
  const recreated=await save(a,'Lost metadata','新定义'),newId=recreated.json.data.cohortId;assert.notEqual(newId,cohortId);await noTarget(a,cohortId);await checked(newId,initial,'Lost metadata','新定义',1);await checked(cohortId,initial,'Lost metadata','',8,true);await checked(otherId,otherInitial,'Other','其它备注',1);
  assert.equal((await owner.mysqlQuery('SELECT COUNT(*) FROM ra_synthetic_test.ra_private_cohort_definition')).trim(),'3');
  const afterRecreate=await list(a);assert.equal(afterRecreate.json.data.total,2);assert.equal(listedItem(afterRecreate,newId).version,1);assert.ok(!afterRecreate.json.data.items.some(item=>item.cohortId===cohortId));
  steps.push({label:'historical-receipts-not-current-state-active-name-new-id',deletedAgain,oldSave,oldRename,oldId:cohortId,newId});
  // 202针对仍活动的新id，不能用本来已删的id冒充owner隔离证据。
  await owner.control(fixture,'IDENTITY_202');const foreignOpen=await perform(a,()=>a.locator(`#private-items [data-open-cohort="${newId}"]`).click(),path('open'),404);assert.equal(foreignOpen.json.code,'RESOURCE_NOT_FOUND');
  await edit(a,newId);await a.locator('#private-edit-name').fill('Foreign edit');const foreignRename=await confirm(a,'rename',404);assert.equal(foreignRename.json.code,'RESOURCE_NOT_FOUND');await a.locator('#private-command-cancel').click();
  await owner.control(fixture,'IDENTITY_101');await list(a);await edit(a,newId,'delete');await owner.control(fixture,'IDENTITY_202');const foreignDelete=await confirm(a,'delete',404);assert.equal(foreignDelete.json.code,'RESOURCE_NOT_FOUND');const foreignList=await list(a);assert.equal(foreignList.json.data.total,0);assert.deepEqual(foreignList.json.data.items,[]);await checked(newId,initial,'Lost metadata','新定义',1);
  steps.push({label:'trusted-202-active-id-open-rename-delete-404-list-empty',cohortId:newId,open:foreignOpen,rename:foreignRename,delete:foreignDelete});
  await anonymousCommand(a,'rename',newId);await anonymousCommand(a,'delete',newId);await owner.control(fixture,'IDENTITY_101');await checked(newId,initial,'Lost metadata','新定义',1);await checked(cohortId,initial,'Lost metadata','',8,true);
  assert.equal(requestsFor('save').length,3);assert.equal(requestsFor('rename').length,11);assert.equal(requestsFor('delete').length,4);assert.equal(requestsFor('open').length,2);
  for(const request of uiRequests){assert.equal(request.method,'POST');assert.equal(request.headers['content-type'],'application/json;charset=UTF-8');assert.ok(!request.headers['x-doctor-id']&&!request.headers.authorization);}
  for(const request of uiRequests.filter(request=>new URL(request.url).pathname.startsWith('/api/ra/cohort/'))){
   const action=new URL(request.url).pathname.split('/').at(-1),keys=Object.keys(request.body).sort();
   if(action==='save')assert.deepEqual(keys,['filters','name','note','requestId']);
   else if(action==='list')assert.deepEqual(keys,['page','size']);
   else if(action==='open')assert.deepEqual(keys,['cohortId']);
   else if(action==='delete'){assert.deepEqual(keys,['cohortId','requestId','version']);assert.ok(Number.isSafeInteger(request.body.version)&&request.body.version>0);}
   else{assert.equal(action,'rename');assert.ok(Object.hasOwn(request.body,'name')||Object.hasOwn(request.body,'note'));assert.deepEqual(keys,['cohortId','requestId','version',...(Object.hasOwn(request.body,'name')?['name']:[]),...(Object.hasOwn(request.body,'note')?['note']:[])].sort());assert.ok(Number.isSafeInteger(request.body.version)&&request.body.version>0);assert.equal(Object.hasOwn(request.body,'filters'),false);}
  }
  await Promise.all(reads);assert.deepEqual(blocked,[]);assert.deepEqual(pageErrors,[]);assert.deepEqual(routeErrors,[]);assert.ok(uiResponses.every(response=>response.trace));
  proof.definition={cohortId,otherId,newId,initial,deletedVersion:8};proof.retainedAnalysisId=analysisId;proof.elapsedMs=Date.now()-started;proof.uiCounts={save:3,rename:11,delete:4,open:2};proof.tabSelection='normal page.bringToFront before corresponding UI interaction';proof.viewports=pages.map(target=>target.viewportSize());
  owner.report.http.push(...uiResponses.map(response=>({...response,port,via:response.via})),...protocolStimuli.map(response=>({...response,port,via:'protocol-adversary'})));
  await writeFile(`${owner.dir}/browser-observation.json`,JSON.stringify({scenario:id,pid,identity,version:context.browser().version(),urls:pages.map(target=>target.url()),ui:{requests:uiRequests,responses:uiResponses},protocolStimuli,steps,proof,dom:await a.locator('main').innerText(),allowed,blocked,pageErrors,routeErrors},null,2)+'\n');
 }catch(error){owner.fail(error.message);throw error;}
 finally{
  await Promise.allSettled(reads);await writeFile(`${owner.dir}/network.json`,JSON.stringify({ui:{requests:uiRequests,responses:uiResponses},protocolStimuli,steps,proof,elapsedMs:Date.now()-started,allowed,blocked,pageErrors,routeErrors},null,2)+'\n');
  await Promise.allSettled(pages.map(target=>target.close()));
 }
}
