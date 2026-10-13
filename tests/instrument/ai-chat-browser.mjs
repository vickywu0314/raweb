import {installAuthBootstrapObserver} from '../fixtures/auth-bootstrap-observer.cjs';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
export async function chatBrowser(context,port,identity,owner,probe,pid,id,fixture){
 const origin=`http://127.0.0.1:${port}`,page=await context.newPage(),errors=[],blocked=[],responses=[],reads=[];
 const auth=await installAuthBootstrapObserver(context,{origin,identity:'anonymous'});
 await context.addInitScript(()=>{window.__bootstrapAuthChanges=0;window.addEventListener('ra-auth-changed',()=>window.__bootstrapAuthChanges++);});
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(new URL(r.url()).pathname==='/api/ra/ai/chat')reads.push(r.json().then(json=>responses.push({status:r.status(),trace:r.headers()['x-trace-id'],json})));});
 await context.route('**/*',async route=>{if(new URL(route.request().url()).origin!==origin){blocked.push(route.request().url());return route.abort('blockedbyclient');}if(await auth.handle(route))return;return route.continue();});
 const state=s=>expect(page.locator('#chat-state')).toHaveAttribute('data-state',s),ask=async q=>{await page.locator('#chat-input').fill(q);await page.locator('#chat-send').click();};
 try{
  await page.goto(origin+'/ai-chat.html');await loginClosed(page,origin,origin+'/ai-chat.html',auth);await anonymousDenied(context,origin,'/api/ra/ai/chat',{scope:{kind:'ALL'},question:'当前范围达标率'});
  assert.equal((await context.request.post(origin+'/api/ra/test/session',{data:''})).status(),204);await seedRealProfile(context,page,origin,auth);await page.goto(origin+'/ai-chat.html');await verifyDocument(page,auth,0);await ask('当前范围达标率');await state('success');await expect(page.locator('#chat-log')).toContainText('40%');await expect(page.locator('#chat-log')).toContainText('未知 1');
  const filters={studyCode:'RA',sex:'F',age:null,sero:null,tx:null,at:'now',act:null,cm:null,data:null,ids:null};const fragment=await page.evaluate(f=>window.RACohortChatEntry.encode({kind:'COHORT',filters:f}),filters);await page.goto(origin+'/ai-chat.html'+fragment);await verifyDocument(page,auth,0);await state('idle');await verifyDocument(page,auth,0);await ask('当前队列达标率');await state('success');await expect(page.locator('#chat-log')).toContainText('50%');await expect(page.locator('#chat-log')).toContainText('本轮 3 人');
  await owner.mysqlQuery("UPDATE ra_synthetic_test.patient_follow_up_history SET bqpg=NULL WHERE patient_basic_info_id<=6");await ask('当前队列达标率');await state('success');await expect(page.locator('#chat-log').locator('article').last()).toContainText('无数据');await expect(page.locator('#chat-log').locator('article').last()).not.toContainText('NO_DATA');
  assert.equal((await context.request.post(origin+'/api/ra/test/logout',{data:''})).status(),204);await ask('当前队列达标率');await state('error');await expect(page.locator('#chat-log')).toBeEmpty();
  await Promise.all(reads);const success=responses.filter(r=>r.status===200);assert.equal(success[0].json.data.facts[0].data.value,.4);assert.equal(success[1].json.data.facts[0].data.value,.5);for(const r of success)assert.equal(r.trace,r.json.data.meta.traceId);await auth.verifyAll();assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);assert.ok(fixture.events.filter(e=>e.type==='chat-http-observation').every(e=>e.typedProvider&&e.active===0));
 }finally{await Promise.allSettled(reads);await writeFile(`${owner.dir}/browser-observation.json`,JSON.stringify({scenario:id,authRequests:auth.requests,errors,blocked,responses,dom:await page.locator('main').innerText().catch(()=>null)},null,2)+'\n');}
}

