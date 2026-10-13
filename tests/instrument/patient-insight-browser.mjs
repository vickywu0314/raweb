import {installAuthBootstrapObserver} from '../fixtures/auth-bootstrap-observer.cjs';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
export async function patientInsightBrowser(context,port,identity,owner,probe,pid,id,fixture){
 const origin=`http://127.0.0.1:${port}`,page=await context.newPage(),errors=[],blocked=[],requests=[],observations=[];
 const auth=await installAuthBootstrapObserver(context,{origin,identity:'anonymous'});
 await context.addInitScript(()=>{window.__bootstrapAuthChanges=0;window.addEventListener('ra-auth-changed',()=>window.__bootstrapAuthChanges++);});
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{const r=route.request(),url=new URL(r.url());if(url.origin!==origin){blocked.push(r.url());return route.abort('blockedbyclient');}if(await auth.handle(route))return;if(url.pathname.startsWith('/api/'))requests.push({path:url.pathname,body:r.postDataJSON()});return route.continue();});
 const state=s=>expect(page.locator('#insight-state')).toHaveAttribute('data-state',s);
 try{
  await page.goto(origin+'/patient-insight.html?id=2&from=ai-analysis');await loginClosed(page,origin,origin+'/patient-insight.html?id=2&from=ai-analysis',auth);await anonymousDenied(context,origin,'/api/ra/ai/patientInsight',{patientId:'2'});assert.equal((await context.request.post(origin+'/api/ra/test/session',{data:''})).status(),204);await seedRealProfile(context,page,origin,auth);await page.goto(origin+'/patient-insight.html?id=2&from=ai-analysis');await verifyDocument(page,auth,1);await state('success');await verifyDocument(page,auth);
  await expect(page.locator('#patient-name')).toContainText('合成患者2');await expect(page.locator('#journey')).toContainText('2.7');await expect(page.locator('#journey')).toContainText('2026-10-06');await expect(page.locator('#treatment')).toContainText('依那西普');await expect(page.locator('#insight-source')).not.toContainText('synthetic-drug-v1');await expect(page.locator('#insight-source')).not.toContainText('synthetic-fm-v1');
  await expect(page.locator('#journey a').first()).toHaveAttribute('href','visit-detail.html?id=2&visit=210&from=ai-analysis');await page.locator('#journey a').first().click();await expect(page.locator('#visit-hero')).toHaveAttribute('data-state','success');await verifyDocument(page,auth);await expect(page.locator('#visit-sections')).toContainText('4.2');await page.locator('#back-visits').click();await expect(page.locator('#patient-basic')).toHaveAttribute('data-state','success');await verifyDocument(page,auth);await page.locator('#patient-insight-link').click();await state('success');await verifyDocument(page,auth);
  await expect(page.locator('#similar-detail')).toHaveAttribute('href','ai-cohort.html?preset=similar&id=2');await page.locator('#similar-detail').click();await expect.poll(()=>requests.some(r=>r.path==='/api/ra/ai/resolveEntry')).toBe(true);assert.deepEqual(requests.find(r=>r.path==='/api/ra/ai/resolveEntry').body,{source:'SIMILAR',indexPatientId:'2'});await expect(page.locator('#results')).toBeVisible();
  await page.goto(origin+'/patient-insight.html?id=7&from=ai-analysis');await verifyDocument(page,auth,1);await state('error');await expect(page.locator('#journey')).toBeEmpty();assert.equal((await context.request.post(origin+'/api/ra/test/logout',{data:''})).status(),204);const cachedAuthRequests=auth.requests.length;await expectCachedIdentity(page,auth);auth.expectIdentity('anonymous');await page.goto(origin+'/patient-insight.html?id=2&from=ai-analysis');await loginClosed(page,origin,origin+'/patient-insight.html?id=2&from=ai-analysis',auth,{start:cachedAuthRequests});await anonymousDenied(context,origin,'/api/ra/ai/patientInsight',{patientId:'2'});
  const events=fixture.events.filter(e=>e.type==='configured-source-http-observation'&&e.path==='/api/ra/ai/patientInsight');assert.ok(events.some(e=>e.status===200&&e.selectDelta===5&&e.borrowDelta===1));assert.ok(events.every(e=>e.active===0&&e.writeDelta===0&&e.analysisInsertDelta===0&&e.typedProvider));assert.ok(events.filter(e=>e.status===401).every(e=>e.bodyBytes===0&&e.borrowDelta===0));await auth.verifyAll();assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);observations.push({typedCookie:true,sql5:true,realSourceNavigation:true,similarInputExact:true,release:true});
 }finally{const evidence={scenario:id,authRequests:auth.requests,requests,errors,blocked,observations};for(const name of ['network.json','browser-observation.json'])await writeFile(`${owner.dir}/${name}`,JSON.stringify(evidence,null,2)+'\n')}
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
 if(cached){const denied=auth.requests.slice(cached.start);assert.equal(denied.length,1,'expired server session with cached browser identity must really bootstrap once and be denied');assert.equal(denied[0].identity,'anonymous');assert.equal(denied[0].status,200);assert.equal(denied[0].result,'ANONYMOUS_DENIED');assert.equal(denied[0].responseBody.success,false);assert.equal(denied[0].responseBody.code,'401');assert.equal(denied[0].responseBody.data,null);}
 await expect(page.locator('body')).not.toContainText('synthetic-patient');await expect(page.locator('body')).not.toContainText('SYNTHETIC-CARD');await expect(page.locator('body')).not.toContainText('合成患者');
}
async function anonymousDenied(context,origin,path,data){
 const response=await context.request.post(origin+path,{data});assert.equal(response.status(),401);const body=await response.json();assert.equal(body.success,false);assert.equal(body.data,null);
}

async function expectCachedIdentity(page,auth){const cached=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('ra-auth')));assert.ok(cached);assert.equal(String(cached.doctorId),'101');assert.equal(cached.expires,0);const actual=auth.requests.filter(r=>r.identity==='authenticated').at(-1)?.responseBody.data;assert.ok(actual,'a real authenticated bootstrap must precede stale-cache logout');for(const key of Object.keys(actual))assert.deepEqual(cached[key],actual[key],'cached actual me profile '+key);}
