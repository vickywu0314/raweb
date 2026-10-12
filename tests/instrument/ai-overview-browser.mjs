import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

export async function overviewBrowser(context,port,identity,owner,probe,pid,id,fixture){
 const origin=`http://127.0.0.1:${port}`,page=await context.newPage(),errors=[],blocked=[],requests=[],responses=[],reads=[],observations=[];
 await context.addInitScript(()=>sessionStorage.setItem('ra-auth',JSON.stringify({name:'合成页面用户',role:'研究者',expires:0})));
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))requests.push({path:new URL(r.url()).pathname,body:r.postDataJSON()});});
 page.on('response',r=>{if(new URL(r.url()).pathname==='/api/ra/ai/overview')reads.push(r.json().then(json=>responses.push({status:r.status(),json})));});
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){blocked.push(route.request().url());return route.abort('blockedbyclient');}return route.continue();});
 const state=s=>expect(page.locator('#overview-state')).toHaveAttribute('data-state',s),reload=()=>page.locator('#overview-retry').click();
 try{
  await page.goto(origin+'/ai-analysis.html');await state('error');await expect(page.locator('#overview-state')).toContainText('UNAUTHENTICATED');await expect(page.locator('#overview')).toBeEmpty();
  assert.equal((await context.request.post(origin+'/api/ra/test/session',{data:''})).status(),204);await reload();await state('success');await expect(page.locator('#overview .stat-tile')).toHaveCount(5);
  const values=await page.locator('#overview strong').allTextContents();assert.deepEqual(values,['6人','40%','3人','3人','2人']);
  assert.deepEqual(await page.locator('#overview a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href'))),['ai-cohort.html','ai-cohort.html?act=target','ai-cohort.html?act=mod-high','ai-cohort.html?cm=FM','ai-cohort.html?data=missing']);
  await owner.mysqlQuery('UPDATE ra_synthetic_test.patient_follow_up_history SET bqpg=NULL WHERE patient_basic_info_id<=6');await reload();await state('success');await expect(page.locator('#overview')).toContainText('暂无可评估患者');await expect(page.locator('#overview')).toContainText('未知 6 人');
  await owner.mysqlQuery(`UPDATE ra_synthetic_test.patient_follow_up_history SET bqpg='{"result":{"crpScore":4.11}}' WHERE patient_basic_info_id<=6`);await reload();await state('success');await expect(page.locator('#overview a').nth(1)).toContainText('0%');await expect(page.locator('#overview a').nth(2)).toContainText('6人');
  await owner.mysqlQuery('DELETE FROM ra_synthetic_test.patient_relation_doctor WHERE doctor_id=101');await reload();await state('success');await expect(page.locator('#overview')).toContainText('当前研究库为空');
  await owner.mysqlQuery('INSERT INTO ra_synthetic_test.patient_relation_doctor (doctor_id,patient_id,research_type,miss) VALUES (101,1,0,0)');await owner.mysqlQuery('RENAME TABLE ra_synthetic_test.patient_follow_up_history TO ra_synthetic_test.synthetic_overview_offline');
  try{await reload();await state('error');await expect(page.locator('#overview-state')).toContainText('SERVICE_UNAVAILABLE');await expect(page.locator('#overview')).toBeEmpty();}finally{await owner.mysqlQuery('RENAME TABLE ra_synthetic_test.synthetic_overview_offline TO ra_synthetic_test.patient_follow_up_history');}
  await reload();await state('success');await page.evaluate(()=>window.dispatchEvent(new Event('ra-auth-changed')));await state('cancelled');await expect(page.locator('#overview')).toBeEmpty();
  assert.equal((await context.request.post(origin+'/api/ra/test/logout',{data:''})).status(),204);await reload();await state('error');await expect(page.locator('#overview-state')).toContainText('UNAUTHENTICATED');
  await Promise.all(reads);const first=responses.find(r=>r.status===200).json.data;assert.equal(first.studyTotal,6);assert.equal(first.targetRate.value,.4);assert.equal(first.targetRate.meta.numerator,2);assert.equal(first.targetRate.meta.denominator,5);assert.equal(first.targetRate.meta.unknownN,1);assert.equal(first.fmN,3);assert.equal(first.missingN,2);
  const events=fixture.events.filter(e=>e.type==='overview-http-observation');assert.ok(events.some(e=>e.status===200&&e.selectDelta===5&&e.borrowDelta===1));assert.ok(events.every(e=>e.active===0&&e.writeDelta===0&&e.typedProvider));assert.ok(events.filter(e=>e.status===401).every(e=>e.bodyBytes===0&&e.borrowDelta===0));assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);assert.ok(requests.every(r=>r.path==='/api/ra/ai/overview'&&JSON.stringify(r.body)==='{}'));
  observations.push({stage:'typed-cookie-sql-dom-overview',cards:5,noDataDistinct:true,zeroDistinct:true,emptyDistinct:true,sourceFailureClosed:true,identityClosed:true,writeDelta:0});
 }finally{await Promise.allSettled(reads);const evidence={scenario:id,version:owner.report.browser.at(-1)?.version,requests,responses,errors,blocked,observations,dom:await page.locator('main').innerText().catch(()=>null)};for(const name of ['network.json','browser-observation.json'])await writeFile(`${owner.dir}/${name}`,JSON.stringify(evidence,null,2)+'\n');}
}
