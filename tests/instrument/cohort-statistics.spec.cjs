const {test,expect}=require('@playwright/test');
const {installAuthBootstrap}=require('../fixtures/auth-bootstrap.cjs');
const {writeFile}=require('node:fs/promises');
const {U,F}=require('../fixtures/cohort-p02.json');
async function setup({page,context,browser},scenario,reply=()=>({status:200,data:U})){
  const auth=await installAuthBootstrap(context);
const origin=process.env.RA_STATIC_URL,requests=[],allowed=[],blocked=[],pageErrors=[];
 page.on('pageerror',e=>pageErrors.push(e.message));
 await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==origin){blocked.push(request.url());return route.abort('blockedbyclient');}allowed.push(request.url());if(await auth.handle(route))return;if(url.pathname.startsWith('/api/')){requests.push({url:request.url(),body:request.postDataJSON()});const r=reply(requests.at(-1));return route.fulfill({status:r.status,contentType:'application/json',body:JSON.stringify(r.status===200?{success:true,code:'200',message:'成功',data:r.data}:{success:false,code:r.code,message:'安全失败',data:null})});}await route.continue();});
 return {origin,auth,requests,pageErrors,save:async()=>{await writeFile(`${process.env.RA_RUN_DIR}/browser-observation.json`,JSON.stringify({scenario,version:browser.version(),requests,authRequests:auth.requests,allowed,blocked,pageErrors,dom:await page.locator('main').innerText()},null,2)+'\n');await writeFile(`${process.env.RA_RUN_DIR}/network.json`,JSON.stringify({requests,authRequests:auth.requests,allowed,blocked,pageErrors},null,2)+'\n');}};
}
test('cohort:statistics-six',async({page,context,browser})=>{
 const o=await setup({page,context,browser},'cohort:statistics-six',request=>({status:200,data:request.body.filters.sex==='F'?F:U}));
 try{await page.goto(o.origin+'/ai-cohort.html');await o.auth.verify(page);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');
 await expect(page.locator('#age-median')).toHaveText('50');await expect(page.locator('#age-detail')).toContainText('有效 5');await expect(page.locator('#stats .stat-tile')).toHaveCount(5);
 await expect(page.locator('#duration-median')).toHaveText('3');await expect(page.locator('#target-rate')).toHaveText('40%');await expect(page.locator('#complete-rate')).toHaveText('67%');await expect(page.locator('#cohort-detail')).toContainText('100%');
 await expect(page.locator('#clinical-panels')).toBeVisible();
 await expect(page.locator('#activity-base .statistics-bucket')).toHaveCount(4);expect(await page.locator('#activity-base .statistics-bucket').evaluateAll(nodes=>nodes.map(n=>n.dataset.count))).toEqual(['1','1','1','2']);
 expect(await page.locator('#activity-current .statistics-bucket').evaluateAll(nodes=>nodes.map(n=>n.dataset.count))).toEqual(['1','1','2','1']);await expect(page.locator('#activity-summary')).toContainText('基线有效 5 · 未知 1');await expect(page.locator('#activity-summary')).toContainText('当前 · 有效 5 · 未知 1');
 await expect(page.locator('#crp-policy')).toHaveText('DAS28-CRP：缓解<2.3，低2.3～2.7，中>2.7且≤4.1，高>4.1；达标≤2.7');
 expect(await page.locator('#tx-groups .statistics-bucket').evaluateAll(nodes=>nodes.map(n=>n.dataset.tx))).toEqual(['csDMARD','TNFi','JAKi','IL-6i','Abatacept']);expect(await page.locator('#tx-groups .statistics-bucket').evaluateAll(nodes=>nodes.map(n=>n.dataset.display))).toEqual(['100%','100%','0%','0%','0%']);
 await expect(page.locator('#tx-summary')).toHaveText('治疗未知/冲突 1 · 当前无治疗 0');await expect(page.locator('#study-target')).toHaveText('研究库基准 40% · 可评估 · 2/5 · 未知 1');await expect(page.locator('#tx-test')).toContainText('符合检验条件的组少于2组');await expect(page.locator('#tx-test')).toContainText('纳入组 无');await expect(page.locator('#tx-test')).toContainText('每组有效样本少于5人');
 expect(await page.locator('#line-groups .statistics-bucket').evaluateAll(nodes=>nodes.map(n=>[n.dataset.count,n.dataset.display,n.style.getPropertyValue('--share')]))).toEqual([['1','17%','16.66666666666667%'],['2','33%','33.33333333333333%'],['2','33%','33.33333333333333%']]);await expect(page.locator('#line-summary')).toHaveText('线数未知 1 · 分母 6');
 await expect(page.locator('#fm-summary')).toHaveText('FM 3 · 明确无FM 0 · 未知 3 · 样本不足 · 每组样本少于3人');await expect(page.locator('#fm-rows tr')).toHaveCount(0);await expect(page.locator('#fm-table')).toBeHidden();await expect(page.locator('#fm-note')).toContainText('样本不足');
 await expect(page.locator('#analysis-policy')).not.toContainText('dev-stats-v04');await expect(page.locator('#analysis-policy')).toContainText('2026-10-07T02:00:00Z');await expect(page.locator('#analysis-policy')).toContainText('探索性分析');expect(await page.locator('main').innerText()).not.toContain('sourceDateCoverage');
 await page.locator('#f-sex').selectOption('F');await expect(page.locator('#age-median')).toHaveText('55');await expect(page.locator('#target-rate')).toHaveText('50%');await expect(page.locator('#complete-rate')).toHaveText('33%');await expect(page.locator('#study-target')).toHaveText('研究库基准 40% · 可评估 · 2/5 · 未知 1');expect(await page.locator('#activity-current .statistics-bucket').evaluateAll(nodes=>nodes.map(n=>n.dataset.count))).toEqual(['1','0','1','0']);await expect(page.locator('#fm-summary')).toHaveText('FM 2 · 明确无FM 0 · 未知 1 · 样本不足 · 每组样本少于3人');expect(o.pageErrors).toEqual([]);
 }finally{await o.save();}
});

