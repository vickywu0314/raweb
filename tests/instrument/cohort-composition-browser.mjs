import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';

// 只读seed-p06的独立输入；不从响应、产品过滤/统计算法构造expected。
const FIRST=['101','102','103','104','105','106','107','108','109','110'];
const MIDDLE=['111','112','113','114','115','116','117','118','119','120','121','122','123','124','125','126','127','128','129','130'];
const LAST=['131','132','133','134','135','136','137'];
const A=['101','102','103','104','105','106','107','108'];
const B=['107','108','109','110','111','112','113','114'];
const METRICS=['n','age','duration','das28At','crpAt','haqAt','female','sero','target','complete','activity','line'];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BEFORE='2026-10-31T15:59:59.999Z',AFTER='2026-10-31T16:00:00.000Z',EXPIRY='2026-10-31T16:14:59.999Z';
const filters=ids=>({studyCode:'RA',at:'now',act:null,ids,sex:null,age:null,sero:null,cm:null,tx:null,data:null});
const command=(method,path,...args)=>({method,path:'/api/ra/'+path,args});
const analyze=ids=>command('cohort','ai/cohort',filters(ids),{completeFilters:true});
const pageRead=(analysisId,cursor)=>command('cohortPatients','ai/cohortPatients',analysisId,cursor);
const comparison=(savedId,excludeOverlap=false)=>command('compare','ai/compare',{a:{source:'FILTERS',filters:filters(A)},b:savedId?{source:'SAVED',cohortId:savedId}:{source:'FILTERS',filters:filters(B)},excludeOverlap});
const comparisonRead=compareResultId=>command('compareResult','ai/compareResult',compareResultId);
const file=(analysisId,fields=['das28Current','crpCurrent'])=>command('exportXlsx','export/xlsx',{source:'COHORT',analysisId,fields});
const success=result=>{assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.json.success,true);assert.equal(result.json.code,'200');return result.json.data;};
function rejected(result,status,code,message){
 assert.equal(result.status,status,JSON.stringify(result));assert.equal(result.json.success,false);assert.equal(result.json.code,code);
 if(code!=='NEED_APPLY')assert.equal(result.json.data,null);
 if(message)assert.equal(result.json.message,message);
 if(result.consumer){assert.equal(result.consumer.status,status);assert.equal(result.consumer.code,code);assert.equal(result.consumer.traceId,result.trace);}
}
function literalComparison(data,excludeOverlap,savedId=null,version=null,total=37){
 assert.match(data.compareResultId,UUID);assert.equal(data.studyTotal,total);assert.equal(data.overlapN,2);assert.equal(data.excludeOverlap,excludeOverlap);
 for(const [side,ids] of [['a',A],['b',B]]){
  assert.equal(data[side].nBeforeExclusion,8);assert.equal(data[side].n,excludeOverlap?6:8);assert.equal(data[side].evalN,excludeOverlap?6:8);
  assert.equal(data[side].submittedUniqueIdsN,8);assert.equal(data[side].effectiveIdsN,8);assert.deepEqual(data[side].filters,filters(ids));
  assert.equal(data[side].source,side==='b'&&savedId?'SAVED':'FILTERS');assert.equal(data[side].cohortId,side==='b'?savedId:null);assert.equal(data[side].cohortVersion,side==='b'?version:null);
 }
 assert.deepEqual(data.rows.map(row=>row.metric),METRICS);assert.deepEqual(data.rows[0].a,{n:excludeOverlap?6:8});assert.deepEqual(data.rows[0].b,{n:excludeOverlap?6:8});
}
function retainedComparison(actual,original){
 for(const key of ['compareResultId','studyTotal','a','b','overlapN','excludeOverlap','rows'])assert.deepEqual(actual[key],original[key],key);
 for(const key of ['computedAt','expiresAt','asOfDate'])assert.equal(actual.meta[key],original.meta[key],key);
}
function receipt(data,state){
 assert.match(data.applicationId,/^[1-9][0-9]*$/);assert.equal(data.status,'APPLICATION_RECORDED');assert.equal(data.notification.mailStatus,state);
 assert.match(data.notification.attemptId,UUID);assert.equal(data.notification.statusConfirmed,true);assert.equal(data.notification.retryable,false);assert.equal(data.notification.deliveryStatus,'UNKNOWN');
 assert.equal(data.notification.smtpAccepted,state==='SENT'?true:null);assert.equal(data.notification.reason,state==='SENT'?null:'DEADLINE');return data;
}

