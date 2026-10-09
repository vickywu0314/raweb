/* 条件→保留cohort→原签名分页；仅有效本代可发布，后段能力尚未接入。 */
"use strict";
shell('ai');
const SELECTS = {sex:'#f-sex',age:'#f-age',sero:'#f-sero',tx:'#f-tx',at:'#f-at',act:'#f-act',cm:'#f-cm',data:'#f-data'};
let flight = null, pageFlight = null, resource = null, disposed = false, blockedEntry = false, entryIds = null, generation = 0;
let identity=identityKey();
function identityKey(){return JSON.stringify(currentUser());}
function waiting(){ $('#cancel-analysis').hidden=!(flight||pageFlight); }
function invalidate(error=null) {
  generation++;const previous=[flight,pageFlight];flight=null;pageFlight=null;
  for(const operation of previous)if(operation){if(!operation.terminal)operation.terminal=error?.code||'SUPERSEDED';clearTimeout(operation.timer);}
  clearResults();waiting();lockControls();
  for(const operation of previous)if(operation)operation.controller.abort();
  if(error)showError(error);
}
function checkIdentity(){
  const current=identityKey();if(current===identity)return false;
  identity=current;invalidate({status:401,code:'UNAUTHENTICATED',message:'登录身份已变化，请重新登录后显式分析'});return true;
}
function isCurrent(operation,kind) {
  return !disposed && !operation.terminal && generation===operation.generation && (kind==='cohort'?flight===operation:pageFlight===operation&&resource===operation.resource&&resource.analysisId===operation.analysisId&&resource.cursor===operation.cursor&&!resource.consumed.has(operation.cursor));
}
function endOperation(operation,kind,cause) {
  if(!operation.terminal)operation.terminal=cause;
  if(kind==='cohort'&&flight===operation)flight=null;
  if(kind==='page'&&pageFlight===operation)pageFlight=null;
  clearTimeout(operation.timer);waiting();lockControls();
}
function restoreEntry() {
  try {
    const filters=window.RACohortConditions.decode(location.search);entryIds=filters.ids;blockedEntry=false;
    for(const [key,selector] of Object.entries(SELECTS)) {
      const select=$(selector);
      if(key==='age'&&filters.age&&!Array.from(select.options||[]).some(option=>option.value===filters.age)) {
        const option=document.createElement('option');option.value=filters.age;option.textContent=filters.age+' 岁';select.append(option);
      }
      select.value=filters[key];
    }
    history.replaceState(null,'',location.pathname+window.RACohortConditions.encode(filters)+location.hash);
  }catch(error){blockedEntry=error;}
}
restoreEntry();
function currentFilters() {
  return {studyCode:'RA', ...Object.fromEntries(Object.entries(SELECTS).map(([key,selector])=>[key,$(selector).value])), ...(entryIds === null ? {} : {ids:[...entryIds]})};
}
function lockControls() {
  // 条件可在旧请求等待时开始新一代分析。
  for(const selector of [...Object.values(SELECTS),'#reset','#question','#question-form button[type="submit"]'])$(selector).disabled=false;
  $('#chips').querySelectorAll('button').forEach(button=>button.disabled=false);
}
function metricDetail(meta) {
  if(!meta)return '—';
  const sample=Object.hasOwn(meta,'validN')?`有效 ${meta.validN}`:`${meta.numerator}/${meta.denominator}`;
  return `${meta.status==='NO_DATA'?'无数据 · ':''}${meta.status} · ${sample} · 未知 ${meta.unknownN}`;
}
function renderCards(data) {
  const m=data.metricMeta||{},stats=data.stats||{};
  for(const [id,key] of [['age-median','ageMedian'],['duration-median','durationMedian'],['target-rate','targetRate'],['complete-rate','completeRate']])$('#'+id).textContent=m[key]?.displayText??'—';
  for(const [id,key] of [['age-detail','ageMedian'],['duration-detail','durationMedian'],['target-detail','targetRate'],['complete-detail','completeRate']])$('#'+id).textContent=metricDetail(m[key]);
  $('#cohort-detail').textContent=`${m.cohortRate?.displayText??'—'} · ${metricDetail(m.cohortRate)}`;
  $('#female-detail').textContent=`女性 ${m.femaleRate?.displayText??'—'} · ${metricDetail(m.femaleRate)}`;
  $('#sero-detail').textContent=`血清阳性 ${m.seroRate?.displayText??'—'} · ${metricDetail(m.seroRate)}`;
  $('#qc-detail').textContent=`待补全 ${stats.incompleteCount??'—'} · QC未知 ${stats.qcUnknownN??'—'}`;
}
function textNode(tag,text,className) {
  const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;
}
function renderBuckets(selector,rows,key) {
  const container=$(selector);container.replaceChildren();
  for(const row of rows||[]) {
    const node=textNode('div',`${row.label??row[key]} · ${row.count??row.targetN} · ${row.displayText} · ${row.status}`,'statistics-bucket');
    node.dataset[key]=String(row[key]);node.dataset.count=String(row.count??row.targetN);node.dataset.display=row.displayText;node.dataset.status=row.status;
    if(key==='tx')node.append(textNode('small',`成员 ${row.n} · 有效 ${row.evalN} · 达标 ${row.targetN}`));
    const value=key==='tx'?row.rate:row.value;
    if(typeof value==='number'&&Number.isFinite(value))node.style.setProperty('--share',`${value*100}%`);
    container.append(node);
  }
}
function testText(test) {
  if(!test)return '—';
  return `${test.method??'—'} · ${test.status} · P ${test.displayP} · ${test.significant===true?'显著':test.significant===false?'未显著':'显著性不可评估'} · ${test.reason??''} · nA ${test.nA??'—'}/nB ${test.nB??'—'} · ${test.testDenominator} · warnings ${JSON.stringify(test.warnings??[])}`;
}
function renderPanels(data) {
  const activity=data.activity||{},byTx=data.byTx||{},lines=data.lines||{},fm=data.fm||{},meta=data.meta||{};
  renderBuckets('#activity-base',activity.base,'level');renderBuckets('#activity-current',activity.current,'level');
  $('#activity-summary').textContent=`基线有效 ${activity.baseN??'—'} · 未知 ${activity.baseUnknownN??'—'}；${meta.at??'—'} · 有效 ${activity.evalN??'—'} · 未知 ${activity.unknownN??'—'}`;
  renderBuckets('#tx-groups',byTx.groups,'tx');$('#tx-summary').textContent=`治疗未知/冲突 ${byTx.unknownTxN??'—'} · 当前无治疗 ${byTx.noCurrentTxN??'—'}`;
  $('#study-target').textContent=`研究库基准 ${byTx.studyTargetMeta?.displayText??'—'} · ${metricDetail(byTx.studyTargetMeta)}`;
  $('#tx-test').textContent=`${testText(byTx.test)} · 纳入组 ${JSON.stringify(byTx.test?.includedGroups??[])} · 排除组 ${JSON.stringify(byTx.test?.excludedGroups??[])} · 检验有效人数 ${JSON.stringify(byTx.test?.groupNs??[])}`;
  $('#tx-notice').textContent=byTx.comparisonNotice??'—';
  renderBuckets('#line-groups',lines.groups,'line');$('#line-summary').textContent=`线数未知 ${lines.unknownLineN??'—'} · 分母 ${data.n}`;
  $('#fm-summary').textContent=`FM ${fm.nFM??'—'} · 非FM ${fm.nOther??'—'} · 未知 ${fm.unknownN??'—'} · ${fm.status??'—'} · ${fm.reason??''}`;
  $('#fm-note').textContent=(fm.rows?.length?'':`样本不足 · ${fm.reason??'—'}`)+'；疼痛尺度未核实，pain缺失，不能由raw推算。';
  $('#fm-rows').replaceChildren();$('#fm-table').hidden=!fm.rows?.length;
  for(const row of fm.rows||[]) {
    const tr=document.createElement('tr');tr.dataset.metric=row.metric;
    tr.append(textNode('td',row.metric),textNode('td',row.displayFM),textNode('td',row.displayOther));
    tr.append(textNode('td',row.displayDifference,row.highlight===true?'difference highlight':'difference'));
    const detail=textNode('td',`${row.status} · ${row.reason??''} · 有效 ${row.nFMValid}/${row.nOtherValid} · ${testText(row.test)}`);
    if(row.test?.significant===true)detail.append(textNode('strong','显著','significant'));
    tr.append(detail);$('#fm-rows').append(tr);
  }
  const policy=[];for(const key of ['at','asOfDate','readStartedAt','readCompletedAt','computedAt'])policy.push(`${key}：${meta[key]??'—'}`);
  for(const [key,value] of Object.entries(meta.policyVersions||{}))policy.push(`${key}：${value}`);
  policy.push(meta.statisticalDisclosure??'—');$('#analysis-policy').textContent='开发政策，尚未医学批准。'+policy.join('；');$('#analysis-policy').hidden=false;
  $('#clinical-panels').hidden=false;
}

