const {test,expect}=require('@playwright/test');
const {writeFile}=require('node:fs/promises');
const {ID,VISIT,detail,visit,form}=require('../fixtures/issue1-patient-detail.cjs');
test('patient:legacy-detail-states',async({page,context,browser})=>{
 test.setTimeout(120000);
 const origin=process.env.RA_STATIC_URL,requests=[],errors=[],blocked=[],observations=[],held=[];let mode='success';
 await context.addInitScript(()=>sessionStorage.setItem('ra-auth',JSON.stringify({doctorId:'101',name:'Synthetic',role:'研究者'})));
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url());if(u.origin!==origin){blocked.push(u.origin);return route.abort('blockedbyclient');}
  if(!u.pathname.startsWith('/api/'))return route.continue();
  requests.push({path:u.pathname,method:r.method(),body:r.postData()});
  const json=(data,status=200,code='200')=>route.fulfill({status,contentType:'application/json',headers:{'X-Trace-Id':'synthetic-issue1'},body:JSON.stringify({success:status===200&&code==='200',code,message:'synthetic-response',data})});
  if(u.pathname==='/api/ra/auth/me'){if(mode==='me-pending'){held.push(route);return;}return json({doctorId:101,name:'Synthetic',role:'研究者'});}
  if(u.pathname==='/api/ra/auth/logout'){held.push(route);return;}
  if(u.pathname==='/api/ra/patient/patientsList')return json({items:[{...detail(),patientId:mode==='list-number'?9007199254740993:ID}],total:1,totalPatients:1,incompleteCount:0,page:1,size:20});
  if(u.pathname==='/api/ra/patient/patientDetail'){
   if(mode==='pending'){held.push(route);return;}
   if(mode==='network')return route.abort('failed');
   if(mode==='nonJSON')return route.fulfill({status:200,contentType:'text/html',body:'synthetic-not-json'});
   if(mode==='malformed')return route.fulfill({status:200,contentType:'application/json',body:'{'});
   if(mode==='http401')return route.fulfill({status:401,contentType:'text/plain',body:'synthetic-denied'});
   if(['FORBIDDEN','RESOURCE_NOT_FOUND','SERVICE_UNAVAILABLE','business'].includes(mode))return json(null,mode==='FORBIDDEN'?403:mode==='RESOURCE_NOT_FOUND'?404:mode==='business'?200:503,mode==='business'?'SERVICE_UNAVAILABLE':mode);
   const d=detail();if(mode==='number')d.patientId=9007199254740993;if(mode==='mismatch')d.patientId='9007199254740992';return json(d);
  }
  if(u.pathname==='/api/ra/patient/patientSensitive'){held.push(route);return;}
  if(u.pathname==='/api/ra/patient/auditLogs')return json([]);
  if(u.pathname==='/api/ra/visit/createVisit')return json({patientId:mode==='save-mismatch'?'9007199254740992':ID,visitId:mode==='save-number'?9007199254741003:VISIT,filledCount:6});
  if(u.pathname.startsWith('/api/ra/visit/')){
   const data=u.pathname.endsWith('/visitDetail')?visit():form(u.pathname.endsWith('/visitCreateForm'));
   if(mode==='adjacent-number')data.visitId=9007199254741003;if(mode==='adjacent-mismatch')data.patientId='9007199254740992';if(mode==='render-broken')data.modules=null;return json(data);
  }
  return json(null,503,'UNEXPECTED_REQUEST');
 });
 const url=p=>origin+'/'+p+'.html?id='+ID+(['visit-detail','visit-edit'].includes(p)?'&visit='+VISIT:'');
 const state=p=>page.locator(p==='patient-visits'?'#patient-basic':p==='visit-detail'?'#visit-hero':'#visit-title');
 const auditCleared=async p=>{if(p==='visit-detail'){await expect(page.locator('#audit .audit-list')).toBeEmpty();await expect(page.locator('#audit .audit-count')).toHaveText('');await expect(page.locator('#audit')).toHaveJSProperty('open',false);}};
 await page.clock.install();
 try{
  mode='list-number';await page.goto(origin+'/patients.html');await expect(page.locator('#patients')).toBeEmpty();await expect(page.locator('#empty')).toContainText('患者列表加载失败');
  mode='success';
  await page.goto(origin+'/patients.html');await expect(page.locator('#patients')).toContainText('SYNTHETIC-ODD');
  const link=page.locator(`#patients a[href*="patient-visits.html?id=${ID}"]`).first();await expect(link).toHaveAttribute('href',new RegExp(ID));await link.click();await expect(state('patient-visits')).toHaveAttribute('data-state','success');
  await expect(page).toHaveURL(origin+'/patient-visits.html?id='+ID);expect(new URLSearchParams(requests.filter(r=>r.path==='/api/ra/patient/patientDetail').at(-1).body).get('patientId')).toBe(ID);
  await expect(page.locator('#visit-list a').first()).toHaveAttribute('href',new RegExp(VISIT));
  for(const p of ['patient-visits','visit-detail','visit-create','visit-edit']){
   mode='success';const start=requests.length;await page.goto(url(p));await expect(state(p)).toHaveAttribute('data-state','success');
   const group=requests.slice(start).filter(r=>r.path==='/api/ra/patient/patientDetail'||r.path.startsWith('/api/ra/visit/'));
   expect(group[0].path).toBe('/api/ra/patient/patientDetail');expect(Object.fromEntries(new URLSearchParams(group[0].body))).toEqual({patientId:ID});
   await expect(page.locator('main')).toContainText('SYNTHETIC-ODD');
   if(p!=='patient-visits'){
    const box=page.locator(p==='visit-detail'?'#visit-sections':'#edit-sections');
    await expect(box.locator(p==='visit-detail'?'.detail-section':'.create-section')).toHaveCount(p==='visit-create'?6:7);
    await expect(box.locator('h2')).toHaveText(p==='visit-create'?['病史病情','辅助检查','病情评估','中医诊断','治疗方案','不良反应']:['病史病情','辅助检查','病情评估','中医诊断','治疗方案','不良反应','不良事件']);
    await expect(box.locator('img')).toHaveAttribute('src','img/record.svg');
    if(p==='visit-detail')for(const text of ['SYNTHETIC-HISTORY','记录日期：2026-10-01','12.50','mg/L','稍有困难','风寒湿痹证','SYNTHETIC-DRUG','5 mg','SYNTHETIC-ADVERSE-EVENT'])await expect(box).toContainText(text);
    else{
     // 展开后检查实际控件值，不能只凭七个标题推定正文未丢。
     await box.locator('details').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));
     await expect(box.locator('[data-col="bsbq"][data-key="followDate"] input')).toHaveValue('2026-10-01');
     await expect(box.locator('[data-col="fzjc"][data-key="cfydb"] .vf-input')).toHaveValue('12.50');
     await expect(box.locator('[data-col="bqpg"][data-key="q2"] select')).toHaveValue('稍有困难');
     await expect(box.locator('[data-col="zyzd"][data-key="zz"] input:checked')).toHaveValue('风寒湿痹证');
     await expect(box.locator('[data-col="blsj"][data-key="event"] input:checked')).toHaveValue('无');
     await expect(box.locator('[data-table="xyList"] [data-key="drugName"]')).toHaveValue('SYNTHETIC-DRUG');
     await expect(box.locator('[data-table="xyList"] [data-key="dosis"]')).toHaveValue('5 mg');
     await expect(box).toContainText('SYNTHETIC-PRESERVED');
     if(p==='visit-edit')await expect(box).toContainText('SYNTHETIC-ADVERSE-EVENT');
     else await expect(box).not.toContainText('不良事件');
    }
   }
   if(p.includes('create')||p.includes('edit')){
    const before=requests.length;await page.evaluate(()=>window.dispatchEvent(new Event('ra-auth-changed')));await expect(state(p)).toHaveAttribute('data-state','cancelled');
    await page.locator(p==='visit-create'?'#create-form':'#edit-form').evaluate(n=>n.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(requests.slice(before).filter(r=>/createVisit|updateVisit/.test(r.path))).toHaveLength(0);await expect(page.locator('#basic-readonly')).toBeEmpty();
   }
   if(p==='visit-detail'){await page.evaluate(()=>window.dispatchEvent(new Event('ra-auth-changed')));await expect(state(p)).toHaveAttribute('data-state','cancelled');await auditCleared(p);}
   for(const error of ['number','mismatch','FORBIDDEN','RESOURCE_NOT_FOUND','SERVICE_UNAVAILABLE','business','nonJSON','malformed','network','http401',...(p==='patient-visits'?[]:['adjacent-number','adjacent-mismatch','render-broken'])]){
    mode=error;await page.goto(url(p));await expect(state(p)).toHaveAttribute('data-state','error');await expect(page.locator('main')).not.toContainText('SYNTHETIC-ODD');await auditCleared(p);
    if(p.includes('create')||p.includes('edit'))await expect(page.locator(p==='visit-create'?'#save-create':'#save-edit')).toBeDisabled();
   }
   mode='success';await page.goto(url(p));await expect(state(p)).toHaveAttribute('data-state','success');mode='SERVICE_UNAVAILABLE';
   await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await expect(state(p)).toHaveAttribute('data-state','error');await expect(page.locator('main')).not.toContainText('SYNTHETIC-ODD');await auditCleared(p);
   mode='pending';const count=requests.length;await page.goto(url(p));await expect(state(p)).toHaveAttribute('data-state','loading');await expect.poll(()=>requests.slice(count).some(r=>r.path==='/api/ra/patient/patientDetail')).toBeTruthy();
   await page.clock.runFor(30000);await expect(state(p)).toHaveAttribute('data-state','timeout');await expect(page.locator('main')).not.toContainText('SYNTHETIC-ODD');await auditCleared(p);
   observations.push({page:p,groupValidated:true,normalModuleCount:p==='patient-visits'?null:p==='visit-create'?6:7,normalModuleContentChecked:p!=='patient-visits',errorTerminal:true,deadlineBeforeTeardown:true,refreshCleared:true});
  }
  for(const resultMode of ['save-number','save-mismatch','save-success']){
   mode=resultMode;await page.goto(url('visit-create'));await expect(state('visit-create')).toHaveAttribute('data-state','success');const before=requests.length;
   await page.locator('#save-create').click();await expect.poll(()=>requests.slice(before).filter(r=>r.path.endsWith('/createVisit')).length).toBe(1);
   if(resultMode==='save-success'){await expect(page).toHaveURL(url('visit-detail'));await expect(state('visit-detail')).toHaveAttribute('data-state','success');}
   else {await expect(page).toHaveURL(url('visit-create'));await expect(page.locator('#edit-error')).toContainText('保存响应');}
   observations.push({saveResult:resultMode,exactNavigationChecked:true});
  }
  mode='success';await page.goto(url('patient-visits'));await expect(state('patient-visits')).toHaveAttribute('data-state','success');await page.locator('.identity-toggle').click();await expect.poll(()=>held.some(r=>new URL(r.request().url()).pathname.endsWith('/patientSensitive'))).toBeTruthy();
  await page.evaluate(()=>window.dispatchEvent(new Event('ra-auth-changed')));await expect(state('patient-visits')).toHaveAttribute('data-state','cancelled');
  const sensitive=held.find(r=>new URL(r.request().url()).pathname.endsWith('/patientSensitive'));await sensitive.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,code:'200',data:'LATE-SYNTHETIC-CARD'})});await expect(page.locator('main')).not.toContainText('LATE-SYNTHETIC-CARD');
  mode='me-pending';await page.goto(url('patient-visits'));await expect(state('patient-visits')).toHaveAttribute('data-state','success');await page.evaluate(()=>signIn({doctorId:'202',name:'Next',role:'研究者'},false));
  await expect.poll(()=>held.some(r=>new URL(r.request().url()).pathname.endsWith('/auth/me'))).toBeTruthy();
  const me=held.filter(r=>new URL(r.request().url()).pathname.endsWith('/auth/me')).at(-1);await me.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,code:'200',data:{doctorId:101,name:'Old',role:'研究者'}})});expect(await page.evaluate(()=>String(currentUser().doctorId))).toBe('202');
  mode='success';await page.goto(url('patient-visits'));await expect(state('patient-visits')).toHaveAttribute('data-state','success');await page.evaluate(()=>signOut());await expect(state('patient-visits')).toHaveAttribute('data-state','cancelled');await expect(page.locator('main')).not.toContainText('SYNTHETIC-ODD');
  expect(blocked).toEqual([]);expect(errors).toEqual([]);expect(requests.filter(r=>/updateVisit|\/ocr\//.test(r.path))).toEqual([]);
  const writes=requests.filter(r=>r.path.endsWith('/createVisit'));expect(writes).toHaveLength(3);for(const write of writes)expect(JSON.parse(write.body).patientId).toBe(ID);
 }finally{
  for(const route of held)await route.abort().catch(()=>{});
  const evidence={scenario:'patient:legacy-detail-states',version:browser.version(),requests,blocked,errors,observations,dom:await page.locator('main').innerText().catch(()=>null)};
  for(const name of ['network.json','browser-observation.json'])await writeFile(`${process.env.RA_RUN_DIR}/${name}`,JSON.stringify(evidence,null,2)+'\n');
 }
});