async function harness(context,port,identity,owner,pid,id,fixture){
 assert.equal(identity,'synthetic');assert.equal(fixture.scenario,id==='cohort:browser-feature-gates'?'p07-composition':'p07-composition-time');
 const origin=`http://127.0.0.1:${port}`,requests=[],responses=[],blocked=[],errors=[],downloads=[],observations=[],proof={};
 await context.addInitScript(()=>{
  sessionStorage.setItem('ra-auth',JSON.stringify({name:'合成页面用户',role:'研究者',expires:0}));
  // 畸形wire仍由原公开RACohortAPI消费者发出真实浏览器fetch；只替换一次网络边界body。
  const nativeFetch=window.fetch.bind(window);
  window.fetch=(input,options)=>{
   const path=new URL(typeof input==='string'?input:input.url,location.href).pathname;
   if(window.__compositionMalformedPath===path){delete window.__compositionMalformedPath;return nativeFetch(input,{...options,body:'{'});}
   return nativeFetch(input,options);
  };
 });
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin||owner.controller.signal.aborted){blocked.push(request.url());return route.abort('blockedbyclient');}
  if(url.pathname.startsWith('/api/')){
   const rawBody=request.postData();let body=null;try{body=JSON.parse(rawBody);}catch{}
   requests.push({path:url.pathname,url:request.url(),method:request.method(),rawBody,body,headers:request.headers(),via:'real-browser'});
  }
  return route.continue();
 });
 const page=await context.newPage();await page.setViewportSize({width:1280,height:720});await page.bringToFront();owner.event('page-created',{pid,port,case:id});
 page.on('pageerror',error=>errors.push(error.message));page.on('download',download=>downloads.push(download.suggestedFilename()));
 const perform=async(action,path,stage)=>{
  await page.bringToFront();const pending=page.waitForResponse(response=>new URL(response.url()).pathname===path&&response.request().method()==='POST');pending.catch(()=>{});
  const consumer=await action(),response=await pending,headers=response.headers(),trace=headers['x-trace-id'];assert.match(trace,UUID);
  const result={stage,path,status:response.status(),trace,headers,body:response.request().postData(),consumer:consumer??null};
  if(headers['content-type']?.toLowerCase().includes('application/json'))result.json=await response.json();
  else{assert.equal(headers['content-type']?.split(';')[0].toLowerCase(),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');result.playwrightBodyBytes=(await response.body()).length;if(result.consumer?.kind==='xlsx')result.fileBytes=result.consumer.fileBytes;}
  responses.push(result);
  await expect.poll(()=>fixture.events.filter(event=>event.type==='composition-http-observation'&&event.traceId===trace).length,{timeout:5000}).toBe(1);
  result.server=fixture.events.find(event=>event.type==='composition-http-observation'&&event.traceId===trace);
  assert.equal(result.server.path,path);assert.equal(result.server.status,result.status);
  return result;
 };
 const invoke=(spec,stage,malformed=false)=>perform(()=>page.evaluate(async({method,args,path,malformed})=>{
  if(malformed)window.__compositionMalformedPath=path;
  const copy=value=>({status:value.status,success:value.success??null,code:value.code??null,message:value.message??null,data:value.data??null,traceId:value.traceId,kind:value.kind??null,fileBytes:value.blob?.size??null,filename:value.filename??null});
  try{return copy(await window.RACohortAPI[method](...args));}catch(error){return copy(error);}finally{delete window.__compositionMalformedPath;}
 },{...spec,malformed}),spec.path,stage);
 const control=async(name,stage=name)=>{const before=fixture.events.length;await owner.control(fixture,name);const events=fixture.events.slice(before);observations.push({stage,control:name,events});return events;};
 const snapshot=async stage=>{const events=await control('SNAPSHOT_ROWS',stage),observed=events.find(event=>event.type==='composition-snapshot');assert.ok(observed,'真实owned全行snapshot');assert.ok(Object.keys(observed.tableRows).length>=11);for(const digest of Object.values(observed.tableDigests))assert.match(digest,/^[0-9a-f]{64}$/);return observed;};
 const sameRows=(actual,expected)=>{assert.deepEqual(actual.tableRows,expected.tableRows);assert.deepEqual(actual.tableDigests,expected.tableDigests);};
 const rebuild=async(name,globalEnabled,fileEnabled)=>{
  const before=await snapshot('before-'+name),events=await control(name),event=events.find(value=>value.type==='composition-rebuilt');assert.ok(event);
  assert.equal(event.globalEnabled,globalEnabled);assert.equal(event.fileEnabled,fileEnabled);assert.equal(event.port,fixture.port);assert.equal(event.oldContextActive,false);assert.equal(event.sameSchema,true);assert.equal(event.rowsUnchanged,true);
  const after=await snapshot('after-'+name);sameRows(after,before);for(const key of ['smtpConnections','smtpDataCommands','smtpAccepted','smtpMessages'])assert.equal(after[key],before[key]);
  observations.push({stage:'rebuild-preserved',name,before,after});return after;
 };
 const noEffects=result=>{
  for(const field of ['bodyBytes','borrowDelta','selectDelta','writeDelta','smtpConnectionDelta','smtpDataDelta'])assert.equal(result.server[field],0,`${result.stage}: ${field}`);
  assert.equal(result.server.active,0);
  const configuration=fixture.events.filter(event=>event.type==='composition-context').at(-1);assert.ok(configuration);assert.equal(configuration.gatewayFailure,'AI_NOT_ENABLED');assert.equal(configuration.gatewayEnabled,false);assert.equal(configuration.gatewayOutboundApproved,false);assert.equal(configuration.parsePeerPresent,false);
  assert.ok(!fixture.events.some(event=>event.type==='parse-peer-planned'),'组合gateway保持关闭，不存在真实AI外发peer');
 };
 const finish=async()=>{
  assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);
  for(const request of requests){assert.equal(request.method,'POST');assert.equal(request.headers.authorization,undefined);assert.equal(request.headers['x-doctor-id'],undefined);assert.equal(request.body?.doctorId,undefined);}
  owner.report.http.push(...responses.map(result=>({...result,port,via:'real-browser'})));
 };
 const close=async()=>{
  const observation={scenario:id,pid,identity,version:context.browser().version(),url:page.url(),requests,responses,observations,proof,downloads,blocked,errors,dom:await page.locator('main').innerText().catch(()=>null)};
  await writeFile(owner.dir+'/browser-observation.json',JSON.stringify(observation,null,2)+'\n');await writeFile(owner.dir+'/network.json',JSON.stringify({scenario:id,requests,responses,proof,blocked,errors},null,2)+'\n');await page.close();
 };
 return {page,requests,responses,downloads,observations,proof,perform,invoke,control,snapshot,sameRows,rebuild,noEffects,finish,close};
}

