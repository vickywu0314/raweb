const {test,expect}=require('@playwright/test');
const {writeFile}=require('node:fs/promises');
const {installAuthBootstrap}=require('../fixtures/auth-bootstrap.cjs');
const parse=require('../fixtures/cohort-parse.json');
const overview={studyTotal:3,targetRate:{value:0,meta:{numerator:0,denominator:0,unknownN:3,status:'NO_DATA',displayText:'0%'}},modHighN:0,fmN:0,missingN:3,meta:{studyCode:'RA',at:'now',asOfDate:'2026-10-07',readStartedAt:'2026-10-07T02:00:00Z',readCompletedAt:'2026-10-07T02:00:00Z',traceId:'search-browser',policyVersions:{qc:'dev'}}};
const row=(patientId,name,studyNo)=>({patientId,name,studyNo});
const odd=row('9007199254740993','synthetic-patient-odd','RA-ODD'),even=row('9007199254740992','synthetic-patient-even','RA-EVEN'),max=row('9223372036854775807','synthetic-patient-max','RA-MAX');
test('analysis:patient-search',async({page,context,browser})=>{
 const origin=process.env.RA_STATIC_URL,requests=[],errors=[],blocked=[],observations=[];let items=[odd,even,max],total=3,status=200,code='200';
 const auth=await installAuthBootstrap(context,{origin});
 await context.addInitScript(()=>{

  const original=window.fetch,timeout=window.setTimeout,clear=window.clearTimeout;window.__searchPending=[];window.__searchHold=false;window.__searchTimers=new Map();let seq=-1;
  window.setTimeout=(fn,ms,...args)=>{if(ms!==30000)return timeout(fn,ms,...args);const id=seq--;window.__searchTimers.set(id,()=>fn(...args));return id};window.clearTimeout=id=>{window.__searchTimers.delete(id);return clear(id)};
  window.fetch=async(...args)=>{const response=await original(...args);if(new URL(String(args[0]),location.href).pathname==='/api/ra/ai/patientSearch'){const json=response.json.bind(response);response.json=async()=>{const value=await json();if(window.__searchHold){const item={signal:args[1].signal,release:null};window.__searchPending.push(item);await new Promise(resolve=>item.release=resolve)}return value}}return response};
 });
 page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());if(url.origin!==origin){blocked.push(request.url());return route.abort('blockedbyclient')}
  if(await auth.handle(route))return;
  if(url.pathname==='/patient-insight.html')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>insight</title>'});if(!url.pathname.startsWith('/api/'))return route.continue();const body=request.postDataJSON();requests.push({path:url.pathname,body});let data,http=200,error='200';
  if(url.pathname==='/api/ra/ai/overview')data=overview;
  else if(url.pathname==='/api/ra/ai/patientSearch'){data={items,total,page:body.page,size:body.size};http=status;error=code}
  else if(url.pathname==='/api/ra/ai/parse')data=parse.PARTIAL;
  else if(url.pathname==='/api/ra/ai/patientDetail')data={...odd,patientId:body.patientId,hasCardNo:false,visits:[{visitId:'9007199254741003',doctorId:'101',visitDate:'2026-10-01',visitType:'基线访视'}],comorbidities:[]};
  else if(url.pathname==='/api/ra/ai/visitDetail')data={patientId:body.patientId,visitId:body.visitId,doctorId:'101',modules:Array.from({length:7},(_,i)=>({title:'合成模块'+i,filled:false}))};
  else return route.abort('blockedbyclient');
  return route.fulfill({status:http,contentType:'application/json',headers:{'X-Trace-Id':url.pathname==='/api/ra/ai/parse'?data.meta.traceId:'search-browser'},body:JSON.stringify({success:http===200,code:error,message:'合成安全错误',data:http===200?data:null})});
 });
 const state=async s=>{await expect(page.locator('#patient-search-state')).toHaveAttribute('data-state',s);await auth.verify(page,{expected:1})},search=async keyword=>{await page.locator('#picker').fill('');await page.locator('#picker').fill(keyword)},options=page.locator('#picker-list [role=option]');
 try{
  await page.goto(origin+'/ai-analysis.html');await expect(page.locator('#overview-state')).toHaveAttribute('data-state','success');await state('idle');expect(requests.filter(r=>r.path.endsWith('/patientSearch'))).toHaveLength(0);
  await search('  synthetic  ');await state('success');expect(requests.at(-1).body).toEqual({keyword:'  synthetic  ',page:1,size:8});await expect(options).toHaveCount(3);await expect(options.first()).toContainText('9007199254740993');
  items=[row(odd.patientId,'<img onerror=alert(1)>','RA<&')];await search('%_\\');await state('success');await expect(page.locator('#picker-list')).toContainText('<img onerror=alert(1)>');await expect(page.locator('#picker-list img')).toHaveCount(0);await expect(page.locator('#overview .stat-tile')).toHaveCount(5);
  total=21;items=[odd];await search('page');await state('success');await expect(page.locator('#picker-list')).toContainText('共 21 位，继续输入缩小范围');await expect(options).toHaveCount(1);
  const count=requests.length;await page.locator('#picker').fill('typed');await expect(page.locator('#picker-list')).toBeEmpty();expect(requests).toHaveLength(count);await state('success');expect(requests.at(-1).body).toEqual({keyword:'typed',page:1,size:8});
  items=[];total=0;await search('missing');await state('empty');await expect(page.locator('#picker-list')).toContainText('没有匹配的患者');
  for(const failure of [[401,'UNAUTHENTICATED'],[400,'INVALID_REQUEST'],[503,'SERVICE_UNAVAILABLE']]){[status,code]=failure;await search('failure');await state('error');await expect(page.locator('#patient-search-state')).toContainText(({UNAUTHENTICATED:'登录已失效，请重新登录',SERVICE_UNAVAILABLE:'服务暂不可用，请稍后重试',INVALID_REQUEST:'输入内容不符合要求，请检查后重试',NOT_FOUND:'所需记录不存在或当前账号无法访问'})[code]);await expect(page.locator('#patient-search-state')).not.toContainText('search-browser');await expect(page.locator('#picker-list')).toBeEmpty()}
  status=200;code='200';total=1;items=[{...odd,patientId:9007199254740993}];await search('invalid');await state('error');await expect(page.locator('#patient-search-state')).toContainText('返回的数据不完整或无法识别，请重新读取');
  items=[{...even,name:'OLD-PATIENT'}];await page.evaluate(()=>window.__searchHold=true);await search('old');await expect.poll(()=>page.evaluate(()=>window.__searchPending.length)).toBe(1);await page.evaluate(()=>window.__searchHold=false);items=[{...odd,name:'CURRENT-PATIENT'}];await search('new');await state('success');await page.evaluate(async()=>{window.__searchPending[0].release();await new Promise(resolve=>setTimeout(resolve,0))});await expect(page.locator('#picker-list')).toContainText('CURRENT-PATIENT');await expect(page.locator('#picker-list')).not.toContainText('OLD-PATIENT');
  await page.evaluate(()=>window.__searchHold=true);await search('pending');await expect.poll(()=>page.evaluate(()=>window.__searchPending.length)).toBe(2);await page.evaluate(()=>{for(const callback of [...window.__searchTimers.values()])callback()});await state('error');expect(await page.evaluate(()=>window.__searchPending[1].signal.aborted)).toBe(true);await page.evaluate(async()=>{window.__searchHold=false;window.__searchPending[1].release();await new Promise(resolve=>setTimeout(resolve,0))});await expect(page.locator('#picker-list')).toBeEmpty();
  for(const event of ['ra-auth-changed','storage','pagehide'])for(const settled of [false,true]){
   let pendingAt;
   if(!settled){pendingAt=await page.evaluate(()=>{window.__searchHold=true;return window.__searchPending.length});await search('private-pending');await expect.poll(()=>page.evaluate(()=>window.__searchPending.length)).toBe(pendingAt+1)}else{await search('private');await state('success')}
   await page.evaluate(type=>window.dispatchEvent(type==='storage'?new StorageEvent('storage',{key:'ra-auth'}):type==='pagehide'?new PageTransitionEvent('pagehide'):new Event(type)),event);await expect(page.locator('#picker-list')).toBeEmpty();await expect(page.locator('#overview')).toBeEmpty();
   if(!settled){expect(await page.evaluate(i=>window.__searchPending[i].signal.aborted,pendingAt)).toBe(true);await page.evaluate(async i=>{window.__searchHold=false;window.__searchPending[i].release();await new Promise(resolve=>setTimeout(resolve,0))},pendingAt);await expect(page.locator('#picker-list')).toBeEmpty()}
   if(event==='pagehide'){const before=requests.filter(r=>r.path.endsWith('/patientSearch')).length;await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await expect(page.locator('#overview-state')).toHaveAttribute('data-state','success');await state('idle');expect(requests.filter(r=>r.path.endsWith('/patientSearch'))).toHaveLength(before);await expect(page.locator('#picker')).toHaveValue('')}
  }
  items=[odd];await search('odd');await state('success');await page.locator('#picker').press('ArrowDown');await page.locator('#picker').press('Enter');await expect(page).toHaveURL(origin+'/patient-insight.html?id=9007199254740993&from=ai-analysis');await page.goto(origin+'/patient-visits.html?id=9007199254740993&from=ai-analysis');await expect(page.locator('#patient-basic')).toHaveAttribute('data-state','success');await auth.verify(page);await expect(page.locator('#back-origin')).toHaveAttribute('href','ai-analysis.html');await page.locator('#visit-list a').click();await expect(page.locator('#visit-hero')).toHaveAttribute('data-state','success');await auth.verify(page);await expect(page.locator('#back-visits')).toHaveAttribute('href','patient-visits.html?id=9007199254740993&from=ai-analysis');await page.locator('#back-visits').click();await expect(page.locator('#patient-basic')).toHaveAttribute('data-state','success');await auth.verify(page);await page.locator('#back-origin').click();await state('idle');
  for(const bad of ['   ','😀'.repeat(201)]){await page.locator('#ask-input').fill(bad);await page.locator('#ask-form button').click();await expect(page).toHaveURL(origin+'/ai-analysis.html');await expect(page.locator('#ask-message')).not.toBeEmpty()}
  await page.evaluate(()=>{document.querySelector('#ask-input').value='\ud800';document.querySelector('#ask-form').requestSubmit()});await expect(page.locator('#ask-message')).toContainText('无效字符');
  for(const raw of ['  & # ? % 😀 原文  ','😀'.repeat(200)]){
   await page.locator('#ask-input').fill(raw);await page.locator('#ask-form button').click();await expect(page.locator('#parse-apply')).toBeVisible();await auth.verify(page);expect(requests.filter(r=>r.path.endsWith('/parse')).at(-1).body).toEqual({question:raw});expect(requests.filter(r=>r.path.endsWith('/applyParse'))).toHaveLength(0);await expect(page.locator('#f-sex')).toHaveValue('');await page.goto(origin+'/ai-analysis.html');await state('idle');
  }
  expect(errors).toEqual([]);expect(blocked).toEqual([]);observations.push({stage:'real-dom-search-source-return-q',staleClosed:true,deadlineAbort:true,identityClosed:true,qRaw:true,partialExplicit:true});
 }finally{const evidence={scenario:'analysis:patient-search',version:browser.version(),authRequests:auth.requests,requests,errors,blocked,observations,dom:await page.locator('main').innerText().catch(()=>null)};for(const name of ['network.json','browser-observation.json'])await writeFile(`${process.env.RA_RUN_DIR}/${name}`,JSON.stringify(evidence,null,2)+'\n')}
});
