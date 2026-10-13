const {test,expect}=require('@playwright/test');
const {installAuthBootstrap}=require('../fixtures/auth-bootstrap.cjs');
const {writeFile}=require('node:fs/promises');
const {CLINICAL}=require('../fixtures/cohort-p02.json');
async function setup({page,context,browser},scenario,reply){
  const auth=await installAuthBootstrap(context);
const origin=process.env.RA_STATIC_URL,requests=[],allowed=[],blocked=[],pageErrors=[];
 page.on('pageerror',e=>pageErrors.push(e.message));
 await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==origin){blocked.push(request.url());return route.abort('blockedbyclient');}allowed.push(request.url());if(await auth.handle(route))return;if(url.pathname.startsWith('/api/')){const r={url:request.url(),body:request.postDataJSON()};requests.push(r);return reply(route,r);}await route.continue();});
 return {origin,auth,requests,pageErrors,save:async()=>{await writeFile(`${process.env.RA_RUN_DIR}/browser-observation.json`,JSON.stringify({scenario,version:browser.version(),requests,authRequests:auth.requests,allowed,blocked,pageErrors,dom:await page.locator('main').innerText()},null,2)+'\n');await writeFile(`${process.env.RA_RUN_DIR}/network.json`,JSON.stringify({requests,authRequests:auth.requests,allowed,blocked,pageErrors},null,2)+'\n');}};
}
const fulfill=(route,data,status=200,code='200')=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({success:status===200,code,message:'合成响应',data})});
test('cohort:clinical-projection',async({page,context,browser})=>{
 let data=structuredClone(CLINICAL);const o=await setup({page,context,browser},'cohort:clinical-projection',route=>fulfill(route,data));
 try{
  await page.goto(o.origin+'/ai-cohort.html');await o.auth.verify(page);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');
  const known=page.locator('[data-patient-id="9223372036854775807"]');
  await expect(known).toContainText('年龄 40');await expect(known.locator('.patient-clinical')).toContainText('女');await expect(known.locator('.patient-treatment')).toContainText('正在治疗');await expect(known.locator('.patient-treatment')).toContainText('传统合成抗风湿药（csDMARD）');await expect(known.locator('.patient-treatment')).toContainText('线数 1');
  await expect(known.locator('.patient-duration')).toContainText('方案月数 6');await expect(known.locator('.patient-das28')).toHaveText('DAS28-CRP 基线 4.5 → 评估 2；当前 3；差值 2.5');await expect(known.locator('.patient-crp')).toContainText('评估 CRP 6 mg/L');await expect(known.locator('.patient-crp')).toContainText('当前 CRP 12 mg/L');await expect(known.locator('.patient-comorbidity')).toHaveText('FM 是 · AS 未知');
  await expect(page.locator('[data-patient-id="2"] .patient-das28')).toHaveText('DAS28-CRP 基线 0 → 评估 0；当前 0；差值 0');await expect(page.locator('[data-patient-id="2"] .patient-comorbidity')).toHaveText('FM 否 · AS 是');
  for(const [id,state] of [['2','NONE'],['3','UNKNOWN'],['4','CONFLICT']])await expect(page.locator(`[data-patient-id="${id}"] .patient-treatment`)).toContainText({NONE:'当前无治疗',UNKNOWN:'未知',CONFLICT:'记录存在冲突'}[state]);
  await expect(page.locator('[data-patient-id="4"] .patient-das28')).toContainText('评估 2.71');await expect(page.locator('[data-patient-id="4"] .patient-activity')).toHaveText('DAS28-CRP 活动 中');await expect(page.locator('[data-patient-id="3"] .patient-clinical')).toContainText('年龄 未记录');
  await expect(known).toContainText('合成<临床>');expect(await known.locator('临床').count()).toBe(0);  // 同一renderer的来源/质量与6m归属，独立字面值不调用生产医学算法。
  const six=structuredClone(CLINICAL);six.n=1;six.meta.at='6m';six.patients={total:1,returnedCount:1,hasMore:false,nextCursor:null,items:[structuredClone(CLINICAL.patients.items[0])]};
  const p=six.patients.items[0];p.selection={at:'6m',episodeKey:'episode-1',baselineVisitId:'110',baselineDate:'2026-04-05',evalVisitId:'120',evalDate:'2026-10-06',nowVisitId:'130',nowDate:'2026-10-07',target6mDate:'2026-10-06',eligible6m:true,quality:[],missingReason:null,deltaMissingReason:null};
  const fields={tjc:['bqpg.result.ytgjs',2,'count'],sjc:['bqpg.result.zzgjs',1,'count'],gh:['bqpg.ztScoreByPatient',0,'0-100'],haq:['bqpg.hqaScore',1.2,'0-3'],crp:['fzjc.cfydb',6,'mg/L'],pain:['bqpg.tjScore',null,null]};
  for(const [key,[sourceField,value,unit]] of Object.entries(fields))p.evaluation[key]={value,unit,sourceVisitId:'120',sourceField,observedAt:'2026-10-06',quality:key==='pain'?['LEGACY_UNVERIFIED','SCALE_UNVERIFIED']:['LEGACY_UNVERIFIED'],missingReason:key==='pain'?'UNVERIFIED_SCALE':null,raw:'RAW_FORBIDDEN_SENTINEL'};
  p.baselineProvenance={source:'LEGACY_STORED',sourceVisitId:'110',sourceField:'bqpg.result.crpScore',observedAt:'2026-04-05',quality:['LEGACY_UNVERIFIED'],missingReason:null,raw:'RAW_FORBIDDEN_SENTINEL'};
  p.scoreProvenance={...p.baselineProvenance,sourceVisitId:'120',observedAt:'2026-10-06',raw:'RAW_FORBIDDEN_SENTINEL'};
  const sourceFields={sex:'patient_basic_info.gender',age:'patient_basic_info.card_no',diseaseDurationYears:'COALESCE(patient_basic_info.confirm_date,patient_basic_info.confirmDate)',sero:'fzjc.lfsyz/fzjc.kccpkt',fm:'patient_comorbidity.disease_code/since_year',as:'patient_comorbidity.disease_code/since_year'};
  for(const [key,sourceField] of Object.entries(sourceFields))p.clinicalProvenance[key]={source:'LEGACY_RECORDED',sourceField,quality:['LEGACY_UNVERIFIED'],missingReason:key==='as'?'NO_POSITIVE_ASSOCIATION':null,...(['sero','fm','as'].includes(key)?{observations:[]}:{}),raw:'RAW_FORBIDDEN_SENTINEL',birthday:'RAW_FORBIDDEN_SENTINEL',card_no:'RAW_FORBIDDEN_SENTINEL'};
  p.clinicalProvenance.sero.observations=[{sourceVisitId:'120',sourceField:'fzjc.lfsyz <来源>',observedAt:'2026-10-06',status:'low_positive',raw:'RAW_FORBIDDEN_SENTINEL'}];p.clinicalProvenance.fm.observations=[{sourceRowId:'71',sinceYear:2020,raw:'RAW_FORBIDDEN_SENTINEL'}];
  p.treatment.provenance={visitId:'130',field:'zlfa.xyList',observedAt:'2026-10-07',quality:['LEGACY_UNVERIFIED'],missingReason:null,dictionaryVersion:'dev-drug-v04',drugFacts:[{genericDrugId:'dev:甲氨蝶呤',startTime:'2026-04-06',endTime:null,visitId:'120',field:'zlfa.xyList[0]',observedAt:'2026-10-06',raw:'RAW_FORBIDDEN_SENTINEL'}],raw:'RAW_FORBIDDEN_SENTINEL'};
  p.qc={status:'MISSING',missingCodes:['M_JWS'],ruleVersion:'dev-missing-v04'};p.raw={card_no:'RAW_FORBIDDEN_SENTINEL',phone:'RAW_FORBIDDEN_SENTINEL'};
  data=six;await page.locator('#f-at').selectOption('6m');await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');
  await expect(known.locator('details summary')).toHaveText('临床来源与质量');await known.locator('details summary').click();await expect(known.locator('.patient-sources')).toBeVisible();
  for(const [key,[sourceField,value,unit]] of Object.entries(fields)){
   const measure=known.locator(`[data-evaluation="${key}"]`);await expect(measure).toContainText(`记录值：${value===null?'未提供':value}`);await expect(measure).toContainText(`单位：${unit==='count'?'个':unit??'未提供'}`);await expect(measure).toContainText(`来源项目：${{tjc:'压痛关节数',sjc:'肿胀关节数',gh:'患者总体评价',haq:'HAQ 评分',crp:'CRP 化验',pain:'疼痛评分'}[key]}`);await expect(measure).toContainText('来源访视：120');await expect(measure).toContainText('记录日期：2026-10-06');await expect(measure).toContainText('历史记录尚未核实');
  }
  await expect(known.locator('[data-evaluation="pain"]')).toContainText('量表尚未核实');await expect(known.locator('[data-evaluation="pain"]')).toContainText('量表未核实，无法计算');
  for(const text of ['评估时点：治疗后六个月','治疗方案编号：episode-1','基线访视：110','基线日期：2026-04-05','评估访视：120','评估日期：2026-10-06','当前访视：130','当前日期：2026-10-07','六个月评估日期：2026-10-06','符合六个月评估条件：是','资料质量：无','缺失原因：未提供','变化值缺失原因：未提供'])await expect(known.locator('.patient-selection')).toContainText(text);
  await expect(known.locator('.patient-baseline-source')).toContainText('来源访视：110');await expect(known.locator('.patient-score-source')).toContainText('来源访视：120');
  for(const [key,field] of Object.entries(sourceFields))await expect(known.locator(`[data-clinical-source="${key}"]`)).toContainText(`来源项目：${{sex:'基本资料中的性别',age:'基本资料中的出生日期依据',diseaseDurationYears:'基本资料中的确诊日期',sero:'类风湿因子与抗 CCP 化验',fm:'合并疾病及起病年份',as:'合并疾病及起病年份'}[key]}`);
  await expect(known.locator('[data-clinical-source="sero"]')).toContainText('来源项目：其他资料');await expect(known.locator('[data-clinical-source="sero"]')).toContainText('来源访视：120');await expect(known.locator('[data-clinical-source="sero"]')).toContainText('记录日期：2026-10-06');await expect(known.locator('[data-clinical-source="sero"]')).toContainText('资料状态：低水平阳性');await expect(known.locator('[data-clinical-source="sero"]')).not.toContainText('fzjc.lfsyz <来源>');expect(await known.locator('来源').count()).toBe(0);await expect(known.locator('[data-clinical-source="fm"]')).toContainText('来源记录：71');
  await expect(known.locator('.patient-treatment-source')).not.toContainText('dictionaryVersion：dev-drug-v04');await expect(known.locator('.patient-treatment-source')).toContainText('开始日期：2026-04-06');await expect(known.locator('.patient-qc')).toContainText('资料状态：资料待补全');await expect(known.locator('.patient-qc')).toContainText('缺失项目：既往史缺失');await expect(known.locator('.patient-qc')).not.toContainText('dev-missing-v04');
  expect(await page.locator('main').evaluate(n=>n.outerHTML)).not.toContain('RAW_FORBIDDEN_SENTINEL');expect(page.url()).not.toContain('RAW_FORBIDDEN_SENTINEL');await expect(known.locator('.patient-sources')).not.toContainText(/sourceVisitId|sourceField|observedAt|LEGACY_UNVERIFIED|SCALE_UNVERIFIED|M_JWS|dev-drug-v04|dev-missing-v04/);
  await expect(page.locator('#numeric-computed-at')).toHaveText('数值计算时间：2026-10-07T02:00:00Z');await expect(page.locator('#display-read-at')).toHaveText('名单显示字段读取时间：2026-10-07T02:00:00Z');
  const refresh=async next=>{data=next;await page.locator('#reanalyze').click();};
  const configured=structuredClone(six);configured.meta.policyVersions.fmSource='synthetic-fm-v1';configured.patients.items[0].clinical.fm='FALSE';configured.patients.items[0].clinicalProvenance.fm={source:'CONFIGURED_FM_EVIDENCE',sourceField:'ra.ai.fm-evidence.json',quality:['SOURCE_UNVERIFIED'],missingReason:null,observations:[{evidenceId:'synthetic:fm1',observedAt:'2026-10-06',fmState:'FALSE',raw:'RAW_FORBIDDEN_SENTINEL'}]};
  await refresh(configured);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');await known.locator('details summary').click();
  const configuredFm=known.locator('[data-clinical-source="fm"]');await expect(configuredFm).toContainText('资料来源：已核定的纤维肌痛依据');await expect(configuredFm).toContainText('资料质量：来源尚未核实');await expect(configuredFm).toContainText('来源依据：已记录，可按记录日期核对');await expect(configuredFm).not.toContainText('synthetic:fm1');await expect(configuredFm).toContainText('记录日期：2026-10-06');await expect(configuredFm).toContainText('纤维肌痛状态：否');await expect(known.locator('.patient-fm-version')).toHaveText('纤维肌痛：使用已核定的来源依据');await expect(configuredFm).toContainText('来源记录');await expect(configuredFm).not.toContainText('来源记录：');expect(await page.locator('main').evaluate(n=>n.outerHTML)).not.toContain('RAW_FORBIDDEN_SENTINEL');
  // CRP的评价访视与当前化验独立解释，不能借evaluation.crp填充当前原因。
  const missingCrp=structuredClone(CLINICAL),missingPatient=missingCrp.patients.items[0];
  missingPatient.crpAt={value:null,unit:null,sourceVisitId:null,sourceField:null,observedAt:null,missingReason:'NO_EVALUATION',quality:['AT_MISSING']};
  missingPatient.crpCurrent={value:null,unit:null,sourceVisitId:null,sourceField:null,observedAt:null,missingReason:'NO_VALID_CRP_LAB',quality:['CURRENT_MISSING <质量>']};
  missingPatient.evaluation.crp.missingReason='EVALUATION_ONLY_SENTINEL';
  await refresh(missingCrp);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');
  await expect(known.locator('.patient-crp')).toHaveText('评估 CRP 未记录 未记录 · 访视 未记录 · 其他资料 · 未记录 · 缺失原因：没有可用评估记录 · 资料质量：评估记录缺失；当前 CRP 未记录 未记录 · 访视 未记录 · 其他资料 · 未记录 · 缺失原因：没有有效 CRP 化验 · 资料质量：其他资料限制');
  expect(await known.locator('.patient-crp').locator('质量').count()).toBe(0);await expect(known.locator('.patient-crp')).not.toContainText('EVALUATION_ONLY_SENTINEL');
  const zeroCrp=structuredClone(CLINICAL);zeroCrp.patients.items[0].crpAt.value=0;zeroCrp.patients.items[0].crpCurrent.value=0;
  await refresh(zeroCrp);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');
  await expect(known.locator('.patient-crp')).toContainText('评估 CRP 0 mg/L · 访视 120 · CRP 化验 · 2026-10-06 · 缺失原因：无 · 资料质量：历史记录尚未核实');
  await expect(known.locator('.patient-crp')).toContainText('当前 CRP 0 mg/L · 访视 131 · CRP 化验 · 2026-10-07 · 缺失原因：无 · 资料质量：历史记录尚未核实');
  const {NO_VALID,EMPTY}=require('../fixtures/cohort-p02.json');await refresh(NO_VALID);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');await expect(page.locator('#patient-rows .ai-row')).toHaveCount(6);await expect(page.locator('.patient-comorbidity').first()).toContainText('未知');
  const noTimes=structuredClone(CLINICAL);delete noTimes.meta.computedAt;delete noTimes.meta.readCompletedAt;await refresh(noTimes);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');await expect(page.locator('#numeric-computed-at')).toHaveText('数值计算时间：未提供');await expect(page.locator('#display-read-at')).toHaveText('名单显示字段读取时间：未提供');
  const malformed=[structuredClone(CLINICAL),structuredClone(CLINICAL),structuredClone(CLINICAL),structuredClone(CLINICAL),structuredClone(CLINICAL),structuredClone(CLINICAL)];
  delete malformed[0].patients.items[1].clinical;malformed[1].patients.items[1].evaluation='wrong-type';malformed[2].patients.items[1].evaluation.pain=null;malformed[3].patients.items[1].treatment.genericDrugIds={};malformed[4].patients.items[1].clinicalProvenance.sero.observations='wrong-type';malformed[5].patients.items[1].qc.missingCodes=null;
  for(const bad of malformed){await refresh(bad);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','error');await expect(page.locator('#error-message')).toContainText('返回的数据不完整或无法识别，请重新读取');await expect(page.locator('#patient-rows > *')).toHaveCount(0);await expect(page.locator('#results')).not.toHaveAttribute('data-analysis-id');await expect(page.locator('#more')).toBeHidden();await expect(page.locator('#numeric-computed-at')).toHaveText('');await expect(page.locator('#display-read-at')).toHaveText('');}
  await refresh(EMPTY);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','empty');await expect(page.locator('#patient-rows > *')).toHaveCount(0);await expect(page.locator('#numeric-computed-at')).toHaveText('');await expect(page.locator('#display-read-at')).toHaveText('');
  expect(o.pageErrors).toEqual([]);
 }finally{await o.save();}
});

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('cohort:clinical-retained-page',async({page,context,browser})=>{
 const {LATE_A,LATE_B,UNKNOWN_PATIENT}=require('../fixtures/cohort-p02.json');
 const ids=Array.from({length:36},(_,i)=>String(i+1)).concat('9223372036854775807');
 const patients=ids.map(patientId=>({...structuredClone(UNKNOWN_PATIENT),patientId,name:'合成患者'+patientId,studyNo:'A'+patientId,das28Base:1,das28At:1,das28Current:1,deltaDas28:0,activity:'remission'}));patients[10].name='合成新名11';patients[10].crpAt.missingReason='NO_EVALUATION';patients[10].crpAt.quality=['AT_MISSING'];patients[10].crpCurrent.missingReason='NO_VALID_CRP_LAB';patients[10].crpCurrent.quality=['CURRENT_MISSING'];
 const A='11111111-1111-1111-1111-111111111111',B='22222222-2222-2222-2222-222222222222';
 const first={...structuredClone(LATE_A),analysisId:A,meta:{...LATE_A.meta,computedAt:'2026-10-07T02:00:00Z',readCompletedAt:'2026-10-07T01:59:59Z'},patients:{total:37,returnedCount:10,hasMore:true,nextCursor:'opaque.A.10',items:patients.slice(0,10)}};
 const middle={analysisId:A,meta:{computedAt:'2026-10-07T02:00:00Z',readCompletedAt:'2026-10-07T01:59:59Z',displayReadCompletedAt:'2026-10-07T02:05:00Z'},patients:{total:37,returnedCount:20,hasMore:true,nextCursor:'opaque.A.30',items:patients.slice(10,30)}};
 const last={analysisId:A,meta:{...middle.meta,displayReadCompletedAt:'2026-10-07T02:06:00Z'},patients:{total:37,returnedCount:7,hasMore:false,nextCursor:null,items:patients.slice(30)}};
 const bItems=['901','902'].map(patientId=>({...structuredClone(UNKNOWN_PATIENT),patientId,name:'合成B'+patientId,studyNo:'B'+patientId,das28At:2,activity:'low'}));bItems[0].clinical.age=70;bItems[0].scoreProvenance.sourceField='source-B';
 const second={...structuredClone(LATE_B),analysisId:B,meta:{...LATE_B.meta,computedAt:'2026-10-07T03:00:00Z',readCompletedAt:'2026-10-07T03:01:00Z'},patients:{total:2,returnedCount:2,hasMore:false,nextCursor:null,items:bItems}};
 let mode='normal',attempts=0;const received=deferred(),release=deferred();
 await context.addInitScript(()=>{AbortController.prototype.abort=function(){};window.__clinicalReads=[];const nativeFetch=window.fetch;window.fetch=async(...args)=>{const r=await nativeFetch(...args),json=r.json.bind(r);r.json=async()=>{const data=await json();window.__clinicalReads.push(data);return data;};return r;};});
 const o=await setup({page,context,browser},'cohort:clinical-retained-page',async(route,r)=>{
  if(new URL(r.url).pathname.endsWith('/cohortPatients')){
   if(mode==='hold'){received.resolve();await release.promise;return fulfill(route,middle);}
   if(mode==='retry'&&++attempts===1)return fulfill(route,null,503,'SERVICE_UNAVAILABLE');
   if(mode==='invalid'){const bad=structuredClone(middle);delete bad.patients.items[5].clinical;return fulfill(route,bad);}
   if(mode==='expired')return fulfill(route,null,410,'ANALYSIS_EXPIRED');
   return fulfill(route,r.body.cursor==='opaque.A.10'?middle:last);
  }
  return fulfill(route,r.body.filters.sex==='F'?second:first);
 });
 const rows=()=>page.locator('#patient-rows [data-patient-id]').evaluateAll(ns=>ns.map(n=>n.dataset.patientId));
 const open=async()=>{await page.goto(o.origin+'/ai-cohort.html');await o.auth.verify(page);await expect(page.locator('#patient-rows .ai-row')).toHaveCount(10);};
 const time=async(computed,display)=>{await expect(page.locator('#numeric-computed-at')).toHaveText('数值计算时间：'+computed);await expect(page.locator('#display-read-at')).toHaveText('名单显示字段读取时间：'+display);};
 const assertB=async()=>{expect(await rows()).toEqual(['901','902']);await expect(page.locator('[data-patient-id="901"] .patient-clinical')).toContainText('年龄 70');await expect(page.locator('[data-patient-id="901"] .patient-score-source')).toContainText('来源项目：其他资料');await time('2026-10-07T03:00:00Z','2026-10-07T03:01:00Z');await expect(page.locator('#age-median')).toHaveText('70');await expect(page.locator('#results')).toHaveAttribute('data-analysis-id',B);};
 const cleared=async()=>{await expect(page.locator('#patient-rows > *')).toHaveCount(0);await expect(page.locator('#numeric-computed-at')).toHaveText('');await expect(page.locator('#display-read-at')).toHaveText('');await expect(page.locator('#clinical-panels')).toBeHidden();await expect(page.locator('#results')).not.toHaveAttribute('data-analysis-id');await expect(page.locator('#more')).toBeHidden();};
 try{
  await open();expect(await rows()).toEqual(ids.slice(0,10));await time('2026-10-07T02:00:00Z','2026-10-07T01:59:59Z');const policy=await page.locator('#analysis-policy').innerText();
  await page.locator('#more').click();await expect(page.locator('#patient-rows .ai-row')).toHaveCount(30);await time('2026-10-07T02:00:00Z','2026-10-07T02:05:00Z');
  await expect(page.locator('[data-patient-id="11"] .patient-das28')).toContainText('评估 1');await expect(page.locator('[data-patient-id="11"]')).toContainText('合成新名11');await expect(page.locator('[data-patient-id="11"] .patient-comorbidity')).toHaveText('FM 未知 · AS 未知');await expect(page.locator('[data-patient-id="11"] .patient-crp')).toContainText('缺失原因：没有可用评估记录 · 资料质量：评估记录缺失');await expect(page.locator('[data-patient-id="11"] .patient-crp')).toContainText('缺失原因：没有有效 CRP 化验 · 资料质量：当前记录缺失');
  expect(await page.locator('#analysis-policy').innerText()).toBe(policy);await expect(page.locator('#age-median')).toHaveText('40');expect(o.requests.at(-1).body).toEqual({analysisId:A,cursor:'opaque.A.10'});
  await page.locator('#more').click();await expect(page.locator('#patient-rows .ai-row')).toHaveCount(37);expect(await rows()).toEqual(ids);await time('2026-10-07T02:00:00Z','2026-10-07T02:06:00Z');await expect(page.locator('#more')).toBeHidden();expect(o.requests.at(-1).body).toEqual({analysisId:A,cursor:'opaque.A.30'});
  mode='hold';await open();await page.locator('#more').click();await received.promise;await page.locator('#f-sex').selectOption('F');await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');await assertB();const priorPageReads=await page.evaluate(()=>window.__clinicalReads.filter(r=>r.data?.patients?.nextCursor==='opaque.A.30').length);release.resolve();await page.waitForFunction(expected=>window.__clinicalReads.filter(r=>r.data?.patients?.nextCursor==='opaque.A.30').length===expected,priorPageReads+1);await assertB();
  mode='retry';await open();await page.locator('#more').click();await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','error');await expect(page.locator('#patient-rows .ai-row')).toHaveCount(10);await time('2026-10-07T02:00:00Z','2026-10-07T01:59:59Z');await expect(page.locator('#age-median')).toHaveText('40');
  await page.locator('#more').click();await expect(page.locator('#patient-rows .ai-row')).toHaveCount(30);expect(o.requests.at(-1).body).toEqual(o.requests.at(-2).body);expect(attempts).toBe(2);expect(new Set(await rows()).size).toBe(30);await time('2026-10-07T02:00:00Z','2026-10-07T02:05:00Z');
  mode='invalid';await open();await page.locator('#more').click();await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','error');await expect(page.locator('#error-message')).toContainText('返回的数据不完整或无法识别，请重新读取');await cleared();
  mode='expired';await open();await page.locator('#more').click();await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','expired');await cleared();expect(o.pageErrors).toEqual([]);
 }finally{release.resolve();await o.save();}
});
