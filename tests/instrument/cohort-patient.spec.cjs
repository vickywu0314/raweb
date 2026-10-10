const {test,expect}=require('@playwright/test');
const {writeFile}=require('node:fs/promises');
const {U,UNKNOWN_PATIENT}=require('../fixtures/cohort-p02.json');
const application=require('../fixtures/cohort-application.json');
const LONGS=['9007199254740992','9007199254740993','9223372036854775807'];
const patients=[...LONGS,'11','12','9223372036854775808'];
const dto=serial=>({...structuredClone(U),analysisId:`00000000-0000-0000-0000-${String(serial).padStart(12,'0')}`,patients:{total:6,returnedCount:6,hasMore:false,nextCursor:null,items:patients.map(patientId=>({...structuredClone(UNKNOWN_PATIENT),patientId,name:'合成名单姓名'}))}});
async function setup({page,context,browser},scenario){
 const origin=process.env.RA_STATIC_URL,requests=[],blocked=[],allowed=[],errors=[],downloads=[],observations=[];let serial=801,file=false;
 await context.addInitScript(()=>{sessionStorage.setItem('ra-auth',JSON.stringify({name:'合成页面用户',role:'研究者',expires:0}));window.__patientTransitions=[];window.addEventListener('pageshow',e=>window.__patientTransitions.push({type:'pageshow',persisted:e.persisted}));window.addEventListener('load',()=>window.addEventListener('pagehide',e=>sessionStorage.setItem('patient-test-exit',JSON.stringify({persisted:e.persisted,resultId:document.querySelector('#results')?.getAttribute('data-analysis-id')??null,receipt:document.querySelector('#application-receipt')?.textContent??null,replayHidden:document.querySelector('#application-replay')?.hidden??null}))));});
 page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d.suggestedFilename()));
 await context.route('**/*',async route=>{
  const r=route.request(),url=new URL(r.url());if(url.origin!==origin){blocked.push(r.url());return route.abort('blockedbyclient');}allowed.push(r.url());
  if(!url.pathname.startsWith('/api/'))return route.continue();
  const body=r.postDataJSON();requests.push({path:url.pathname,method:r.method(),headers:r.headers(),body});
  const json=(data,status=200,code='200')=>route.fulfill({status,contentType:'application/json',headers:{'X-Trace-Id':'trace-patient'},body:JSON.stringify({success:status===200,code,message:'合成边界响应',data})});
  if(url.pathname==='/api/ra/ai/cohort')return json(dto(serial++));
  if(url.pathname==='/api/ra/export/xlsx'){
   if(file)return route.fulfill({status:200,contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',headers:{'X-Trace-Id':'trace-file'},body:require('node:fs').readFileSync(require('node:path').resolve(__dirname,'../fixtures/cohort-export.xlsx'))});
   const requested=body.fields;return json({decision:'NEED_APPLY',source:'COHORT',referenceId:body.analysisId,selectionMode:'EXPLICIT',requested,eligible:[],blocked:requested.map(field=>({field,side:null,reason:'MISSING_SOURCE_DATE',affectedN:6})),freeStart:'2026-04-01',today:'2026-10-07',policyVersion:'dev-export-v01'},409,'NEED_APPLY');
  }
  if(url.pathname==='/api/ra/export/applyAnalysis')return json({applicationId:'7',status:'APPLICATION_RECORDED',notification:application.notifications.SENT});
  return json(null,503,'UNEXPECTED_PATIENT_REQUEST');
 });
 const save=async()=>{const o={scenario,version:browser.version(),url:page.url(),requests,allowed,blocked,errors,downloads,observations,dom:await page.locator('main').innerText().catch(()=>null)};for(const name of ['network.json','browser-observation.json'])await writeFile(`${process.env.RA_RUN_DIR}/${name}`,JSON.stringify(o,null,2)+'\n');};
 return {origin,requests,errors,downloads,observations,save,setFile:value=>file=value};
}
const patientRequests=o=>o.requests.filter(r=>!['/api/ra/ai/cohort','/api/ra/export/xlsx','/api/ra/export/applyAnalysis'].includes(r.path));
async function closed(page,id){
 await expect(page.locator('#patient-basic')).toContainText('患者档案暂未接入可信身份，当前未加载患者数据');
 if(id)await expect(page.locator('#patient-basic')).toContainText('患者 ID：'+id);else await expect(page.locator('#patient-basic')).toContainText('入口参数无效');
 await expect(page.locator('#audit')).toBeHidden();await expect(page.locator('.visits-section-head')).toBeHidden();await expect(page.locator('#visit-list .visit-row')).toHaveCount(0);
 await expect(page.locator('main a[href*="patient-edit"],main a[href*="visit-"],#ask-ai,#download-all,#paper-import,#withdraw-btn')).toHaveCount(0);
 await expect(page.locator('.app-footnote')).toContainText('未请求或加载患者数据');
 expect(await page.locator('main').innerText()).not.toMatch(/HTTP 401|HTTP 403|合成名单姓名|陈医生|基线访视|DAS28/);
 await page.evaluate(()=>{const a=document.querySelector('#audit');a.open=true;a.dispatchEvent(new Event('toggle'));});
}
test('cohort:patient-entry-closed',async({page,context,browser})=>{
 const o=await setup({page,context,browser},'cohort:patient-entry-closed');
 try{
  await page.goto(o.origin+'/ai-cohort.html');await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');
  expect(await page.locator('#patient-rows a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')))).toEqual(patients.slice(0,5).map(id=>'patient-visits.html?id='+id+'&from=ai-cohort'));
  for(const id of LONGS){await page.goto(o.origin+'/patient-visits.html?id='+id+'&from=ai-cohort');await closed(page,id);expect(patientRequests(o)).toEqual([]);await page.locator('#back-origin').click();await expect(page).toHaveURL(o.origin+'/ai-cohort.html');}
  for(const query of ['from=ai-cohort','id=&from=ai-cohort','id=01&from=ai-cohort','id=0&from=ai-cohort','id=-1&from=ai-cohort','id=%201&from=ai-cohort','id=1e3&from=ai-cohort','id=9223372036854775808&from=ai-cohort','id=1&id=2&from=ai-cohort','id=1&from=ai-cohort&from=patients','id=1&from=patients&from=ai-cohort','id=1&from=ai-cohort&from=ai-cohort','id=1&from=ai-cohort&return=https://unsafe.invalid','id=1&from=ai-cohort&doctorId=101']){await page.goto(o.origin+'/patient-visits.html?'+query);await closed(page);expect(patientRequests(o)).toEqual([]);}
  // 任意同源页也不是已核队列来源，固定回退不能误回未知页。
  await context.route(o.origin+'/unrelated.html',route=>route.fulfill({contentType:'text/html',body:'<a href="patient-visits.html?id=1&from=ai-cohort">进入</a>'}));await page.goto(o.origin+'/unrelated.html');await page.locator('a').click();await closed(page,'1');await page.locator('#crumb-origin').click();await expect(page).toHaveURL(o.origin+'/ai-cohort.html');
  const direct=await context.newPage();await direct.goto(o.origin+'/patient-visits.html?id=1&from=ai-cohort');await closed(direct,'1');await direct.locator('#back-origin').click();await expect(direct).toHaveURL(o.origin+'/ai-cohort.html');await direct.close();
  expect(patientRequests(o)).toEqual([]);expect(o.errors).toEqual([]);
 }finally{await o.save();}
});
test('cohort:patient-return',async({page,context,browser})=>{
 const o=await setup({page,context,browser},'cohort:patient-return');
 await context.addInitScript(()=>{window.__patientHold=new Set();window.__patientWait=[];window.__patientRelease={};window.__patientFiles={urls:0,clicks:0};const fetchOriginal=window.fetch,click=HTMLAnchorElement.prototype.click,create=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{window.__patientFiles.urls++;return create(b);};HTMLAnchorElement.prototype.click=function(){if(this.download)window.__patientFiles.clicks++;return click.call(this);};const Abort=window.AbortController;window.AbortController=class extends Abort{abort(){}};window.fetch=async(...args)=>{const response=await fetchOriginal(...args),path=new URL(String(args[0]),location.href).pathname,kind=path.endsWith('/xlsx')?'blob':'json',read=response[kind].bind(response);response[kind]=async()=>{const value=await read();if(window.__patientHold.has(path)){window.__patientWait.push(path);await new Promise(resolve=>window.__patientRelease[path]=resolve);}return value;};return response;};});
 const count=()=>o.requests.filter(r=>r.path==='/api/ra/ai/cohort').length;
 const query='?sex=F&ids='+LONGS[1],hold=path=>page.evaluate(p=>window.__patientHold.add(p),'/api/ra/'+path),wait=path=>page.waitForFunction(p=>window.__patientWait.includes(p),'/api/ra/'+path),release=path=>page.evaluate(async p=>{window.__patientHold.delete(p);window.__patientRelease[p]?.();for(let i=0;i<10;i++)await Promise.resolve();},'/api/ra/'+path);
 const exportFields=async fields=>{await page.locator('#export').click();for(const f of fields)await page.locator('#export-fields input[value="'+f+'"]').check();await page.locator('#export-confirm').click();};
 const prepareApplication=async()=>{o.setFile(false);await exportFields(['patientId','sex']);await expect(page.locator('#application-open')).toBeVisible();await page.locator('#application-open').click();await page.locator('#application-start').fill(application.startDate);await page.locator('#application-end').fill(application.endDate);await page.locator('#application-purpose').selectOption('RESEARCH');await page.locator('#application-reason').fill('ordinary-patient-return');};
 try{
  await page.goto(o.origin+'/ai-cohort.html'+query);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');
  await prepareApplication();await page.locator('#application-submit').click();await expect(page.locator('#application-receipt')).toBeVisible();const old=await page.locator('#results').getAttribute('data-analysis-id'),before=count(),commands=o.requests.filter(r=>r.path==='/api/ra/export/applyAnalysis').length;
  await page.locator('#patient-rows [data-patient-id="'+LONGS[1]+'"] a').click();await closed(page,LONGS[1]);expect(patientRequests(o)).toEqual([]);
  const exit=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('patient-test-exit')));expect(exit.resultId).toBe(null);expect(exit.receipt).toBe('');expect(exit.replayHidden).toBe(true);o.observations.push({stage:'real-history-pagehide',exit});
  await page.locator('#back-origin').click();await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');expect(count()).toBe(before+1);expect(await page.locator('#results').getAttribute('data-analysis-id')).not.toBe(old);expect(new URL(page.url()).searchParams.get('ids')).toBe(LONGS[1]);await expect(page.locator('#f-sex')).toHaveValue('F');expect(o.requests.filter(r=>r.path==='/api/ra/export/applyAnalysis')).toHaveLength(commands);await expect(page.locator('#application-replay')).toBeHidden();await expect(page.locator('#application-receipt')).toBeHidden();o.observations.push({stage:'real-history-return',transitions:await page.evaluate(()=>window.__patientTransitions),freshAnalysis:true});
  // 受控persisted返回与真实history记录分开；完整body已收而abort无效仍不得复活旧权。
  o.setFile(true);await hold('export/xlsx');await exportFields(['das28Current']);await wait('export/xlsx');let n=count();await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');expect(count()).toBe(n+1);await release('export/xlsx');expect(await page.evaluate(()=>window.__patientFiles)).toEqual({urls:0,clicks:0});expect(o.downloads).toEqual([]);
  await prepareApplication();await hold('export/applyAnalysis');await page.locator('#application-submit').click();await wait('export/applyAnalysis');n=count();const a=o.requests.filter(r=>r.path==='/api/ra/export/applyAnalysis').length;await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');expect(count()).toBe(n+1);await release('export/applyAnalysis');await expect(page.locator('#application-receipt')).toBeHidden();await expect(page.locator('#application-replay')).toBeHidden();await page.evaluate(()=>document.querySelector('#application-replay').click());expect(o.requests.filter(r=>r.path==='/api/ra/export/applyAnalysis')).toHaveLength(a);o.observations.push({stage:'controlled-persisted-return',fileRights:await page.evaluate(()=>window.__patientFiles),noApplicationReplay:true});
  for(const request of o.requests.filter(r=>r.path==='/api/ra/ai/cohort'))expect(request.body.filters).toEqual({studyCode:'RA',sex:'F',age:'',sero:'',tx:'',at:'now',act:'',cm:'',data:'',ids:[LONGS[1]]});expect(patientRequests(o)).toEqual([]);expect(o.errors).toEqual([]);
 }finally{await o.save();}
});