function clearResults() {
  $('#cohort-n').textContent = '—'; $('#study-total').textContent = '—';
  for(const id of ['age-median','duration-median','target-rate','complete-rate','cohort-detail','age-detail','female-detail','duration-detail','sero-detail','target-detail','complete-detail','qc-detail'])$('#'+id).textContent='—';
  $('#patient-rows').replaceChildren(); $('#list-count').textContent = '';
  $('#numeric-computed-at').textContent='';$('#display-read-at').textContent='';
  for(const selector of ['#activity-base','#activity-current','#tx-groups','#line-groups','#fm-rows'])$(selector).replaceChildren();
  for(const id of ['activity-summary','tx-summary','study-target','tx-test','tx-notice','line-summary','fm-summary','fm-note','analysis-policy'])$('#'+id).textContent='';
  $('#clinical-panels').hidden=true;$('#analysis-policy').hidden=true;
  $('#results').hidden = true; $('#no-result').hidden = true; $('#analysis-error').hidden = true;
  $('#login-return').hidden = true; $('#more').hidden = true; $('#more').disabled=true;
  resource=null;delete $('#results').dataset.analysisId;
}
function state(name, message) {
  $('#cohort-state').dataset.state = name; $('#cohort-state').textContent = message;
}
function renderChips() {
  const active = Object.entries(SELECTS).filter(([key,selector])=>$(selector).value && !(key==='at'&&$(selector).value==='now'));
  const idsChip=entryIds===null?'':`<span class="cond-chip">指定 ${entryIds.length} 个患者 ID<button type="button" data-key="ids" aria-label="移除患者 ID 条件">×</button></span>`;
  $('#chips').innerHTML = (active.length ? active.map(([key,selector])=>{
    const label=$(selector).selectedOptions[0].textContent;
    return `<span class="cond-chip">${escapeHTML(label)}<button type="button" data-key="${key}" aria-label="移除条件 ${escapeHTML(label)}">×</button></span>`;
  }).join('') : (idsChip?'':'<span class="cond-empty">未设置条件 · 将分析当前授权 RA 研究库</span>'))+idsChip;
}
function showError(error) {
  const resourceState=error.status===410?'expired':error.status===409&&error.code==='SCOPE_CHANGED'?'scope-changed':'error';
  state(resourceState,resourceState==='expired'?'分析结果已过期，请显式重新分析':resourceState==='scope-changed'?'授权范围已变化，请显式重新分析':error.status===404?'分析资源不存在，请显式重新分析':'分析失败，请确认条件后重新分析');
  $('#analysis-error').hidden = false;
  $('#error-message').textContent = `${error.status ? `HTTP ${error.status} · ` : ''}${error.code || 'REQUEST_FAILED'}：${error.message || '请求失败'}`;
  $('#error-trace').textContent = error.traceId ? `Trace：${error.traceId}` : '';
  if (error.status === 401) {
    $('#login-return').hidden = false;
    $('#login-return').href = 'login.html?next=' + encodeURIComponent('ai-cohort.html');
  }
}
function validPatients(patients,total,loaded,max) {
  return patients && patients.total===total && Number.isInteger(patients.returnedCount) && Array.isArray(patients.items) && patients.returnedCount===patients.items.length && patients.items.length===Math.min(total-loaded,max) && patients.items.every(patient=>validClinicalPatient(patient)&&typeof patient.patientId==='string'&&/^[1-9][0-9]*$/.test(patient.patientId)) && new Set(patients.items.map(patient=>patient.patientId)).size===patients.items.length && typeof patients.hasMore==='boolean' && patients.hasMore===(loaded+patients.items.length<total) && (patients.hasMore?typeof patients.nextCursor==='string'&&patients.nextCursor.length>0:patients.nextCursor===null);
}
// 只守护当前卡图可消费的结构；不复算医学数值或跨字段关系。
function validProjection(data) {
  const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const rows=value=>Array.isArray(value)&&value.every(record);
  const count=value=>Number.isInteger(value)&&value>=0;
  const metric=(value,median=false)=>record(value)&&typeof value.displayText==='string'&&typeof value.status==='string'&&count(value.unknownN)&&(median?count(value.validN):count(value.numerator)&&count(value.denominator));
  return [data.stats,data.metricMeta,data.activity,data.byTx,data.lines,data.fm,data.meta].every(record)
    && ['ageMedian','durationMedian'].every(key=>metric(data.metricMeta[key],true))
    && ['cohortRate','femaleRate','seroRate','targetRate','completeRate'].every(key=>metric(data.metricMeta[key]))
    && count(data.stats.incompleteCount)&&count(data.stats.qcUnknownN)
    && rows(data.activity.base)&&rows(data.activity.current)&&rows(data.byTx.groups)&&rows(data.lines.groups)&&rows(data.fm.rows)
    && metric(data.byTx.studyTargetMeta)&&record(data.byTx.test)&&record(data.meta.policyVersions);
}
function clinicalText(value,missing='未记录') {
  return value===null||value===undefined?missing:['string','number','boolean'].includes(typeof value)?String(value):missing;
}
function crpText(label,value) {
  return `${label} CRP ${clinicalText(value.value)} ${clinicalText(value.unit)} · 访视 ${clinicalText(value.sourceVisitId)} · ${clinicalText(value.sourceField)} · ${clinicalText(value.observedAt)} · missingReason：${clinicalText(value.missingReason,'未提供')} · quality：${sourceText(value.quality)}`;
}
// 只守护本行reader的容器；合法null/UNKNOWN及空数组不构成坏响应。
function validClinicalPatient(patient) {
  const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const list=value=>Array.isArray(value);
  const facts=value=>record(value)&&list(value.quality);
  const rows=value=>list(value)&&value.every(record);
  if(!record(patient)||![patient.clinical,patient.evaluation,patient.selection,patient.treatment,patient.qc,patient.clinicalProvenance].every(record))return false;
  return ['tjc','sjc','gh','haq','crp','pain'].every(key=>facts(patient.evaluation[key]))
    && [patient.baselineProvenance,patient.scoreProvenance,patient.crpAt,patient.crpCurrent,patient.treatment.provenance].every(facts)
    && ['sex','age','diseaseDurationYears','sero','fm','as'].every(key=>facts(patient.clinicalProvenance[key]))
    && ['sero','fm','as'].every(key=>rows(patient.clinicalProvenance[key].observations))
    && list(patient.selection.quality)&&list(patient.treatment.genericDrugIds)&&list(patient.qc.missingCodes)
    && (!Object.hasOwn(patient.treatment.provenance,'drugFacts')||rows(patient.treatment.provenance.drugFacts));
}
function sourceText(value) {
  return Array.isArray(value)?(value.length?value.map(item=>clinicalText(item,'未提供')).join('、'):'[]'):clinicalText(value,'未提供');
}
function sourceBlock(label,value,keys,className) {
  const block=textNode('div','',className);block.append(textNode('strong',label));
  for(const key of keys)block.append(textNode('span',`${key}：${sourceText(value[key])}`));
  return block;
}
function patientSources(patient) {
  const details=document.createElement('details');details.className='patient-provenance';details.append(textNode('summary','临床来源与质量'));
  const body=textNode('div','','patient-sources');
  const measureKeys=['value','unit','sourceVisitId','sourceField','observedAt','quality','missingReason'];
  for(const key of ['tjc','sjc','gh','haq','crp','pain']) {
    const block=sourceBlock(`evaluation ${key}`,patient.evaluation[key],measureKeys,'patient-evaluation');block.dataset.evaluation=key;body.append(block);
  }
  body.append(sourceBlock('selection',patient.selection,['at','episodeKey','baselineVisitId','baselineDate','evalVisitId','evalDate','nowVisitId','nowDate','target6mDate','eligible6m','quality','missingReason','deltaMissingReason'],'patient-selection'));
  const scoreKeys=['source','sourceVisitId','sourceField','observedAt','quality','missingReason'];
  body.append(sourceBlock('baselineProvenance',patient.baselineProvenance,scoreKeys,'patient-baseline-source'));
  body.append(sourceBlock('scoreProvenance',patient.scoreProvenance,scoreKeys,'patient-score-source'));
  for(const key of ['sex','age','diseaseDurationYears','sero','fm','as']) {
    const value=patient.clinicalProvenance[key],block=sourceBlock(`clinicalProvenance ${key}`,value,scoreKeys,'patient-clinical-source');block.dataset.clinicalSource=key;
    // 只读已知来源字段，绝不输出raw/病例或临床身份原值。
    const keys=key==='sero'?['sourceVisitId','sourceField','observedAt','status']:['sourceRowId','sinceYear'];
    if(['sero','fm','as'].includes(key))for(const observation of value.observations)block.append(sourceBlock('observation',observation,keys,'patient-observation'));
    body.append(block);
  }
  const treatment=patient.treatment.provenance,block=sourceBlock('treatment.provenance',treatment,['visitId','field','observedAt','quality','missingReason','dictionaryVersion'],'patient-treatment-source');
  for(const fact of treatment.drugFacts||[])block.append(sourceBlock('drugFact',fact,['genericDrugId','startTime','endTime','visitId','field','observedAt'],'patient-drug-source'));
  body.append(block);body.append(sourceBlock('qc',patient.qc,['status','missingCodes','ruleVersion'],'patient-qc'));
  details.append(body);return details;
}
function renderPatientTimes(meta) {
  $('#numeric-computed-at').textContent=`数值计算时间：${clinicalText(meta.computedAt,'未提供')}`;
  $('#display-read-at').textContent=`名单显示字段读取时间：${clinicalText(meta.readCompletedAt,'未提供')}`;
}
function appendPatients(items) {
  for (const patient of items) {
    const row=document.createElement('div');row.className='ai-row';row.dataset.patientId=patient.patientId;row.setAttribute('role','listitem');
    const c=patient.clinical,t=patient.treatment;
    const personal=textNode('div','', 'patient-clinical');
    for(const value of [patient.name??'未记录姓名',patient.studyNo??'未记录研究号',patient.patientId])personal.append(textNode('span',value));
    personal.append(textNode('small',`${clinicalText(c.sex)} · 年龄 ${clinicalText(c.age)} · 病程年 ${clinicalText(c.diseaseDurationYears)} · 血清 ${clinicalText(c.sero)}`));row.append(personal);
    row.append(textNode('div',`${clinicalText(t.state)} · ${clinicalText(t.category)} · 线数 ${clinicalText(t.line)} · 靶向药史 ${clinicalText(t.targetedDrugHistoryN)} · 药物 ID ${t.genericDrugIds.length?t.genericDrugIds.map(id=>clinicalText(id)).join('、'):'未记录'}`,'patient-treatment'));
    row.append(textNode('div',`方案月数 ${clinicalText(t.schemeDurationMonths)} · 显式起点 ${clinicalText(t.startDate)} · 估算起点 ${clinicalText(t.estimatedStartDate)} · ${clinicalText(t.startConfidence)} · 结束 ${clinicalText(t.endDate)}`,'patient-duration'));
    row.append(textNode('div',`DAS28-CRP 基线 ${clinicalText(patient.das28Base)} → 评估 ${clinicalText(patient.das28At)}；当前 ${clinicalText(patient.das28Current)}；差值 ${clinicalText(patient.deltaDas28)}`,'patient-das28'));
    const activity={remission:'缓解',low:'低',moderate:'中',high:'高'};
    row.append(textNode('div',`DAS28-CRP 活动 ${activity[patient.activity]??'未知'}`,'patient-activity'+(Object.hasOwn(activity,patient.activity)?' activity-'+patient.activity:'')));
    row.append(textNode('div',crpText('评估',patient.crpAt)+'；'+crpText('当前',patient.crpCurrent),'patient-crp'));
    row.append(textNode('div',`FM ${clinicalText(c.fm)} · AS ${clinicalText(c.as)}`,'patient-comorbidity'));
    row.append(patientSources(patient));$('#patient-rows').append(row);
  }
}
function renderPageRights() {
  $('#list-count').textContent=`${resource.n} 位患者 · 已显示 ${resource.loaded} 位`;
  $('#more').hidden=!resource.cursor;$('#more').disabled=Boolean(pageFlight);$('#more').textContent='加载更多患者';
}
function finish(operation, result, error) {
  if(!isCurrent(operation,'cohort'))return;
  if(operation.identity!==identityKey()){checkIdentity();return;}
  if(error){endOperation(operation,'cohort',error.code||'REQUEST_FAILED');showError(error);return;}
  const data = result.data;
  if (!data || !Number.isInteger(data.n) || !Number.isInteger(data.studyTotal) || data.n<0 || data.studyTotal<data.n || typeof data.analysisId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(data.analysisId) || !validPatients(data.patients,data.n,0,10) || !validProjection(data)) {
    endOperation(operation,'cohort','INVALID_RESPONSE');showError({status:result.status,code:'INVALID_RESPONSE',message:'队列响应不完整',traceId:result.traceId});return;
  }
  endOperation(operation,'cohort','SUCCESS');
  resource={generation,analysisId:data.analysisId,cursor:data.patients.nextCursor,n:data.n,loaded:data.patients.items.length,consumed:new Set()};
  $('#results').dataset.analysisId=data.analysisId;
  $('#cohort-n').textContent = String(data.n); $('#study-total').textContent = String(data.studyTotal);
  renderCards(data);
  if (data.n === 0) {
    state('empty','分析完成，当前条件下没有患者'); $('#no-result').hidden = false; return;
  }
  renderPanels(data);
  appendPatients(data.patients.items);renderPatientTimes(data.meta);renderPageRights();
  state('success','分析完成，人数与名单来自本次服务端结果'); $('#results').hidden = false;
}
function finishPage(operation,result,error) {
  if(!isCurrent(operation,'page'))return;
  if(operation.identity!==identityKey()){checkIdentity();return;}
  if(error){
    endOperation(operation,'page',error.code||'REQUEST_FAILED');
    if([400,401,404,410].includes(error.status)||error.code==='SCOPE_CHANGED'||error.code==='REQUEST_TIMEOUT'||error.code==='REQUEST_CANCELLED')invalidate(error);
    else{showError(error);$('#more').disabled=false;$('#more').textContent='重试加载患者';}
    return;
  }
  const data=result.data;
  const existing=new Set([...$('#patient-rows').children].map(row=>row.dataset.patientId));
  if(!data || data.analysisId!==operation.analysisId || !validPatients(data.patients,resource.n,resource.loaded,20) || data.patients.items.some(patient=>existing.has(patient.patientId)) || (data.patients.nextCursor!==null&&resource.consumed.has(data.patients.nextCursor)) || data.patients.nextCursor===operation.cursor){
    endOperation(operation,'page','INVALID_RESPONSE');clearResults();showError({status:result.status,code:'INVALID_RESPONSE',message:'分页响应不完整',traceId:result.traceId});return;
  }
  endOperation(operation,'page','SUCCESS');
  resource.consumed.add(operation.cursor);appendPatients(data.patients.items);resource.loaded+=data.patients.items.length;resource.cursor=data.patients.nextCursor;
  $('#display-read-at').textContent=`名单显示字段读取时间：${clinicalText(data.meta?.displayReadCompletedAt,'未提供')}`;
  $('#analysis-error').hidden=true;renderPageRights();state('success','分析完成，人数与名单来自本次服务端结果');
}
function loadMore() {
  if(disposed||checkIdentity()||flight||pageFlight||!resource?.cursor||resource.consumed.has(resource.cursor))return;
  const operation={controller:new AbortController(),timer:null,terminal:null,identity,generation,resource,analysisId:resource.analysisId,cursor:resource.cursor};
  pageFlight=operation;waiting();$('#more').disabled=true;state('loading','正在加载患者，请稍候');
  operation.timer=setTimeout(()=>{finishPage(operation,null,{code:'REQUEST_TIMEOUT',message:'请求超过30秒，请重新分析'});operation.controller.abort();},30000);
  window.RACohortAPI.cohortPatients(operation.analysisId,operation.cursor,{signal:operation.controller.signal}).then(result=>finishPage(operation,result),error=>finishPage(operation,null,error));
}
$('#more').addEventListener('click',loadMore);
function analyze() {
  if (disposed) return;
  invalidate();identity=identityKey();renderChips();
  if (blockedEntry) {
    showError(blockedEntry); return;
  }
  const filters = currentFilters();
  history.replaceState(null,'',location.pathname+window.RACohortConditions.encode({...filters,ids:entryIds})+location.hash);
  const operation = {controller:new AbortController(),timer:null,terminal:null,identity,generation};
  flight = operation;waiting();state('loading','正在分析，请稍候'); lockControls(true);
  operation.timer = setTimeout(()=>{
    finish(operation,null,{code:'REQUEST_TIMEOUT',message:'请求超过30秒，请重新分析'});
    operation.controller.abort();
  },30_000);
  window.RACohortAPI.cohort(filters,{signal:operation.controller.signal}).then(result=>finish(operation,result),error=>finish(operation,null,error));
}
Object.values(SELECTS).forEach(selector=>$(selector).addEventListener('change',analyze));
$('#chips').addEventListener('click',event=>{
  const button=event.target.closest('[data-key]'); if (!button || disposed) return;
  if(button.dataset.key==='ids')entryIds=null;
  else $(SELECTS[button.dataset.key]).value=button.dataset.key==='at'?'now':'';
  analyze();
});
$('#question-form').addEventListener('submit',event=>{
  event.preventDefault(); if (disposed) return;
  if ($('#question').value.trim()) {
    $('#parse-note').hidden=false; $('#parse-note').textContent='研究问题解析开发中，请使用下方条件筛选。'; return;
  }
  analyze();
});
$('#reset').addEventListener('click',()=>{
  if (disposed) return;
  Object.entries(SELECTS).forEach(([key,selector])=>$(selector).value=key==='at'?'now':'');
  $('#question').value=''; $('#parse-note').hidden=true; blockedEntry=false; entryIds=null;
  history.replaceState(null,'',location.pathname+location.hash); analyze();
});
$('#cancel-analysis').addEventListener('click',()=>{if(flight||pageFlight)invalidate({code:'REQUEST_CANCELLED',message:'请求已取消，请显式重新分析'});});
window.addEventListener('pagehide',()=>{disposed=true;invalidate({code:'REQUEST_CANCELLED',message:'已离开页面，请重新分析'});});
window.addEventListener('pageshow',event=>{if(event.persisted){disposed=false;invalidate();restoreEntry();analyze();}});
window.addEventListener('popstate',()=>{if(!disposed){invalidate();restoreEntry();analyze();}});
window.addEventListener('storage',event=>{if(event.key==='ra-auth')checkIdentity();});
window.addEventListener('focus',checkIdentity);
document.addEventListener('visibilitychange',checkIdentity);
analyze();
