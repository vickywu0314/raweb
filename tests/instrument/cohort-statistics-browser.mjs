import {installUnavailableAuthBootstrapObserver} from '../fixtures/auth-bootstrap-observer.cjs';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
const fixture=JSON.parse(await readFile(new URL('../fixtures/cohort-p02.json',import.meta.url)));
// 普通六人源的独立字面预期，只检查实际公开投影，不调用生产计算。
export function literalStatistics(data,key='U') {
  const expected=fixture[key];assert.equal(data.n,expected.n);assert.equal(data.studyTotal,6);assert.deepEqual(data.stats,expected.stats);assert.deepEqual(data.metricMeta,expected.metricMeta);
  assert.deepEqual(data.patients.items.map(p=>p.patientId),expected.patients.items.map(p=>p.patientId));
  for(const k of ['baseN','baseUnknownN','evalN','unknownN','unknownTxN'])assert.equal(data.activity[k],expected.activity[k]);
  for(const side of ['base','current'])assert.deepEqual(data.activity[side].map(({level,count,value,status,displayText})=>({level,count,value,status,displayText})),expected.activity[side].map(({level,count,value,status,displayText})=>({level,count,value,status,displayText})));
  assert.deepEqual(data.byTx.groups,expected.byTx.groups);for(const k of ['unknownTxN','noCurrentTxN','studyTargetRate','studyTargetMeta','comparisonNotice'])assert.deepEqual(data.byTx[k],expected.byTx[k]);
  for(const k of ['status','reason','displayP','significant','includedGroups','excludedGroups','groupNs'])assert.deepEqual(data.byTx.test[k],expected.byTx.test[k]);
  assert.deepEqual(data.lines,expected.lines);assert.deepEqual(data.fm,expected.fm);assert.equal(data.meta.at,'now');assert.equal(data.meta.asOfDate,'2026-10-07');assert.deepEqual(data.meta.policyVersions,expected.meta.policyVersions);assert.equal(data.meta.statisticalDisclosure,expected.meta.statisticalDisclosure);
  for(const p of data.patients.items){assert.notEqual(p.clinical.fm,'FALSE');assert.equal(p.evaluation.pain.value,null);assert.equal(p.evaluation.pain.missingReason,p.patientId==='6'?'NO_VALID_CRP':'UNVERIFIED_SCALE');}
  for(const p of data.patients.items)for(const key of ['card_no','cardNo','birthday','birthDate'])assert.equal(Object.hasOwn(p,key),false);assert.ok(!JSON.stringify(data).includes('110101198610070011'));
}
export async function statisticsBrowser(context,port,identity,owner,probe,pid) {
  const origin=`http://127.0.0.1:${port}`,requests=[],responses=[],reads=[],allowed=[],blocked=[],pageErrors=[];
  await context.route('**/*',async route=>{const request=route.request();if(owner.controller.signal.aborted||new URL(request.url()).origin!==origin){blocked.push(request.url());return route.abort('blockedbyclient');}allowed.push(request.url());if(await auth.handle(route))return;if(new URL(request.url()).pathname.startsWith('/api/'))requests.push({url:request.url(),method:request.method(),body:request.postDataJSON()});await route.continue();});
  // 此调用仅限已核 non-typed SQL fixture；真实404明确不等于认证通过。
 const auth=await installUnavailableAuthBootstrapObserver(context,{origin});
 await context.addInitScript(()=>sessionStorage.setItem('ra-auth',JSON.stringify({name:'合成页面用户',role:'研究者',expires:0})));
  owner.controller.signal.throwIfAborted();const page=await context.newPage();owner.controller.signal.throwIfAborted();owner.event('page-created',{pid,port});page.on('pageerror',e=>pageErrors.push(e.message));
  page.on('response',r=>{if(new URL(r.url()).pathname==='/api/ra/ai/cohort')reads.push((async()=>responses.push({status:r.status(),trace:r.headers()['x-trace-id'],json:await r.json()}))());});
  let dom;
  const checkDom=async(key)=>{
    const expected=fixture[key];await expect(page.locator('#cohort-n')).toHaveText(String(expected.n));await expect(page.locator('#study-total')).toHaveText('6');
    for(const [id,value] of [['age-median',key==='U'?'50':key==='F'?'55':'—'],['duration-median',key==='EMPTY'?'—':'3'],['target-rate',key==='U'?'40%':key==='F'?'50%':'0%'],['complete-rate',key==='U'?'67%':key==='F'?'33%':'0%']])await expect(page.locator('#'+id)).toHaveText(value);
    assert.deepEqual(await page.locator('#patient-rows [data-patient-id]').evaluateAll(ns=>ns.map(n=>n.dataset.patientId)),expected.patients.items.map(p=>p.patientId));
    if(key==='EMPTY'){await expect(page.locator('#clinical-panels')).toBeHidden();await expect(page.locator('#no-result')).toBeVisible();for(const selector of ['#activity-base','#activity-current','#tx-groups','#line-groups','#fm-rows'])await expect(page.locator(selector+' > *')).toHaveCount(0);return;}
    await expect(page.locator('#clinical-panels')).toBeVisible();await expect(page.locator('#study-target')).toHaveText('研究库基准 40% · 可评估 · 2/5 · 未知 1');
    for(const side of ['base','current'])assert.deepEqual(await page.locator('#activity-'+side+' .statistics-bucket').evaluateAll(ns=>ns.map(n=>Number(n.dataset.count))),expected.activity[side].map(r=>r.count));
    assert.deepEqual(await page.locator('#tx-groups .statistics-bucket').evaluateAll(ns=>ns.map(n=>[n.dataset.tx,n.dataset.display])),expected.byTx.groups.map(r=>[r.tx,r.displayText]));
    assert.deepEqual(await page.locator('#line-groups .statistics-bucket').evaluateAll(ns=>ns.map(n=>[Number(n.dataset.count),n.dataset.display])),expected.lines.groups.map(r=>[r.count,r.displayText]));
    await expect(page.locator('#fm-summary')).toContainText('明确无FM 0');await expect(page.locator('#fm-rows tr')).toHaveCount(0);await expect(page.locator('#fm-note')).toContainText('每组样本少于3人');await expect(page.locator('#analysis-policy')).not.toContainText('dev-stats-v04');
  };
  try {
    const response=await page.goto(origin+'/ai-cohort.html');await auth.verify(page);assert.equal(response.status(),200);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');await checkDom('U');
    await page.locator('#f-sex').selectOption('F');await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');await checkDom('F');
    await page.goto(origin+'/ai-cohort.html?ids=');await auth.verify(page);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','empty');await checkDom('EMPTY');
    await Promise.all(reads);assert.equal(responses.length,3);for(const [index,key] of ['U','F','EMPTY'].entries()){assert.equal(responses[index].status,200);assert.ok(responses[index].trace);literalStatistics(responses[index].json.data,key);}
    assert.equal(requests.length,3);assert.equal(requests[1].body.filters.sex,'F');assert.deepEqual(requests[2].body.filters.ids,[]);assert.ok(requests.every(r=>r.method==='POST'));assert.deepEqual(blocked,[]);await auth.verifyAll();assert.deepEqual(pageErrors,[]);
    owner.report.http.push(...responses.map(r=>({...r,port,via:'page'})));dom=await page.locator('main').innerText();await writeFile(owner.dir+'/browser-observation.json',JSON.stringify({authRequests:auth.requests,authenticationVerified:false,scenario:'cohort:browser-statistics',pid,version:context.browser().version(),identity,requests,responses,allowed,blocked,pageErrors,dom},null,2)+'\n');
  }catch(e){owner.fail(e.message);throw e;}finally{
    const errors=[];try{await writeFile(owner.dir+'/network.json',JSON.stringify({authRequests:auth.requests,authenticationVerified:false,requests,responses,allowed,blocked,pageErrors},null,2)+'\n');}catch(e){errors.push(e.message);}try{await page.close();}catch(e){errors.push(e.message);}if(errors.length){owner.report.cleanupErrors=(owner.report.cleanupErrors||[]).concat(errors);owner.report.exit=1;if(!owner.controller.signal.aborted)throw new Error('browser-case-cleanup-failed:'+errors[0]);}
  }
}