export async function featureGatesBrowser(context,port,identity,owner,probe,pid,id,fixture){
 assert.equal(id,'cohort:browser-feature-gates');const h=await harness(context,port,identity,owner,pid,id,fixture),{page,invoke,perform,control,snapshot,sameRows,rebuild,noEffects,proof}=h;
 try{
  const scope=(await owner.mysqlQuery('SELECT CAST(patient_id AS CHAR) FROM ra_synthetic_test.patient_relation_doctor WHERE doctor_id=101 AND research_type=0 ORDER BY patient_id')).trim().split('\n');assert.deepEqual(scope,[...FIRST,...MIDDLE,...LAST]);proof.sourceScope=scope;
  const original=success(await perform(()=>page.goto(`http://127.0.0.1:${port}/ai-cohort.html`),'/api/ra/ai/cohort','firstscreen'));
  assert.equal(original.n,37);assert.equal(original.studyTotal,37);assert.deepEqual(original.patients.items.map(item=>item.patientId),FIRST);assert.equal(original.patients.returnedCount,10);assert.match(original.patients.nextCursor,/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');await expect(page.locator('#patient-rows .ai-row')).toHaveCount(10);
  const middle=success(await perform(()=>page.locator('#more').click(),'/api/ra/ai/cohortPatients','signed-middle'));
  assert.equal(middle.analysisId,original.analysisId);assert.deepEqual(middle.patients.items.map(item=>item.patientId),MIDDLE);assert.equal(middle.patients.returnedCount,20);assert.equal(JSON.parse(h.responses.at(-1).body).cursor,original.patients.nextCursor);
  const last=success(await perform(()=>page.locator('#more').click(),'/api/ra/ai/cohortPatients','signed-last'));
  assert.equal(last.analysisId,original.analysisId);assert.deepEqual(last.patients.items.map(item=>item.patientId),LAST);assert.equal(last.patients.returnedCount,7);assert.equal(last.patients.nextCursor,null);assert.equal(last.patients.hasMore,false);assert.equal(JSON.parse(h.responses.at(-1).body).cursor,middle.patients.nextCursor);
  await expect(page.locator('#patient-rows .ai-row')).toHaveCount(37);assert.deepEqual(await page.locator('#patient-rows .ai-row').evaluateAll(nodes=>nodes.map(node=>node.dataset.patientId)),scope);await expect(page.locator('#more')).toBeHidden();
  proof.pagination={analysisId:original.analysisId,counts:[10,20,7],first:FIRST,middle:MIDDLE,last:LAST};
  const saveBody={requestId:randomUUID(),name:'P07 persistent definition',note:null,filters:filters(B)},saved=success(await invoke(command('save','cohort/save',saveBody),'initial-save'));assert.match(saved.cohortId,UUID);assert.equal(saved.version,1);
  const renameBody={cohortId:saved.cohortId,version:1,requestId:randomUUID(),note:'P07 persistent metadata'},renamed=success(await invoke(command('rename','cohort/rename',renameBody),'initial-rename'));assert.equal(renamed.cohortId,saved.cohortId);assert.equal(renamed.version,2);
  const compared=success(await invoke(comparison(saved.cohortId),'initial-comparison'));literalComparison(compared,false,saved.cohortId,2);
  const excluded=success(await invoke(comparison(saved.cohortId,true),'initial-excluded-comparison'));literalComparison(excluded,true,saved.cohortId,2);assert.notEqual(excluded.compareResultId,compared.compareResultId);
  const parsed=success(await invoke(command('parse','ai/parse','女性'),'initial-rule-parse'));assert.equal(parsed.engine,'RULE');assert.equal(parsed.fallbackReason,'AI_NOT_ENABLED');assert.deepEqual(parsed.candidateFilters,{sex:'F'});
  const applyBody={currentFilters:filters(null),candidateFilters:parsed.candidateFilters,parseStatus:parsed.parseStatus,questionRef:parsed.questionRef};
  const applied=success(await invoke(command('applyParse','ai/applyParse',applyBody),'initial-rule-apply'));assert.equal(applied.applied,true);assert.deepEqual(applied.filters,{...filters(null),sex:'F'});
  await page.locator('#export').click();for(const field of ['das28Current','crpCurrent'])await page.locator(`#export-fields input[value="${field}"]`).check();
  const pendingDownload=page.waitForEvent('download');pendingDownload.catch(()=>{});const downloaded=await perform(()=>page.locator('#export-confirm').click(),'/api/ra/export/xlsx','initial-real-xlsx');assert.equal(downloaded.status,200);
  const download=await pendingDownload;await download.saveAs(owner.dir+'/composition-download.xlsx');const bytes=await readFile(owner.dir+'/composition-download.xlsx');assert.ok(bytes.length>0);downloaded.fileBytes=bytes.length;downloaded.byteSource='saved-real-browser-download';
  await expect(page.locator('#export-state')).toHaveAttribute('data-state','success');
  await expect.poll(async()=>(await owner.mysqlQuery(`SELECT generation_status,transfer_status,file_rows,file_bytes,reference_id FROM ra_synthetic_test.ra_ai_export_audit WHERE id='${downloaded.trace}'`)).trim()).toBe(`READY\tWRITTEN\t37\t${bytes.length}\t${original.analysisId}`);
  proof.xlsx={trace:downloaded.trace,analysisId:original.analysisId,fileRows:37,fileBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),serverWriteOnly:true};
  await page.locator('#export').click();for(const field of ['patientId','sex'])await page.locator(`#export-fields input[value="${field}"]`).check();
  const decision=await perform(()=>page.locator('#export-confirm').click(),'/api/ra/export/xlsx','initial-need-apply');rejected(decision,409,'NEED_APPLY');assert.equal(decision.json.data.referenceId,original.analysisId);assert.equal(decision.json.data.today,'2026-10-07');assert.equal(decision.json.data.freeStart,'2026-04-01');
  await page.locator('#application-open').click();await page.locator('#application-start').fill('2026-01-01');await page.locator('#application-end').fill('2026-10-07');await page.locator('#application-purpose').selectOption('RESEARCH');await page.locator('#application-reason').fill('ordinary-application-canary');
  const sent=receipt(success(await perform(()=>page.locator('#application-submit').click(),'/api/ra/export/applyAnalysis','initial-sent-application')),'SENT'),sentBody=JSON.parse(h.responses.at(-1).body);
  await expect(page.locator('#application-receipt')).toContainText('SENT');await control('SMTP_UNKNOWN');
  const unknownBody={...sentBody,requestId:randomUUID()},unknown=receipt(success(await invoke(command('applyAnalysis','export/applyAnalysis',unknownBody),'initial-unknown-application')),'UNKNOWN');assert.notEqual(unknown.applicationId,sent.applicationId);
  await control('SMTP_ASSERT');
  const notificationRows=async()=>(await owner.mysqlQuery(`SELECT r.request_id,CAST(r.application_id AS CHAR),r.mail_state,r.attempt_id,r.attempt_no,a.mail_sent,a.status,a.mail_to,r.mail_from,r.created_at_ms,r.attempt_started_at_ms,r.decided_at_ms,r.request_sha256,HEX(r.verified_summary) FROM ra_synthetic_test.ra_ai_export_request r JOIN ra_synthetic_test.export_application a ON a.id=r.application_id WHERE r.request_id IN ('${sentBody.requestId}','${unknownBody.requestId}') ORDER BY r.application_id`)).trim();
  const originalNotificationRows=await notificationRows();assert.equal(originalNotificationRows.split('\n').length,2);const notifications=originalNotificationRows.split('\n').map(row=>row.split('\t'));
  for(const [index,value] of [sent,unknown].entries()){assert.equal(notifications[index][1],value.applicationId);assert.equal(notifications[index][2],index?'UNKNOWN':'SENT');assert.equal(notifications[index][3],value.notification.attemptId);assert.equal(notifications[index][4],'1');assert.equal(notifications[index][5],index?'0':'1');assert.equal(notifications[index][6],'pending');assert.equal(notifications[index][7],'fixture-admin@notification.invalid');assert.equal(notifications[index][8],'fixture-from@notification.invalid');assert.match(notifications[index][12],/^[0-9a-f]{64}$/);}
  const originalRows=async()=>{
   const result={};for(const [table,where,columns] of [
    ['ra_ai_analysis_run',`id='${original.analysisId}'`,'id,owner_doctor_id,scope_fingerprint,payload_sha256,HEX(payload),created_at_ms,expires_at_ms'],
    ['ra_ai_compare_run',`id IN ('${compared.compareResultId}','${excluded.compareResultId}')`,'id,owner_doctor_id,scope_fingerprint,payload_sha256,HEX(payload),created_at_ms,expires_at_ms'],
    ['ra_private_cohort_definition',`id='${saved.cohortId}'`,'id,owner_doctor_id,name,version,filters_sha256,HEX(filters_utf8),created_at_ms,updated_at_ms,deleted_at_ms'],
    ['ra_private_cohort_command',`request_id IN ('${saveBody.requestId}','${renameBody.requestId}')`,'action,request_id,cohort_id,result_version,request_sha256,trace_id,created_at_ms'],
    ['ra_ai_export_audit',`id IN ('${downloaded.trace}','${decision.trace}')`,'id,payload_sha256,reference_id,generation_status,transfer_status,file_rows,file_bytes,created_at_ms']
   ])result[table]=(await owner.mysqlQuery(`SELECT ${columns} FROM ra_synthetic_test.${table} WHERE ${where} ORDER BY 1`)).trim();
   result.notification=await notificationRows();return result;
  };
  const preserved=await originalRows();for(const value of Object.values(preserved))assert.ok(value.length>0);proof.retainedOriginalRows=preserved;
  const specs=[analyze(null),pageRead(original.analysisId,original.patients.nextCursor),command('resolveEntry','ai/resolveEntry','101'),command('parse','ai/parse','女性'),command('applyParse','ai/applyParse',applyBody),comparison(saved.cohortId),comparisonRead(compared.compareResultId),command('save','cohort/save',saveBody),command('list','cohort/list',{page:1,size:20}),command('open','cohort/open',{cohortId:saved.cohortId}),command('rename','cohort/rename',renameBody),command('delete','cohort/delete',{cohortId:saved.cohortId,version:2,requestId:randomUUID()}),file(original.analysisId),command('applyAnalysis','export/applyAnalysis',sentBody),command('retryNotification','export/retryNotification',{applicationId:sent.applicationId})];
  assert.equal(specs.length,15);assert.equal(new Set(specs.map(spec=>spec.path)).size,15);proof.routes=specs.map(spec=>spec.path);
  const baseline=await rebuild('REBUILD_GLOBAL_OFF',false,true);
  for(const malformed of [false,true])for(const spec of specs){const result=await invoke(spec,`global-off-${malformed?'malformed':'legal'}-${spec.method}`,malformed);rejected(result,503,'SERVICE_UNAVAILABLE','队列功能暂不可用');assert.equal(result.body,malformed?'{':JSON.stringify(JSON.parse(result.body)));noEffects(result);}
  await control('IDENTITY_ANONYMOUS');for(const spec of specs){const result=await invoke(spec,'anonymous-global-off-'+spec.method);rejected(result,401,'UNAUTHENTICATED');noEffects(result);}await control('IDENTITY_101');
  sameRows(await snapshot('global-off-after-browser'),baseline);assert.deepEqual(await originalRows(),preserved);
  await rebuild('REBUILD_BOTH_OFF',false,false);for(const malformed of [false,true]){const result=await invoke(file(original.analysisId),'both-off-global-precedes-file',malformed);rejected(result,503,'SERVICE_UNAVAILABLE','队列功能暂不可用');noEffects(result);}sameRows(await snapshot('both-off-after-browser'),baseline);
  const fileOff=await rebuild('REBUILD_FILE_OFF',true,false);for(const malformed of [false,true]){const result=await invoke(file(original.analysisId),'file-only-off',malformed);rejected(result,503,'SERVICE_UNAVAILABLE','文件导出暂不可用');noEffects(result);}sameRows(await snapshot('file-off-rejection-no-audit'),fileOff);
  // 其余14路按真实业务合同消费；私有rename/delete作用于新定义，保留原行/回执。
  const consumed=new Set();const allowed=async spec=>{const result=await invoke(spec,'file-off-allowed-'+spec.method);consumed.add(spec.path);return success(result);};
  const fresh=await allowed(analyze(null));assert.equal(fresh.n,37);assert.equal(fresh.studyTotal,37);
  assert.deepEqual((await allowed(pageRead(original.analysisId,original.patients.nextCursor))).patients.items.map(item=>item.patientId),MIDDLE);
  assert.equal((await allowed(command('resolveEntry','ai/resolveEntry','101'))).source,'SIMILAR');
  const parsedAgain=await allowed(command('parse','ai/parse','女性'));assert.equal(parsedAgain.engine,'RULE');assert.equal(parsedAgain.fallbackReason,'AI_NOT_ENABLED');
  assert.equal((await allowed(command('applyParse','ai/applyParse',{...applyBody,questionRef:parsedAgain.questionRef}))).applied,true);
  literalComparison(await allowed(comparison(saved.cohortId)),false,saved.cohortId,2);retainedComparison(await allowed(comparisonRead(compared.compareResultId)),compared);
  const disposable=await allowed(command('save','cohort/save',{requestId:randomUUID(),name:'P07 file-off disposable',note:null,filters:filters(A)}));assert.equal(disposable.version,1);
  assert.equal((await allowed(command('list','cohort/list',{page:1,size:20}))).total,2);assert.equal((await allowed(command('open','cohort/open',{cohortId:saved.cohortId}))).analysis.n,8);
  assert.equal((await allowed(command('rename','cohort/rename',{cohortId:disposable.cohortId,version:1,requestId:randomUUID(),name:'P07 file-off renamed'}))).version,2);
  assert.equal((await allowed(command('delete','cohort/delete',{cohortId:disposable.cohortId,version:2,requestId:randomUUID()}))).version,3);
  await control('SMTP_SUCCESS');const fileOffApplication=receipt(await allowed(command('applyAnalysis','export/applyAnalysis',{...sentBody,requestId:randomUUID()})),'SENT');assert.ok(![sent.applicationId,unknown.applicationId].includes(fileOffApplication.applicationId));
  assert.deepEqual(receipt(await allowed(command('retryNotification','export/retryNotification',{applicationId:unknown.applicationId})),'UNKNOWN'),unknown);proof.fileOffApplication=fileOffApplication;
  assert.deepEqual([...consumed].sort(),specs.filter(spec=>spec.method!=='exportXlsx').map(spec=>spec.path).sort());assert.deepEqual(await originalRows(),preserved);
  await rebuild('REBUILD_ENABLED',true,true);
  const beforeReplay=await snapshot('reopened-before-replay');
  for(const [body,value] of [[sentBody,sent],[unknownBody,unknown]])assert.deepEqual(receipt(success(await invoke(command('applyAnalysis','export/applyAnalysis',body),'reopened-same-application')) ,value.notification.mailStatus),value);
  for(const value of [sent,unknown])assert.deepEqual(receipt(success(await invoke(command('retryNotification','export/retryNotification',{applicationId:value.applicationId}),'reopened-current-notification')),value.notification.mailStatus),value);
  const savedReplay=success(await invoke(command('save','cohort/save',saveBody),'reopened-save-receipt'));assert.equal(savedReplay.cohortId,saved.cohortId);assert.equal(savedReplay.version,1);
  const renamedReplay=success(await invoke(command('rename','cohort/rename',renameBody),'reopened-rename-receipt'));assert.equal(renamedReplay.cohortId,saved.cohortId);assert.equal(renamedReplay.version,2);
  const pageAgain=success(await invoke(pageRead(original.analysisId,original.patients.nextCursor),'reopened-original-analysis'));assert.equal(pageAgain.analysisId,original.analysisId);assert.deepEqual(pageAgain.patients.items.map(item=>item.patientId),MIDDLE);assert.equal(pageAgain.meta.expiresAt,original.meta.expiresAt);assert.equal(pageAgain.meta.computedAt,original.meta.computedAt);
  for(const value of [compared,excluded])retainedComparison(success(await invoke(comparisonRead(value.compareResultId),'reopened-original-comparison')),value);
  const afterReplay=await snapshot('reopened-after-replay');sameRows(afterReplay,beforeReplay);for(const field of ['smtpConnections','smtpDataCommands','smtpAccepted','smtpMessages'])assert.equal(afterReplay[field],beforeReplay[field]);assert.deepEqual(await originalRows(),preserved);
  const reopenedFile=await invoke(file(original.analysisId),'reopened-original-xlsx');assert.equal(reopenedFile.status,200);assert.equal(reopenedFile.consumer.kind,'xlsx');assert.equal(reopenedFile.consumer.fileBytes,reopenedFile.fileBytes);assert.ok(reopenedFile.fileBytes>0);
  const afterFile=await snapshot('reopened-file-served');for(const [table,count] of Object.entries(afterReplay.tableRows))assert.equal(afterFile.tableRows[table],count+(table==='ra_ai_export_audit'?1:0));assert.equal(await notificationRows(),originalNotificationRows);
  await control('SMTP_ASSERT');assert.equal(h.downloads.length,1);proof.applications={sent,unknown,commands:[sentBody,unknownBody],preservedAttemptRows:true,noImplicitSmtp:true};proof.originalTtl={computedAt:original.meta.computedAt,expiresAt:original.meta.expiresAt,ttlMs:Date.parse(original.meta.expiresAt)-Date.parse(original.meta.computedAt)};assert.equal(proof.originalTtl.ttlMs,900000);
  await h.finish();owner.event('composition-feature-browser-before-fallback',{case:id,routes:15,globalLegal:15,globalMalformed:15,anonymous:15,fileOtherRoutes:14,preserved:true});
 }catch(error){owner.fail(error.message);throw error;}finally{await h.close();}
}

