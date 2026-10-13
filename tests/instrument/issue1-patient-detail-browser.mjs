import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
export async function legacyDetailBrowser(context,port,identity,owner,probe,pid,id,fixture){
 const origin=`http://127.0.0.1:${port}`,patientId='9007199254740992',visitId='9007199254741001',requests=[],responses=[],reads=[],errors=[],blocked=[],observations=[];
 await context.addInitScript(()=>sessionStorage.setItem('ra-auth',JSON.stringify({doctorId:'101',name:'synthetic-browser',role:'研究者'})));
 await context.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==origin){blocked.push(u.origin);return route.abort('blockedbyclient');}if(u.pathname.startsWith('/api/'))requests.push({path:u.pathname,body:r.postData(),cookiePresent:!!r.headers().cookie});return route.continue();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{const path=new URL(r.url()).pathname;if(path==='/api/ra/patient/patientDetail'||path.startsWith('/api/ra/visit/'))reads.push((async()=>responses.push({path,status:r.status(),trace:r.headers()['x-trace-id'],json:await r.json()}))());});
 const url=p=>origin+'/'+p+'.html?id='+patientId+(['visit-detail','visit-edit'].includes(p)?'&visit='+visitId:'');
 const state=p=>page.locator(p==='patient-visits'?'#patient-basic':p==='visit-detail'?'#visit-hero':'#visit-title');
 try{
  await page.goto(url('patient-visits'));await expect(state('patient-visits')).toHaveAttribute('data-state','error');await expect(state('patient-visits')).toContainText('请先登录');
  assert.equal((await context.request.post(origin+'/api/ra/test/session',{data:''})).status(),204);
  for(const p of ['patient-visits','visit-detail','visit-create','visit-edit']){
   await page.goto(url(p));await expect(state(p)).toHaveAttribute('data-state','success');await expect(page.locator('main')).toContainText('synthetic-patient-even');
   if(p==='patient-visits')await expect(page.locator('#visit-list a').first()).toHaveAttribute('href',new RegExp(visitId));
   if(p==='visit-detail')await expect(page.locator('#visit-sections')).toContainText('SYNTHETIC-HISTORY');
   if(p==='visit-create'||p==='visit-edit')await expect(page.locator(p==='visit-create'?'#save-create':'#save-edit')).toBeEnabled();
   await page.evaluate(()=>window.dispatchEvent(new Event('ra-auth-changed')));await expect(state(p)).toHaveAttribute('data-state','cancelled');await expect(page.locator('main')).not.toContainText('synthetic-patient-even');
   observations.push({page:p,typedCookieSqlDom:true,exactPatientId:patientId,exactVisitId:visitId,identityCleared:true});
  }
  await owner.mysqlQuery('RENAME TABLE ra_synthetic_test.patient_follow_up_history TO ra_synthetic_test.synthetic_issue1_source_offline');try{await page.goto(url('patient-visits'));await expect(state('patient-visits')).toHaveAttribute('data-state','error');await expect(page.locator('#visit-list')).toBeEmpty();}finally{await owner.mysqlQuery('RENAME TABLE ra_synthetic_test.synthetic_issue1_source_offline TO ra_synthetic_test.patient_follow_up_history');}
  await owner.mysqlQuery('DELETE FROM ra_synthetic_test.patient_relation_doctor WHERE doctor_id=101 AND patient_id=9007199254740992');await page.goto(url('patient-visits'));await expect(state('patient-visits')).toHaveAttribute('data-state','error');await expect(state('patient-visits')).toContainText('患者资料不可用');
  assert.equal((await context.request.post(origin+'/api/ra/test/logout',{data:''})).status(),204);await page.goto(url('visit-edit'));await expect(state('visit-edit')).toHaveAttribute('data-state','error');await expect(page.locator('#save-edit')).toBeDisabled();
  await Promise.all(reads);assert.equal(errors.length,0);assert.equal(blocked.length,0);assert.ok(responses.some(r=>r.path==='/api/ra/patient/patientDetail'&&r.status===200&&r.trace&&r.json.data.patientId===patientId));
  assert.ok(fixture.events.filter(e=>e.type==='patient-http-observation').every(e=>e.typedProvider&&e.active===0));
 }finally{
  await Promise.allSettled(reads);const evidence={scenario:id,version:owner.report.browser.at(-1)?.version,requests,responses,blocked,errors,observations,dom:await page.locator('main').innerText().catch(()=>null)};for(const name of ['network.json','browser-observation.json'])await writeFile(`${owner.dir}/${name}`,JSON.stringify(evidence,null,2)+'\n');
 }
}
