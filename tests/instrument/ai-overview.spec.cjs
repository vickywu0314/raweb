const {test,expect}=require('@playwright/test');
const {writeFile}=require('node:fs/promises');
const {installAuthBootstrap}=require('../fixtures/auth-bootstrap.cjs');
const truth=(n=6,status='OK')=>({studyTotal:n,targetRate:{value:status==='NO_DATA'?0:.4,meta:{numerator:status==='NO_DATA'?0:2,denominator:status==='NO_DATA'?0:5,unknownN:status==='NO_DATA'?n:n-5,status,displayText:status==='NO_DATA'?'0%':'40%'}},modHighN:status==='NO_DATA'?0:3,fmN:n?3:0,missingN:n?2:0,meta:{studyCode:'RA',at:'now',asOfDate:'2026-10-07',readStartedAt:'2026-10-07T02:00:00Z',readCompletedAt:'2026-10-07T02:00:00Z',traceId:'overview-browser',policyVersions:{drugDictionary:'dev-drug-v04'}}});
test('analysis:overview-states',async({page,context,browser})=>{
 const origin=process.env.RA_STATIC_URL,requests=[],errors=[],blocked=[],observations=[];let reply=truth(),status=200,code='200';
 const auth=await installAuthBootstrap(context,{origin});
 await context.addInitScript(()=>{

  const fetchOriginal=window.fetch,timeout=window.setTimeout,clear=window.clearTimeout;window.__overviewPending=[];window.__overviewHold=false;window.__overviewTimers=new Map();let seq=-1;
  window.setTimeout=(fn,ms,...args)=>{if(ms!==30000)return timeout(fn,ms,...args);const id=seq--;window.__overviewTimers.set(id,()=>fn(...args));return id;};
  window.clearTimeout=id=>{window.__overviewTimers.delete(id);return clear(id);};
  window.fetch=async(...args)=>{const response=await fetchOriginal(...args);if(new URL(String(args[0]),location.href).pathname==='/api/ra/ai/overview'){
   const json=response.json.bind(response);response.json=async()=>{const value=await json();if(window.__overviewHold){const item={signal:args[1].signal,release:null};window.__overviewPending.push(item);await new Promise(resolve=>item.release=resolve);}return value;};}return response;};
 });
 page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());if(url.origin!==origin){blocked.push(request.url());return route.abort('blockedbyclient');}
  if(await auth.handle(route))return;
  if(!url.pathname.startsWith('/api/'))return route.continue();requests.push({path:url.pathname,body:request.postDataJSON()});
  if(url.pathname!=='/api/ra/ai/overview')return route.abort('blockedbyclient');
  return route.fulfill({status,contentType:'application/json',headers:{'X-Trace-Id':'overview-browser'},body:JSON.stringify({success:status===200,code,message:'合成安全错误',data:status===200?reply:null})});
 });
 const state=async s=>{await expect(page.locator('#overview-state')).toHaveAttribute('data-state',s);await auth.verify(page,{expected:1})},load=()=>page.locator('#overview-retry').click();
 try{
  await page.goto(origin+'/ai-analysis.html');await state('success');await expect(page.locator('#overview .stat-tile')).toHaveCount(5);await expect(page.locator('#overview')).toContainText('40%');
  expect(await page.locator('#overview a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')))).toEqual(['ai-cohort.html','ai-cohort.html?act=target','ai-cohort.html?act=mod-high','ai-cohort.html?cm=FM','ai-cohort.html?data=missing']);
  await expect(page.locator('.study-meta')).not.toContainText('异常检验');await expect(page.locator('#picker')).toBeEnabled();await expect(page.locator('#patient-search-form')).toBeVisible();await expect(page.locator('#patient-search-state')).toHaveAttribute('data-state','idle');
  reply=truth(6,'NO_DATA');await load();await state('success');await expect(page.locator('#overview')).toContainText('暂无可评估患者');await expect(page.locator('#overview')).toContainText('未知 6 人');
  reply={...truth(),targetRate:{value:0,meta:{numerator:0,denominator:5,unknownN:1,status:'OK',displayText:'0%'}},modHighN:5};await load();await state('success');await expect(page.locator('#overview')).toContainText('0%');await expect(page.locator('#overview')).not.toContainText('暂无可评估患者');
  reply=truth(0,'NO_DATA');await load();await state('success');await expect(page.locator('#overview')).toContainText('当前研究库为空');
  for(const failure of [[401,'UNAUTHENTICATED'],[503,'SERVICE_UNAVAILABLE'],[400,'INVALID_REQUEST']]){[status,code]=failure;await load();await state('error');await expect(page.locator('#overview')).toBeEmpty();await expect(page.locator('#overview-state')).toContainText(({UNAUTHENTICATED:'登录已失效，请重新登录',SERVICE_UNAVAILABLE:'服务暂不可用，请稍后重试',INVALID_REQUEST:'输入内容不符合要求，请检查后重试',NOT_FOUND:'所需记录不存在或当前账号无法访问'})[code]);await expect(page.locator('#overview-state')).not.toContainText('overview-browser');}
  status=200;code='200';reply={...truth(),fmN:'invalid'};await load();await state('error');await expect(page.locator('#overview-state')).toContainText('返回的数据不完整或无法识别，请重新读取');
  reply=truth();await page.evaluate(()=>window.__overviewHold=true);await load();await page.waitForFunction(()=>window.__overviewPending.length===1);
  await page.evaluate(()=>window.__overviewHold=false);reply=truth(9);await load();await state('success');await expect(page.locator('#overview a').first()).toContainText('9');await page.evaluate(()=>window.__overviewPending[0].release());await expect(page.locator('#overview a').first()).toContainText('9');
  await page.evaluate(()=>window.__overviewHold=true);reply=truth();await load();await page.waitForFunction(()=>window.__overviewPending.length===2);
  await page.evaluate(()=>{const callback=[...window.__overviewTimers.values()][0];callback();});await state('error');expect(await page.evaluate(()=>window.__overviewPending[1].signal.aborted)).toBe(true);await expect(page.locator('#overview-state')).toContainText('超时');await page.evaluate(()=>window.__overviewPending[1].release());await expect(page.locator('#overview')).toBeEmpty();
  for(const event of ['ra-auth-changed','storage','pagehide']){
   await page.evaluate(()=>window.__overviewHold=false);await load();await state('success');await page.evaluate(event=>window.dispatchEvent(event==='storage'?new StorageEvent('storage',{key:'ra-auth'}):new Event(event)),event);await state('cancelled');await expect(page.locator('#overview')).toBeEmpty();
   if(event==='pagehide'){await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await state('success');}
  }
  expect(requests.every(r=>r.path==='/api/ra/ai/overview'&&JSON.stringify(r.body)==='{}')).toBe(true);expect(errors).toEqual([]);expect(blocked).toEqual([]);observations.push({cards:5,noDataDistinct:true,zeroDistinct:true,startedOldResponseFenced:true,pendingTimeoutAborted:true,identityCleared:true});
 }finally{const evidence={scenario:'analysis:overview-states',version:browser.version(),authRequests:auth.requests,requests,errors,blocked,observations,dom:await page.locator('main').innerText().catch(()=>null)};for(const name of ['network.json','browser-observation.json'])await writeFile(`${process.env.RA_RUN_DIR}/${name}`,JSON.stringify(evidence,null,2)+'\n');}
});