export async function compositionTimeBrowser(context,port,identity,owner,probe,pid,id,fixture){
 assert.equal(id,'cohort:browser-composition-time');const h=await harness(context,port,identity,owner,pid,id,fixture),{page,invoke,perform,control,rebuild,proof}=h;
 const literalMeta=(data,asOf,computedAt,expiresAt)=>{assert.equal(data.meta.asOfDate,asOf);assert.equal(data.meta.computedAt,computedAt);assert.equal(data.meta.expiresAt,expiresAt);assert.equal(Date.parse(data.meta.expiresAt)-Date.parse(data.meta.computedAt),900000);};
 const windowDecision=async(analysisId,today,freeStart,stage)=>{const result=await invoke(file(analysisId,['patientId']),stage);rejected(result,409,'NEED_APPLY');const data=result.json.data;assert.equal(data.source,'COHORT');assert.equal(data.referenceId,analysisId);assert.equal(data.selectionMode,'EXPLICIT');assert.deepEqual(data.requested,['patientId']);assert.equal(data.today,today);assert.equal(data.freeStart,freeStart);assert.deepEqual(data.blocked,[{field:'patientId',side:null,reason:'MISSING_SOURCE_DATE',affectedN:37}]);return data;};
 const epochs=async(analysisId,compareResultId)=>{
  const records={};for(const [table,id] of [['ra_ai_analysis_run',analysisId],['ra_ai_compare_run',compareResultId]]){
   assert.match(id,UUID);const row=(await owner.mysqlQuery(`SELECT id,owner_doctor_id,created_at_ms,expires_at_ms,payload_sha256,SHA2(payload,256),scope_fingerprint FROM ra_synthetic_test.${table} WHERE id='${id}'`)).trim().split('\t');assert.equal(row[0],id);assert.equal(row[1],'101');assert.equal(Number(row[2]),Date.parse(BEFORE));assert.equal(Number(row[3]),Date.parse(EXPIRY));assert.equal(Number(row[3])-Number(row[2]),900000);assert.equal(row[4],row[5]);records[table]=row;
  }return records;
 };
 try{
  const beforeControl=await control('CLOCK_DAY_BEFORE');assert.equal(beforeControl.find(event=>event.type==='composition-clock').epochMs,Date.parse(BEFORE));
  const old=success(await perform(()=>page.goto(`http://127.0.0.1:${port}/ai-cohort.html`),'/api/ra/ai/cohort','shanghai-before-day'));assert.equal(old.n,37);assert.equal(old.studyTotal,37);literalMeta(old,'2026-10-31',BEFORE,EXPIRY);
  await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');await expect(page.locator('#numeric-computed-at')).toHaveText('数值计算时间：'+BEFORE);
  const oldComparison=success(await invoke(comparison(null),'shanghai-before-comparison'));literalComparison(oldComparison,false);literalMeta(oldComparison,'2026-10-31',BEFORE,EXPIRY);
  const beforeDecision=await windowDecision(old.analysisId,'2026-10-31','2026-04-01','shanghai-before-window'),originalEpochs=await epochs(old.analysisId,oldComparison.compareResultId);
  await rebuild('REBUILD_ENABLED',true,true);assert.deepEqual(await epochs(old.analysisId,oldComparison.compareResultId),originalEpochs);
  const afterControl=await control('CLOCK_DAY_AFTER');assert.equal(afterControl.find(event=>event.type==='composition-clock').epochMs,Date.parse(AFTER));
  const newDay=success(await invoke(analyze(null),'shanghai-after-day'));assert.notEqual(newDay.analysisId,old.analysisId);assert.equal(newDay.n,37);literalMeta(newDay,'2026-11-01','2026-10-31T16:00:00Z','2026-10-31T16:15:00Z');
  const afterDecision=await windowDecision(newDay.analysisId,'2026-11-01','2026-05-01','shanghai-after-window');
  await rebuild('REBUILD_ENABLED',true,true);assert.deepEqual(await epochs(old.analysisId,oldComparison.compareResultId),originalEpochs);
  const retained=success(await invoke(pageRead(old.analysisId,old.patients.nextCursor),'day-change-original-analysis'));assert.equal(retained.analysisId,old.analysisId);assert.deepEqual(retained.patients.items.map(item=>item.patientId),MIDDLE);literalMeta(retained,'2026-10-31',BEFORE,EXPIRY);
  retainedComparison(success(await invoke(comparisonRead(oldComparison.compareResultId),'day-change-original-comparison')),oldComparison);
  const expiryControl=await control('CLOCK_EXACT_EXPIRY');assert.equal(expiryControl.find(event=>event.type==='composition-clock').epochMs,Date.parse(EXPIRY));
  rejected(await invoke(pageRead(old.analysisId,old.patients.nextCursor),'exact-900000ms-analysis-expiry'),410,'ANALYSIS_EXPIRED');rejected(await invoke(comparisonRead(oldComparison.compareResultId),'exact-900000ms-comparison-expiry'),410,'COMPARE_EXPIRED');
  rejected(await invoke(file(old.analysisId),'exact-900000ms-file-expiry'),410,'ANALYSIS_EXPIRED');assert.deepEqual(await epochs(old.analysisId,oldComparison.compareResultId),originalEpochs);
  // 到期之后新资源仍有效；移除C外137关系也必须使同owner旧A/B比较失效。
  const scopeAnalysis=success(await invoke(analyze(null),'scope-before-real-change')),scopeComparison=success(await invoke(comparison(null),'scope-comparison-before-real-change'));assert.equal(scopeAnalysis.n,37);literalComparison(scopeComparison,false);
  assert.equal((await owner.mysqlQuery('SELECT COUNT(*) FROM ra_synthetic_test.patient_relation_doctor WHERE doctor_id=101 AND patient_id=137')).trim(),'1');
  const sourceEvents=await control('SOURCE_SCOPE_CHANGE'),source=sourceEvents.find(event=>event.type==='composition-source-changed');assert.ok(source);assert.equal(source.affectedRows,1);
  assert.equal((await owner.mysqlQuery('SELECT COUNT(*) FROM ra_synthetic_test.patient_relation_doctor WHERE doctor_id=101 AND patient_id=137')).trim(),'0');
  for(const [table,resourceId] of [['ra_ai_analysis_run',scopeAnalysis.analysisId],['ra_ai_compare_run',scopeComparison.compareResultId]])assert.equal((await owner.mysqlQuery(`SELECT owner_doctor_id FROM ra_synthetic_test.${table} WHERE id='${resourceId}'`)).trim(),'101');
  rejected(await invoke(pageRead(scopeAnalysis.analysisId,scopeAnalysis.patients.nextCursor),'same-owner-old-analysis-scope-changed'),409,'SCOPE_CHANGED');rejected(await invoke(comparisonRead(scopeComparison.compareResultId),'same-owner-old-comparison-scope-changed'),409,'SCOPE_CHANGED');rejected(await invoke(file(scopeAnalysis.analysisId),'same-owner-old-file-scope-changed'),409,'SCOPE_CHANGED');
  const current=success(await invoke(analyze(null),'scope-change-new-analysis'));assert.equal(current.n,36);assert.equal(current.studyTotal,36);assert.notEqual(current.analysisId,scopeAnalysis.analysisId);
  const currentComparison=success(await invoke(comparison(null),'scope-change-new-comparison'));literalComparison(currentComparison,false,null,null,36);
  proof.time={before:BEFORE,after:AFTER,expiry:EXPIRY,beforeDate:'2026-10-31',afterDate:'2026-11-01',beforeFreeStart:'2026-04-01',afterFreeStart:'2026-05-01',ttlMs:900000,analysisId:old.analysisId,compareResultId:oldComparison.compareResultId,originalEpochs,beforeDecision,afterDecision};proof.scope={source,oldAnalysisId:scopeAnalysis.analysisId,oldCompareResultId:scopeComparison.compareResultId,owner:'101',newAnalysisId:current.analysisId,studyTotalBefore:37,studyTotalAfter:36,removedId:'137',removedOutsideComparison:true};assert.deepEqual(h.downloads,[]);
  await h.finish();owner.event('composition-time-browser-before-fallback',{case:id,exactExpiryMs:Date.parse(EXPIRY),ttlMs:900000,scopeChanged:true,owner:'101'});
 }catch(error){owner.fail(error.message);throw error;}finally{await h.close();}
}
