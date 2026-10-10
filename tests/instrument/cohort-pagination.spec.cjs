const {test,expect}=require('@playwright/test');
const {EMPTY,LATE_A,LATE_B,UNKNOWN_PATIENT}=require('../fixtures/cohort-p02.json');
const {writeFile}=require('node:fs/promises');
async function setup({page,context,browser},scenario,reply) {
  const origin=process.env.RA_STATIC_URL,requests=[],allowed=[],blocked=[],pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  await context.addInitScript(()=>sessionStorage.setItem('ra-auth',JSON.stringify({name:'合成页面用户',role:'研究者',expires:0})));
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==origin){blocked.push(request.url());await route.abort('blockedbyclient');return;}
    allowed.push(request.url());
    if(url.pathname.startsWith('/api/')){requests.push({url:request.url(),body:request.postDataJSON()});await reply(route,requests.at(-1));return;}
    await route.continue();
  });
  const save=async()=>{
    await writeFile(`${process.env.RA_RUN_DIR}/browser-observation.json`,JSON.stringify({scenario,version:browser.version(),requests,allowed,blocked,pageErrors,dom:await page.locator('main').innerText()},null,2)+'\n');
    await writeFile(`${process.env.RA_RUN_DIR}/network.json`,JSON.stringify({requests,allowed,blocked,pageErrors},null,2)+'\n');
  };
  return {origin,requests,pageErrors,save};
}
const empty={success:true,code:'200',message:'成功',data:{...EMPTY,n:0,studyTotal:37,analysisId:'11111111-1111-1111-1111-111111111111',patients:{total:0,returnedCount:0,hasMore:false,nextCursor:null,items:[]}}};
const fulfill=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'X-Trace-Id':'p01b-trace'},body:JSON.stringify(body)});
test('cohort:url-ids',async ({page,context,browser})=>{
  const observed=await setup({page,context,browser},'cohort:url-ids',route=>fulfill(route,empty));
  try {
    await page.goto(`${observed.origin}/ai-cohort.html?ids=`,{waitUntil:'load'});
    await expect.poll(()=>observed.requests.length).toBe(1);
    expect(observed.requests[0].body.filters.ids).toEqual([]);
    await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','empty');
    await expect(page.locator('#cohort-n')).toHaveText('0');await expect(page.locator('#study-total')).toHaveText('37');
    await page.goto(`${observed.origin}/ai-cohort.html?ids=9223372036854775807,1`,{waitUntil:'load'});
    await expect.poll(()=>observed.requests.length).toBe(2);
    expect(observed.requests.at(-1).body.filters.ids).toEqual(['9223372036854775807','1']);
    await page.goto(`${observed.origin}/ai-cohort.html?sex=女&age=043-067&at=6m&tx=TNFi`,{waitUntil:'load'});
    await expect.poll(()=>observed.requests.length).toBe(3);
    expect(observed.requests.at(-1).body.filters).toEqual({studyCode:'RA',sex:'F',age:'043-067',sero:'',tx:'TNFi',at:'6m',act:'',cm:'',data:''});
    await expect(page.locator('#f-age')).toHaveValue('043-067');expect(new URL(page.url()).searchParams.get('sex')).toBe('F');
    await page.locator('#f-act').selectOption('target');await expect.poll(()=>observed.requests.length).toBe(4);expect(observed.requests.at(-1).body.filters.age).toBe('043-067');
    await page.locator('#reset').click();await expect.poll(()=>observed.requests.length).toBe(5);expect(new URL(page.url()).search).toBe('');expect(Object.hasOwn(observed.requests.at(-1).body.filters,'ids')).toBe(false);
    for(const query of ['?ids=01','?ids=9223372036854775808','?ids=1,,2','?ids=1&ids=2','?sex=X','?sex=F&sex=M','?age=68-43','?q=TNFi','?similar=9','?host=x','?doctorId=202','?analysisId=x','?cursor=x','?compareResultId=x','?foo=']){
      const before=observed.requests.length;await page.goto(`${observed.origin}/ai-cohort.html${query}`,{waitUntil:'load'});await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','error');expect(observed.requests.length).toBe(before);await page.locator('#reanalyze').click();expect(observed.requests.length).toBe(before);
    }
    expect(observed.pageErrors).toEqual([]);
  } finally {await observed.save();}
});
const firstA={success:true,code:'200',message:'成功',data:{...LATE_A,n:37,studyTotal:50,analysisId:'11111111-1111-1111-1111-111111111111',patients:{total:37,returnedCount:10,hasMore:true,nextCursor:'opaque.A.10',items:['1','2','3','4','5','6','7','8','9','10'].map((patientId,index)=>({...structuredClone(UNKNOWN_PATIENT),patientId,name:`合成A${index+1}`,studyNo:`A${index+1}`}))}}};
const firstB={success:true,code:'200',message:'成功',data:{...LATE_B,n:2,studyTotal:50,analysisId:'22222222-2222-2222-2222-222222222222',patients:{total:2,returnedCount:2,hasMore:false,nextCursor:null,items:[{...structuredClone(UNKNOWN_PATIENT),patientId:'901',name:'合成B1',studyNo:'B1'},{...structuredClone(UNKNOWN_PATIENT),patientId:'902',name:'合成B2',studyNo:'B2'}]}}};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const rows=page=>page.locator('#patient-rows [data-patient-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.patientId));
async function ignoreAbortAndObserveReads(context) {
  await context.addInitScript(()=>{
    AbortController.prototype.abort=function(){};
    window.__p01bReads=[];const nativeFetch=window.fetch;
    window.fetch=async (...args)=>{const response=await nativeFetch(...args),json=response.json.bind(response);response.json=async()=>{const data=await json();window.__p01bReads.push(data);return data;};return response;};
  });
}
async function assertB(page) {
  await expect(page.locator('#cohort-n')).toHaveText('2');await expect(page.locator('#study-total')).toHaveText('50');
  await expect(page.locator('#age-median')).toHaveText('70');await expect(page.locator('#analysis-policy')).toContainText('policy-B');expect(await page.locator('#activity-current .statistics-bucket').evaluateAll(ns=>ns.map(n=>n.dataset.count))).toEqual(['0','2','0','0']);expect(await page.locator('#line-groups .statistics-bucket').evaluateAll(ns=>ns.map(n=>n.dataset.count))).toEqual(['0','2','0']);await expect(page.locator('#fm-summary')).toContainText('未知 2');
  expect(await rows(page)).toEqual(['901','902']);await expect(page.locator('#more')).toBeHidden();await expect(page.locator('#results')).toHaveAttribute('data-analysis-id','22222222-2222-2222-2222-222222222222');
}
test('cohort:late-isolation',async ({page,context,browser})=>{
  await ignoreAbortAndObserveReads(context);
  const receivedA=deferred(),releaseA=deferred(),receivedPage=deferred(),releasePage=deferred(),receivedOld=deferred(),releaseOld=deferred(),receivedB=deferred(),releaseB=deferred();let mode='late',pageAttempts=0;
  const observed=await setup({page,context,browser},'cohort:late-isolation',async(route,request)=>{
    if(new URL(request.url).pathname.endsWith('/cohortPatients')){
      if(mode==='retry'){pageAttempts++;await fulfill(route,pageAttempts===1?{success:false,code:'SERVICE_UNAVAILABLE',message:'服务暂不可用',data:null}:pageAttempts===2?pageA:lastA,pageAttempts===1?503:200);}
      else{receivedPage.resolve();await releasePage.promise;await fulfill(route,pageA);}
    }
    else if(mode==='new-loading'){if(request.body.filters.sex==='F'){receivedB.resolve();await releaseB.promise;await fulfill(route,firstB);}else{receivedOld.resolve();await releaseOld.promise;await fulfill(route,{success:false,code:'SERVICE_UNAVAILABLE',message:'旧请求失败',data:null},503);}}
    else if(request.body.filters.sex==='F')await fulfill(route,firstB);
    else if(mode==='late'){receivedA.resolve();await releaseA.promise;await fulfill(route,firstA);}
    else await fulfill(route,firstA);
  });
  try {
    await page.goto(`${observed.origin}/ai-cohort.html`,{waitUntil:'load'});await receivedA.promise;
    await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','loading');await expect(page.locator('#f-sex')).toBeEnabled();
    await page.locator('#f-sex').selectOption('F');await assertB(page);expect(observed.requests.length).toBe(2);
    releaseA.resolve();await page.waitForFunction(()=>window.__p01bReads.some(result=>result.data?.analysisId==='11111111-1111-1111-1111-111111111111'));
    await assertB(page);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');
    mode='page';await page.goto(`${observed.origin}/ai-cohort.html`,{waitUntil:'load'});await expect(page.locator('#cohort-n')).toHaveText('37');
    await expect(page.locator('#more')).toBeEnabled();await page.locator('#more').click();await receivedPage.promise;
    expect(observed.requests.at(-1).body).toEqual({analysisId:'11111111-1111-1111-1111-111111111111',cursor:'opaque.A.10'});
    await page.locator('#more').evaluate(button=>{button.click();button.click();});expect(observed.requests.filter(request=>request.body.cursor==='opaque.A.10').length).toBe(1);
    await page.locator('#f-sex').selectOption('F');await assertB(page);
    releasePage.resolve();await page.waitForFunction(()=>window.__p01bReads.some(result=>result.data?.patients?.nextCursor==='opaque.A.30'));
    await assertB(page);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');
    mode='retry';await page.goto(`${observed.origin}/ai-cohort.html`,{waitUntil:'load'});await expect(page.locator('#cohort-n')).toHaveText('37');
    await page.locator('#more').click();await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','error');await expect(page.locator('#patient-rows .ai-row')).toHaveCount(10);await expect(page.locator('#cohort-n')).toHaveText('37');await expect(page.locator('#age-median')).toHaveText('40');await expect(page.locator('#analysis-policy')).toContainText('policy-A');await expect(page.locator('#more')).toBeEnabled();
    const beforeRetry=observed.requests.length;await page.locator('#more').click();await expect(page.locator('#patient-rows .ai-row')).toHaveCount(30);expect(observed.requests.length).toBe(beforeRetry+1);expect(observed.requests.at(-1).body).toEqual(observed.requests.at(-2).body);expect(pageAttempts).toBe(2);await expect(page.locator('#age-median')).toHaveText('40');await expect(page.locator('#analysis-policy')).toContainText('policy-A');
    await page.locator('#more').click();await expect(page.locator('#patient-rows .ai-row')).toHaveCount(37);await expect(page.locator('#more')).toBeHidden();expect(new Set(await rows(page)).size).toBe(37);expect(observed.requests.at(-1).body.cursor).toBe('opaque.A.30');
    mode='new-loading';await page.goto(`${observed.origin}/ai-cohort.html`,{waitUntil:'load'});await receivedOld.promise;await page.locator('#f-sex').selectOption('F');await receivedB.promise;releaseOld.resolve();
    await page.waitForFunction(()=>window.__p01bReads.some(result=>result.code==='SERVICE_UNAVAILABLE'));await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','loading');await expect(page.locator('#cohort-n')).toHaveText('—');await expect(page.locator('#patient-rows .ai-row')).toHaveCount(0);
    releaseB.resolve();await assertB(page);
    expect(observed.pageErrors).toEqual([]);
  } finally {releaseA.resolve();releasePage.resolve();releaseOld.resolve();releaseB.resolve();await observed.save();}
});

const pageA={success:true,code:'200',message:'成功',data:{analysisId:'11111111-1111-1111-1111-111111111111',patients:{total:37,returnedCount:20,hasMore:true,nextCursor:'opaque.A.30',items:['11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30'].map(patientId=>({...structuredClone(UNKNOWN_PATIENT),patientId,name:'合成A'+patientId,studyNo:'A'+patientId}))}}};
test('cohort:terminal-states',async ({page,context,browser})=>{
  await ignoreAbortAndObserveReads(context);await page.clock.install();let hold=null,pageError=null;const gates=[];
  const observed=await setup({page,context,browser},'cohort:terminal-states',async(route,request)=>{
    const isPage=new URL(request.url).pathname.endsWith('/cohortPatients');
    const response=isPage?(pageError||{body:pageA,status:200}):{body:request.body.filters.sex==='F'?firstB:firstA,status:200};
    const gate=hold;
    if(gate&&!gate.used&&gate.kind===(isPage?'page':'cohort')){gate.used=true;gate.received.resolve();await gate.release.promise;}
    await fulfill(route,response.body,response.status);
  });
  const pending=kind=>{const gate={kind,received:deferred(),release:deferred(),used:false};gates.push(gate);hold=gate;return gate;};
  const fresh=async()=>{hold=null;pageError=null;await page.goto(`${observed.origin}/ai-cohort.html`,{waitUntil:'load'});await expect(page.locator('#cohort-n')).toHaveText('37');await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');};
  const cleared=async(code,state='error')=>{await expect(page.locator('#cohort-state')).toHaveAttribute('data-state',state);await expect(page.locator('#error-message')).toContainText(code);await expect(page.locator('#patient-rows .ai-row')).toHaveCount(0);await expect(page.locator('#cohort-n')).toHaveText('—');await expect(page.locator('#no-result')).toBeHidden();await expect(page.locator('#results')).toBeHidden();await expect(page.locator('#more')).toBeHidden();await expect(page.locator('#export')).toBeDisabled();await expect(page.locator('#age-median')).toHaveText('—');await expect(page.locator('#clinical-panels')).toBeHidden();await expect(page.locator('#analysis-policy')).toHaveText('');for(const selector of ['#activity-base','#activity-current','#tx-groups','#line-groups','#fm-rows'])await expect(page.locator(selector+' > *')).toHaveCount(0);};
  const release=async gate=>{const count=await page.evaluate(()=>window.__p01bReads.length);gate.release.resolve();await page.waitForFunction(count=>window.__p01bReads.length>count,count);};
  try {
    for(const kind of ['cohort','page']){
      if(kind==='page')await fresh();const gate=pending(kind);
      if(kind==='cohort')await page.goto(`${observed.origin}/ai-cohort.html`,{waitUntil:'load'});else await page.locator('#more').click();
      await gate.received.promise;await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','loading');
      await expect(page.locator('#cancel-analysis')).toBeVisible();const count=observed.requests.length;await page.locator('#cancel-analysis').click();
      await cleared('REQUEST_CANCELLED');expect(observed.requests.length).toBe(count);await release(gate);await cleared('REQUEST_CANCELLED');
    }
    for(const kind of ['cohort','page']){
      if(kind==='page')await fresh();const gate=pending(kind);
      if(kind==='cohort')await page.goto(`${observed.origin}/ai-cohort.html`,{waitUntil:'load'});else await page.locator('#more').click();
      await gate.received.promise;const count=observed.requests.length;await page.clock.fastForward(30000);
      await cleared('REQUEST_TIMEOUT');expect(observed.requests.length).toBe(count);await release(gate);await cleared('REQUEST_TIMEOUT');
    }
    const hidden=pending('cohort');await page.goto(`${observed.origin}/ai-cohort.html`,{waitUntil:'load'});await hidden.received.promise;
    await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide')));await cleared('REQUEST_CANCELLED');await release(hidden);await cleared('REQUEST_CANCELLED');
    hold=null;const beforeRestore=observed.requests.length;await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await expect(page.locator('#cohort-n')).toHaveText('37');expect(observed.requests.length).toBe(beforeRestore+1);
    const beforePop=observed.requests.length;await page.evaluate(()=>{history.pushState(null,'','?sex=F');dispatchEvent(new PopStateEvent('popstate'));});await assertB(page);expect(observed.requests.length).toBe(beforePop+1);expect(observed.requests.at(-1).body.filters.sex).toBe('F');
    await fresh();const identity=pending('page');await page.locator('#more').click();await identity.received.promise;
    await page.evaluate(()=>{sessionStorage.setItem('ra-auth',JSON.stringify({name:'合成另一身份',role:'研究者',expires:0}));dispatchEvent(new StorageEvent('storage',{key:'ra-auth'}));});await cleared('UNAUTHENTICATED');await release(identity);await cleared('UNAUTHENTICATED');
    for(const event of ['focus','visibilitychange']){await fresh();await page.evaluate(event=>{sessionStorage.setItem('ra-auth',JSON.stringify({name:'合成另一身份',role:'研究者',expires:0}));(event==='focus'?window:document).dispatchEvent(new Event(event));},event);await cleared('UNAUTHENTICATED');}
    const noEvent=pending('cohort');await page.goto(`${observed.origin}/ai-cohort.html`,{waitUntil:'load'});await noEvent.received.promise;
    await page.evaluate(()=>sessionStorage.setItem('ra-auth',JSON.stringify({name:'完成前身份变化',role:'研究者',expires:0})));await release(noEvent);await cleared('UNAUTHENTICATED');await expect(page.locator('#login-return')).toHaveAttribute('href','login.html?next=ai-cohort.html');
    for(const [status,code,state] of [[400,'CURSOR_INVALID','error'],[401,'UNAUTHENTICATED','error'],[404,'RESOURCE_NOT_FOUND','error'],[409,'SCOPE_CHANGED','scope-changed'],[410,'ANALYSIS_EXPIRED','expired']]){
      await fresh();pageError={status,body:{success:false,code,message:'资源失效，请显式重新分析',data:null}};const count=observed.requests.length;
      await page.locator('#more').click();await cleared(code,state);expect(observed.requests.length).toBe(count+1);await expect(page.locator('#error-trace')).toHaveText('Trace：p01b-trace');
      expect(await page.locator('#results').getAttribute('data-analysis-id')).toBe(null);await page.locator('#more').evaluate(button=>button.click());expect(observed.requests.length).toBe(count+1);
    }
    await expect(page.locator('#clinical-panels')).toBeHidden();expect(observed.pageErrors).toEqual([]);
  }finally{for(const gate of gates)gate.release.resolve();await observed.save();}
});

const lastA={success:true,code:'200',message:'成功',data:{analysisId:'11111111-1111-1111-1111-111111111111',patients:{total:37,returnedCount:7,hasMore:false,nextCursor:null,items:['31','32','33','34','35','36','37'].map(patientId=>({...structuredClone(UNKNOWN_PATIENT),patientId,name:'合成A'+patientId,studyNo:'A'+patientId}))}}};
