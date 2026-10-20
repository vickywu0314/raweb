const {test,expect}=require('@playwright/test');
const {installAuthBootstrap}=require('../fixtures/auth-bootstrap.cjs');
// 比较医学量与检验语义使用独立字面真值，原协议另外由只读资源断言完整验证。
const expectedLabels={"n":"人数","q1":"下四分位数","median":"中位数","q3":"上四分位数","iqr":"四分位距","validN":"有效人数","unknownN":"未知人数","numerator":"符合人数","denominator":"分母人数","value":"记录值","knownN":"已知人数","datedN":"有日期人数","undatedN":"缺少日期人数","missingN":"缺失人数","minDate":"最早日期","maxDate":"最晚日期","status":"资料状态"};
const expectedCodes={"OK":"可评估","NO_DATA":"无可评估数据","UNKNOWN":"未知","PARTIAL":"部分内容已识别","OVERLAP":"两组患者重叠","INSUFFICIENT_SAMPLE":"样本不足","DEGENERATE":"数据无法支持检验","MANN_WHITNEY_EXACT":"Mann–Whitney 精确检验","MANN_WHITNEY_ASYMPTOTIC":"Mann–Whitney 近似检验","FISHER_EXACT":"Fisher 精确检验","CHI_SQUARE":"卡方检验","COHORTS_OVERLAP":"两组有重叠患者，不能进行独立组检验","VALID_N_LT_5":"每组有效样本少于5人","ZERO_RANK_VARIANCE":"秩次无差异，无法检验","ZERO_MARGIN":"列联表边际计数为零，无法检验","SMALL_SAMPLE_TIES":"小样本存在相同数值，解释需谨慎","SPARSE_EXPECTED_COUNTS":"部分期望频数较低，解释需谨慎","NON_MISSING_METRIC":"分母为指标非缺失患者","KNOWN_CATEGORY":"分母为分类已知患者","EVALUABLE_TARGET":"分母为可评估达标情况的患者","EVALUABLE_ACTIVITY":"分母为活动度可评估患者","KNOWN_LINE":"分母为治疗线数已知患者","remission":"缓解","low":"低活动","moderate":"中活动","high":"高活动","KNOWN":"已知"};

