import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import { literalSuccess, failure } from './loopback-cases.mjs';
/** 当前页面只是instrument载体。期望由P00b字面oracle提供，不消费演示计算。 */
export async function browserLoopbackScenario(context,proxyPort,identity,owner,probe,pid) {
  const origin=`http://127.0.0.1:${proxyPort}`,allowed=[],blocked=[],pageErrors=[];
  owner.controller.signal.throwIfAborted();
  await context.route('**/*',async route=>{
    if(!owner.controller.signal.aborted&&new URL(route.request().url()).origin===origin){allowed.push(route.request().url());await route.continue();}
    else{blocked.push(route.request().url());await route.abort('blockedbyclient');}
  });
  await context.addInitScript(()=>sessionStorage.setItem('ra-auth',JSON.stringify({name:'仪器演示用户',role:'研究者',expires:0})));
  owner.controller.signal.throwIfAborted();const page=await context.newPage();owner.controller.signal.throwIfAborted();
  owner.event('page-created',{pid,port:proxyPort});page.on('pageerror',error=>pageErrors.push(error.message));
  try {
    const response=await page.goto(`${origin}/`,{waitUntil:'load'});
    assert.equal(response.status(),200,'current page must be served by the owned proxy');
    assert.equal(await page.title(),'队列分析 · 患者数据研究平台');
    assert.equal(await page.locator('h1').textContent(),'群体智能分析 · 队列分析');
    for(const selector of ['#question-form','#question','#question-form button[type="submit"]']){await page.locator(selector).waitFor({state:'visible'});assert.equal(await page.locator(selector).isVisible(),true);}
    assert.deepEqual(pageErrors,[]);
    const denied=await page.evaluate(async()=>{try{await fetch('https://example.invalid/instrument-network-denied');return 'allowed';}catch{return 'blocked';}});
    assert.equal(denied,'blocked');assert.ok(blocked.includes('https://example.invalid/instrument-network-denied'));
    const cohort=await page.evaluate(async identity=>{
      const result=await fetch('/api/ra/ai/cohort',{method:'POST',headers:{'Content-Type':'application/json','X-Doctor-Id':'202'},body:JSON.stringify(identity==='anonymous'?{doctorId:'101'}:{})});
      if(!result.headers.get('content-type')?.includes('application/json'))throw new Error('non-json');
      return {status:result.status,trace:result.headers.get('x-trace-id'),json:await result.json()};
    },identity);
    if(identity==='anonymous')failure(cohort,401,'UNAUTHENTICATED');else literalSuccess(cohort);
    assert.deepEqual(pageErrors,[]);owner.controller.signal.throwIfAborted();
    owner.report.http.push({...cohort,port:proxyPort,via:'browser'});
    await writeFile(`${owner.dir}/browser-observation.json`,JSON.stringify({pid,version:context.browser().version(),identity,url:page.url(),http:response.status(),title:await page.title(),h1:await page.locator('h1').textContent(),cohort,allowed,blocked,pageErrors},null,2)+'\n');
    await writeFile(`${owner.dir}/network.json`,JSON.stringify({allowed,blocked,pageErrors},null,2)+'\n');
    if(['browser-pending','browser-suite-timeout'].includes(probe)){
      owner.event('browser-pending',{pid,port:proxyPort,identity,pageOpen:!page.isClosed(),peer:'never-completes'});
      // owner independently settles this wait; the peer never releases it.
      await new Promise(()=>{});
    }
    if(probe==='assert-fail')assert.equal(cohort.json.data.n,6,'temporary wrong literal after real browser HTTP success');
    return cohort;
  }catch(error){owner.fail(error.message);throw error;}finally{
    const errors=[];try{await writeFile(`${owner.dir}/network.json`,JSON.stringify({allowed,blocked,pageErrors},null,2)+'\n');}catch(error){errors.push(error.message);}
    try{await page.close();}catch(error){errors.push(error.message);}
    if(errors.length){owner.report.cleanupErrors=(owner.report.cleanupErrors||[]).concat(errors);owner.report.exit=1;if(!owner.controller.signal.aborted)throw new Error(`browser-case-cleanup-failed:${errors[0]}`);}
  }
}
