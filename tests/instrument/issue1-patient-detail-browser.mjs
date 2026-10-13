import {installAuthBootstrapObserver} from '../fixtures/auth-bootstrap-observer.cjs';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
export async function legacyDetailBrowser(context,port,identity,owner,probe,pid,id,fixture){
 const origin=`http://127.0.0.1:${port}`,patientId='9007199254740992',visitId='9007199254741001',requests=[],responses=[],reads=[],errors=[],blocked=[],observations=[];
 const auth=await installAuthBootstrapObserver(context,{origin,identity:'anonymous'});
 await context.addInitScript(()=>{window.__bootstrapAuthChanges=0;window.addEventListener('ra-auth-changed',()=>window.__bootstrapAuthChanges++);});
 await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==origin){blocked.push(u.origin);return route.abort('blockedbyclient');}if(await auth.handle(route))return;if(u.pathname.startsWith('/api/'))requests.push({path:u.pathname,body:r.postData(),cookiePresent:!!r.headers().cookie});return route.continue();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{const path=new URL(r.url()).pathname;if(path==='/api/ra/patient/patientDetail'||path.startsWith('/api/ra/visit/'))reads.push((async()=>responses.push({path,status:r.status(),trace:r.headers()['x-trace-id'],json:await r.json()}))());});
 const url=p=>origin+'/'+p+'.html?id='+patientId+(['visit-detail','visit-edit'].includes(p)?'&visit='+visitId:'');
 const state=p=>page.locator(p==='patient-visits'?'#patient-basic':p==='visit-detail'?'#visit-hero':'#visit-title');
 try{
  await page.goto(url('patient-visits'));await loginClosed(page,origin,url('patient-visits'),auth);await anonymousDenied(context,origin,'/api/ra/patient/patientDetail','patientId='+patientId);
  assert.equal((await context.request.post(origin+'/api/ra/test/session',{data:''})).status(),204);await seedRealProfile(context,page,origin,auth);
  for(const p of ['patient-visits','visit-detail','visit-create','visit-edit']){
   await page.goto(url(p));await verifyDocument(page,auth,1);await expect(state(p)).toHaveAttribute('data-state','success');await verifyDocument(page,auth);await expect(page.locator('main')).toContainText('synthetic-patient-even');
   if(p==='patient-visits')await expect(page.locator('#visit-list a').first()).toHaveAttribute('href',new RegExp(visitId));
   if(p==='visit-detail')await expect(page.locator('#visit-sections')).toContainText('SYNTHETIC-HISTORY');
   if(p==='visit-create'||p==='visit-edit')await expect(page.locator(p==='visit-create'?'#save-create':'#save-edit')).toBeEnabled();
   await page.evaluate(()=>window.dispatchEvent(new Event('ra-auth-changed')));await expect(state(p)).toHaveAttribute('data-state','cancelled');await expect(page.locator('main')).not.toContainText('synthetic-patient-even');
   observations.push({page:p,typedCookieSqlDom:true,exactPatientId:patientId,exactVisitId:visitId,identityCleared:true});
  }
  await owner.mysqlQuery('RENAME TABLE ra_synthetic_test.patient_follow_up_history TO ra_synthetic_test.synthetic_issue1_source_offline');try{await page.goto(url('patient-visits'));await verifyDocument(page,auth,1);await expect(state('patient-visits')).toHaveAttribute('data-state','error');await expect(page.locator('#visit-list')).toBeEmpty();}finally{await owner.mysqlQuery('RENAME TABLE ra_synthetic_test.synthetic_issue1_source_offline TO ra_synthetic_test.patient_follow_up_history');}
  await owner.mysqlQuery('DELETE FROM ra_synthetic_test.patient_relation_doctor WHERE doctor_id=101 AND patient_id=9007199254740992');await page.goto(url('patient-visits'));await verifyDocument(page,auth,1);await expect(state('patient-visits')).toHaveAttribute('data-state','error');await expect(state('patient-visits')).toContainText('患者资料不可用');
  assert.equal((await context.request.post(origin+'/api/ra/test/logout',{data:''})).status(),204);const cachedAuthRequests=auth.requests.length;await expectCachedIdentity(page,auth);auth.expectIdentity('anonymous');await page.goto(url('visit-edit'));await loginClosed(page,origin,url('visit-edit'),auth,{start:cachedAuthRequests});await expect(page.locator('#save-edit')).toHaveCount(0);await anonymousDenied(context,origin,'/api/ra/patient/patientDetail','patientId='+patientId);
  await Promise.all(reads);await auth.verifyAll();assert.equal(errors.length,0);assert.equal(blocked.length,0);assert.ok(responses.some(r=>r.path==='/api/ra/patient/patientDetail'&&r.status===200&&r.trace&&r.json.data.patientId===patientId));
  assert.ok(fixture.events.filter(e=>e.type==='patient-http-observation').every(e=>e.typedProvider&&e.active===0));
 }finally{
  await Promise.allSettled(reads);const evidence={scenario:id,authRequests:auth.requests,version:owner.report.browser.at(-1)?.version,requests,responses,blocked,errors,observations,dom:await page.locator('main').innerText().catch(()=>null)};for(const name of ['network.json','browser-observation.json'])await writeFile(`${owner.dir}/${name}`,JSON.stringify(evidence,null,2)+'\n');
 }
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
