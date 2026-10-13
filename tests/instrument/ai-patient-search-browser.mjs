import {installAuthBootstrapObserver} from '../fixtures/auth-bootstrap-observer.cjs';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
export async function patientSearchBrowser(context,port,identity,owner,probe,pid,id,fixture){
 const origin=`http://127.0.0.1:${port}`,page=await context.newPage(),requests=[],responses=[],reads=[],errors=[],blocked=[],observations=[];
 const auth=await installAuthBootstrapObserver(context,{origin,identity:'anonymous'});
 await context.addInitScript(()=>{window.__bootstrapAuthChanges=0;window.addEventListener('ra-auth-changed',()=>window.__bootstrapAuthChanges++);});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/api/ra/ai/'))reads.push(r.json().then(json=>responses.push({path:new URL(r.url()).pathname,status:r.status(),json})))});
 await context.route('**/*',async route=>{const r=route.request(),url=new URL(r.url());if(url.origin!==origin){blocked.push(r.url());return route.abort('blockedbyclient');}if(await auth.handle(route))return;if(url.pathname.startsWith('/api/'))requests.push({path:url.pathname,body:r.postDataJSON()});return route.continue();});
 const state=s=>expect(page.locator('#patient-search-state')).toHaveAttribute('data-state',s),search=async keyword=>{await page.locator('#picker').fill(keyword);await page.locator('#patient-search-form button').click()};
 try{
  await page.goto(origin+'/ai-analysis.html');await loginClosed(page,origin,origin+'/ai-analysis.html',auth);await anonymousDenied(context,origin,'/api/ra/ai/patientSearch',{keyword:'odd',page:1,size:20});
  assert.equal((await context.request.post(origin+'/api/ra/test/session',{data:''})).status(),204);await seedRealProfile(context,page,origin,auth);await page.goto(origin+'/ai-analysis.html');await verifyDocument(page,auth,1);await expect(page.locator('#overview-state')).toHaveAttribute('data-state','success');await verifyDocument(page,auth);assert.deepEqual(await page.locator('#overview strong').allTextContents(),['3人','暂无可评估患者','0人','0人','3人']);
  await search('');await state('success');await verifyDocument(page,auth);assert.deepEqual(await page.locator('#picker-list a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href'))),['patient-visits.html?id=9007199254740993&from=ai-analysis','patient-visits.html?id=9007199254740992&from=ai-analysis','patient-visits.html?id=9223372036854775807&from=ai-analysis']);await expect(page.locator('#patient-search-page')).toContainText('共 3 人');await expect(page.locator('#patient-search-next')).toBeDisabled();
  const p2=await context.request.post(origin+'/api/ra/ai/patientSearch',{data:{keyword:'',page:2,size:2}});assert.equal(p2.status(),200);const second=(await p2.json()).data;assert.equal(second.total,3);assert.deepEqual(second.items,[{patientId:'9223372036854775807',name:'synthetic-patient-max',studyNo:'RA-MAX'}]);
  await search('9007199254740993');await state('success');await verifyDocument(page,auth);await page.locator('#picker-list a').click();await expect(page.locator('#patient-basic')).toHaveAttribute('data-state','success');await verifyDocument(page,auth);await expect(page.locator('#patient-basic')).toContainText('synthetic-patient-odd');await expect(page.locator('#visit-list a')).toHaveAttribute('href','visit-detail.html?id=9007199254740993&visit=9007199254741003&from=ai-analysis');
  await page.locator('#visit-list a').click();await expect(page.locator('#visit-hero')).toHaveAttribute('data-state','success');await verifyDocument(page,auth);await expect(page.locator('#back-visits')).toHaveAttribute('href','patient-visits.html?id=9007199254740993&from=ai-analysis');await page.locator('#back-visits').click();await expect(page.locator('#patient-basic')).toHaveAttribute('data-state','success');await verifyDocument(page,auth);await page.locator('#back-origin').click();await state('idle');await expect(page.locator('#picker-list')).toBeEmpty();
  await search('RA-EVEN');await state('success');await verifyDocument(page,auth);await expect(page.locator('#picker-list a')).toHaveCount(1);await expect(page.locator('#picker-list')).toContainText('9007199254740992');
  for(const k of ['8001','8002','no-synthetic-result']){await search(k);await state('empty');await expect(page.locator('#patient-search-page')).toContainText('共 0 人')}
  await owner.mysqlQuery("UPDATE ra_synthetic_test.patient_basic_info SET name='<img onerror=alert(1)> % literal' WHERE id=9007199254740993");await search('%');await state('success');await verifyDocument(page,auth);await expect(page.locator('#picker-list')).toContainText('<img onerror=alert(1)>');await expect(page.locator('#picker-list img')).toHaveCount(0);
  await owner.mysqlQuery('DELETE FROM ra_synthetic_test.patient_relation_doctor WHERE doctor_id=101 AND patient_id=9007199254740993');await search('9007199254740993');await state('empty');
  await owner.mysqlQuery('RENAME TABLE ra_synthetic_test.patient_follow_up_history TO ra_synthetic_test.synthetic_search_offline');try{await search('');await state('error');await expect(page.locator('#patient-search-state')).toContainText('服务暂不可用，请稍后重试');await expect(page.locator('#picker-list')).toBeEmpty()}finally{await owner.mysqlQuery('RENAME TABLE ra_synthetic_test.synthetic_search_offline TO ra_synthetic_test.patient_follow_up_history')}
  await search('');await state('success');await verifyDocument(page,auth);await page.evaluate(()=>window.dispatchEvent(new Event('ra-auth-changed')));await expect(page.locator('#picker-list')).toBeEmpty();await expect(page.locator('#overview')).toBeEmpty();await state('idle');
  assert.equal((await context.request.post(origin+'/api/ra/test/logout',{data:''})).status(),204);await search('');await state('error');await expect(page.locator('#patient-search-state')).toContainText('登录已失效，请重新登录');await Promise.all(reads);
  const first=responses.find(r=>r.path.endsWith('/overview')&&r.status===200).json.data;assert.equal(first.studyTotal,3);assert.equal(first.targetRate.meta.status,'NO_DATA');assert.equal(first.targetRate.meta.unknownN,3);assert.ok(fixture.events.filter(e=>e.type==='http-observation').every(e=>e.active===0&&e.borrowed===e.returned));await auth.verifyAll();assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);assert.ok(requests.every(r=>['/api/ra/ai/overview','/api/ra/ai/patientSearch','/api/ra/ai/patientDetail','/api/ra/ai/visitDetail'].includes(r.path)));assert.ok(requests.filter(r=>r.path.endsWith('/patientSearch')).every(r=>Object.keys(r.body).sort().join(',')==='keyword,page,size'));
  observations.push({stage:'typed-cookie-sql-search-details-return',originalLongIds:true,overviewNoData:true,scopeHidden:true,sourceFailureClosed:true,identityClosed:true});
 }finally{await Promise.allSettled(reads);const evidence={scenario:id,authRequests:auth.requests,version:owner.report.browser.at(-1)?.version,requests,responses,errors,blocked,observations,dom:await page.locator('main').innerText().catch(()=>null)};for(const name of ['network.json','browser-observation.json'])await writeFile(`${owner.dir}/${name}`,JSON.stringify(evidence,null,2)+'\n')}
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