export async function patientChatBrowser(context,port,identity,owner,probe,pid,id,fixture){
 const origin=`http://127.0.0.1:${port}`,page=await context.newPage(),errors=[],blocked=[],responses=[],reads=[];
 const auth=await installAuthBootstrapObserver(context,{origin,identity:'anonymous'});
 await context.addInitScript(()=>{window.__bootstrapAuthChanges=0;window.addEventListener('ra-auth-changed',()=>window.__bootstrapAuthChanges++);});
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(new URL(r.url()).pathname==='/api/ra/ai/chat')reads.push(r.json().then(json=>responses.push({status:r.status(),trace:r.headers()['x-trace-id'],json})));});await context.route('**/*',async route=>{if(new URL(route.request().url()).origin!==origin){blocked.push(route.request().url());return route.abort('blockedbyclient');}if(await auth.handle(route))return;return route.continue();});
 const state=s=>expect(page.locator('#chat-state')).toHaveAttribute('data-state',s),ask=async q=>{await page.locator('#chat-input').fill(q);await page.locator('#chat-send').click();};
 try{
  assert.equal((await context.request.post(origin+'/api/ra/test/session',{data:''})).status(),204);await seedRealProfile(context,page,origin,auth);await owner.control(fixture,'CHAT_PATIENT_SEED');await owner.control(fixture,'CHAT_COURSE');
  await page.goto(origin+'/patient-visits.html?id=1&from=ai-analysis');await verifyDocument(page,auth,1);await expect(page.locator('#patient-basic')).toHaveAttribute('data-state','success');await verifyDocument(page,auth);await expect(page.locator('#patient-chat-link')).toHaveAttribute('href','ai-chat.html#kind=PATIENT&patientId=1');await page.locator('#patient-chat-link').click();await state('idle');await verifyDocument(page,auth,0);await ask('全程记录');await state('success');await expect(page.locator('#chat-log')).toContainText('4.11');await expect(page.locator('#chat-log')).toContainText('2.7');await expect(page.locator('#chat-log')).toContainText('2.31');
  await page.goto(origin+'/patient-insight.html?id=1&from=ai-analysis');await verifyDocument(page,auth,1);await expect(page.locator('#insight-state')).toHaveAttribute('data-state','success');await verifyDocument(page,auth);await page.locator('#insight-chat-link').click();await state('idle');await verifyDocument(page,auth,0);await ask('全程治疗');await state('success');await expect(page.locator('#chat-log')).toContainText('依那西普');
  await owner.control(fixture,'CHAT_VISIT');await page.goto(origin+'/visit-detail.html?id=1&visit=1001&from=ai-analysis');await verifyDocument(page,auth,1);await expect(page.locator('#visit-hero')).toHaveAttribute('data-state','success');await verifyDocument(page,auth);await page.locator('#visit-chat-link').click();await state('idle');await verifyDocument(page,auth,0);await expect(page.locator('#scope-patient-note')).toContainText('本次访视 1001');await ask('本次实测和记录用药');await state('success');await expect(page.locator('#chat-log')).toContainText('4.11');await expect(page.locator('#chat-log')).toContainText('20 mg/L');await expect(page.locator('#chat-log')).not.toContainText('2.31');await expect(page.locator('#chat-log')).not.toContainText('依那西普');
  await owner.control(fixture,'CHAT_COURSE');await page.locator('#patient-course').click();await ask('全程实测');await state('success');await expect(page.locator('#chat-log')).toContainText('2.31');
  assert.equal((await context.request.post(origin+'/api/ra/ai/chat',{data:{scope:{kind:'PATIENT',patientId:'1',visitId:'220'},question:'跨人'}})).status(),404);assert.equal((await context.request.post(origin+'/api/ra/test/logout',{data:''})).status(),204);await ask('下轮记录');await state('error');await expect(page.locator('#chat-log')).toBeEmpty();await Promise.all(reads);assert.equal(responses.filter(r=>r.status===200).length,4);for(const r of responses.filter(r=>r.status===200))assert.equal(r.trace,r.json.data.meta.traceId);await auth.verifyAll();assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
 }finally{await Promise.allSettled(reads);await writeFile(`${owner.dir}/browser-observation.json`,JSON.stringify({scenario:id,authRequests:auth.requests,errors,blocked,responses,dom:await page.locator('main').innerText().catch(()=>null)},null,2)+'\n');}
}


// 会话从真实生产 /auth/me 取回；这里只写前端显示缓存，不替换任何后端响应。
async function seedRealProfile(context,page,origin,auth){
 const response=await context.request.post(origin+'/api/ra/auth/me');assert.equal(response.status(),200);const body=await response.json();assert.equal(body.success,true);assert.equal(body.code,'200');assert.ok(body.data&&body.data.doctorId!=null);
 auth.expectIdentity('authenticated',body.data);
 if(new URL(page.url()).origin!==origin){await page.goto(origin+'/login.html');await auth.verify(page,{expected:0});}
 await page.evaluate(profile=>sessionStorage.setItem('ra-auth',JSON.stringify({...profile,expires:0})),body.data);return body.data;
}
async function verifyDocument(page,auth,expected=1){
 await auth.verify(page,{expected});
 if(expected===1)assert.equal(await page.evaluate(()=>window.__bootstrapAuthChanges),0,'same real doctor bootstrap must not revoke the initial business flight');
}
async function loginClosed(page,origin,target,auth,cached=false){
 const url=new URL(target);await expect(page).toHaveURL(origin+'/login.html?next='+encodeURIComponent(url.pathname.split('/').pop()+url.search+url.hash));
 await auth.verify(page,{expected:0});await auth.verifyAll();
 if(cached){const denied=auth.requests.filter(r=>r.identity==='anonymous');assert.equal(denied.length,1,'expired server session with cached browser identity must really bootstrap once and be denied');assert.equal(denied[0].result,'ANONYMOUS_DENIED');}
 await expect(page.locator('body')).not.toContainText('synthetic-patient');await expect(page.locator('body')).not.toContainText('SYNTHETIC-CARD');await expect(page.locator('body')).not.toContainText('合成患者');
}
async function anonymousDenied(context,origin,path,data){
 const response=await context.request.post(origin+path,{data});assert.equal(response.status(),401);const body=await response.json();assert.equal(body.success,false);assert.equal(body.data,null);
}
