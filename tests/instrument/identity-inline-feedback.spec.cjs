const {test,expect}=require('@playwright/test');
const {writeFile}=require('node:fs/promises');
const {ID,VISIT,detail,visit}=require('../fixtures/issue1-patient-detail.cjs');
test('patient:identity-inline-feedback-states',async({page,context,browser})=>{
 test.setTimeout(120000);
 const origin=process.env.RA_STATIC_URL,requests=[],errors=[],blocked=[],dialogs=[],observations=[],held=[];let mode='error';
 await context.addInitScript(()=>sessionStorage.setItem('ra-auth',JSON.stringify({doctorId:'101',name:'Synthetic',role:'研究者'})));
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss();});
 await context.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url());if(u.origin!==origin){blocked.push(u.origin);return route.abort('blockedbyclient');}
  if(!u.pathname.startsWith('/api/'))return route.continue();
  requests.push({path:u.pathname,body:r.postData(),method:r.method()});
  const json=(data,status=200,code='200')=>route.fulfill({status,contentType:'application/json',headers:{'X-Trace-Id':'synthetic-inline-feedback'},body:JSON.stringify({success:status===200,code,message:'RAW-SQL-CARD-ERROR',data})});
  if(u.pathname==='/api/ra/auth/me')return json({doctorId:101,name:'Synthetic',role:'研究者'});
  const trusted=u.pathname.startsWith('/api/ra/ai/');
  if(u.pathname.endsWith('/patientDetail'))return json(detail());
  if(u.pathname.endsWith('/visitDetail'))return json(visit());
  if(u.pathname.endsWith('/patientSensitive')){
   if(mode==='pending'){held.push({route,trusted});return;}
   if(mode==='error')return json(null,503,'SERVICE_UNAVAILABLE');
   return json(trusted?{patientId:ID,cardNo:'SYNTHETIC-CARD'}:'SYNTHETIC-CARD');
  }
  if(u.pathname.endsWith('/patientAuditLogs'))return json({patientId:ID,logs:[{id:'9007199254741103',detail:'SYNTHETIC-AUDIT'}]});
  if(u.pathname.endsWith('/auditLogs'))return json([{time:'2026-10-01',action:'编辑随访',detail:'SYNTHETIC-AUDIT',operator:'Synthetic'}]);
  return json(null,503,'UNEXPECTED_REQUEST');
 });
 await page.clock.install();
 const sensitiveCount=()=>requests.filter(r=>r.path.endsWith('/patientSensitive')).length;
 const stale=async entry=>{await entry.route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,code:'200',data:entry.trusted?{patientId:ID,cardNo:'LATE-OLD-CARD'}:'LATE-OLD-CARD'})}).catch(()=>{});};
 try{
  for(const trusted of [true,false])for(const p of ['patient-visits','visit-detail']){
   mode='error';const url=origin+'/'+p+'.html?id='+ID+(p==='visit-detail'?'&visit='+VISIT:'')+(trusted?'&from=ai-cohort':'');
   const state=page.locator(p==='patient-visits'?'#patient-basic':'#visit-hero');await page.goto(url);await expect(state).toHaveAttribute('data-state','success');
   if(p==='visit-detail')await page.locator('#basic-collapse summary').click();
   const row=page.locator('.identity-value'),number=row.locator('.identity-number'),toggle=row.locator('.identity-toggle'),feedback=row.locator('.identity-feedback'),retry=row.locator('.identity-retry');
   await expect(feedback).toBeHidden();await expect(retry).toBeHidden();await expect(toggle).toHaveAttribute('aria-describedby','patient-identity-feedback');
   await expect(feedback).toHaveAttribute('role','status');await expect(feedback).toHaveAttribute('aria-live','polite');await expect(feedback).toHaveAttribute('aria-atomic','true');
   await toggle.click();await expect(feedback).toHaveText('身份证号暂不可用，请重试。');await expect(feedback).toBeVisible();await expect(retry).toBeVisible();await expect(number).toHaveText('SYNTHETIC-MASKED');expect(dialogs).toEqual([]);await expect(row).not.toContainText('RAW-SQL');
   if(process.env.RA_RUN_DIR)await page.screenshot({path:process.env.RA_RUN_DIR+`/identity-feedback-${p}-${trusted?'trusted':'ordinary'}.png`,fullPage:false});
   mode='success';const before=sensitiveCount();await retry.focus();await retry.press('Enter');await expect(number).toHaveText('SYNTHETIC-CARD');expect(sensitiveCount()).toBe(before+1);await expect(feedback).toBeHidden();await expect(feedback).toHaveText('');await expect(retry).toBeHidden();
   await toggle.click();await expect(number).toHaveText('SYNTHETIC-MASKED');
   mode='pending';expect(held).toHaveLength(0);await expect(toggle).toHaveAttribute('aria-pressed','false');await expect(toggle).toBeVisible();await expect(toggle).toBeEnabled();await toggle.click({trial:true});
   // install 后时间仍自然前进。只冻结精确 deadline 段；先完成真实可操作性检查，避免冻结 RAF 后 click 等待稳定性。
   // 当前没有敏感请求；未来锚点只用于安全暂停，不改变请求的 30000ms timeout。
   await page.clock.pauseAt(await page.evaluate(()=>Date.now()+60000));const pausedAt=await page.evaluate(()=>Date.now());
   await toggle.evaluate(button=>button.click());await expect.poll(()=>held.length).toBeGreaterThan(0);const timed=held.pop();expect(await page.evaluate(()=>Date.now())).toBe(pausedAt);
   await page.clock.runFor(29999);expect(await page.evaluate(()=>Date.now())).toBe(pausedAt+29999);await expect(feedback).toBeHidden();
   await page.clock.runFor(1);expect(await page.evaluate(()=>Date.now())).toBe(pausedAt+30000);await expect(feedback).toHaveText('身份证号查询超时，请重试。');await expect(number).toHaveText('SYNTHETIC-MASKED');await page.clock.resume();
   mode='pending';const restart=sensitiveCount();await retry.click();await expect.poll(sensitiveCount).toBe(restart+1);const newer=held.pop();await stale(timed);await expect(number).toHaveText('SYNTHETIC-MASKED');await expect(feedback).toBeHidden();
   await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));await expect(state).toHaveAttribute('data-state','cancelled');await stale(newer);
   mode='success';await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await expect(state).toHaveAttribute('data-state','success');if(p==='visit-detail')await page.locator('#basic-collapse').evaluate(n=>n.open=true);await expect(number).toHaveText('SYNTHETIC-MASKED');await expect(feedback).toBeHidden();await expect(retry).toBeHidden();
   mode='error';await toggle.click();await expect(feedback).toContainText('暂不可用');
   if(p==='visit-detail'){await page.locator('#basic-collapse summary').click();await expect(feedback).toHaveText('');await expect(retry).toBeHidden();await page.locator('#basic-collapse summary').click();await expect(feedback).toBeHidden();}
   mode='success';if(p==='patient-visits')await retry.click();else await toggle.click();await expect(number).toHaveText('SYNTHETIC-CARD');
   // 原成功与审计功能继续真实点击，不将行内修复替代原功能验收。
   if(p==='patient-visits'){await page.locator('#audit summary').click();await expect(page.locator('#audit-list')).toContainText('SYNTHETIC-AUDIT');await page.locator('#audit summary').click();await expect(page.locator('#audit-list')).toBeEmpty();}
   await toggle.click();mode='pending';await toggle.click();await expect.poll(()=>held.length).toBeGreaterThan(0);const identityOld=held.pop();await page.evaluate(()=>window.dispatchEvent(new Event('ra-auth-changed')));await expect(state).toHaveAttribute('data-state','cancelled');await stale(identityOld);await expect(page.locator('main')).not.toContainText('LATE-OLD-CARD');await expect(page.locator('main')).not.toContainText('SYNTHETIC-CARD');
   // 同页新 generation 仍可成功；旧 owner 已失去发布权。
   mode='success';await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await expect(state).toHaveAttribute('data-state','success');if(p==='visit-detail')await page.locator('#basic-collapse').evaluate(n=>n.open=true);await toggle.click();await expect(number).toHaveText('SYNTHETIC-CARD');
   mode='pending';await toggle.click();await toggle.click();const left=sensitiveCount();await expect.poll(()=>held.length).toBeGreaterThan(0);const hiddenOld=held.pop();await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));await expect(state).toHaveAttribute('data-state','cancelled');await stale(hiddenOld);expect(sensitiveCount()).toBe(left);await expect(page.locator('main')).not.toContainText('LATE-OLD-CARD');
   observations.push({page:p,trusted,errorInline:true,deadline30000:true,deadlineClockPaused:true,deadlineDOMClickAfterTrial:true,keyboardRetry:true,successReset:true,collapseReset:true,lateResponseFenced:true,identityAndPagehideClear:true});
  }
  expect(errors).toEqual([]);expect(blocked).toEqual([]);expect(dialogs).toEqual([]);expect(observations).toHaveLength(4);
 }finally{
  for(const entry of held)await entry.route.abort().catch(()=>{});
  if(process.env.RA_RUN_DIR)await writeFile(process.env.RA_RUN_DIR+'/identity-feedback-observation.json',JSON.stringify({scenario:'patient:identity-inline-feedback-states',browser:browser.version(),requests,errors,blocked,dialogs,observations},null,2)+'\n');
 }
});
