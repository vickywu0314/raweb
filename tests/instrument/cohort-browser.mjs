import {installUnavailableAuthBootstrapObserver} from '../fixtures/auth-bootstrap-observer.cjs';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
// T3：真实页面用户动作产生请求，网络边界不替换，不用evaluate手工fetch。
export async function cohortBrowserScenario(context,proxyPort,identity,owner,probe,pid,id) {
  const origin=`http://127.0.0.1:${proxyPort}`,allowed=[],blocked=[],pageErrors=[],requests=[],responses=[],reads=[];
  await context.route('**/*',async route=>{
    const request=route.request();
    if(owner.controller.signal.aborted||new URL(request.url()).origin!==origin){blocked.push(request.url());await route.abort('blockedbyclient');return;}
    allowed.push(request.url());
    if(await auth.handle(route))return;if(new URL(request.url()).pathname.startsWith('/api/'))requests.push({url:request.url(),method:request.method(),body:request.postDataJSON(),headers:request.headers()});
    await route.continue();
  });
  // 此调用仅限已核 non-typed SQL fixture；真实404明确不等于认证通过。
 const auth=await installUnavailableAuthBootstrapObserver(context,{origin});
 await context.addInitScript(()=>sessionStorage.setItem('ra-auth',JSON.stringify({name:'合成页面用户',role:'研究者',expires:0})));
  owner.controller.signal.throwIfAborted();const page=await context.newPage();owner.controller.signal.throwIfAborted();owner.event('page-created',{pid,port:proxyPort});
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('response',response=>{if(new URL(response.url()).pathname==='/api/ra/ai/cohort')reads.push((async()=>{responses.push({status:response.status(),trace:response.headers()['x-trace-id'],json:await response.json()});})());});
  let dom;
  try {
    const response=await page.goto(`${origin}/ai-cohort.html`,{waitUntil:'load'});await auth.verify(page);assert.equal(response.status(),200);
    assert.equal(await page.title(),'队列分析 · 患者数据研究平台');assert.equal(await page.locator('h1').textContent(),'群体智能分析 · 队列分析');
    if(id==='cohort:browser-firstscreen') {
      await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');await expect(page.locator('#cohort-n')).toHaveText('5');await expect(page.locator('#study-total')).toHaveText('5');
      await expect(page.locator('#patient-rows .ai-row')).toHaveCount(5);assert.deepEqual(await page.locator('#patient-rows [data-patient-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.patientId)),['5','3','1','7','6']);
      await page.locator('#f-sex').selectOption('F');await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','empty');await expect(page.locator('#cohort-n')).toHaveText('0');await expect(page.locator('#study-total')).toHaveText('5');await expect(page.locator('#patient-rows .ai-row')).toHaveCount(0);await expect(page.locator('#no-result')).toBeVisible();
      await page.locator('#reset').click();await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');await expect(page.locator('#cohort-n')).toHaveText('5');await expect(page.locator('#study-total')).toHaveText('5');assert.deepEqual(await page.locator('#patient-rows [data-patient-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.patientId)),['5','3','1','7','6']);
    } else {
      await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','error');await expect(page.locator('#patient-rows .ai-row')).toHaveCount(0);await expect(page.locator('#cohort-n')).toHaveText('—');await expect(page.locator('#no-result')).toBeHidden();
      await expect(page.locator('#error-message')).toContainText(id==='cohort:browser-unauthenticated'?'登录已失效，请重新登录':'服务暂不可用，请稍后重试');await expect(page.locator('#error-trace')).toHaveText('');
      if(identity==='anonymous')await expect(page.locator('#login-return')).toBeVisible();
    }
    await Promise.all(reads);await auth.verifyAll();assert.deepEqual(pageErrors,[]);assert.deepEqual(blocked,[]);
    const expected={studyCode:'RA',sex:'',age:'',sero:'',tx:'',at:'now',act:'',cm:'',data:''};
    assert.deepEqual(requests.map(request=>request.body),id==='cohort:browser-firstscreen'?[{filters:expected},{filters:{...expected,sex:'F'}},{filters:expected}]:[{filters:expected}]);
    assert.ok(requests.every(request=>request.method==='POST'&&request.headers['content-type']==='application/json;charset=UTF-8'&&!request.headers['x-doctor-id']&&!request.headers.authorization));
    if(id==='cohort:browser-firstscreen') {
      assert.deepEqual(responses.map(r=>[r.status,r.json.success,r.json.code,r.json.data.n,r.json.data.studyTotal]),[[200,true,'200',5,5],[200,true,'200',0,5],[200,true,'200',5,5]]);
      assert.deepEqual(responses[1].json.data.patients.items,[]);
      for(const index of [0,2])assert.deepEqual(responses[index].json.data.patients.items.map(patient=>patient.patientId),['5','3','1','7','6']);
    }else{assert.equal(responses.length,1);assert.equal(responses[0].status,identity==='anonymous'?401:503);assert.equal(responses[0].json.success,false);assert.equal(responses[0].json.data,null);}
    assert.ok(responses.every(response=>response.trace));owner.report.http.push(...responses.map(response=>({...response,port:proxyPort,via:'page'})));dom=await page.locator('main').innerText();
    await writeFile(`${owner.dir}/browser-observation.json`,JSON.stringify({authRequests:auth.requests,authenticationVerified:false,scenario:id,pid,version:context.browser().version(),identity,url:page.url(),http:response.status(),requests,responses,dom,allowed,blocked,pageErrors},null,2)+'\n');
  }catch(error){owner.fail(error.message);throw error;}finally{
    const errors=[];try{await writeFile(`${owner.dir}/network.json`,JSON.stringify({authRequests:auth.requests,authenticationVerified:false,requests,responses,allowed,blocked,pageErrors},null,2)+'\n');}catch(error){errors.push(error.message);}
    try{await page.close();}catch(error){errors.push(error.message);}
    if(errors.length){owner.report.cleanupErrors=(owner.report.cleanupErrors||[]).concat(errors);owner.report.exit=1;if(!owner.controller.signal.aborted)throw new Error(`browser-case-cleanup-failed:${errors[0]}`);}
  }
}
