const {test,expect}=require('@playwright/test');
const {installAuthBootstrap}=require('../fixtures/auth-bootstrap.cjs');
// 独立中文错误真值。
const expectedError={"UNAUTHENTICATED":"登录已失效，请重新登录","SERVICE_UNAVAILABLE":"服务暂不可用，请稍后重试","INVALID_ARGUMENT":"输入内容不符合要求，请检查后重试"};
const {writeFile}=require('node:fs/promises');
const {U,EMPTY,UNKNOWN_PATIENT}=require('../fixtures/cohort-p02.json');
const ids=['9223372036854775807','11','9','8','7','6','5','4','3','2'];
const firstscreen={success:true,code:'200',message:'成功',data:{...U,n:12,studyTotal:20,analysisId:'11111111-1111-1111-1111-111111111111',patients:{total:12,returnedCount:10,hasMore:true,nextCursor:'opaque-firstscreen-cursor',items:[{...structuredClone(UNKNOWN_PATIENT),patientId:'9223372036854775807',name:'合成<甲>',studyNo:'RA-001'},{...structuredClone(UNKNOWN_PATIENT),patientId:'11',name:'合成乙1',studyNo:null},{...structuredClone(UNKNOWN_PATIENT),patientId:'9',name:'合成乙2',studyNo:null},{...structuredClone(UNKNOWN_PATIENT),patientId:'8',name:'合成乙3',studyNo:null},{...structuredClone(UNKNOWN_PATIENT),patientId:'7',name:'合成乙4',studyNo:null},{...structuredClone(UNKNOWN_PATIENT),patientId:'6',name:'合成乙5',studyNo:null},{...structuredClone(UNKNOWN_PATIENT),patientId:'5',name:'合成乙6',studyNo:null},{...structuredClone(UNKNOWN_PATIENT),patientId:'4',name:'合成乙7',studyNo:null},{...structuredClone(UNKNOWN_PATIENT),patientId:'3',name:'合成乙8',studyNo:null},{...structuredClone(UNKNOWN_PATIENT),patientId:'2',name:'合成乙9',studyNo:null}]}}};
async function setup({page,context,browser},scenario,reply=()=>({status:200,body:firstscreen})) {
   const auth=await installAuthBootstrap(context);
const origin=process.env.RA_STATIC_URL,requests=[],allowed=[],blocked=[],pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==origin){blocked.push(request.url());await route.abort('blockedbyclient');return;}
    allowed.push(request.url());if(await auth.handle(route))return;
    if(url.pathname.startsWith('/api/')){
      requests.push({url:request.url(),method:request.method(),headers:request.headers(),body:request.postDataJSON()});
      const response=scenario==='cohort:no-demo-actions'&&url.pathname==='/api/ra/ai/parse'?{status:200,trace:'trace-p05',body:{success:true,code:'200',data:require('../fixtures/cohort-parse.json').PARTIAL}}:reply(requests.length);if(response.abort){await route.abort('failed');return;}
      await route.fulfill({status:response.status,contentType:response.contentType||'application/json',headers:{'X-Trace-Id':response.trace||'fixture-trace'},body:typeof response.body==='string'?response.body:JSON.stringify(response.body)});return;
    }
    await route.continue();
  });
  const save=async()=>{
    const dom=await page.locator('main').innerText().catch(()=>null);
    await writeFile(`${process.env.RA_RUN_DIR}/browser-observation.json`,JSON.stringify({scenario,version:browser.version(),url:page.url(),requests,authRequests:auth.requests,dom,allowed,blocked,pageErrors},null,2)+'\n');
    await writeFile(`${process.env.RA_RUN_DIR}/network.json`,JSON.stringify({requests,authRequests:auth.requests,allowed,blocked,pageErrors},null,2)+'\n');
  };
  return {origin,auth,requests,pageErrors,save};
}
test('cohort:request-firstscreen',async ({page,context,browser})=>{
  const observed=await setup({page,context,browser},'cohort:request-firstscreen');
  try {
    await page.goto(`${observed.origin}/ai-cohort.html`,{waitUntil:'load'});await observed.auth.verify(page);
    await page.locator('#f-sex').selectOption({label:'女'});
    await expect.poll(()=>observed.requests.length).toBe(2);
    expect(observed.requests.map(request=>request.body)).toEqual([
      {filters:{studyCode:'RA',sex:'',age:'',sero:'',tx:'',at:'now',act:'',cm:'',data:''}},
      {filters:{studyCode:'RA',sex:'F',age:'',sero:'',tx:'',at:'now',act:'',cm:'',data:''}}
    ]);
    await expect(page.locator('#cohort-n')).toHaveText('12');await expect(page.locator('#study-total')).toHaveText('20');
    await expect(page.locator('#patient-rows .ai-row')).toHaveCount(10);
    expect(await page.locator('#patient-rows [data-patient-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.patientId))).toEqual(ids);
    await expect(page.locator('#patient-rows .ai-row').first()).toContainText('合成<甲>');await expect(page.locator('#patient-rows .ai-row').first()).toContainText('RA-001');
    expect(await page.locator('#patient-rows .ai-row').first().locator('甲').count()).toBe(0);
    await expect(page.locator('#more')).toBeEnabled();
    let expected={studyCode:'RA',sex:'F',age:'',sero:'',tx:'',at:'now',act:'',cm:'',data:''};
    for(const [key,values] of [['sex',['M','F']],['age',['18-40','40-50','50-60','60-70','70-']],['sero',['1']],['tx',['csDMARD','bio','TNFi','JAKi','IL-6i','Abatacept']],['at',['6m','now']],['act',['target','mod-high','remission','low','moderate','high']],['cm',['FM','AS','none']],['data',['complete','missing']]]) {
      for(const value of values){const before=observed.requests.length;await page.locator(`#f-${key}`).selectOption(value);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');expected={...expected,[key]:value};expect(observed.requests.length).toBe(before+1);expect(observed.requests.at(-1).body).toEqual({filters:expected});}
    }
    await page.locator('#reset').click();await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');expect(observed.requests.at(-1).body).toEqual({filters:{studyCode:'RA',sex:'',age:'',sero:'',tx:'',at:'now',act:'',cm:'',data:''}});
    expect(observed.requests.every(request=>request.method==='POST'&&request.headers['content-type']==='application/json;charset=UTF-8'&&!request.headers['x-doctor-id']&&!request.headers.authorization)).toBe(true);
    expect(new URL(page.url()).search).toBe('');expect(observed.pageErrors).toEqual([]);
  }finally{await observed.save();}
});

test('cohort:empty-errors',async ({page,context,browser})=>{
  let response={status:200,body:firstscreen};
  const observed=await setup({page,context,browser},'cohort:empty-errors',()=>response);
  const success=async()=>{response={status:200,body:firstscreen};await page.locator('#reanalyze').click();await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');await expect(page.locator('#patient-rows .ai-row')).toHaveCount(10);};
  try {
    await page.goto(`${observed.origin}/ai-cohort.html`,{waitUntil:'load'});await observed.auth.verify(page);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');
    response={status:200,body:{success:true,code:'200',message:'成功',data:{...EMPTY,n:0,studyTotal:20,analysisId:'11111111-1111-1111-1111-111111111111',patients:{total:0,returnedCount:0,hasMore:false,nextCursor:null,items:[]}}}};
    await page.locator('#f-sex').selectOption('F');await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','empty');
    await expect(page.locator('#cohort-n')).toHaveText('0');await expect(page.locator('#study-total')).toHaveText('20');await expect(page.locator('#patient-rows .ai-row')).toHaveCount(0);await expect(page.locator('#no-result')).toBeVisible();await expect(page.locator('#analysis-error')).toBeHidden();
    for(const failed of [
      {status:401,trace:'trace-401',body:{success:false,code:'UNAUTHENTICATED',message:'会话<img src=x onerror=alert(1)>失效',data:null}},
      {status:503,trace:'trace-503',body:{success:false,code:'SERVICE_UNAVAILABLE',message:'服务暂不可用',data:null}},
      {status:400,trace:'trace-400',body:{success:false,code:'INVALID_ARGUMENT',message:'条件错误',data:null}},
      {status:200,trace:'trace-nonjson',contentType:'text/html',body:'<html>无法响应</html>'},
      {abort:true}
    ]) {
      await success();const before=observed.requests.length;response=failed;
      await page.locator('#reanalyze').click();await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','error');
      expect(observed.requests.length).toBe(before+1);await expect(page.locator('#patient-rows .ai-row')).toHaveCount(0);await expect(page.locator('#cohort-n')).toHaveText('—');await expect(page.locator('#no-result')).toBeHidden();await expect(page.locator('#results')).toBeHidden();await expect(page.locator('#analysis-error')).toBeVisible();
      await expect(page.locator('#f-sex')).toHaveValue('F');await expect(page.locator('#f-sex')).toBeEnabled();
      await expect(page.locator('#error-message')).toContainText(failed.abort?'网络连接失败，请检查连接后重试':failed.contentType?'返回的数据不完整或无法识别，请重新读取':expectedError[failed.body.code]);
      if(failed.trace)await expect(page.locator('#error-trace')).toHaveText('');
      if(failed.status===401){await expect(page.locator('#login-return')).toBeVisible();await expect(page.locator('#login-return')).toHaveAttribute('href','login.html?next=ai-cohort.html');await expect(page.locator('#error-message')).toHaveText('登录已失效，请重新登录');expect(await page.locator('#analysis-error img').count()).toBe(0);}else await expect(page.locator('#login-return')).toBeHidden();
    }
    expect(observed.pageErrors).toEqual([]);
  }finally{await observed.save();}
});

test('cohort:no-demo-actions',async ({page,context,browser})=>{
  const observed=await setup({page,context,browser},'cohort:no-demo-actions');const downloads=[];page.on('download',download=>downloads.push(download.suggestedFilename()));
  try {
    for(const query of ['?similar=9','?foo=']) {
      const before=observed.requests.length;
      await page.goto(`${observed.origin}/ai-cohort.html${query}`,{waitUntil:'load'});await observed.auth.verify(page);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','error');
      await expect(page.locator('#error-message')).toHaveText('此链接中的条件暂不支持，请清空条件后重新分析');expect(observed.requests.length).toBe(before);await expect(page.locator('#patient-rows .ai-row')).toHaveCount(0);
      await page.locator('#reanalyze').click();expect(observed.requests.length).toBe(before);
      await page.locator('#reset').click();await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');expect(observed.requests.length).toBe(before+1);expect(new URL(page.url()).search).toBe('');
      expect(observed.requests.at(-1).body).toEqual({filters:{studyCode:'RA',sex:'',age:'',sero:'',tx:'',at:'now',act:'',cm:'',data:''}});
    }
    const before=observed.requests.length;
    const analysisId=await page.locator('#results').getAttribute('data-analysis-id');
    await page.locator('#question').fill('女性且吸烟');
    await page.locator('#question-form button[type="submit"]').click();
    await expect(page.locator('#parse-state')).toHaveAttribute('data-state','success');
    await expect(page.locator('#parse-state')).toContainText('尚未应用');
    await expect(page.locator('#parse-note')).toHaveText(require('../fixtures/cohort-parse.json').PARTIAL.notice);
    await expect(page.locator('#parse-apply')).toBeVisible();
    await expect(page.locator('#results')).toHaveAttribute('data-analysis-id',analysisId);
    expect(observed.requests.length).toBe(before+1);
    expect(observed.requests.at(-1).body).toEqual({question:'女性且吸烟'});
    await expect(page.locator('#export')).toBeEnabled();
    await page.locator('#export').click();await expect(page.locator('#export-dialog')).toBeVisible();expect(observed.requests.length).toBe(before+1);expect(downloads).toEqual([]);
    expect(await page.locator('#patient-rows a').evaluateAll(nodes=>nodes.map(node=>({text:node.textContent,href:node.getAttribute('href')})))).toEqual(ids.map(id=>({text:'查看患者档案',href:'patient-visits.html?id='+id+'&from=ai-cohort'}))); await expect(page.locator('#clinical-panels')).toBeVisible();expect(await page.locator('main').innerText()).not.toContain('自动发现');expect(await page.locator('main').innerText()).not.toContain('DAS28-ESR');
    expect(observed.requests.every(request=>new URL(request.url).origin===observed.origin&&['/api/ra/ai/cohort','/api/ra/ai/parse'].includes(new URL(request.url).pathname))).toBe(true);
    expect(observed.pageErrors).toEqual([]);
  }finally{await observed.save();}
});