test('cohort:statistics-boundaries',async({page,context,browser})=>{
 const {FM_THREE,FM_TESTS,FM_DEGENERATE}=require('../fixtures/cohort-p02.json');let data=FM_THREE;
 const o=await setup({page,context,browser},'cohort:statistics-boundaries',()=>({status:200,data}));
 const refresh=async value=>{data=value;await page.locator('#reanalyze').click();await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');};
 try {await page.goto(o.origin+'/ai-cohort.html');await o.auth.verify(page);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');
 await expect(page.locator('#fm-rows tr')).toHaveCount(6);
 expect(await page.locator('#fm-rows tr').evaluateAll(ns=>ns.map(n=>n.dataset.metric))).toEqual(['das28','tjc','sjc','crp','pain','haq']);
 await expect(page.locator('#activity-current')).toContainText('缓解 2.29');await expect(page.locator('#activity-current')).toContainText('低 2.30 / 2.70');await expect(page.locator('#activity-current')).toContainText('中 2.71 / 4.10');await expect(page.locator('#activity-current')).toContainText('高 4.11');
 for(const metric of ['das28','tjc','sjc','crp','haq']) {const row=page.locator(`#fm-rows [data-metric="${metric}"]`);await expect(row).toContainText('有效 3/3');await expect(row).toContainText('每组有效样本少于5人');await expect(row).toContainText('P —');await expect(row.locator('.significant')).toHaveCount(0);}
 await expect(page.locator('#fm-rows [data-metric="pain"]')).toContainText('无可评估数据');await expect(page.locator('#fm-rows [data-metric="pain"]')).toContainText('缺少指标记录');await expect(page.locator('#fm-note')).toContainText('疼痛量表尚未核实');
 await refresh(FM_TESTS);
 const das=page.locator('#fm-rows [data-metric="das28"]'),tjc=page.locator('#fm-rows [data-metric="tjc"]');
 await expect(das).toContainText('P 0.050');await expect(das.locator('.significant')).toHaveText('显著');await expect(das.locator('.difference')).not.toHaveClass(/highlight/);await expect(das.locator('.difference')).toHaveText('0.5');
 await expect(tjc).toContainText('P 0.050');await expect(tjc.locator('.significant')).toHaveCount(0);await expect(tjc.locator('.difference')).toHaveClass(/highlight/);await expect(tjc).toContainText('未显著');await expect(tjc).toContainText('A组有效 5 / B组有效 5');await expect(tjc).toContainText('Mann–Whitney 精确检验');
 await expect(page.locator('#fm-rows [data-metric="sjc"]')).toContainText('小样本存在相同数值，解释需谨慎');
 await refresh(FM_DEGENERATE);await expect(page.locator('#fm-rows [data-metric="crp"]')).toContainText('数据无法支持检验');await expect(page.locator('#fm-rows [data-metric="crp"]')).toContainText('秩次无差异，无法检验');await expect(page.locator('#fm-rows [data-metric="crp"]')).toContainText('P —');await expect(page.locator('#fm-rows [data-metric="crp"] .significant')).toHaveCount(0);
 await refresh(U);await expect(page.locator('#fm-rows tr')).toHaveCount(0);await expect(page.locator('#fm-table')).toBeHidden();await expect(page.locator('#fm-note')).toContainText('样本不足');expect(o.pageErrors).toEqual([]);
 }finally{await o.save();}
});

test('cohort:statistics-terminal',async({page,context,browser})=>{
 const {EMPTY,NO_VALID}=require('../fixtures/cohort-p02.json');let reply={status:200,data:U};
 const o=await setup({page,context,browser},'cohort:statistics-terminal',()=>reply);
 const refresh=async value=>{reply=value;await page.locator('#reanalyze').click();};
 const emptyPanels=async()=>{await expect(page.locator('#clinical-panels')).toBeHidden();for(const selector of ['#activity-base','#activity-current','#tx-groups','#line-groups','#fm-rows'])await expect(page.locator(selector+' > *')).toHaveCount(0);await expect(page.locator('#analysis-policy')).toHaveText('');await expect(page.locator('#analysis-policy')).toBeHidden();};
 try{await page.goto(o.origin+'/ai-cohort.html');await o.auth.verify(page);await expect(page.locator('#clinical-panels')).toBeVisible();
 await refresh({status:200,data:NO_VALID});await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');await expect(page.locator('#cohort-n')).toHaveText('6');await expect(page.locator('#target-rate')).toHaveText('0%');await expect(page.locator('#target-detail')).toHaveText('无可评估数据 · 0/0 · 未知 6');await expect(page.locator('#age-median')).toHaveText('—');await expect(page.locator('#age-detail')).toContainText('有效 0 · 未知 6');await expect(page.locator('#tx-groups')).toContainText('无可评估数据');await expect(page.locator('#tx-groups .statistics-bucket')).toHaveCount(5);await expect(page.locator('#no-result')).toBeHidden();
 await refresh({status:200,data:EMPTY});await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','empty');await expect(page.locator('#cohort-n')).toHaveText('0');await expect(page.locator('#study-total')).toHaveText('6');await expect(page.locator('#stats .stat-tile')).toHaveCount(5);await expect(page.locator('#cohort-detail')).toHaveText('0% · 无可评估数据 · 0/6 · 未知 0');await expect(page.locator('#age-median')).toHaveText('—');await expect(page.locator('#target-detail')).toContainText('无可评估数据');await expect(page.locator('#no-result')).toBeVisible();await expect(page.locator('#patient-rows .ai-row')).toHaveCount(0);await emptyPanels();
 const malformed=[structuredClone(U),{...U,activity:'wrong-type'},structuredClone(EMPTY),{...U,metricMeta:{...U.metricMeta,ageMedian:null}}];delete malformed[0].metricMeta;delete malformed[2].meta;
 for(const data of malformed) {await refresh({status:200,data:U});await expect(page.locator('#clinical-panels')).toBeVisible();await refresh({status:200,data});await expect.soft(page.locator('#cohort-state')).toHaveAttribute('data-state','error',{timeout:1000});
  if(await page.locator('#cohort-state').getAttribute('data-state')==='error'){await expect(page.locator('#error-message')).toContainText('返回的数据不完整或无法识别，请重新读取');await emptyPanels();for(const selector of ['#cohort-n','#study-total','#age-median','#duration-median','#target-rate','#complete-rate','#age-detail','#target-detail'])await expect(page.locator(selector)).toHaveText('—');await expect(page.locator('#results')).not.toHaveAttribute('data-analysis-id');await expect(page.locator('#patient-rows > *')).toHaveCount(0);await expect(page.locator('#more')).toBeHidden();await expect(page.locator('#no-result')).toBeHidden();}
 }
 await refresh({status:200,data:EMPTY});await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','empty');await expect(page.locator('#target-detail')).toContainText('无可评估数据');await expect(page.locator('#no-result')).toBeVisible();await emptyPanels();
 for(const [status,code] of [[401,'UNAUTHENTICATED'],[503,'SERVICE_UNAVAILABLE']]) {await refresh({status:200,data:U});await expect(page.locator('#clinical-panels')).toBeVisible();await refresh({status,code});await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','error');await emptyPanels();await expect(page.locator('#cohort-n')).toHaveText('—');await expect(page.locator('#age-median')).toHaveText('—');await expect(page.locator('#target-rate')).toHaveText('—');await expect(page.locator('#no-result')).toBeHidden();}
 expect(o.pageErrors).toEqual([]);
 }finally{await o.save();}
});
