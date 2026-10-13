const {test,expect}=require('@playwright/test');
const {installAuthBootstrap}=require('../fixtures/auth-bootstrap.cjs');
// 独立中文业务真值；不使用生产显示函数生成期望。
const expectedError={"UNAUTHENTICATED":"登录已失效，请重新登录","RESOURCE_NOT_FOUND":"所需记录不存在或当前账号无法访问","INVALID_REQUEST":"输入内容不符合要求，请检查后重试","SERVICE_UNAVAILABLE":"服务暂不可用，请稍后重试","NAME_CONFLICT":"名称已被使用，请修改名称","VERSION_CONFLICT":"记录已更新，请刷新并核对后重试","IDEMPOTENCY_CONFLICT":"此次重试与原内容不一致，请核对后重新操作","LIMIT_EXCEEDED":"内容超出允许范围，请调整后重试"};
const {writeFile}=require('node:fs/promises');
const {U,F,EMPTY,CLINICAL}=require('../fixtures/cohort-p02.json');
const {cohort}=require('../fixtures/cohort-private.json');
async function setup({page,context,browser},scenario,reply){
  const auth=await installAuthBootstrap(context);
const origin=process.env.RA_STATIC_URL,requests=[],allowed=[],blocked=[],pageErrors=[];
 page.on('pageerror',e=>pageErrors.push(e.message));
 await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==origin){blocked.push(request.url());return route.abort('blockedbyclient');}allowed.push(request.url());if(await auth.handle(route))return;if(url.pathname.startsWith('/api/')){const r={url:request.url(),body:request.postDataJSON()};requests.push(r);return reply(route,r);}await route.continue();});
 return {origin,auth,requests,pageErrors,save:async()=>{await writeFile(`${process.env.RA_RUN_DIR}/browser-observation.json`,JSON.stringify({scenario,version:browser.version(),requests,authRequests:auth.requests,allowed,blocked,pageErrors,dom:await page.locator('main').innerText()},null,2)+'\n');await writeFile(`${process.env.RA_RUN_DIR}/network.json`,JSON.stringify({requests,authRequests:auth.requests,allowed,blocked,pageErrors},null,2)+'\n');}};
}
const fulfill=(route,data,status=200,code='200')=>route.fulfill({status,contentType:'application/json',headers:{'X-Trace-Id':'trace-private'},body:JSON.stringify({success:status===200,code,message:'合成响应',data})});
test('cohort:private-save-open',async({page,context,browser})=>{
 let listMode='ok',openMode='ok',selected=structuredClone(cohort),analysis=U;
 const o=await setup({page,context,browser},'cohort:private-save-open',(route,r)=>{
  const path=new URL(r.url).pathname;
  if(path.endsWith('/save'))return fulfill(route,{cohortId:cohort.cohortId,version:1,meta:{traceId:'trace-private'}});
  if(path.endsWith('/list'))return listMode==='error'?fulfill(route,null,503,'SERVICE_UNAVAILABLE'):fulfill(route,{items:r.body.page===1?[selected]:[],total:1,page:r.body.page,size:r.body.size,meta:{traceId:'trace-private'}});
  if(path.endsWith('/open')){
   if(['401','404','503'].includes(openMode))return fulfill(route,null,Number(openMode),{'401':'UNAUTHENTICATED','404':'RESOURCE_NOT_FOUND','503':'SERVICE_UNAVAILABLE'}[openMode]);
   const data={cohort:structuredClone(selected),analysis:structuredClone(analysis),meta:{traceId:'trace-private'}};
   if(openMode==='bad-meta')delete data.cohort.filters.at;
   if(openMode==='bad-analysis')delete data.analysis.patients.items[0].clinical;
   return fulfill(route,data);
  }
  return fulfill(route,U);
 });
 try{
  await page.goto(o.origin+'/ai-cohort.html?act=target&ids=11,9223372036854775807');await o.auth.verify(page);
  await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');
  await expect(page.locator('#save-cohort')).toBeVisible();
  await page.locator('#save-cohort').click();await page.locator('#private-name').fill('  Trial  ');await page.locator('#private-note').fill('');await page.locator('#private-save').click();
  await expect(page.locator('#private-save-state')).toHaveAttribute('data-state','success');
  const save=o.requests.find(r=>new URL(r.url).pathname==='/api/ra/cohort/save');expect(save).toBeTruthy();
  expect(Object.keys(save.body).sort()).toEqual(['filters','name','note','requestId']);expect(save.body.name).toBe('  Trial  ');expect(save.body.note).toBe('');
  expect(save.body.filters).toEqual({studyCode:'RA',sex:'',age:'',sero:'',tx:'',at:'now',act:'target',cm:'',data:'',ids:['11','9223372036854775807']});expect(save.body.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  await expect(page.locator('#private-list-load')).toBeVisible();await expect(page.locator('#private-list-state')).toHaveAttribute('data-state','success');
  await expect(page.locator('#private-items > *')).toHaveCount(1);await expect(page.locator('#private-items')).toContainText('Trial');await expect(page.locator('#private-items')).toContainText('打开后计算');await expect(page.locator('#private-items')).toContainText('版本 1');await expect(page.locator('#private-items')).toContainText('2026-10-07T02:00:00Z');
  const lists=()=>o.requests.filter(r=>r.url.endsWith('/list'));expect(lists()[0].body).toEqual({page:1,size:20});
  await page.locator('#private-next').click();await expect(page.locator('#private-list-state')).toHaveAttribute('data-state','empty');await expect(page.locator('#private-page')).toHaveText('第 2 页 · 每页 20 条 · 共 1 条');expect(lists().at(-1).body).toEqual({page:2,size:20});
  await page.locator('#private-prev').click();await expect(page.locator('#private-items > *')).toHaveCount(1);
  const ordinary=o.requests.filter(r=>r.url.endsWith('/cohort')).length,clickOpen=()=>page.locator('#private-items [data-open-cohort]').click();
  await clickOpen();await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');expect(o.requests.at(-1).body).toEqual({cohortId:cohort.cohortId});expect(o.requests.filter(r=>r.url.endsWith('/cohort'))).toHaveLength(ordinary);
  for(const [selector,text] of [['#cohort-n','6'],['#study-total','6'],['#age-median','50'],['#target-rate','40%'],['#complete-rate','67%'],['#duration-median','3']])await expect(page.locator(selector)).toHaveText(text);
  await expect(page.locator('#f-act')).toHaveValue('target');expect(new URL(page.url()).searchParams.get('ids')).toBe('11,9223372036854775807');await expect(page.locator('#results')).toHaveAttribute('data-analysis-id',U.analysisId);
  for(const selector of ['#activity-base','#activity-current','#tx-groups','#line-groups'])expect(await page.locator(selector+' > *').count()).toBeGreaterThan(0);
  await expect(page.locator('#patient-rows [data-patient-id]')).toHaveCount(6);await expect(page.locator('#numeric-computed-at')).toHaveText('数值计算时间：2026-10-07T02:00:00Z');await expect(page.locator('#display-read-at')).toHaveText('名单显示字段读取时间：2026-10-07T02:00:00Z');
  selected={...structuredClone(cohort),name:'<img src=x onerror=alert(1)>',note:'<备注>',version:9007199254740992,filters:{studyCode:'RA',sex:'F',age:'41-49',sero:null,tx:null,at:'now',act:null,cm:null,data:null,ids:null}};analysis=F;
  await page.locator('#private-list-load').click();await expect(page.locator('#private-items')).toContainText('<img src=x onerror=alert(1)>');expect(await page.locator('#private-items img').count()).toBe(0);await expect(page.locator('#private-items')).toContainText('超出安全显示范围');
  await clickOpen();await expect(page.locator('#cohort-n')).toHaveText('3');await expect(page.locator('#age-median')).toHaveText('55');await expect(page.locator('#f-age')).toHaveValue('41-49');await expect(page.locator('#f-sex')).toHaveValue('F');expect(new URL(page.url()).searchParams.has('ids')).toBe(false);await expect(page.locator('#private-open-meta')).toContainText('<img src=x onerror=alert(1)>');
  selected={...structuredClone(cohort),filters:{studyCode:'RA',sex:null,age:null,sero:null,tx:null,at:'now',act:null,cm:null,data:null,ids:[]}};analysis=EMPTY;
  await clickOpen();await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','empty');await expect(page.locator('#cohort-n')).toHaveText('0');expect(new URL(page.url()).searchParams.get('ids')).toBe('');await expect(page.locator('#f-sex')).toHaveValue('');
  selected=structuredClone(cohort);analysis=CLINICAL;await clickOpen();await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');const long=page.locator('[data-patient-id="9223372036854775807"]');await expect(long.locator('.patient-das28')).toContainText('基线 4.5 → 评估 2');await expect(long.locator('.patient-crp')).toContainText('评估 CRP 6 mg/L');await expect(long.locator('.patient-crp')).toContainText('当前 CRP 12 mg/L');await long.locator('summary').click();await expect(long.locator('.patient-score-source')).toContainText('来源访视');
  for(const mode of ['bad-meta','bad-analysis','404','503']){
   openMode=mode;const url=page.url(),filters=await page.locator('#f-act').inputValue();await clickOpen();await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','error');await expect(page.locator('#patient-rows > *')).toHaveCount(0);await expect(page.locator('#clinical-panels')).toBeHidden();await expect(page.locator('#private-open-meta')).toHaveText('');expect(page.url()).toBe(url);expect(await page.locator('#f-act').inputValue()).toBe(filters);await expect(page.locator('#error-message')).toContainText(mode.startsWith('bad')?'返回的数据不完整或无法识别，请重新读取':mode==='404'?'所需记录不存在或当前账号无法访问':'服务暂不可用，请稍后重试');await expect(page.locator('#error-trace')).not.toContainText('trace-private');
  }
  listMode='error';await page.locator('#private-list-load').click();await expect(page.locator('#private-list-state')).toHaveAttribute('data-state','error');await expect(page.locator('#private-list-state')).toContainText('服务暂不可用，请稍后重试');await expect(page.locator('#private-list-state')).not.toContainText('trace-private');
  listMode='ok';await page.locator('#private-list-load').click();await expect(page.locator('#private-items > *')).toHaveCount(1);openMode='401';await clickOpen();await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','error');await expect(page.locator('#private-items > *')).toHaveCount(0);await expect(page.locator('#private-open-meta')).toHaveText('');await expect(page.locator('#login-return')).toBeVisible();
  expect(o.pageErrors).toEqual([]);expect(o.requests.filter(r=>r.url.includes('/rename')||r.url.includes('/delete'))).toHaveLength(0);

 }finally{await o.save();}
});
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function inertAbort(context){
 await context.addInitScript(()=>{
  const Native=window.AbortController;window.AbortController=class extends Native{abort(){window.__privateAborts=(window.__privateAborts||0)+1;}};
  window.__privateReads=[];const fetch=window.fetch.bind(window);window.fetch=async(...args)=>{const response=await fetch(...args),json=response.json.bind(response);response.json=async()=>{const value=await json();window.__privateReads.push({url:String(args[0]),value});return value;};return response;};
 });
}
test('cohort:private-pending-isolation',async({page,context,browser})=>{
 const A='11111111-1111-1111-1111-111111111111',B='22222222-2222-2222-2222-222222222222',allHolds=[],holds=new Map();let saves=0,saveError=null;
 const first={...structuredClone(U),analysisId:A,n:37,studyTotal:37,patients:{total:37,returnedCount:10,hasMore:true,nextCursor:'opaque.A.10',items:Array.from({length:10},(_,i)=>({...structuredClone(CLINICAL.patients.items[0]),patientId:String(i+1),name:'A-'+(i+1)}))}};
 const second={...structuredClone(U),analysisId:B,n:2,studyTotal:37,patients:{total:2,returnedCount:2,hasMore:false,nextCursor:null,items:['901','902'].map(patientId=>({...structuredClone(CLINICAL.patients.items[0]),patientId,name:'B-'+patientId,clinical:{...structuredClone(CLINICAL.patients.items[0].clinical),age:70},scoreProvenance:{...structuredClone(CLINICAL.patients.items[0].scoreProvenance),source:'B-source'}}))}};
 second.metricMeta.ageMedian={validN:2,unknownN:0,status:'OK',displayText:'70'};second.meta.computedAt='2026-10-07T03:00:00Z';second.meta.readCompletedAt='2026-10-07T03:01:00Z';
 const older={...structuredClone(cohort),name:'Definition A',filters:{studyCode:'RA',sex:'M',age:'18-40',sero:null,tx:null,at:'6m',act:null,cm:null,data:null,ids:[]}},newer={...structuredClone(cohort),name:'Definition B',filters:{studyCode:'RA',sex:'F',age:'70-',sero:null,tx:null,at:'now',act:null,cm:null,data:null,ids:null}};
 let opened={cohort:newer,analysis:second,meta:{traceId:'trace-private'}};
 const receipt={cohortId:cohort.cohortId,version:1,meta:{traceId:'trace-private'}};
 const arm=(path,data,status=200,code='200')=>{const h={received:gate(),release:gate(),data,status,code};allHolds.push(h);const queue=holds.get(path)||[];queue.push(h);holds.set(path,queue);return h;};
 const never=arm('save',receipt);
 await inertAbort(context);await page.clock.install();
 const o=await setup({page,context,browser},'cohort:private-pending-isolation',async(route,r)=>{
  const path=new URL(r.url).pathname.split('/').at(-1),h=holds.get(path)?.shift();
  if(h){h.received.resolve(r);await h.release.promise;return fulfill(route,h.data,h.status,h.code);}
  if(path==='save'){saves++;return saveError?fulfill(route,null,saveError[0],saveError[1]):fulfill(route,receipt);}
  if(path==='list')return fulfill(route,{items:[{...cohort,name:'Page '+r.body.page}],total:100,page:r.body.page,size:20,meta:{traceId:'trace-private'}});
  if(path==='open')return fulfill(route,opened);
  return fulfill(route,r.body.filters?.sex==='F'?second:first);
 });
 const load=async()=>{await page.locator('#private-list-load').click();await expect(page.locator('#private-list-state')).toHaveAttribute('data-state','success');};
 const open=()=>page.locator('#private-items [data-open-cohort]').click();
 const submit=async name=>{await page.locator('#save-cohort').click();await page.locator('#private-name').fill(name);await page.locator('#private-save').click();};
 const readCount=()=>page.evaluate(()=>window.__privateReads.length);
 const releaseRead=async h=>{const before=await readCount();h.release.resolve();await page.waitForFunction(before=>window.__privateReads.length>before,before);};
 const snapshot=()=>page.evaluate(()=>({url:location.href,html:document.querySelector('main').innerHTML,values:['sex','age','at','act'].map(k=>document.querySelector('#f-'+k).value)}));
 const assertB=async()=>{
  await expect(page.locator('#results')).toHaveAttribute('data-analysis-id',B);await expect(page.locator('#cohort-n')).toHaveText('2');await expect(page.locator('#study-total')).toHaveText('37');await expect(page.locator('#age-median')).toHaveText('70');
  expect(await page.locator('#patient-rows [data-patient-id]').evaluateAll(ns=>ns.map(n=>n.dataset.patientId))).toEqual(['901','902']);await expect(page.locator('[data-patient-id="901"] .patient-clinical')).toContainText('年龄 70');await expect(page.locator('[data-patient-id="901"] .patient-das28')).toContainText('基线 4.5 → 评估 2');await expect(page.locator('[data-patient-id="901"] .patient-score-source')).toContainText('资料来源：未提供说明');await expect(page.locator('[data-patient-id="901"] .patient-score-source')).toContainText('来源项目：未提供');await expect(page.locator('[data-patient-id="901"] .patient-score-source')).toContainText('缺失原因：缺少有效 CRP 记录');await expect(page.locator('[data-patient-id="901"] .patient-score-source')).not.toContainText('B-source');await expect(page.locator('#numeric-computed-at')).toHaveText('数值计算时间：2026-10-07T03:00:00Z');await expect(page.locator('#display-read-at')).toHaveText('名单显示字段读取时间：2026-10-07T03:01:00Z');await expect(page.locator('#more')).toBeHidden();await expect(page.locator('#f-sex')).toHaveValue('F');
 };
 const fresh=async()=>{await page.goto(o.origin+'/ai-cohort.html?act=target&ids=11,9223372036854775807');await o.auth.verify(page);await expect(page.locator('#results')).toHaveAttribute('data-analysis-id',A);await load();};
 const cleared=async()=>{await expect(page.locator('#patient-rows > *')).toHaveCount(0);await expect(page.locator('#cohort-n')).toHaveText('—');await expect(page.locator('#clinical-panels')).toBeHidden();await expect(page.locator('#private-open-meta')).toHaveText('');await expect(page.locator('#results')).not.toHaveAttribute('data-analysis-id');};
 const noPrivate=async()=>{await cleared();await expect(page.locator('#private-items > *')).toHaveCount(0);await expect(page.locator('#private-save-dialog')).toBeHidden();await expect(page.locator('#private-save-state')).toHaveAttribute('data-state','idle');await expect(page.locator('#private-name')).toHaveValue('');await expect(page.locator('#private-note')).toHaveValue('');};
 try{
  await fresh();await submit('  Trial  ');await never.received.promise;await page.clock.runFor(30001);await expect(page.locator('#private-save-state')).toHaveAttribute('data-state','error');await expect(page.locator('#private-save-state')).toContainText('不能确定是否已提交');await expect(page.locator('#private-retry')).toBeVisible();await expect(page.locator('#private-save')).toBeEnabled();
  await page.locator('#private-retry').click();await expect(page.locator('#private-save-state')).toHaveAttribute('data-state','success');const commands=o.requests.filter(r=>r.url.endsWith('/save'));expect(commands).toHaveLength(2);expect(commands[1].body).toEqual(commands[0].body);
  await page.locator('#private-name').fill('Changed');await page.locator('#private-save').click();await expect(page.locator('#private-save-state')).toHaveAttribute('data-state','success');const changed=o.requests.filter(r=>r.url.endsWith('/save')).at(-1).body;expect(changed.requestId).not.toBe(commands[0].body.requestId);expect(changed.name).toBe('Changed');
  // 旧open A→普通B；真实读完迟到A，整体DOM/条件/URL/cursor/时间仍属B。
  await fresh();const lateOpen=arm('open',{cohort:older,analysis:first,meta:{traceId:'trace-private'}});await open();await lateOpen.received.promise;await page.locator('#f-sex').selectOption('F');await assertB();expect(new URL(page.url()).searchParams.get('ids')).toBe('11,9223372036854775807');await expect(page.locator('#private-open-meta')).toHaveText('');let verified=await snapshot();await releaseRead(lateOpen);await assertB();expect(await snapshot()).toEqual(verified);
  // 普通A→openB；B的定义条件与完整结果一次发布。
  await fresh();const lateAnalysis=arm('cohort',first);await page.locator('#f-sex').selectOption('M');await lateAnalysis.received.promise;await open();await assertB();await expect(page.locator('#f-age')).toHaveValue('70-');expect(new URL(page.url()).searchParams.has('ids')).toBe(false);await expect(page.locator('#private-open-meta')).toContainText('Definition B');verified=await snapshot();await releaseRead(lateAnalysis);await assertB();expect(await snapshot()).toEqual(verified);
  // 旧A后页→openB；与原同一分页owner，迟到不追加A名单。
  await fresh();const middle={analysisId:A,patients:{total:37,returnedCount:20,hasMore:true,nextCursor:'opaque.A.30',items:Array.from({length:20},(_,i)=>({...structuredClone(CLINICAL.patients.items[0]),patientId:String(i+11),name:'Late A-'+(i+11)}))},meta:{displayReadCompletedAt:'2026-10-07T04:00:00Z'}};
  const latePage=arm('cohortPatients',middle);await page.locator('#more').click();await latePage.received.promise;await open();await assertB();verified=await snapshot();await releaseRead(latePage);await assertB();expect(await snapshot()).toEqual(verified);
  // open/list各自真实永久pending并由自己的30秒timer收束；列表不占分析flight。
  await fresh();const pendingOpen=arm('open',{cohort:newer,analysis:second,meta:{traceId:'trace-private'}});await open();await pendingOpen.received.promise;await page.clock.runFor(30001);await expect(page.locator('#error-message')).toContainText('等待超时，请重试');await cleared();await expect(page.locator('#cancel-analysis')).toBeHidden();
  const pendingList=arm('list',{items:[cohort],total:1,page:1,size:20,meta:{traceId:'trace-private'}});await page.locator('#private-list-load').click();await pendingList.received.promise;await page.locator('#f-sex').selectOption('F');await assertB();await page.clock.runFor(30001);await expect(page.locator('#private-list-state')).toHaveAttribute('data-state','error');await expect(page.locator('#private-list-state')).toContainText('等待超时，请重试');await assertB();
  // 原命令晚于新命令：改参数即撤旧发布权；旧回执不触发新list。
  await load();const lateSave=arm('save',receipt);await submit('Old');await lateSave.received.promise;await page.locator('#private-name').fill('New');await page.locator('#private-save').click();await expect(page.locator('#private-save-state')).toHaveAttribute('data-state','success');await expect(page.locator('#private-list-state')).toHaveAttribute('data-state','success');const beforeLists=o.requests.filter(r=>r.url.endsWith('/list')).length;verified=await snapshot();await releaseRead(lateSave);expect(o.requests.filter(r=>r.url.endsWith('/list'))).toHaveLength(beforeLists);expect(await snapshot()).toEqual(verified);const lastTwo=o.requests.filter(r=>r.url.endsWith('/save')).slice(-2);expect(lastTwo[0].body.requestId).not.toBe(lastTwo[1].body.requestId);
  // 旧page2不能覆盖新page3。
  const lateList=arm('list',{items:[{...cohort,name:'OLD page 2'}],total:100,page:2,size:20,meta:{traceId:'trace-private'}});await page.locator('#private-next').click();await lateList.received.promise;await page.locator('#private-next').click();await expect(page.locator('#private-page')).toHaveText('第 3 页 · 每页 20 条 · 共 100 条');await expect(page.locator('#private-items')).toContainText('Page 3');verified=await snapshot();await releaseRead(lateList);expect(await snapshot()).toEqual(verified);
  const cancelled=arm('save',receipt);await submit('Cancel');await cancelled.received.promise;await page.locator('#private-cancel').click();verified=await snapshot();await releaseRead(cancelled);await expect(page.locator('#private-save-dialog')).toBeHidden();expect(await snapshot()).toEqual(verified);
  // 明确业务失败不盲重试；输入保留，名称冲突有改名提示。
  for(const error of [[400,'INVALID_REQUEST'],[409,'NAME_CONFLICT'],[409,'IDEMPOTENCY_CONFLICT'],[413,'LIMIT_EXCEEDED']]){saveError=error;await submit('Keep input');await expect(page.locator('#private-save-state')).toHaveAttribute('data-state','error');await expect(page.locator('#private-save-state')).toContainText(expectedError[error[1]]);await expect(page.locator('#private-save-state')).not.toContainText('trace-private');await expect(page.locator('#private-name')).toHaveValue('Keep input');await expect(page.locator('#private-retry')).toBeHidden();if(error[1]==='NAME_CONFLICT')await expect(page.locator('#private-save-state')).toContainText('修改名称');}saveError=null;
  // 三种独立pending权利在身份变化/离页后同时关闭，abort无操作也不能恢复。
  for(const terminal of ['identity','pagehide']){
   await fresh();const pendingO=arm('open',{cohort:newer,analysis:second,meta:{traceId:'trace-private'}});await open();await pendingO.received.promise;const pendingS=arm('save',receipt);await submit('Private secret');await pendingS.received.promise;const pendingL=arm('list',{items:[cohort],total:1,page:1,size:20,meta:{traceId:'trace-private'}});await page.locator('#private-list-load').click();await pendingL.received.promise;
   if(terminal==='identity')await page.evaluate(()=>{sessionStorage.setItem('ra-auth',JSON.stringify({name:'另一合成身份',role:'研究者',expires:0}));window.dispatchEvent(new Event('focus'));});else await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
   await noPrivate();const count=await readCount();for(const h of [pendingO,pendingS,pendingL])h.release.resolve();await page.waitForFunction(count=>window.__privateReads.length===count+3,count);await noPrivate();
  }
  expect(o.pageErrors).toEqual([]);expect(await page.evaluate(()=>window.__privateAborts)).toBeGreaterThan(0);
 }finally{for(const h of allHolds)h.release.resolve();await o.save();}
});

test('cohort:private-metadata-conflicts',async({page,context,browser})=>{
 const selected={...structuredClone(cohort),note:'  原备注  '},other={...structuredClone(cohort),cohortId:'00000000-0000-0000-0000-000000000200',name:'Other'};
 const commands=[],filters=structuredClone(selected.filters);let error=null,unsafe=false,unsafeReceipt=false,listFault=null;
 const o=await setup({page,context,browser},'cohort:private-metadata-conflicts',(route,r)=>{
  const path=new URL(r.url).pathname;
  if(path.endsWith('/rename')){commands.push(r.body);if(error)return fulfill(route,null,error[0],error[1]);if(Object.hasOwn(r.body,'name'))selected.name=r.body.name;if(Object.hasOwn(r.body,'note'))selected.note=r.body.note;selected.version++;if(unsafeReceipt)selected.version=9007199254740992;return fulfill(route,{cohortId:selected.cohortId,version:selected.version,meta:{traceId:'trace-private'}});}
  if(path.endsWith('/list')){if(listFault){const fault=listFault;listFault=null;if(fault==='offline')return route.abort('failed');if(fault==='nonjson')return route.fulfill({status:200,contentType:'text/html',body:'broken'});return fulfill(route,null,503,'SERVICE_UNAVAILABLE');}const data={items:[selected,other],total:2,page:1,size:20,meta:{traceId:'trace-private'}};if(unsafe)return route.fulfill({status:200,contentType:'application/json',headers:{'X-Trace-Id':'trace-private'},body:JSON.stringify({success:true,code:'200',data}).replace('"version":'+selected.version,'"version":9007199254740993')});return fulfill(route,data);}
  if(path.endsWith('/open'))return fulfill(route,{cohort:selected,analysis:U,meta:{traceId:'trace-private'}});
  return fulfill(route,U);
 });
 const edit=async()=>{await page.locator(`[data-edit-cohort="${cohort.cohortId}"]`).click();await expect(page.locator('#private-command-dialog')).toBeVisible();};
 const confirm=async()=>{await page.locator('#private-command-confirm').click();await expect(page.locator('#private-command-state')).toHaveAttribute('data-state','success');await expect(page.locator('#private-list-state')).toHaveAttribute('data-state','success');};
 try{
  await page.goto(o.origin+'/ai-cohort.html');await o.auth.verify(page);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');const analyses=o.requests.filter(r=>r.url.endsWith('/cohort')).length;
  await page.locator('#private-list-load').click();await expect(page.locator('#private-list-state')).toHaveAttribute('data-state','success');
  await edit();await expect(page.locator('#private-edit-name')).toHaveValue('Trial');await page.locator('#private-command-confirm').click();expect(commands).toHaveLength(0);await expect(page.locator('#private-command-state')).toContainText('未变化');
  await page.locator('#private-edit-name').fill('Trial2');await confirm();expect(Object.keys(commands[0]).sort()).toEqual(['cohortId','name','requestId','version']);expect(commands[0]).toMatchObject({cohortId:cohort.cohortId,name:'Trial2',version:1});await expect(page.locator('#private-items')).toContainText('Trial2');await expect(page.locator('#private-items')).toContainText('原备注');expect(selected.note).toBe('  原备注  ');
  await edit();await page.locator('#private-edit-note-mode').selectOption('clear');await confirm();expect(commands[1]).toMatchObject({cohortId:cohort.cohortId,version:2,note:null});expect(Object.hasOwn(commands[1],'name')).toBe(false);expect(selected.note).toBe(null);
  await edit();await page.locator('#private-edit-note-mode').selectOption('value');await confirm();expect(commands[2].note).toBe('');expect(commands[2].version).toBe(3);expect(selected.note).toBe('');
  await edit();await page.locator('#private-edit-name').fill('\u00a0Trial2\u00a0');await page.locator('#private-edit-note').fill(' <script>bad()</script> ');await confirm();expect(commands[3].name).toBe('\u00a0Trial2\u00a0');expect(commands[3].note).toBe(' <script>bad()</script> ');await expect(page.locator('#private-items')).toContainText('<script>bad()</script>');expect(await page.locator('#private-items script').count()).toBe(0);expect(selected.filters).toEqual(filters);
  for(const code of ['NAME_CONFLICT','VERSION_CONFLICT','IDEMPOTENCY_CONFLICT']){
   error=[409,code];await edit();await page.locator('#private-edit-name').fill('Keep '+code);const before=commands.length;await page.locator('#private-command-confirm').click();await expect(page.locator('#private-command-state')).toHaveAttribute('data-state','error');await expect(page.locator('#private-command-state')).toContainText(expectedError[code]);await expect(page.locator('#private-command-state')).not.toContainText('trace-private');await expect(page.locator('#private-edit-name')).toHaveValue('Keep '+code);await expect(page.locator('#private-command-retry')).toBeHidden();expect(commands).toHaveLength(before+1);
   if(code==='VERSION_CONFLICT'){const failed=commands.at(-1);
    await page.locator(`[data-delete-cohort="${other.cohortId}"]`).click();await expect(page.locator('#private-command-target')).toContainText('Other');await expect(page.locator('#private-command-confirm'),'新delete确认不能继承旧版本冲突禁用权').toBeEnabled();await expect(page.locator('#private-version-refresh'),'新delete不能继承旧编辑刷新权').toBeHidden();await page.locator('#private-command-cancel').click();
    await edit();await page.locator('#private-edit-name').fill('Keep '+code);await page.locator('#private-command-confirm').click();await expect(page.locator('#private-command-state')).toContainText('记录已更新，请刷新并核对后重试');selected.version=10;await expect(page.locator('#private-version-refresh')).toBeVisible();await page.locator('#private-edit-name').fill('Keep refreshed input');await expect(page.locator('#private-version-refresh')).toBeVisible();
    for(const fault of ['503','nonjson','offline']){listFault=fault;await page.locator('#private-version-refresh').click();await expect(page.locator('#private-list-state')).toHaveAttribute('data-state','error');await expect(page.locator('#private-edit-name')).toHaveValue('Keep refreshed input');await expect(page.locator('#private-command-confirm')).toBeDisabled();await expect(page.locator('#private-version-refresh')).toBeVisible();await expect(page.locator('#private-command-state')).toContainText('刷新失败');}
    await page.locator('#private-version-refresh').click();await expect(page.locator('#private-command-state')).toContainText('元信息已刷新');await expect(page.locator('#private-edit-name')).toHaveValue('Keep refreshed input');error=null;await confirm();expect(commands.at(-1).version).toBe(10);expect(commands.at(-1).requestId).not.toBe(failed.requestId);}
   else await page.locator('#private-command-cancel').click();
  }
  // 既有通用400/413处理为characterization：保输入可修改，不能装成成功或隐藏重发。
  for(const [status,code] of [[400,'INVALID_REQUEST'],[413,'LIMIT_EXCEEDED']]){error=[status,code];await edit();await page.locator('#private-edit-name').fill('Keep '+code);const before=commands.length;await page.locator('#private-command-confirm').click();await expect(page.locator('#private-command-state')).toHaveAttribute('data-state','error');await expect(page.locator('#private-command-state')).toContainText(expectedError[code]);await expect(page.locator('#private-command-state')).not.toContainText('trace-private');await expect(page.locator('#private-edit-name')).toHaveValue('Keep '+code);await expect(page.locator('#private-command-confirm')).toBeEnabled();await expect(page.locator('#private-command-retry')).toBeHidden();expect(commands).toHaveLength(before+1);await page.locator('#private-command-cancel').click();}
  error=null;unsafe=true;await page.locator('#private-list-load').click();await expect(page.locator('#private-items')).toContainText('超出安全显示范围');await expect(page.locator(`[data-edit-cohort="${cohort.cohortId}"]`)).toBeDisabled();await expect(page.locator(`[data-delete-cohort="${cohort.cohortId}"]`)).toBeDisabled();await expect(page.locator(`[data-open-cohort="${cohort.cohortId}"]`)).toBeEnabled();
  await page.locator(`[data-open-cohort="${cohort.cohortId}"]`).click();await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');
  unsafe=false;selected.version=Number.MAX_SAFE_INTEGER;await page.locator('#private-list-load').click();await expect(page.locator(`[data-edit-cohort="${cohort.cohortId}"]`)).toBeEnabled();unsafeReceipt=true;await edit();await page.locator('#private-edit-name').fill('Safe limit');await confirm();expect(commands.at(-1).version).toBe(Number.MAX_SAFE_INTEGER);await expect(page.locator(`[data-edit-cohort="${cohort.cohortId}"]`)).toBeDisabled();await expect(page.locator(`[data-delete-cohort="${cohort.cohortId}"]`)).toBeDisabled();
  expect(o.requests.filter(r=>r.url.endsWith('/cohort'))).toHaveLength(analyses);expect(o.requests.filter(r=>r.url.endsWith('/open'))).toHaveLength(1);expect(o.pageErrors).toEqual([]);
 }finally{await o.save();}
});

test('cohort:private-delete-replay',async({page,context,browser})=>{
 const oldId=cohort.cohortId,newId='00000000-0000-0000-0000-000000000300';let selected={...structuredClone(cohort),version:2},active=true,newItem=null,fault=null;
 const commands=[],holds=new Map(),allHolds=[];
 const receipt=version=>({cohortId:oldId,version,meta:{traceId:'trace-private'}});
 const listData=()=>({items:[...(active?[structuredClone(selected)]:[]),...(newItem?[structuredClone(newItem)]:[])],total:Number(active)+Number(Boolean(newItem)),page:1,size:20,meta:{traceId:'trace-private'}});
 const arm=(path,data,commit=false)=>{const h={received:gate(),release:gate(),data,commit};(holds.get(path)||holds.set(path,[]).get(path)).push(h);allHolds.push(h);return h;};
 await inertAbort(context);await page.clock.install();
 const o=await setup({page,context,browser},'cohort:private-delete-replay',async(route,r)=>{
  const path=new URL(r.url).pathname.split('/').at(-1);if(['delete','rename'].includes(path))commands.push({action:path,body:r.body});
  const h=holds.get(path)?.shift();if(h){if(h.commit&&path==='delete')active=false;h.received.resolve(r);await h.release.promise;return fulfill(route,h.data);}
  if(['delete','rename'].includes(path)&&fault){const f=fault;fault=null;if(f==='offline')return route.abort('failed');if(f==='nonjson')return route.fulfill({status:200,contentType:'text/html',body:'broken'});return fulfill(route,null,f[0],f[1]);}
  if(path==='list')return fulfill(route,listData());
  if(path==='delete'){active=false;return fulfill(route,receipt(3));}
  if(path==='rename'){if(Object.hasOwn(r.body,'name'))selected.name=r.body.name;if(Object.hasOwn(r.body,'note'))selected.note=r.body.note;selected.version++;return fulfill(route,receipt(selected.version));}
  if(path==='save')return fulfill(route,receipt(1));
  if(path==='open')return fulfill(route,{cohort:selected,analysis:U,meta:{traceId:'trace-private'}});
  return fulfill(route,U);
 });
 const load=async()=>{await page.locator('#private-list-load').click();await expect(page.locator('#private-list-state')).toHaveAttribute('data-state',active||newItem?'success':'empty');};
 const begin=async(action='delete')=>{await expect(page.locator(`[data-${action==='rename'?'edit':'delete'}-cohort="${oldId}"]`)).toBeVisible();await page.locator(`[data-${action==='rename'?'edit':'delete'}-cohort="${oldId}"]`).click();if(action==='rename')await page.locator('#private-edit-name').fill('Edited');};
 const confirm=()=>page.locator('#private-command-confirm').click();
 const releaseRead=async h=>{const before=await page.evaluate(()=>window.__privateReads.length);h.release.resolve();await page.waitForFunction(before=>window.__privateReads.length>before,before);};
 const snapshot=()=>page.locator('main').innerHTML();
 const fresh=async()=>{active=true;newItem=null;selected={...structuredClone(cohort),version:2};await page.goto(o.origin+'/ai-cohort.html');await o.auth.verify(page);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');await load();};
 try{
  await fresh();await begin();await expect(page.locator('#private-command-target')).toContainText('Trial');await expect(page.locator('#private-command-target')).toContainText('条件');await expect(page.locator('#private-edit-fields')).toBeHidden();await page.locator('#private-command-cancel').click();expect(commands).toHaveLength(0);
  await begin();const pending=arm('delete',receipt(3),true);await confirm();await pending.received.promise;await page.clock.runFor(30001);await expect(page.locator('#private-command-state')).toHaveAttribute('data-state','error');await expect(page.locator('#private-command-state')).toContainText('结果尚未确认');await expect(page.locator('#private-command-retry')).toBeVisible();await expect(page.locator('#private-command-confirm')).toBeEnabled();
  await page.locator('#private-command-retry').click();await expect(page.locator('#private-list-state')).toHaveAttribute('data-state','empty');expect(commands).toHaveLength(2);expect(commands[1]).toEqual(commands[0]);expect(Object.keys(commands[0].body).sort()).toEqual(['cohortId','requestId','version']);expect(commands[0].body.version).toBe(2);const oldCommand=commands[0].body;
  let before=o.requests.filter(r=>r.url.endsWith('/list')).length,dom=await snapshot();await releaseRead(pending);expect(o.requests.filter(r=>r.url.endsWith('/list'))).toHaveLength(before);expect(await snapshot()).toEqual(dom);await expect(page.locator('#private-items > *')).toHaveCount(0);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');
  // 断网、503、损坏响应三种未知结果均显式重放逐键相同；不隐藏重发。
  for(const failure of ['offline',[503,'SERVICE_UNAVAILABLE'],'nonjson']){await fresh();await begin('rename');fault=failure;before=commands.length;await confirm();await expect(page.locator('#private-command-state')).toHaveAttribute('data-state','error');await expect(page.locator('#private-command-retry')).toBeVisible();expect(commands).toHaveLength(before+1);const original=structuredClone(commands.at(-1));await page.locator('#private-command-retry').click();await expect(page.locator('#private-command-state')).toHaveAttribute('data-state','success');expect(commands.at(-1)).toEqual(original);expect(commands).toHaveLength(before+2);}
  // 输入变化撤权：旧rename回执晚到，不能关新delete确认或改其错误。
  await fresh();await begin('rename');const lateRename=arm('rename',receipt(3));await confirm();await lateRename.received.promise;await page.locator('#private-edit-name').fill('New input');fault=[409,'NAME_CONFLICT'];await confirm();await expect(page.locator('#private-command-state')).toContainText('名称已被使用，请修改名称');const firstPair=commands.slice(-2);expect(firstPair[0].body.requestId).not.toBe(firstPair[1].body.requestId);await begin();dom=await snapshot();await releaseRead(lateRename);expect(await snapshot()).toEqual(dom);await expect(page.locator('#private-command-title')).toHaveText('确认删除私有定义');fault=[404,'RESOURCE_NOT_FOUND'];await confirm();await expect(page.locator('#private-command-state')).toContainText('所需记录不存在或当前账号无法访问');expect(commands.at(-1).body.requestId).not.toBe(firstPair[1].body.requestId);await page.locator('#private-command-cancel').click();
  // 删后旧list才读完：最新list决定空项，不能重插旧ID（最高loss UI fence反事实目标）。
  await fresh();const lateList=arm('list',listData());await page.locator('#private-list-load').click();await lateList.received.promise;await load();await begin();await confirm();await expect(page.locator('#private-list-state')).toHaveAttribute('data-state','empty');dom=await snapshot();await releaseRead(lateList);await expect(page.locator(`[data-open-cohort="${oldId}"]`),'删除确认后迟到旧list不能复活旧ID').toHaveCount(0);expect(await snapshot()).toEqual(dom);
  // 已开始open的原分析可以完成；已知删除的元信息不再称活动定义。
  await fresh();const lateOpen=arm('open',{cohort:structuredClone(selected),analysis:U,meta:{traceId:'trace-private'}});await page.locator(`[data-open-cohort="${oldId}"]`).click();await lateOpen.received.promise;await begin();await confirm();await expect(page.locator('#private-list-state')).toHaveAttribute('data-state','empty');await releaseRead(lateOpen);await expect(page.locator('#results')).toHaveAttribute('data-analysis-id',U.analysisId);await expect(page.locator('#private-open-meta')).toContainText('已删除');await expect(page.locator(`[data-open-cohort="${oldId}"]`)).toHaveCount(0);
  // 历史save/rename回执不能拼回删除条目，同名新定义以新ID区分。
  await fresh();await page.locator('#save-cohort').click();await page.locator('#private-name').fill('Trial');const lateSave=arm('save',receipt(1));await page.locator('#private-save').click();await lateSave.received.promise;await begin();await confirm();await expect(page.locator('#private-list-state')).toHaveAttribute('data-state','empty');newItem={...structuredClone(cohort),cohortId:newId,version:1};await releaseRead(lateSave);await expect(page.locator(`[data-open-cohort="${newId}"]`)).toHaveCount(1);await expect(page.locator(`[data-open-cohort="${oldId}"]`)).toHaveCount(0);expect(oldCommand.cohortId).not.toBe(newId);
  // 各终止入口关闭timer/等待和发布权，abort无操作仍不能恢复旧对话框。
  for(const terminal of ['cancel','refresh','identity','pagehide']){
   await fresh();await begin('rename');const late=arm('rename',receipt(3));await confirm();await late.received.promise;
   if(terminal==='cancel')await page.locator('#private-command-cancel').click();
   if(terminal==='refresh')await load();
   if(terminal==='identity')await page.evaluate(()=>{sessionStorage.setItem('ra-auth',JSON.stringify({name:'另一合成身份',role:'研究者',expires:0}));window.dispatchEvent(new Event('focus'));});
   if(terminal==='pagehide')await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
   await expect(page.locator('#private-command-dialog')).toBeHidden();if(['identity','pagehide'].includes(terminal)){await expect(page.locator('#private-items > *')).toHaveCount(0);await expect(page.locator('#private-edit-name')).toHaveValue('');await expect(page.locator('#private-edit-note')).toHaveValue('');}
   dom=await snapshot();before=o.requests.filter(r=>r.url.endsWith('/list')).length;await page.clock.runFor(30001);expect(await snapshot()).toEqual(dom);await releaseRead(late);expect(await snapshot()).toEqual(dom);expect(o.requests.filter(r=>r.url.endsWith('/list'))).toHaveLength(before);
  }
  await fresh();await begin('rename');fault=[401,'UNAUTHENTICATED'];await confirm();await expect(page.locator('#private-items > *')).toHaveCount(0);await expect(page.locator('#private-command-dialog')).toBeHidden();await expect(page.locator('#private-edit-name')).toHaveValue('');await expect(page.locator('#login-return')).toBeVisible();expect(o.pageErrors).toEqual([]);
 }finally{for(const h of allHolds)h.release.resolve();await o.save();}
});
