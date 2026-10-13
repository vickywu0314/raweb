const {test,expect}=require('@playwright/test');
const {installAuthBootstrap}=require('../fixtures/auth-bootstrap.cjs');
// 独立中文业务真值；不使用生产显示函数生成期望。
const expectedError={"UNAUTHENTICATED":"登录已失效，请重新登录","INVALID_REQUEST":"输入内容不符合要求，请检查后重试","INVALID_RESPONSE":"返回的数据不完整或无法识别，请重新读取","NETWORK_ERROR":"网络连接失败，请检查连接后重试","SERVICE_UNAVAILABLE":"服务暂不可用，请稍后重试","LIMIT_EXCEEDED":"内容超出允许范围，请调整后重试","INVALID_FILTER":"筛选条件无效，请检查后重试"};
const {writeFile}=require('node:fs/promises');
const {U}=require('../fixtures/cohort-p02.json');
const fixtures=require('../fixtures/cohort-parse.json');
const {PARTIAL}=fixtures;
async function setup({page,context,browser},scenario,respond){
 await page.bringToFront();
  const auth=await installAuthBootstrap(context);
const origin=process.env.RA_STATIC_URL,requests=[],allowed=[],blocked=[],pageErrors=[];
 page.on('pageerror',e=>pageErrors.push(e.message));
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==origin){blocked.push(req.url());return route.abort('blockedbyclient');}allowed.push(req.url());if(await auth.handle(route))return;if(!url.pathname.startsWith('/api/'))return route.continue();const r={url:req.url(),method:req.method(),headers:req.headers(),body:req.postDataJSON()};requests.push(r);return respond(route,r);});
 const save=async()=>{const data={scenario,version:browser.version(),url:page.url(),requests,authRequests:auth.requests,allowed,blocked,pageErrors,dom:await page.locator('main').innerText().catch(()=>null)};for(const name of ['network.json','browser-observation.json'])await writeFile(`${process.env.RA_RUN_DIR}/${name}`,JSON.stringify(data,null,2)+'\n');};
 return {origin,auth,requests,pageErrors,save};
}
const fulfill=(route,data,status=200,code='200',trace='trace-p05')=>route.fulfill({status,contentType:'application/json',headers:{'X-Trace-Id':trace},body:JSON.stringify({success:status===200,code,message:status===200?'成功':'安全错误',data})});
const snapshot=page=>page.evaluate(()=>({url:location.href,values:['sex','age','sero','tx','at','act','cm','data'].map(k=>document.querySelector('#f-'+k).value),analysisId:document.querySelector('#results').dataset.analysisId,results:document.querySelector('#results').innerHTML,rows:document.querySelector('#patient-rows').innerHTML}));
const parseCalls=o=>o.requests.filter(r=>r.url.endsWith('/ai/parse'));
test('cohort:parse-candidates',async({page,context,browser})=>{
 let reply=PARTIAL,active=U,hold=null,serial=80;const release=()=>{hold?.resolve();hold=null;};
 const normalized=(candidate,current)=>({studyCode:'RA',sex:null,age:null,sero:null,tx:null,at:'now',act:null,cm:null,data:null,...candidate,ids:current.ids==null?null:[...new Set(current.ids)].sort((a,b)=>a.length-b.length||a.localeCompare(b))});
 const o=await setup({page,context,browser},'cohort:parse-candidates',async(route,r)=>{
  if(r.url.endsWith('/ai/parse'))return fulfill(route,reply);
  if(r.url.endsWith('/ai/applyParse')){if(hold)await hold.promise;const filters=normalized(r.body.candidateFilters,r.body.currentFilters);active={...U,analysisId:`00000000-0000-0000-0000-${String(serial++).padStart(12,'0')}`};return fulfill(route,{questionRef:r.body.questionRef,parseStatus:r.body.parseStatus,applyMode:reply.applyMode,applied:true,filters,meta:{...reply.meta,traceId:'trace-p05-apply',modelVersion:null,promptVersion:null,durationMs:4}},200,'200','trace-p05-apply');}
  return fulfill(route,active);
 });
 try{
  await page.goto(o.origin+'/ai-cohort.html?sex=M&tx=TNFi&ids=9223372036854775807,1');await o.auth.verify(page);await expect(page.locator('#results')).toHaveAttribute('data-analysis-id',U.analysisId);const old=await snapshot(page),count=o.requests.length;
  await page.locator('#question').fill('女性且吸烟');await page.locator('#question-form button[type="submit"]').click();await expect.poll(()=>parseCalls(o).length).toBe(1);
  expect(parseCalls(o)[0].body).toEqual({question:'女性且吸烟'});expect(parseCalls(o)[0].method).toBe('POST');expect(parseCalls(o)[0].headers['content-type']).toBe('application/json;charset=UTF-8');expect(parseCalls(o)[0].headers.authorization).toBeUndefined();expect(parseCalls(o)[0].headers['x-doctor-id']).toBeUndefined();
  await expect(page.locator('#parse-state')).toHaveAttribute('data-state','success');await expect(page.locator('#parse-candidate')).toHaveText('女性');await expect(page.locator('#parse-state')).toContainText('尚未应用');await expect(page.locator('#parse-note')).toHaveText(PARTIAL.notice);await expect(page.locator('#parse-details')).toContainText('仅识别了部分内容，确认前不会应用');await expect(page.locator('#parse-details')).toContainText('请确认后仅应用已识别的条件');await expect(page.locator('#parse-apply')).toBeVisible();expect(await snapshot(page)).toEqual(old);expect(o.requests).toHaveLength(count+1);
  for(const [question,key] of [['女性','OK'],['   ','EMPTY'],['吸烟','UNRECOGNIZED'],['女性或男性','UNSUPPORTED'],['TNFi 治疗 6 个月后仍处于中高疾病活动的患者','TNFI'],['女性且吸烟','AI_PARTIAL']]){
   reply=fixtures[key];const n=o.requests.length,p=parseCalls(o).length,stable=await snapshot(page);if(reply.parseStatus==='OK')hold=gate();await page.locator('#question').fill(question);await page.locator('#question').press('Enter');await expect.poll(()=>parseCalls(o).length).toBe(p+1);
   await expect(page.locator('#parse-note')).toHaveText(reply.notice);
   const expectedParse={OK:{candidate:'女性',details:'已识别可用条件；智能解析暂未启用，已按现有规则识别'},EMPTY:{candidate:'暂无可用候选，保留当前条件',details:'未输入内容；智能解析暂未启用，已按现有规则识别'},UNRECOGNIZED:{candidate:'暂无可用候选，保留当前条件',details:'未识别到可用条件；仍有部分文字未识别（2个字符），未用于筛选；智能解析暂未启用，已按现有规则识别'},UNSUPPORTED:{candidate:'暂无可用候选，保留当前条件',details:'暂不支持此条件；智能解析暂未启用，已按现有规则识别；暂不支持“或”条件，请分别筛选'},TNFI:{candidate:'治疗类别：TNF 抑制剂（TNFi）；治疗后六个月；中高疾病活动',details:'已识别可用条件；智能解析暂未启用，已按现有规则识别'},AI_PARTIAL:{candidate:'女性',details:'仅识别了部分内容，确认前不会应用；仍有部分文字未识别（2个字符），未用于筛选；指定患者：该条件不允许用于筛选；部分条件无法使用；请确认后仅应用已识别的条件'}}[key];
   await expect(page.locator('#parse-candidate')).toHaveText(expectedParse.candidate);await expect(page.locator('#parse-details')).toHaveText(expectedParse.details);
   await expect(page.locator('#parse-details')).not.toContainText(/engine=|REPLACE_EXCEPT_IDS|REQUIRE_CONFIRMATION|KEEP_CURRENT|UNMAPPED_TEXT|FORBIDDEN_FIELD|\{\s*"/);expect(parseCalls(o).at(-1).body).toEqual({question});expect(await snapshot(page)).toEqual(stable,'解析及apply成功前均保持当前条件/旧结果');
   if(reply.parseStatus==='OK'){await expect.poll(()=>o.requests.filter(r=>r.url.endsWith('/ai/applyParse')).length).toBe(key==='OK'?1:2);release();await expect(page.locator('#parse-state')).toContainText('已应用');await expect(page.locator('#results')).toHaveAttribute('data-analysis-id',active.analysisId);expect((await snapshot(page)).analysisId).not.toBe(stable.analysisId);expect(o.requests).toHaveLength(n+3);}
   else{await expect(page.locator('#parse-state')).toHaveAttribute('data-state','success');expect(o.requests).toHaveLength(n+1);expect(await snapshot(page)).toEqual(stable);if(reply.parseStatus==='PARTIAL')await expect(page.locator('#parse-apply')).toBeVisible();else await expect(page.locator('#parse-apply')).toBeHidden();}
  }
  const prior=await snapshot(page);reply={...fixtures.OK,notice:'<img src=x onerror=alert(1)><a href="https://example.invalid">字面</a>'};hold=gate();await page.locator('#question-form button[type="submit"]').click();await expect(page.locator('#parse-note')).toHaveText(reply.notice);await expect(page.locator('#parse-note img,#parse-note a,#parse-note script')).toHaveCount(0);expect(await snapshot(page)).toEqual(prior);release();await expect(page.locator('#parse-state')).toContainText('已应用');await expect(page.locator('#results')).toHaveAttribute('data-analysis-id',active.analysisId);
  const cohorts=o.requests.filter(r=>r.url.endsWith('/ai/cohort')).length;await page.locator('#reanalyze').click();await expect.poll(()=>o.requests.filter(r=>r.url.endsWith('/ai/cohort')).length).toBe(cohorts+1);expect(parseCalls(o).at(-1).body.question).toBe('女性且吸烟');expect(o.pageErrors).toEqual([]);
 }finally{release();await o.save();}
});

test('cohort:parse-preserve-errors',async({page,context,browser})=>{
 let mode='ok';const o=await setup({page,context,browser},'cohort:parse-preserve-errors',(route,r)=>{
  if(!r.url.endsWith('/ai/parse'))return fulfill(route,U);
  if(mode==='network')return route.abort('failed');if(mode==='nonjson')return route.fulfill({status:503,contentType:'text/html',headers:{'X-Trace-Id':'trace-p05'},body:'bad'});
  if(Array.isArray(mode))return fulfill(route,null,...mode);
  if(mode==='invalid')return fulfill(route,{...PARTIAL,candidateFilters:{ids:['1']}});
  return fulfill(route,PARTIAL);
 });
 try{
  await page.goto(o.origin+'/ai-cohort.html?sex=M&tx=TNFi&ids=');await o.auth.verify(page);await expect(page.locator('#results')).toHaveAttribute('data-analysis-id',U.analysisId);const old=await snapshot(page);
  await page.locator('#question').fill('女性且吸烟');
  for(const [fault,code] of [[[400,'INVALID_REQUEST'],'INVALID_REQUEST'],[[400,'INVALID_FILTER'],'INVALID_FILTER'],[[413,'LIMIT_EXCEEDED'],'LIMIT_EXCEEDED'],[[503,'SERVICE_UNAVAILABLE'],'SERVICE_UNAVAILABLE'],['network','NETWORK_ERROR'],['nonjson','INVALID_RESPONSE'],['invalid','INVALID_RESPONSE']]){
   mode='ok';await page.locator('#question-form button[type="submit"]').click();await expect(page.locator('#parse-state')).toHaveAttribute('data-state','success');mode=fault;const n=o.requests.length;await page.locator('#question-form button[type="submit"]').click();await expect(page.locator('#parse-state')).toHaveAttribute('data-state','error');await expect(page.locator('#parse-state')).toContainText(expectedError[code]);if(!['network'].includes(fault))await expect(page.locator('#parse-state')).not.toContainText('trace-p05');await expect(page.locator('#parse-candidate')).toHaveText('');await expect(page.locator('#parse-dismiss')).toBeHidden();await expect(page.locator('#question')).toHaveValue('女性且吸烟');expect(await snapshot(page)).toEqual(old);expect(o.requests).toHaveLength(n+1);
  }
  mode=[401,'UNAUTHENTICATED'];await page.locator('#question-form button[type="submit"]').click();await expect(page.locator('#parse-state')).toContainText('登录已失效，请重新登录');await expect(page.locator('#results')).not.toHaveAttribute('data-analysis-id');await expect(page.locator('#patient-rows > *')).toHaveCount(0);await expect(page.locator('#private-items > *')).toHaveCount(0);await expect(page.locator('#compare-start')).toBeDisabled();await expect(page.locator('#login-return')).toBeVisible();expect(o.pageErrors).toEqual([]);
 }finally{await o.save();}
});
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function inertParseAbort(context){await context.addInitScript(()=>{
 window.__parseReads=[];window.__parseAborts=0;const NativeAbortController=window.AbortController;window.AbortController=class extends NativeAbortController{abort(){window.__parseAborts++;}};
 const original=window.fetch;window.fetch=async(...args)=>{const response=await original(...args),json=response.json.bind(response);response.json=async()=>{const value=await json();window.__parseReads.push({url:String(args[0]),value});return value;};return response;};
});}
test('cohort:parse-late-isolation',async({page,context,browser})=>{
 const holds=[],queue=[],producers=[],producerQueue=[];let serial=60,analysisSerial=1000,reply=fixtures.OK,comparePending=null;
 await inertParseAbort(context);await page.clock.install();
 const comparison=require('../fixtures/cohort-comparison.json').before;
 const definition=require('../fixtures/cohort-private.json').cohort;
 const clone=x=>JSON.parse(JSON.stringify(x));
 const produce=async(route,r,kind)=>{
  const hold=producerQueue.shift();if(hold)expect(hold.kind).toBe(kind);
  const data={...clone(U),analysisId:`00000000-0000-0000-0000-${String(analysisSerial++).padStart(12,'0')}`};
  const owner={kind,analysisId:data.analysisId,request:r,data};producers.push(owner);
  if(hold){hold.owner=owner;hold.received.resolve();await hold.release.promise;}
  return fulfill(route,kind==='open'?{cohort:definition,analysis:data,meta:{traceId:'trace-p05'}}:data);
 };
 const o=await setup({page,context,browser},'cohort:parse-late-isolation',async(route,r)=>{
  if(r.url.endsWith('/ai/parse')){const h=queue.shift();if(h){h.received.resolve();await h.release.promise;return fulfill(route,h.data);}return fulfill(route,reply);}
  if(r.url.endsWith('/ai/applyParse'))return fulfill(route,{questionRef:r.body.questionRef,parseStatus:r.body.parseStatus,applyMode:'REPLACE_EXCEPT_IDS',applied:true,filters:{studyCode:'RA',sex:'F',age:null,sero:null,tx:null,at:'now',act:null,cm:null,data:null,ids:r.body.currentFilters.ids??null},meta:{...fixtures.OK.meta,traceId:'trace-p05-apply',durationMs:4}},200,'200','trace-p05-apply');
  if(r.url.endsWith('/list'))return fulfill(route,{items:[definition],total:1,page:1,size:20,meta:{traceId:'trace-p05'}});
  if(r.url.endsWith('/open'))return produce(route,r,'open');
  if(r.url.endsWith('/ai/cohort'))return produce(route,r,'cohort');
  if(r.url.endsWith('/ai/compare')||r.url.endsWith('/ai/compareResult')){
   if(comparePending){const h=comparePending;comparePending=null;h.received.resolve();await h.release.promise;}
   const data=clone(comparison);data.meta.traceId='trace-p05';if(r.body.a)for(const side of ['a','b']){const input=r.body[side],filters=input.source==='SAVED'?definition.filters:input.filters;data[side].source=input.source;data[side].cohortId=input.source==='SAVED'?definition.cohortId:null;data[side].cohortVersion=input.source==='SAVED'?definition.version:null;data[side].filters={studyCode:'RA',sex:null,age:null,sero:null,tx:null,at:'now',act:null,cm:null,data:null,ids:null,...Object.fromEntries(Object.entries(filters).map(([k,v])=>[k,v===''?null:v]))};}return fulfill(route,data);
  }
  return fulfill(route,U);
 });
 const arm=()=>{const h={received:gate(),release:gate(),data:{...clone(PARTIAL),questionRef:`00000000-0000-0000-0000-${String(serial++).padStart(12,'0')}`}};holds.push(h);queue.push(h);return h;};
 const submit=()=>page.locator('#question-form button[type="submit"]').click();
 const published=async owner=>{
  await page.waitForFunction(id=>window.__parseReads.some(r=>(r.value?.data?.analysisId||r.value?.data?.analysis?.analysisId)===id),owner.analysisId);
  await expect(page.locator('#results')).toHaveAttribute('data-analysis-id',owner.analysisId);
  await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');
  await expect(page.locator('#patient-rows > *')).toHaveCount(6);await expect(page.locator('#list-count')).toHaveText('6 位患者 · 已显示 6 位');
 };
 const nextProducer=async count=>{await expect.poll(()=>producers.length).toBe(count+1);return producers[count];};
 const holdProducer=kind=>{const h={kind,received:gate(),release:gate()};holds.push(h);producerQueue.push(h);return h;};
 const counts=()=>({parse:parseCalls(o).length,apply:o.requests.filter(r=>r.url.endsWith('/ai/applyParse')).length,cohort:o.requests.filter(r=>r.url.endsWith('/ai/cohort')).length,open:o.requests.filter(r=>r.url.endsWith('/open')).length,total:o.requests.length});
 const fresh=async()=>{const before=producers.length;await page.goto(o.origin+'/ai-cohort.html?sex=M&tx=TNFi&ids=1');await o.auth.verify(page);await published(await nextProducer(before));await page.locator('#question').fill('女性且吸烟');};
 const start=async()=>{const h=arm();await submit();await h.received.promise;await expect(page.locator('#parse-state')).toHaveAttribute('data-state','loading');return h;};
 const release=async h=>{h.release.resolve();await page.waitForFunction(id=>window.__parseReads.some(r=>r.value?.data?.questionRef===id),h.data.questionRef);await page.evaluate(async()=>{await Promise.resolve();await Promise.resolve();});};
 const state=()=>page.evaluate(()=>({pane:document.querySelector('.parse-panel').innerHTML,note:document.querySelector('#parse-note').textContent,results:document.querySelector('#results').innerHTML,url:location.href}));
 const closed=async()=>{await expect(page.locator('#parse-state')).not.toHaveAttribute('data-state','loading');await expect(page.locator('#parse-cancel')).toBeHidden();await expect(page.locator('#parse-dismiss')).toBeHidden();await expect(page.locator('#parse-candidate')).toHaveText('');};
 try{
  await fresh();const a=await start(),beforeApply=producers.length;await submit();await expect(page.locator('#parse-details')).toContainText('已识别可用条件');await expect(page.locator('#parse-state')).toContainText('已应用');await published(await nextProducer(beforeApply));const b=await state(),bCounts=counts();await release(a);expect(await state()).toEqual(b);expect(counts()).toEqual(bCounts);
  // The old parse and the current cohort have independent response gates and identities.
  for(const order of ['late-parse-before-current','current-before-late-parse']){
   await fresh();const old=await start(),current=holdProducer('cohort'),before=producers.length;
   await page.locator('#f-tx').selectOption('JAKi');await current.received.promise;await closed();
   expect(producers).toHaveLength(before+1);expect(current.owner.request.body.filters.tx).toBe('JAKi');expect(current.owner.analysisId).not.toBe(old.data.questionRef);
   if(order==='current-before-late-parse'){current.release.resolve();await published(current.owner);}
   else{await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','loading');await expect(page.locator('#results')).not.toHaveAttribute('data-analysis-id');await expect(page.locator('#patient-rows > *')).toHaveCount(0);}
   const stable=await state(),n=counts();await release(old);expect(await state(),order+'旧parse单独迟到不能发布').toEqual(stable);expect(counts()).toEqual(n);
   if(order==='late-parse-before-current'){current.release.resolve();await published(current.owner);}
   const complete=await state();await page.clock.runFor(30001);expect(await state(),order+'退休timer不能扰动合法新结果').toEqual(complete);expect(counts()).toEqual(n);
  }
  const actions=[['question',()=>page.locator('#question').fill('新问题')],...Object.entries({sex:'F',age:'18-40',sero:'1',tx:'JAKi',at:'6m',act:'target',cm:'FM',data:'complete'}).map(([k,v])=>['condition-'+k,()=>page.locator('#f-'+k).selectOption(v)]),['reanalyze',()=>page.locator('#reanalyze').click()],['reset',()=>page.locator('#reset').click()],['chip',()=>page.locator('#chips [data-key=ids]').click()],['popstate',()=>page.evaluate(()=>{history.pushState(null,'','?sex=F');dispatchEvent(new PopStateEvent('popstate'));})],['current-a',()=>page.locator('#compare-current-a').click()],['current-b',()=>page.locator('#compare-current-b').click()],['swap',()=>page.locator('#compare-swap').click()],['exclude',()=>page.locator('#compare-exclude').check()],['cancel',()=>page.locator('#parse-cancel').click()],['timeout',()=>page.clock.runFor(30001)],['identity',()=>page.evaluate(()=>{sessionStorage.setItem('ra-auth',JSON.stringify({name:'新合成身份',role:'研究者',expires:0}));dispatchEvent(new Event('focus'));})],['pagehide',()=>page.evaluate(()=>dispatchEvent(new Event('pagehide')))]];
  for(const [name,act] of actions){
   await fresh();const h=await start(),n=parseCalls(o).length,before=producers.length;await act();await closed();
   if(name.startsWith('condition-')||['reanalyze','reset','chip','popstate'].includes(name))await published(await nextProducer(before));
   else expect(producers).toHaveLength(before);
   if(name==='timeout'||name==='cancel')await expect(page.locator('#parse-state')).toContainText(name==='timeout'?'等待超时，请重试':'等待已取消');if(name==='identity'||name==='pagehide')await expect(page.locator('#patient-rows > *')).toHaveCount(0);
   const stable=await state(),requestCount=counts();await release(h);expect(await state(),name+'迟到不能复活').toEqual(stable);expect(counts()).toEqual(requestCount);await page.clock.runFor(30001);expect(await state(),name+'timer已退休').toEqual(stable);expect(counts()).toEqual(requestCount);expect(parseCalls(o)).toHaveLength(n);
  }
  for(const source of ['a','b','open']){
   await fresh();await page.locator('#private-list-load').click();await expect(page.locator('#private-list-state')).toHaveAttribute('data-state','success');const h=await start(),before=producers.length;
   await page.locator(source==='open'?`[data-open-cohort="${definition.cohortId}"]`:`[data-compare-side="${source}"][data-compare-cohort="${definition.cohortId}"]`).click();await closed();
   if(source==='open')await published(await nextProducer(before));else expect(producers).toHaveLength(before);
   const stable=await state(),n=counts();await release(h);expect(await state()).toEqual(stable);expect(counts()).toEqual(n);await page.clock.runFor(30001);expect(await state()).toEqual(stable);expect(counts()).toEqual(n);
  }
  await fresh();reply=PARTIAL;await submit();await expect(page.locator('#parse-dismiss')).toBeVisible();const old=await snapshot(page);await page.locator('#parse-dismiss').click();await closed();expect(await snapshot(page)).toEqual(old);reply=fixtures.OK;
  for(const action of ['compare-start','compare-read','compare-cancel']){
   let comparisonHold=null;
   await fresh();await page.locator('#compare-current-a').click();await page.locator('#compare-current-b').click();
   if(action==='compare-read'){await page.locator('#compare-start').click();await expect(page.locator('#compare-read')).toBeVisible();}
   if(action==='compare-cancel'){const pending={received:gate(),release:gate()};comparisonHold=pending;comparePending=pending;holds.push(pending);await page.locator('#compare-start').click();await pending.received.promise;}
   const h=await start();await page.locator('#'+action).click();if(comparisonHold)comparisonHold.release.resolve();await closed();const stable=await state();await release(h);expect(await state()).toEqual(stable);
  }
  await fresh();const bfcache=await start(),beforeReentry=producers.length;await page.evaluate(()=>{dispatchEvent(new Event('pagehide'));const e=new Event('pageshow');Object.defineProperty(e,'persisted',{value:true});dispatchEvent(e);});await published(await nextProducer(beforeReentry));await closed();const rebuilt=await state(),reentryCounts=counts();await release(bfcache);expect(await state()).toEqual(rebuilt);expect(counts()).toEqual(reentryCounts);await page.clock.runFor(30001);expect(await state()).toEqual(rebuilt);expect(counts()).toEqual(reentryCounts);
  expect(o.pageErrors).toEqual([]);expect(await page.evaluate(()=>window.__parseAborts)).toBeGreaterThan(0);expect(o.requests.filter(r=>r.url.endsWith('/applyParse')).every(r=>r.body.parseStatus==='OK'&&r.body.question===undefined)).toBe(true);
 }finally{for(const h of holds)h.release.resolve();await o.save();}
});