// 独立中文业务真值；不使用生产显示函数生成期望。
const expectedError={"UNAUTHENTICATED":"登录已失效，请重新登录","RESOURCE_NOT_FOUND":"所需记录不存在或当前账号无法访问","COMPARE_EXPIRED":"分析结果已过期，请重新分析","INVALID_REQUEST":"输入内容不符合要求，请检查后重试","SERVICE_UNAVAILABLE":"服务暂不可用，请稍后重试","SCOPE_CHANGED":"可访问的研究库范围已变化，请重新分析","LIMIT_EXCEEDED":"内容超出允许范围，请调整后重试"};
const {writeFile}=require('node:fs/promises');
const {U}=require('../fixtures/cohort-p02.json');
const {before,excluded,definition,unknownBoundary}=require('../fixtures/cohort-comparison.json');
const clone=value=>structuredClone(value);
const FILTER_KEYS=['studyCode','sex','age','sero','tx','at','act','cm','data','ids'];
// 条件规范化仅服务于独立fixture投影，不能调用产品派生/统计函数生成expected。
const canonical=filters=>Object.fromEntries(FILTER_KEYS.map(key=>[key,key==='ids'?clone(filters.ids??null):key==='studyCode'?'RA':key==='at'?(filters.at||'now'):(filters[key]||null)]));
const sideButton=(page,side,id)=>page.locator(`[data-compare-side="${side}"][data-compare-cohort="${id}"]`);
const fulfill=(route,data,status=200,code='200')=>route.fulfill({status,contentType:'application/json',headers:{'X-Trace-Id':'trace-comparison'},body:JSON.stringify({success:status===200,code,message:'合成比较响应',data})});
async function setup({page,context,browser},scenario,reply){
  const auth=await installAuthBootstrap(context);
const origin=process.env.RA_STATIC_URL,requests=[],allowed=[],blocked=[],pageErrors=[];
 page.on('pageerror',e=>pageErrors.push(e.message));
 await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==origin){blocked.push(request.url());return route.abort('blockedbyclient');}allowed.push(request.url());if(await auth.handle(route))return;if(url.pathname.startsWith('/api/')){const r={url:request.url(),body:request.postDataJSON()};requests.push(r);return reply(route,r);}return route.continue();});
 return {origin,auth,requests,pageErrors,save:async()=>{await writeFile(`${process.env.RA_RUN_DIR}/browser-observation.json`,JSON.stringify({scenario,version:browser.version(),requests,authRequests:auth.requests,allowed,blocked,pageErrors,dom:await page.locator('main').innerText()},null,2)+'\n');await writeFile(`${process.env.RA_RUN_DIR}/network.json`,JSON.stringify({requests,authRequests:auth.requests,allowed,blocked,pageErrors},null,2)+'\n');}};
}
function fixtureFor(body,definitions,id=before.compareResultId){
 const data=clone(body.excludeOverlap?excluded:before);
 const selected=side=>body[side].source==='SAVED'?definitions.get(body[side].cohortId).filters:canonical(body[side].filters);
 const reversed=JSON.stringify(selected('a').ids)===JSON.stringify(before.b.filters.ids)&&JSON.stringify(selected('b').ids)===JSON.stringify(before.a.filters.ids);
 if(reversed){[data.a,data.b]=[data.b,data.a];[data.meta.sourceDateCoverage.a,data.meta.sourceDateCoverage.b]=[data.meta.sourceDateCoverage.b,data.meta.sourceDateCoverage.a];for(const row of data.rows){[row.a,row.b]=[row.b,row.a];if(row.difference!==null)row.difference=JSON.parse(JSON.stringify(-row.difference));if(row.test)[row.test.nA,row.test.nB]=[row.test.nB,row.test.nA];}}
 for(const side of ['a','b']){const input=body[side],saved=input.source==='SAVED'?definitions.get(input.cohortId):null;Object.assign(data[side],{source:input.source,filters:clone(saved?saved.filters:canonical(input.filters)),cohortId:saved?saved.cohortId:null,cohortVersion:saved?saved.version:null});}
 data.compareResultId=id;return data;
}
function zeroFixture(body,definitions){
 const data=fixtureFor(body,definitions);data.overlapN=0;
 for(const side of ['a','b']){Object.assign(data[side],{nBeforeExclusion:0,n:0,evalN:0,submittedUniqueIdsN:0,effectiveIdsN:0});for(const metric of Object.values(data.meta.sourceDateCoverage[side]))Object.assign(metric,{validN:0,datedN:0,undatedN:0,missingN:0,minDate:null,maxDate:null,status:'NO_DATA'});}
 for(const row of data.rows){row.difference=null;for(const side of ['a','b']){
  if(row.kind==='COUNT')row[side]={n:0};
  else if(row.kind==='CONTINUOUS')row[side]={validN:0,unknownN:0,q1:null,median:null,q3:null,iqr:null,status:'NO_DATA'};
  else if(row.kind==='BINARY')row[side]={numerator:0,denominator:0,knownN:0,unknownN:0,value:0,status:'NO_DATA'};
  else row[side]={denominator:0,knownN:0,unknownN:0,status:'NO_DATA',groups:row[side].groups.map(group=>({...group,count:0,value:0}))};
 }if(row.test){Object.assign(row.test,{method:null,status:'INSUFFICIENT_SAMPLE',pValue:null,displayP:'—',nA:0,nB:0,reason:'VALID_N_LT_5',warnings:[],significant:null});if(Object.hasOwn(row.test,'expectedBelow5Cells'))row.test.expectedBelow5Cells=null;if(Object.hasOwn(row.test,'expectedCellCount'))row.test.expectedCellCount=null;}}
 return data;
}
async function setCurrent(page,filters){
 const query=new URLSearchParams();for(const key of FILTER_KEYS){const value=filters[key];if(key==='ids'){if(value!==null&&value!==undefined)query.set('ids',value.join(','));}else if(value&&!(key==='studyCode'&&value==='RA')&&!(key==='at'&&value==='now'))query.set(key,value);}
 await page.evaluate(query=>{history.pushState(null,'',location.pathname+(query?'?'+query:''));window.dispatchEvent(new Event('popstate'));},query.toString());
 await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');
}
async function noResult(page){await expect(page.locator('#compare-result')).toBeHidden();await expect(page.locator('#compare-result')).not.toHaveAttribute('data-compare-result-id');expect(await page.evaluate(()=>window.RACohortComparison.getResource())).toBeNull();}
async function assertResult(page,data){
 await expect(page.locator('#compare-state')).toHaveAttribute('data-state','success');await expect(page.locator('#compare-result')).toBeVisible();await expect(page.locator('#compare-result')).toHaveAttribute('data-compare-result-id',data.compareResultId);await expect(page.locator('#compare-cancel')).toBeHidden();
 await expect(page.locator('#compare-summary')).toHaveText(`研究库 ${data.studyTotal} 人 · 两组重叠 ${data.overlapN} 人`);
 for(const side of ['a','b']){
  const value=data[side],box=page.locator('#compare-side-'+side);
  for(const text of [side.toUpperCase()+'组',value.source==='SAVED'?'已保存条件':'当前筛选条件',`排重前 ${value.nBeforeExclusion} 人`,`本组 ${value.n} 人`,`可评估 ${value.evalN} 人`,`指定患者 ${value.submittedUniqueIdsN??'未指定'} 人`,`其中有效 ${value.effectiveIdsN??'未指定'} 人`])await expect(box).toContainText(text);
  if(value.source==='SAVED'){await expect(box).toContainText(`条件编号 ${value.cohortId}`);await expect(box).toContainText(`版本 ${Number.isSafeInteger(value.cohortVersion)?value.cohortVersion:'超出安全显示范围'}`);}
  if(value.filters.ids!==null)await expect(box).toContainText(`指定患者 ${value.filters.ids.length} 人`);
  if(value.filters.sex)await expect(box).toContainText({F:'女性',M:'男性'}[value.filters.sex]);
  if(value.filters.age)await expect(box).toContainText(`年龄 ${value.filters.age} 岁`);
  await expect(box).toContainText(value.filters.at==='6m'?'治疗后六个月':'当前');
  await expect(box).not.toContainText(/studyCode|nBeforeExclusion|evalN|\{\s*"/);
 }
 const policy=page.locator('#compare-policy');for(const key of ['asOfDate','readStartedAt','readCompletedAt','computedAt','expiresAt'])await expect(policy).toContainText(data.meta[key]);await expect(policy).toContainText(data.meta.at==='6m'?'评估时点 治疗后六个月':'评估时点 当前');for(const value of Object.values(data.meta.policyVersions))await expect(policy).not.toContainText(value);await expect(policy).not.toContainText(data.meta.traceId);await expect(policy).toContainText(data.meta.statisticalDisclosure);await expect(policy).toContainText(data.excludeOverlap?'双方均排除重叠患者':'保留重叠患者；交集存在时不能进行独立组检验');
 expect(await page.evaluate(()=>window.RACohortComparison.getResource())).toEqual(data);
}
test('cohort:comparison-sources',async({page,context,browser})=>{
 const aDefinition={...clone(definition),cohortId:'00000000-0000-0000-0000-000000000200',version:3,name:'A 定义',filters:clone(before.a.filters)};
 const bDefinition={...clone(definition),name:'<img src=x onerror=alert(1)>',note:'<script>bad()</script>'};
 const definitions=new Map([[aDefinition.cohortId,aDefinition],[bDefinition.cohortId,bDefinition]]);
 let mode='ok',lastData=null;
 const compares=()=>o.requests.filter(r=>r.url.endsWith('/ai/compare'));
 const ordinary=()=>o.requests.filter(r=>r.url.endsWith('/ai/cohort')).length;
 const opens=()=>o.requests.filter(r=>r.url.endsWith('/cohort/open')).length;
 const bad=new Map([
  ['id-missing',d=>delete d.compareResultId],['id-type',d=>d.compareResultId=401],['id-invalid',d=>d.compareResultId='not-a-uuid'],['side-missing',d=>delete d.a],['studyTotal-type',d=>d.studyTotal='14'],['overlap-negative',d=>d.overlapN=-1],['exclude-type',d=>d.excludeOverlap='false'],['exclude-binding',d=>d.excludeOverlap=!d.excludeOverlap],
  ['source-binding',d=>d.a.source='SAVED'],['filters-binding',d=>d.a.filters.sex='F'],['saved-binding',d=>d.b.cohortId=aDefinition.cohortId],['filters-container',d=>d.a.filters=null],['filters-missing',d=>delete d.a.filters.at],['filters-version-binding',d=>d.a.cohortVersion=1],['saved-version-type',d=>d.b.cohortVersion='1'],['side-count-missing',d=>delete d.a.evalN],['side-count-type',d=>d.b.n='8'],
  ['rows-container',d=>d.rows={}],['rows-count',d=>d.rows.pop()],['rows-metric',d=>d.rows[2].metric='diseaseDurationYears'],['rows-kind',d=>d.rows[1].kind='BINARY'],
  ['meta-container',d=>d.meta=null],['meta-time',d=>d.meta.computedAt=null],['meta-asOf',d=>d.meta.asOfDate=null],['meta-readStarted',d=>delete d.meta.readStartedAt],['meta-readCompleted',d=>d.meta.readCompletedAt=1],['meta-expires',d=>d.meta.expiresAt=null],['meta-at',d=>d.meta.at='6m'],['meta-trace',d=>d.meta.traceId=null],['meta-policy',d=>d.meta.policyVersions=[]],['meta-policy-missing',d=>delete d.meta.policyVersions.statistics],['meta-policy-type',d=>d.meta.policyVersions.comparison=1],['meta-disclosure',d=>delete d.meta.statisticalDisclosure]
 ]);
 const o=await setup({page,context,browser},'cohort:comparison-sources',(route,r)=>{
  const path=new URL(r.url).pathname;
  if(path.endsWith('/list'))return fulfill(route,{items:r.body.page===1?Array.from(definitions.values()).map(clone):[],total:definitions.size,page:r.body.page,size:20,meta:{traceId:'trace-comparison'}});
  if(path.endsWith('/rename')){const item=definitions.get(r.body.cohortId);if(Object.hasOwn(r.body,'name'))item.name=r.body.name;if(Object.hasOwn(r.body,'note'))item.note=r.body.note;item.version++;return fulfill(route,{cohortId:item.cohortId,version:item.version,meta:{traceId:'trace-comparison'}});}
  if(path.endsWith('/delete')){definitions.delete(r.body.cohortId);return fulfill(route,{cohortId:r.body.cohortId,version:r.body.version+1,meta:{traceId:'trace-comparison'}});}
  if(path.endsWith('/ai/compare')){
   if(Array.isArray(mode))return fulfill(route,null,mode[0],mode[1]);if(mode==='offline')return route.abort('failed');if(mode==='nonjson')return route.fulfill({status:200,contentType:'text/html',headers:{'X-Trace-Id':'trace-comparison'},body:'broken'});
   lastData=mode==='zero'?zeroFixture(r.body,definitions):fixtureFor(r.body,definitions);if(bad.has(mode))bad.get(mode)(lastData);return fulfill(route,lastData);
  }
  return fulfill(route,U);
 });
 const load=async()=>{await page.locator('#private-list-load').click();await expect(page.locator('#private-list-state')).toHaveAttribute('data-state','success');};
 const select=async(side,source)=>{const beforeRequests=o.requests.length;if(source==='SAVED')await sideButton(page,side,side==='a'?aDefinition.cohortId:bDefinition.cohortId).click();else await page.locator('#compare-current-'+side).click();expect(o.requests).toHaveLength(beforeRequests);};
 const clickCompare=async()=>{const count=compares().length,analysisCount=ordinary(),openCount=opens();await page.locator('#compare-start').click();await expect(page.locator('#compare-state')).toHaveAttribute('data-state',mode==='ok'||mode==='zero'?'success':'error');expect(compares()).toHaveLength(count+1);expect(ordinary()).toBe(analysisCount);expect(opens()).toBe(openCount);};
 try{
  await page.goto(o.origin+'/ai-cohort.html?ids=1,2,3,4,5,6,7,8');await o.auth.verify(page);
  // 保留首cycle对旧页面缺动作的真实断言。
  await expect(page.locator('#compare-current-a')).toBeVisible();await expect(page.locator('#compare-start')).toBeDisabled();await page.locator('#compare-current-a').click();await expect(page.locator('#compare-source-a')).toContainText('已选条件');await page.locator('#compare-current-b').click();await expect(page.locator('#compare-start')).toBeEnabled();
  await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');await expect(page.locator('#compare-exclude')).not.toBeChecked();
  const pickedA=await page.locator('#compare-source-a').innerText(),pickedB=await page.locator('#compare-source-b').innerText();await page.locator('#f-sex').selectOption('F');await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');await expect(page.locator('#compare-source-a')).toHaveText(pickedA);await expect(page.locator('#compare-source-b')).toHaveText(pickedB);await select('b','FILTERS');await expect(page.locator('#compare-source-b')).toContainText('女性');await expect(page.locator('#compare-source-a')).toHaveText(pickedA);
  await setCurrent(page,before.b.filters);await select('b','FILTERS');await clickCompare();await assertResult(page,lastData);
  // 列表只提供真实本页定义，不发open、cohort或逐项计数。
  let count=ordinary();await load();expect(ordinary()).toBe(count);expect(opens()).toBe(0);await expect(sideButton(page,'a',aDefinition.cohortId)).toBeVisible();await expect(sideButton(page,'b',bDefinition.cohortId)).toBeVisible();await expect(page.locator('#private-items')).toContainText('<img src=x onerror=alert(1)>');await expect(page.locator('#private-items')).toContainText('<script>bad()</script>');expect(await page.locator('#private-items img, #private-items script').count()).toBe(0);
  for(const [aSource,bSource] of [['FILTERS','FILTERS'],['FILTERS','SAVED'],['SAVED','FILTERS'],['SAVED','SAVED']]){
   await setCurrent(page,before.a.filters);await select('a',aSource);await setCurrent(page,before.b.filters);await select('b',bSource);await page.locator('#compare-exclude').uncheck();await noResult(page);await clickCompare();const request=compares().at(-1).body;expect(Object.keys(request).sort()).toEqual(['a','b','excludeOverlap']);expect(request.excludeOverlap).toBe(false);
   for(const side of ['a','b']){const source=side==='a'?aSource:bSource,input=request[side];expect(input.source).toBe(source);expect(Object.keys(input).sort()).toEqual(source==='SAVED'?['cohortId','source']:['filters','source']);if(source==='SAVED')expect(input.cohortId).toBe(side==='a'?aDefinition.cohortId:bDefinition.cohortId);else{expect(Object.keys(input.filters).sort()).toEqual([...FILTER_KEYS].sort());expect(canonical(input.filters)).toEqual(before[side].filters);}}
   await assertResult(page,lastData);if(bSource==='SAVED'){await expect(page.locator('#compare-source-b')).toContainText(bDefinition.name);await expect(page.locator('#compare-source-b')).toContainText(bDefinition.note);expect(await page.locator('#compare-source-b img, #compare-source-b script').count()).toBe(0);}
  }
  // 一页map清空或刷新不会抹去用户明确已选SAVED快照。
  const slots=await page.locator('#compare-source-a, #compare-source-b').allTextContents(),resource=clone(lastData);count=ordinary();await page.locator('#private-next').click();await expect(page.locator('#private-list-state')).toHaveAttribute('data-state','empty');expect(await page.locator('#compare-source-a, #compare-source-b').allTextContents()).toEqual(slots);expect(await page.evaluate(()=>window.RACohortComparison.getResource())).toEqual(resource);expect(ordinary()).toBe(count);expect(opens()).toBe(0);await page.locator('#private-prev').click();await expect(page.locator('#private-list-state')).toHaveAttribute('data-state','success');
  // 同at冲突保选择，任何click都必须零compare，用户重选后才恢复。
  await page.locator('#f-at').selectOption('6m');await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');await select('a','FILTERS');const conflictA=await page.locator('#compare-source-a').innerText(),conflictB=await page.locator('#compare-source-b').innerText(),compareCount=compares().length;await expect(page.locator('#compare-start')).toBeDisabled();await page.locator('#compare-start').evaluate(button=>button.click());expect(compares()).toHaveLength(compareCount);await expect(page.locator('#compare-state')).toContainText(/时点|at/);await expect(page.locator('#compare-source-a')).toHaveText(conflictA);await expect(page.locator('#compare-source-b')).toHaveText(conflictB);await noResult(page);
  await setCurrent(page,before.a.filters);await select('a','FILTERS');await select('b','SAVED');await clickCompare();await assertResult(page,lastData);
  await page.locator('#compare-exclude').check();await noResult(page);await clickCompare();expect(compares().at(-1).body.excludeOverlap).toBe(true);await assertResult(page,lastData);expect(lastData.a.n).toBe(6);expect(lastData.b.n).toBe(6);expect(lastData.rows.find(row=>row.metric==='age').difference).toBe(-8);
  const previous=clone(compares().at(-1).body);await page.locator('#compare-swap').click();await noResult(page);expect(compares()).toHaveLength(compareCount+2);await clickCompare();expect(compares().at(-1).body).toEqual({a:previous.b,b:previous.a,excludeOverlap:true});await assertResult(page,lastData);expect(lastData.rows.find(row=>row.metric==='age').difference).toBe(8);
  // readonly seam必须保留完整12行及全部metadata，外部修改clone不能篡改资源。
  await page.evaluate(()=>{const value=window.RACohortComparison.getResource();value.rows.length=0;value.a.filters.ids.push('9223372036854775807');value.meta.policyVersions.comparison='changed';});expect(await page.evaluate(()=>window.RACohortComparison.getResource())).toEqual(lastData);
  await page.locator('#compare-exclude').uncheck();await setCurrent(page,before.a.filters);await select('a','FILTERS');await select('b','SAVED');
  // 所需容器、类型、固定row身份和本次side绑定统一验证，坏成功绝无ID/旧资源。
  for(const fault of bad.keys()){mode=fault;await clickCompare();await noResult(page);await expect(page.locator('#compare-state')).toContainText('返回的数据不完整或无法识别，请重新读取');await expect(page.locator('#compare-state')).not.toContainText('trace-comparison');await expect(page.locator('#results')).toHaveAttribute('data-analysis-id',U.analysisId);await expect(page.locator('#cohort-n')).toHaveText(String(U.n));}
  for(const error of [[400,'INVALID_REQUEST'],[404,'RESOURCE_NOT_FOUND'],[409,'SCOPE_CHANGED'],[410,'COMPARE_EXPIRED'],[413,'LIMIT_EXCEEDED'],[503,'SERVICE_UNAVAILABLE']]){mode=error;await clickCompare();await noResult(page);await expect(page.locator('#compare-state')).not.toContainText(`HTTP ${error[0]}`);await expect(page.locator('#compare-state')).toContainText(expectedError[error[1]]);await expect(page.locator('#compare-state')).not.toContainText('trace-comparison');await expect(page.locator('#results')).toHaveAttribute('data-analysis-id',U.analysisId);}
  for(const error of ['offline','nonjson']){mode=error;await clickCompare();await noResult(page);await expect(page.locator('#compare-state')).toContainText(error==='offline'?'网络连接失败，请检查连接后重试':'返回的数据不完整或无法识别，请重新读取');await expect(page.locator('#compare-state')).toContainText(/未知|未确认|不能确定|不能确认|尚未确认/);}
  // 不安全version只能诚实显示，合法UNKNOWN与合法零不能错判坏成功。
  mode='ok';bDefinition.version=9007199254740992;await load();await select('b','SAVED');await clickCompare();await assertResult(page,lastData);await expect(page.locator('#compare-side-b')).toContainText('超出安全显示范围');expect(lastData.meta.sourceDateCoverage.a.age.status).toBe('UNKNOWN');
  mode='zero';await setCurrent(page,{...clone(before.a.filters),ids:[]});await select('a','FILTERS');await select('b','FILTERS');await clickCompare();await assertResult(page,lastData);expect(compares().at(-1).body.a.filters.ids).toEqual([]);expect(lastData.a.n).toBe(0);
  // 名称/版本更新及删除候选，不得改写已创建比较的原version/filters/数值。
  mode='ok';bDefinition.version=1;await load();await setCurrent(page,before.a.filters);await select('a','FILTERS');await setCurrent(page,before.b.filters);await select('b','SAVED');await clickCompare();const retained=clone(lastData);
  await page.locator(`[data-edit-cohort="${bDefinition.cohortId}"]`).click();await page.locator('#private-edit-name').fill('已改名');await page.locator('#private-command-confirm').click();await expect(page.locator('#private-command-state')).toHaveAttribute('data-state','success');await expect(page.locator('#private-items')).toContainText('已改名');await assertResult(page,retained);expect(retained.b.cohortVersion).toBe(1);
  await page.locator(`[data-delete-cohort="${bDefinition.cohortId}"]`).click();await page.locator('#private-command-confirm').click();await expect(page.locator('#private-command-state')).toHaveAttribute('data-state','success');await expect(sideButton(page,'b',bDefinition.cohortId)).toHaveCount(0);await expect(page.locator('#compare-source-b')).toContainText('尚未选择');await expect(page.locator('#compare-start')).toBeDisabled();await assertResult(page,retained);await expect(page.locator('#compare-definition-note')).toContainText('已删除');await expect(page.locator('#compare-definition-note')).toContainText('已保留');await select('b','FILTERS');await noResult(page);await clickCompare();await assertResult(page,lastData);
  expect(o.pageErrors).toEqual([]);expect(opens()).toBe(0);expect(o.requests.some(r=>r.url.endsWith('/ai/compareResult'))).toBe(false);
 }finally{await o.save();}
});
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function inertComparisonAbort(context){
 await context.addInitScript(()=>{
  const Native=window.AbortController;window.AbortController=class extends Native{abort(){window.__comparisonAborts=(window.__comparisonAborts||0)+1;}};
  window.__comparisonReads=[];const fetch=window.fetch.bind(window);window.fetch=async(...args)=>{const response=await fetch(...args),json=response.json.bind(response);response.json=async()=>{const value=await json();window.__comparisonReads.push({url:String(args[0]),value});return value;};return response;};
 });
}
test('cohort:comparison-pending',async({page,context,browser})=>{
 const A=before.compareResultId,B='00000000-0000-0000-0000-000000000402';
 const aDefinition={...clone(definition),cohortId:'00000000-0000-0000-0000-000000000200',name:'A 定义',filters:clone(before.a.filters)},bDefinition=clone(definition);
 const definitions=new Map([[aDefinition.cohortId,aDefinition],[bDefinition.cohortId,bDefinition]]),holds=[],queue=[];
 let immediateId=B,compareError=null,analysisError=null;
 const arm=id=>{const h={id,received:gate(),release:gate(),response:null};holds.push(h);queue.push(h);return h;};
 await inertComparisonAbort(context);await page.clock.install();
 const o=await setup({page,context,browser},'cohort:comparison-pending',async(route,r)=>{
  const path=new URL(r.url).pathname;
  if(path.endsWith('/list'))return fulfill(route,{items:Array.from(definitions.values()).map(clone),total:definitions.size,page:r.body.page,size:20,meta:{traceId:'trace-comparison'}});
  if(path.endsWith('/delete')){definitions.delete(r.body.cohortId);return fulfill(route,{cohortId:r.body.cohortId,version:r.body.version+1,meta:{traceId:'trace-comparison'}});}
  if(path.endsWith('/open'))return fulfill(route,{cohort:clone(definitions.get(r.body.cohortId)),analysis:U,meta:{traceId:'trace-comparison'}});
  if(path.endsWith('/ai/compare')){const h=queue.shift();if(h){h.response=fixtureFor(r.body,definitions,h.id);h.received.resolve(r);await h.release.promise;try{return await fulfill(route,h.response);}catch(error){if(!page.isClosed()&&!/closed|cancel|disposed|destroyed|aborted/i.test(error.message))throw error;return;}}return compareError?fulfill(route,null,compareError[0],compareError[1]):fulfill(route,fixtureFor(r.body,definitions,immediateId));}
  return analysisError?fulfill(route,null,analysisError[0],analysisError[1]):fulfill(route,U);
 });
 const compares=()=>o.requests.filter(r=>r.url.endsWith('/ai/compare'));
 const sourceTexts=()=>page.locator('#compare-source-a, #compare-source-b').allTextContents();
 const snapshot=()=>page.evaluate(()=>({url:location.href,comparison:document.querySelector('#comparison').innerHTML,analysis:document.querySelector('#results').innerHTML,analysisId:document.querySelector('#results').dataset.analysisId,values:['sex','age','sero','tx','at','act','cm','data'].map(key=>document.querySelector('#f-'+key).value),resource:window.RACohortComparison.getResource()}));
 const releaseRead=async h=>{h.release.resolve();await page.waitForFunction(id=>window.__comparisonReads.some(read=>read.url.endsWith('/ai/compare')&&read.value?.data?.compareResultId===id),h.id);await page.evaluate(async()=>{await Promise.resolve();await Promise.resolve();});};
 const fresh=async()=>{
  compareError=null;analysisError=null;definitions.set(aDefinition.cohortId,clone(aDefinition));definitions.set(bDefinition.cohortId,clone(bDefinition));
  await page.goto(o.origin+'/ai-cohort.html?ids=1,2,3,4,5,6,7,8');await o.auth.verify(page);await expect(page.locator('#results')).toHaveAttribute('data-analysis-id',U.analysisId);await page.locator('#compare-current-a').click();await page.locator('#private-list-load').click();await expect(page.locator('#private-list-state')).toHaveAttribute('data-state','success');await sideButton(page,'b',bDefinition.cohortId).click();await expect(page.locator('#compare-start')).toBeEnabled();
 };
 const start=async id=>{const h=arm(id),count=compares().length;await page.locator('#compare-start').click();await h.received.promise;expect(compares()).toHaveLength(count+1);await expect(page.locator('#compare-state')).toHaveAttribute('data-state','loading');await expect(page.locator('#compare-cancel')).toBeVisible();await noResult(page);return h;};
 const closed=async()=>{await expect(page.locator('#compare-state')).not.toHaveAttribute('data-state','loading');await expect(page.locator('#compare-cancel')).toBeHidden();await noResult(page);};
 const privateCleared=async()=>{await closed();await expect(page.locator('#compare-source-a')).toContainText('尚未选择');await expect(page.locator('#compare-source-b')).toContainText('尚未选择');await expect(page.locator('#compare-start')).toBeDisabled();await expect(page.locator('#private-items > *')).toHaveCount(0);await expect(page.locator('#results')).not.toHaveAttribute('data-analysis-id');await expect(page.locator('#patient-rows > *')).toHaveCount(0);};
 try{
  // A已真实收到但未返回，B先完成；abort无操作且A实际JSON读完也不能改B。
  await fresh();const old=await start(A);await page.locator('#compare-exclude').check();await closed();await page.locator('#compare-start').click();const expectedB=fixtureFor(compares().at(-1).body,definitions,B);await assertResult(page,expectedB);const verifiedB=await snapshot(),bCount=compares().length;await releaseRead(old);await assertResult(page,expectedB);expect(await snapshot()).toEqual(verifiedB);expect(compares()).toHaveLength(bCount);expect(expectedB.a.n).toBe(6);expect(old.response.a.n).toBe(8);
  // 同一来源再次开始仍是独立operation，而非复用前次等待或暗重试。
  await fresh();const same=await start('00000000-0000-0000-0000-000000000403');await page.locator('#compare-start').click();await assertResult(page,fixtureFor(compares().at(-1).body,definitions,B));let stable=await snapshot(),count=compares().length;await releaseRead(same);expect(await snapshot()).toEqual(stable);expect(compares()).toHaveLength(count);
  // 四个来源入口、交换/排重/显式取消均先结束等待，再让迟到peer读完。
  const sourceTerminals=[
   ['current-a',()=>page.locator('#compare-current-a').click()],['current-b',()=>page.locator('#compare-current-b').click()],
   ['saved-a',()=>sideButton(page,'a',aDefinition.cohortId).click()],['saved-b',()=>sideButton(page,'b',bDefinition.cohortId).click()],
   ['swap',()=>page.locator('#compare-swap').click()],['exclude',()=>page.locator('#compare-exclude').check()],['cancel',()=>page.locator('#compare-cancel').click()]
  ];
  let serial=410;
  for(const [terminal,act] of sourceTerminals){await fresh();const h=await start(`00000000-0000-0000-0000-${String(serial++).padStart(12,'0')}`);count=compares().length;await act();await closed();if(terminal==='cancel')await expect(page.locator('#compare-state')).toHaveText('已取消等待，结果尚未确认，不能确定是否已提交；重新比较会生成一条新结果。');stable=await snapshot();await releaseRead(h);expect(await snapshot(),terminal+'迟到后不可发布').toEqual(stable);await page.clock.runFor(30001);expect(await snapshot(),terminal+'不得留下旧timeout权利').toEqual(stable);expect(compares()).toHaveLength(count);}
  // 每个普通条件控件、新分析、open以及条件导航均终止比较，保留已选快照。
  const conditionTerminals=[...Object.entries({sex:'F',age:'18-40',sero:'1',tx:'TNFi',at:'6m',act:'target',cm:'FM',data:'complete'}).map(([key,value])=>['condition-'+key,()=>page.locator('#f-'+key).selectOption(value)]),
   ['analyze',()=>page.locator('#reanalyze').click()],['open',()=>page.locator(`[data-open-cohort="${bDefinition.cohortId}"]`).click()],['reset',()=>page.locator('#reset').click()],['chip',()=>page.locator('#chips [data-key="ids"]').click()],['popstate',()=>setCurrent(page,before.b.filters)]
  ];
  for(const [terminal,act] of conditionTerminals){await fresh();const picked=await sourceTexts(),h=await start(`00000000-0000-0000-0000-${String(serial++).padStart(12,'0')}`);count=compares().length;await act();await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');await closed();expect(await sourceTexts(),terminal+'保留显式快照').toEqual(picked);stable=await snapshot();await releaseRead(h);expect(await snapshot(),terminal+'迟到后不可发布').toEqual(stable);await page.clock.runFor(30001);expect(await snapshot()).toEqual(stable);expect(compares()).toHaveLength(count);}
  // 定义真删除终止涉及它的未来比较，迟到响应不能恢复槽/候选。
  await fresh();const deleted=await start(`00000000-0000-0000-0000-${String(serial++).padStart(12,'0')}`);count=compares().length;await page.locator(`[data-delete-cohort="${bDefinition.cohortId}"]`).click();await page.locator('#private-command-confirm').click();await expect(page.locator('#private-command-state')).toHaveAttribute('data-state','success');await expect(sideButton(page,'b',bDefinition.cohortId)).toHaveCount(0);await expect(page.locator('#compare-source-b')).toContainText('尚未选择');await closed();stable=await snapshot();await releaseRead(deleted);expect(await snapshot()).toEqual(stable);expect(compares()).toHaveLength(count);await expect(sideButton(page,'b',bDefinition.cohortId)).toHaveCount(0);
  // 身份变化、401和离页清全部比较私有选择及患者展示；旧身份不可恢复。
  for(const terminal of ['identity','compare-401','analysis-401','pagehide']){
   await fresh();const h=await start(`00000000-0000-0000-0000-${String(serial++).padStart(12,'0')}`);
   if(terminal==='identity')await page.evaluate(()=>{sessionStorage.setItem('ra-auth',JSON.stringify({name:'另一合成身份',role:'研究者',expires:0}));window.dispatchEvent(new Event('focus'));});
   else if(terminal==='pagehide')await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
   else if(terminal==='compare-401'){compareError=[401,'UNAUTHENTICATED'];await page.locator('#compare-start').click();await expect(page.locator('#compare-state')).toContainText('登录已失效，请重新登录');}
   else{analysisError=[401,'UNAUTHENTICATED'];await page.locator('#f-sex').selectOption('F');await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','error');}
   await privateCleared();count=compares().length;stable=await snapshot();await releaseRead(h);await privateCleared();expect(await snapshot()).toEqual(stable);await page.clock.runFor(30001);expect(await snapshot()).toEqual(stable);expect(compares()).toHaveLength(count);
  }
  // peer永久不响应：实际收到请求后只用Playwright Clock证明30秒自终止。
  await fresh();const pendingSources=await sourceTexts(),never=await start(`00000000-0000-0000-0000-${String(serial++).padStart(12,'0')}`);count=compares().length;await page.clock.runFor(30001);await closed();await expect(page.locator('#compare-state')).toHaveAttribute('data-state','error');await expect(page.locator('#compare-state')).toContainText('等待超时，请重试');await expect(page.locator('#compare-state')).toContainText(/未知|未确认|不能确定|不能确认|尚未确认/);await expect(page.locator('#compare-start')).toBeEnabled();expect(await sourceTexts()).toEqual(pendingSources);stable=await snapshot();await page.clock.runFor(30001);expect(await snapshot()).toEqual(stable);expect(compares()).toHaveLength(count);expect(await page.evaluate(id=>window.__comparisonReads.some(read=>read.value?.data?.compareResultId===id),never.id)).toBe(false);
  // timeout后显式新比较允许新ID；旧peer迟到即便实际读完也无权覆盖。
  await page.locator('#compare-start').click();await assertResult(page,fixtureFor(compares().at(-1).body,definitions,B));stable=await snapshot();count=compares().length;await releaseRead(never);expect(await snapshot()).toEqual(stable);expect(compares()).toHaveLength(count);
  expect(await page.evaluate(()=>window.__comparisonAborts)).toBeGreaterThan(0);expect(o.pageErrors).toEqual([]);expect(o.requests.some(r=>r.url.endsWith('/ai/compareResult'))).toBe(false);
 }finally{for(const h of holds)h.release.resolve();await o.save();}
});

test('cohort:comparison-rows',async({page,context,browser})=>{
 const definitions=new Map();let lastData,mode='ok';
 const faults=new Map([['median-type',d=>d.rows[1].a.median='22.5'],['validN-type',d=>d.rows[1].a.validN=null],['row-status',d=>d.rows[1].a.status='UNKNOWN'],['test-array',d=>d.rows[1].test=[]],['test-method',d=>d.rows[1].test.method='AUTO'],['test-n',d=>d.rows[1].test.nA='6'],['warnings',d=>d.rows[1].test.warnings={}],['binary-value',d=>d.rows[6].a.value='0'],['binary-denominator',d=>delete d.rows[6].a.denominator],['group-array',d=>d.rows[10].a.groups={}],['group-category',d=>d.rows[11].a.groups[2].category='4'],['group-count',d=>d.rows[11].a.groups[0].count=null],['expected-type',d=>d.rows[6].test.expectedCellCount='4']]);
 const o=await setup({page,context,browser},'cohort:comparison-rows',async(route,r)=>{
  if(r.url.endsWith('/ai/compare')){lastData=mode==='boundary'?clone(unknownBoundary):mode==='zero'?zeroFixture(r.body,definitions):fixtureFor(r.body,definitions);for(const side of ['a','b'])lastData[side].filters=canonical(r.body[side].filters);if(mode==='threshold-true'||mode==='threshold-false'){Object.assign(lastData.rows[1].test,{pValue:mode==='threshold-true'?.0496:.05,displayP:'0.050',significant:mode==='threshold-true'});}if(mode==='text'){lastData.meta.statisticalDisclosure='<img src=x onerror=alert(1)>';lastData.rows[1].test.policyVersion='<script>bad()</script>';}if(mode==='degenerate'){for(const side of ['a','b'])Object.assign(lastData.rows[1][side],{q1:0,median:0,q3:0,iqr:0});lastData.rows[1].difference=0;lastData.rows[1].test={...lastData.rows[1].test,method:null,status:'DEGENERATE',pValue:null,displayP:'—',significant:null,reason:'ZERO_RANK_VARIANCE',warnings:[]};}if(faults.has(mode))faults.get(mode)(lastData);return fulfill(route,lastData);}
  return fulfill(route,U);
 });
 try{
  await page.goto(o.origin+'/ai-cohort.html?ids=1,2,3,4,5,6,7,8');await o.auth.verify(page);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');
  await page.locator('#compare-current-a').click();await setCurrent(page,before.b.filters);await page.locator('#compare-current-b').click();await page.locator('#compare-start').click();await expect(page.locator('#compare-state')).toHaveAttribute('data-state','success');await assertResult(page,lastData);
  await expect(page.locator('#compare-rows > tr')).toHaveCount(12);
  // 当前表原有横向滚动；同源几何验完整最右列可到达，不把截图截断当作丢列。
  await page.setViewportSize({width:390,height:844});await expect(page.locator('#compare-scroll-hint')).toContainText('横向滚动');const scroll=page.locator('#compare-table-scroll');await scroll.focus();await expect(scroll).toBeFocused();const geometry=await scroll.evaluate(wrap=>{wrap.scrollLeft=wrap.scrollWidth;const box=wrap.getBoundingClientRect(),last=wrap.querySelector('th:last-child').getBoundingClientRect();return {client:wrap.clientWidth,scroll:wrap.scrollWidth,left:wrap.scrollLeft,right:last.right,viewportRight:box.right};});expect(geometry.scroll).toBeGreaterThan(geometry.client);expect(geometry.left).toBeGreaterThan(0);expect(geometry.right).toBeLessThanOrEqual(geometry.viewportRight+1);await expect(page.locator('#compare-table th').last()).toHaveText('整体检验');await page.setViewportSize({width:1440,height:1000});

  expect(await page.locator('#compare-rows > tr').evaluateAll(rows=>rows.map(row=>row.dataset.metric))).toEqual(['n','age','duration','das28At','crpAt','haqAt','female','sero','target','complete','activity','line']);
  const checkRows=async()=>{
  for(const row of lastData.rows){
   const element=page.locator(`#compare-rows > tr[data-metric="${row.metric}"]`);await expect(element).toHaveAttribute('data-kind',row.kind);
   for(const side of ['a','b']){
    const cell=element.locator(`[data-side="${side}"]`);
    for(const [key,value] of Object.entries(row[side]))if(key!=='groups')await expect(cell).toContainText(`${expectedLabels[key]}：${key==='status'?expectedCodes[value]:value===null?'缺失':value}`);else for(const group of value)await expect(cell).toContainText(`${expectedCodes[group.category]||group.category}：${group.count} 人 · 比例 ${group.value}`);
    if(row.kind!=='COUNT'){const coverage=lastData.meta.sourceDateCoverage[side][row.metric],panel=cell.locator('.comparison-coverage');await expect(panel).toContainText('来源覆盖');for(const [key,value] of Object.entries(coverage))await expect(panel).toContainText(`${expectedLabels[key]}：${key==='status'?(value==='PARTIAL'?'部分来源日期缺失':expectedCodes[value]):value===null?'未提供':value}`);}
    await expect(cell).not.toContainText(/validN=|unknownN=|denominator=|NO_DATA|sourceDateCoverage/);
   }
   await expect(element.locator('[data-difference]')).toContainText(row.difference===null?'不适用':String(row.difference));
   const test=element.locator('[data-test]');if(row.test){
    const t=row.test;for(const text of [t.method===null?'未进行检验':expectedCodes[t.method],expectedCodes[t.status],`P ${t.displayP}`,t.significant===true?'显著':t.significant===false?'未显著':'显著性不可评估',t.reason===null?'无额外限制':expectedCodes[t.reason],`A组有效 ${t.nA} / B组有效 ${t.nB}`,expectedCodes[t.testDenominator],`提示：${t.warnings.length?t.warnings.map(value=>expectedCodes[value]).join('、'):'无'}`])await expect(test).toContainText(text);
    await expect(test).not.toContainText(t.policyVersion);if(row.kind!=='CONTINUOUS'){await expect(test).toContainText(`期望频数低于5的单元数 ${t.expectedBelow5Cells??'不适用'}`);await expect(test).toContainText(`单元总数 ${t.expectedCellCount??'不适用'}`);}
   }else await expect(test).toHaveText('不适用');
  }
  };await checkRows();
  const compare=async()=>{await page.locator('#compare-start').click();await expect(page.locator('#compare-state')).toHaveAttribute('data-state',faults.has(mode)?'error':'success');};
  await page.locator('#compare-exclude').check();await compare();await checkRows();
  for(const scenario of ['threshold-true','threshold-false','degenerate','text']){mode=scenario;await compare();await checkRows();await expect(page.locator('[data-metric=age] .stat-significant')).toHaveCount(scenario==='threshold-true'||scenario==='text'?1:0);if(scenario==='text'){await expect(page.locator('#compare-result img,#compare-result script')).toHaveCount(0);await expect(page.locator('#compare-policy')).toContainText('<img src=x onerror=alert(1)>');}}
  mode='boundary';await page.locator('#compare-exclude').uncheck();await setCurrent(page,unknownBoundary.a.filters);await page.locator('#compare-current-a').click();await setCurrent(page,unknownBoundary.b.filters);await page.locator('#compare-current-b').click();await compare();await checkRows();await expect(page.locator('[data-metric=female] [data-side=a]')).toContainText('分母人数：7');await expect(page.locator('[data-metric=female] [data-side=b]')).toContainText('分母人数：8');await expect(page.locator('[data-metric=line] [data-side=b]')).toContainText('未知人数：2');
  mode='zero';await setCurrent(page,{...before.a.filters,ids:[]});await page.locator('#compare-current-a').click();await page.locator('#compare-current-b').click();await compare();await checkRows();await expect(page.locator('[data-metric=age] [data-side=a]')).toContainText('中位数：缺失');await expect(page.locator('[data-metric=female] [data-side=a]')).toContainText('记录值：0');
  await setCurrent(page,before.a.filters);await page.locator('#compare-current-a').click();await setCurrent(page,before.b.filters);await page.locator('#compare-current-b').click();await page.locator('#compare-exclude').check();
  for(const fault of faults.keys()){mode=fault;await compare();await noResult(page);await expect(page.locator('#compare-rows > tr')).toHaveCount(0);await expect(page.locator('#compare-state')).toContainText('返回的数据不完整或无法识别，请重新读取');}
  expect(o.pageErrors).toEqual([]);
 }finally{await o.save();}
});

test('cohort:comparison-retained',async({page,context,browser})=>{
 const definitions=new Map([[definition.cohortId,clone(definition)]]),holds=[],queue=[],resources=new Map();let serial=500,readSerial=0,mode='ok';
 await inertComparisonAbort(context);await page.clock.install();
 const o=await setup({page,context,browser},'cohort:comparison-retained',async(route,r)=>{
  const path=new URL(r.url).pathname;
  if(path.endsWith('/list'))return fulfill(route,{items:Array.from(definitions.values()).map(clone),total:definitions.size,page:r.body.page,size:20,meta:{traceId:'trace-comparison'}});
  if(path.endsWith('/delete')){definitions.delete(r.body.cohortId);return fulfill(route,{cohortId:r.body.cohortId,version:r.body.version+1,meta:{traceId:'trace-comparison'}});}
  if(path.endsWith('/ai/compare')){const data=fixtureFor(r.body,definitions,`00000000-0000-0000-0000-${String(serial++).padStart(12,'0')}`);resources.set(data.compareResultId,clone(data));return fulfill(route,data);}
  if(path.endsWith('/ai/compareResult')){
   expect(Object.keys(r.body)).toEqual(['compareResultId']);const data=clone(resources.get(r.body.compareResultId));Object.assign(data.meta,{traceId:'trace-read-'+(++readSerial),comparisonTraceId:'trace-comparison'});
   const h=queue.shift();if(h){h.data=data;h.received.resolve(r);await h.release.promise;return route.fulfill({status:200,contentType:'application/json',headers:{'X-Trace-Id':data.meta.traceId},body:JSON.stringify({success:true,code:'200',data})});}
   if(Array.isArray(mode))return fulfill(route,null,mode[0],mode[1]);if(mode==='network')return route.abort('failed');if(mode==='nonjson')return route.fulfill({status:200,contentType:'text/html',body:'bad'});
   if(mode==='id')data.compareResultId='00000000-0000-0000-0000-000000009999';if(mode==='value')data.rows[1].a.median=999;if(mode==='trace')data.meta.comparisonTraceId='wrong';if(mode==='shape')data.rows[3].test=[];
   return route.fulfill({status:200,contentType:'application/json',headers:{'X-Trace-Id':data.meta.traceId},body:JSON.stringify({success:mode!=='success',code:'200',data})});
  }
  return fulfill(route,U);
 });
 const calls=suffix=>o.requests.filter(r=>r.url.endsWith(suffix));
 const snapshot=()=>page.evaluate(()=>({comparison:document.querySelector('#comparison').innerHTML,resource:window.RACohortComparison.getResource(),analysis:document.querySelector('#results').innerHTML}));
 const fresh=async(saved=false)=>{
  mode='ok';await page.goto(o.origin+'/ai-cohort.html?ids=1,2,3,4,5,6,7,8');await o.auth.verify(page);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');await page.locator('#compare-current-a').click();
  if(saved){definitions.set(definition.cohortId,clone(definition));await page.locator('#private-list-load').click();await expect(sideButton(page,'b',definition.cohortId)).toBeVisible();await sideButton(page,'b',definition.cohortId).click();}
  else{await setCurrent(page,before.b.filters);await page.locator('#compare-current-b').click();}
  await page.locator('#compare-start').click();await expect(page.locator('#compare-state')).toHaveAttribute('data-state','success');return page.evaluate(()=>window.RACohortComparison.getResource());
 };
 const arm=()=>{const h={received:gate(),release:gate(),data:null};holds.push(h);queue.push(h);return h;};
 const start=async()=>{const h=arm();await page.locator('#compare-read').click();await h.received.promise;await noResult(page);await expect(page.locator('#compare-cancel')).toBeVisible();return h;};
 const release=async h=>{h.release.resolve();await expect.poll(()=>page.evaluate(id=>window.__comparisonReads.some(read=>read.value?.data?.compareResultId===id&&read.url.endsWith('/compareResult')),h.data.compareResultId),{timeout:5000}).toBe(true);};
 try{
  const original=await fresh();const initialCalls={compare:calls('/ai/compare').length,cohort:calls('/ai/cohort').length,open:calls('/cohort/open').length};
  for(let n=0;n<2;n++){await page.locator('#compare-read').click();await expect(page.locator('#compare-state')).toHaveAttribute('data-state','success');const resource=await page.evaluate(()=>window.RACohortComparison.getResource());expect(resource.compareResultId).toBe(original.compareResultId);expect(resource.meta.comparisonTraceId).toBe(original.meta.traceId);expect(resource.meta.traceId).toBe('trace-read-'+(n+1));const expected=clone(original);Object.assign(expected.meta,{traceId:resource.meta.traceId,comparisonTraceId:original.meta.traceId});expect(resource).toEqual(expected);for(const field of ['readStartedAt','readCompletedAt','computedAt','expiresAt'])expect(resource.meta[field]).toBe(original.meta[field]);await expect(page.locator('#compare-policy')).not.toContainText(original.meta.traceId);await expect(page.locator('#compare-state')).toHaveText('已重新读取原结果，数值和有效期保持不变');}
  expect({compare:calls('/ai/compare').length,cohort:calls('/ai/cohort').length,open:calls('/cohort/open').length}).toEqual(initialCalls);expect(calls('/ai/compareResult')).toHaveLength(2);
  for(const fault of [[404,'RESOURCE_NOT_FOUND'],[410,'COMPARE_EXPIRED'],[409,'SCOPE_CHANGED'],[503,'SERVICE_UNAVAILABLE'],'shape','id','value','trace','network','nonjson','success']){const saved=await fresh();mode=fault;const count=calls('/ai/compare').length;await page.locator('#compare-read').click();await expect(page.locator('#compare-state')).toHaveAttribute('data-state','error');await noResult(page);await expect(page.locator('#compare-rows > tr')).toHaveCount(0);await expect(page.locator('#compare-read')).toBeHidden();expect(calls('/ai/compare').length).toBe(count);expect(calls('/ai/compareResult').at(-1).body).toEqual({compareResultId:saved.compareResultId});}
  // 真删除只撤未来来源槽；已发read仍用原资源且同一id成功。
  const saved=await fresh(true),pending=await start();await page.locator(`[data-delete-cohort="${definition.cohortId}"]`).click();await page.locator('#private-command-confirm').click();await expect(page.locator('#private-command-state')).toHaveAttribute('data-state','success');await expect(page.locator('#compare-source-b')).toContainText('尚未选择');await expect(page.locator('#compare-cancel')).toBeVisible();pending.release.resolve();await expect(page.locator('#compare-state')).toHaveAttribute('data-state','success');const read=await page.evaluate(()=>window.RACohortComparison.getResource());expect(read.compareResultId).toBe(saved.compareResultId);expect(read.b).toEqual(saved.b);await page.locator('#compare-read').click();await expect(page.locator('#compare-state')).toHaveAttribute('data-state','success');await page.locator('#compare-current-b').click();await noResult(page);
  // 持旧read A，显式新compare B先成功；实际A读完仍零覆盖。
  await fresh();const old=await start();await page.locator('#compare-exclude').check();await page.locator('#compare-start').click();await expect(page.locator('#compare-state')).toHaveAttribute('data-state','success');const newResult=await snapshot();expect(newResult.resource.compareResultId).not.toBe(old.data.compareResultId);await release(old);expect(await snapshot()).toEqual(newResult);
  for(const terminal of ['cancel','timeout','pagehide','identity']){await fresh();const h=await start();const count=calls('/ai/compare').length;if(terminal==='cancel')await page.locator('#compare-cancel').click();else if(terminal==='timeout')await page.clock.runFor(30001);else if(terminal==='pagehide')await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));else await page.evaluate(()=>{sessionStorage.setItem('ra-auth',JSON.stringify({name:'另一身份',role:'研究者',expires:0}));window.dispatchEvent(new Event('focus'));});await noResult(page);await expect(page.locator('#compare-cancel')).toBeHidden();const settled=await snapshot();await release(h);expect(await snapshot()).toEqual(settled);await page.clock.runFor(30001);expect(await snapshot()).toEqual(settled);expect(calls('/ai/compare').length).toBe(count);}
  await fresh(true);mode=[401,'UNAUTHENTICATED'];await page.locator('#compare-read').click();await expect(page.locator('#compare-state')).toContainText('登录已失效，请重新登录');await noResult(page);await expect(page.locator('#private-items > *')).toHaveCount(0);await expect(page.locator('#compare-source-a')).toContainText('尚未选择');await expect(page.locator('#results')).not.toHaveAttribute('data-analysis-id');expect(o.pageErrors).toEqual([]);
 }finally{for(const h of holds)h.release.resolve();await o.save();}
});
