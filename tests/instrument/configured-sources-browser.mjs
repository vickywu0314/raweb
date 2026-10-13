import {installAuthBootstrapObserver} from '../fixtures/auth-bootstrap-observer.cjs';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

export async function configuredSourcesBrowser(context,port,identity,owner,probe,pid,id,fixture){
 const origin=`http://127.0.0.1:${port}`,page=await context.newPage(),errors=[],blocked=[],requests=[],responses=[],reads=[],observations=[];
 const auth=await installAuthBootstrapObserver(context,{origin,identity:'anonymous'});
 await context.addInitScript(()=>{window.__bootstrapAuthChanges=0;window.addEventListener('ra-auth-changed',()=>window.__bootstrapAuthChanges++);});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(['/api/ra/ai/overview','/api/ra/ai/cohort'].includes(new URL(r.url()).pathname))reads.push(r.json().then(json=>responses.push({path:new URL(r.url()).pathname,status:r.status(),json})));});
 await context.route('**/*',async route=>{const r=route.request(),url=new URL(r.url());if(url.origin!==origin){blocked.push(r.url());return route.abort('blockedbyclient');}if(await auth.handle(route))return;if(url.pathname.startsWith('/api/'))requests.push({path:url.pathname,body:r.postDataJSON()});return route.continue();});
 try{
  await page.goto(origin+'/ai-analysis.html');await loginClosed(page,origin,origin+'/ai-analysis.html',auth);await anonymousDenied(context,origin,'/api/ra/ai/overview',{});
  assert.equal((await context.request.post(origin+'/api/ra/test/session',{data:''})).status(),204);await seedRealProfile(context,page,origin,auth);await page.goto(origin+'/ai-analysis.html');await verifyDocument(page,auth,1);await expect(page.locator('#overview-state')).toHaveAttribute('data-state','success');await verifyDocument(page,auth);assert.deepEqual(await page.locator('#overview strong').allTextContents(),['6人','40%','3人','3人','2人']);
  await page.locator('#overview a[href="ai-cohort.html"]').click();await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');await verifyDocument(page,auth);await expect(page.locator('#cohort-n')).toHaveText('6');await expect(page.locator('#fm-summary')).toHaveText('FM 3 · 明确无FM 3 · 未知 0 · 可评估 · 无额外限制');await expect(page.locator('#fm-rows tr')).toHaveCount(6);
  const falsePatient=page.locator('[data-patient-id="4"]');await expect(falsePatient.locator('.patient-comorbidity')).toHaveText('FM 否 · AS 未知');await falsePatient.locator('details summary').click();await expect(falsePatient.locator('[data-clinical-source="fm"]')).toContainText('来源依据：已记录，可按记录日期核对');await expect(falsePatient.locator('[data-clinical-source="fm"]')).not.toContainText('synthetic:fm4');await expect(falsePatient.locator('[data-clinical-source="fm"]')).toContainText('纤维肌痛状态：否');await expect(falsePatient.locator('[data-clinical-source="fm"]')).toContainText('记录日期：2026-10-06');await expect(falsePatient.locator('.patient-fm-version')).toHaveText('纤维肌痛：使用已核定的来源依据');
  await page.locator('#f-tx').selectOption('TNFi');await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');await verifyDocument(page,auth);await expect(page.locator('#cohort-n')).toHaveText('1');await expect(page.locator('#patient-rows .ai-row')).toHaveCount(1);await expect(page.locator('[data-patient-id="2"] .patient-treatment')).toContainText('用药记录 1 项 · 已记录药物（名称待核对）');await expect(page.locator('[data-patient-id="2"] .patient-treatment')).not.toContainText('synthetic:g2');await page.locator('[data-patient-id="2"] details summary').click();await expect(page.locator('.patient-treatment-source')).not.toContainText('dictionaryVersion：synthetic-drug-v1');await expect(page.locator('[data-clinical-source="fm"]')).toContainText('纤维肌痛状态：是');
  assert.equal((await context.request.post(origin+'/api/ra/test/logout',{data:''})).status(),204);await page.locator('#reanalyze').click();await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','error');await expect(page.locator('#error-message')).toContainText('登录已失效，请重新登录');await expect(page.locator('#patient-rows')).toBeEmpty();
  await Promise.all(reads);const overview=responses.find(r=>r.path==='/api/ra/ai/overview'&&r.status===200).json.data,cohort=responses.find(r=>r.path==='/api/ra/ai/cohort'&&r.status===200).json.data;
  assert.equal(overview.fmN,3);assert.equal(overview.meta.policyVersions.fmSource,'synthetic-fm-v1');assert.deepEqual([cohort.fm.nFM,cohort.fm.nOther,cohort.fm.unknownN],[3,3,0]);assert.equal(cohort.meta.policyVersions.drugDictionary,'synthetic-drug-v1');assert.equal(cohort.fm.rows[0].difference,-1.635);for(const row of cohort.fm.rows){assert.equal(row.test.reason,'VALID_N_LT_5');assert.equal(row.test.pValue,null);}
  const events=fixture.events.filter(e=>e.type==='configured-source-http-observation');assert.ok(events.some(e=>e.path==='/api/ra/ai/overview'&&e.status===200&&e.selectDelta===5&&e.borrowDelta===1&&e.writeDelta===0));assert.ok(events.some(e=>e.path==='/api/ra/ai/cohort'&&e.status===200&&e.selectDelta===5&&e.analysisInsertDelta===1));assert.ok(events.every(e=>e.active===0&&e.typedProvider));assert.ok(events.filter(e=>e.status===401).every(e=>e.bodyBytes===0&&e.borrowDelta===0));await auth.verifyAll();assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  observations.push({stage:'typed-cookie-configured-source-sql-dom',patients:6,fmTrue:3,fmFalse:3,fmUnknown:0,opaqueBrandId:'synthetic:g2',sourceVersion:'synthetic-fm-v1',overviewWrites:0,identityClosed:true});
 }finally{await Promise.allSettled(reads);const evidence={scenario:id,authRequests:auth.requests,version:owner.report.browser.at(-1)?.version,requests,responses,errors,blocked,observations,dom:await page.locator('main').innerText().catch(()=>null)};for(const name of ['network.json','browser-observation.json'])await writeFile(`${owner.dir}/${name}`,JSON.stringify(evidence,null,2)+'\n');}
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
