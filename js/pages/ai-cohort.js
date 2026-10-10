/* 条件→保留cohort→原签名分页；仅有效本代可发布，后段能力尚未接入。 */
"use strict";
shell('ai');
const SELECTS = {sex:'#f-sex',age:'#f-age',sero:'#f-sero',tx:'#f-tx',at:'#f-at',act:'#f-act',cm:'#f-cm',data:'#f-data'};
let flight = null, pageFlight = null, resource = null, disposed = false, blockedEntry = false, entryIds = null, generation = 0;
let identity=identityKey();
function identityKey(){return JSON.stringify(currentUser());}
function waiting(){ $('#cancel-analysis').hidden=!(flight||pageFlight); }
function invalidate(error=null) {
  endComparison(error?.code||'ANALYSIS_CHANGED');comparisonState('idle','当前条件或分析已变化，请显式新比较');renderComparisonSources();
  generation++;const previous=[flight,pageFlight];flight=null;pageFlight=null;
  for(const operation of previous)if(operation){if(!operation.terminal)operation.terminal=error?.code||'SUPERSEDED';clearTimeout(operation.timer);}
  clearResults();waiting();lockControls();
  for(const operation of previous)if(operation)operation.controller.abort();
  if(error)showError(error);
}
function checkIdentity(){
  const current=identityKey();if(current===identity)return false;
  identity=current;clearPrivate();invalidate({status:401,code:'UNAUTHENTICATED',message:'登录身份已变化，请重新登录后显式分析'});return true;
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
  resource=null;delete $('#results').dataset.analysisId;$('#private-open-meta').textContent='';delete $('#private-open-meta').dataset.cohortId;
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
  if(error.status===401)clearPrivate();
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
  const outer=result.data,data=operation.cohortId?outer?.analysis:outer;
  const normalized=operation.cohortId&&validPrivateItem(outer?.cohort)&&outer.cohort.cohortId===operation.cohortId?privateFilters(outer.cohort.filters):null;
  if ((operation.cohortId&&(!normalized||!validPrivateMeta(outer,result.traceId))) || !data || !Number.isInteger(data.n) || !Number.isInteger(data.studyTotal) || data.n<0 || data.studyTotal<data.n || typeof data.analysisId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(data.analysisId) || !validPatients(data.patients,data.n,0,10) || !validProjection(data)) {
    endOperation(operation,'cohort','INVALID_RESPONSE');showError({status:result.status,code:'INVALID_RESPONSE',message:'队列响应不完整',traceId:result.traceId});return;
  }
  endOperation(operation,'cohort','SUCCESS');
  if(operation.cohortId){applyPrivateFilters(normalized);$('#private-open-meta').textContent=privateDeleted.has(outer.cohort.cohortId)?'该私有定义已删除；本次已开始的分析仍遵循原有效期和授权范围。':privateItemText(outer.cohort);$('#private-open-meta').dataset.cohortId=outer.cohort.cohortId;}
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
  checkIdentity();saveParametersChanged();invalidate();identity=identityKey();renderChips();
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
// 比较拥有独立operation/代次与保留资源，原分析owner不参与发布。
let comparisonSlots={a:null,b:null},comparisonResource=null,comparisonFlight=null,comparisonGeneration=0;
const COMPARISON_ROWS=[['n','COUNT'],['age','CONTINUOUS'],['duration','CONTINUOUS'],['das28At','CONTINUOUS'],['crpAt','CONTINUOUS'],['haqAt','CONTINUOUS'],['female','BINARY'],['sero','BINARY'],['target','BINARY'],['complete','BINARY'],['activity','DISTRIBUTION'],['line','DISTRIBUTION']];
const COMPARISON_POLICIES=['statistics','descriptive','qc','crp','now','clinical','serology','treatment','visitMatcher','drugDictionary','comparison'];
const comparisonClone=value=>JSON.parse(JSON.stringify(value));
function comparisonState(name,message){$('#compare-state').dataset.state=name;$('#compare-state').textContent=message;}
function clearComparisonResult(){comparisonResource=null;$('#compare-read').hidden=true;$('#compare-read').disabled=true;$('#compare-rows').replaceChildren();$('#compare-result').hidden=true;delete $('#compare-result').dataset.compareResultId;for(const id of ['compare-summary','compare-side-a','compare-side-b','compare-policy','compare-definition-note'])$('#'+id).textContent='';}
function endComparison(cause,clear=true){
 comparisonGeneration++;const old=comparisonFlight;
 if(old&&!old.terminal)old.terminal=cause;
 comparisonFlight=null;if(old)clearTimeout(old.timer);
 if(clear)clearComparisonResult();$('#compare-cancel').hidden=true;
 if(old)old.controller.abort();
}
function resetComparison(cause='IDENTITY_ENDED'){endComparison(cause);comparisonSlots={a:null,b:null};renderComparisonSources();comparisonState('idle','请选择 A/B 来源');}
function comparisonAt(slot){return slot?.source==='SAVED'?slot.item.filters.at:slot?.filters.at;}
function renderComparisonSources(){
 for(const side of ['a','b']){const slot=comparisonSlots[side];$('#compare-source-'+side).textContent=!slot?'尚未选择':slot.source==='FILTERS'?`已选条件 · ${JSON.stringify(slot.filters)}`:`已选私有定义 · source=SAVED · cohortId=${slot.cohortId} · ${privateItemText(slot.item)}`;}
 const mismatch=comparisonSlots.a&&comparisonSlots.b&&comparisonAt(comparisonSlots.a)!==comparisonAt(comparisonSlots.b);
 $('#compare-start').disabled=!comparisonSlots.a||!comparisonSlots.b||Boolean(mismatch);
 if(mismatch)comparisonState('error','INVALID_REQUEST：A/B评估时点 at 须相同，请显式重选来源');
}
function selectComparison(side,slot){
 if(disposed||checkIdentity()||blockedEntry)return;
 endComparison('SOURCE_CHANGED');comparisonSlots[side]=slot;comparisonState('idle','来源已选择，请显式比较');renderComparisonSources();
}
for(const side of ['a','b'])$('#compare-current-'+side).addEventListener('click',()=>selectComparison(side,{source:'FILTERS',filters:{...currentFilters(),ids:entryIds===null?null:[...entryIds]}}));
function selectSavedComparison(side,cohortId){const item=privateItems.get(cohortId);if(!item)return;selectComparison(side,{source:'SAVED',cohortId,item:comparisonClone(item)});}
function comparisonBody(){const side=slot=>slot.source==='SAVED'?{source:'SAVED',cohortId:slot.cohortId}:{source:'FILTERS',filters:comparisonClone(slot.filters)};return {a:side(comparisonSlots.a),b:side(comparisonSlots.b),excludeOverlap:$('#compare-exclude').checked};}
function normalizedComparisonFilters(filters){
 const normalized=privateFilters(filters);if(!normalized)return null;
 const result={studyCode:'RA'};for(const key of Object.keys(SELECTS))result[key]=normalized[key]||null;result.at=normalized.at;
 result.ids=normalized.ids===null?null:[...new Set(normalized.ids)].sort((a,b)=>a.length-b.length||a.localeCompare(b));
 if(result.age){const [min,max]=result.age.split('-');result.age=String(Number(min))+'-'+(max===''?'':String(Number(max)));}
 return result;
}
function sameComparisonFilters(a,b){const x=normalizedComparisonFilters(a),y=normalizedComparisonFilters(b);return x&&y&&JSON.stringify(x)===JSON.stringify(y);}
function validComparisonRow(row){
 const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value),count=value=>Number.isSafeInteger(value)&&value>=0,number=value=>typeof value==='number'&&Number.isFinite(value),nullable=value=>value===null||number(value);
 if(!nullable(row.difference))return false;
 for(const side of ['a','b']){
  const value=row[side];
  if(row.kind==='COUNT'){if(!count(value.n)||row.difference!==null||row.test!==null)return false;continue;}
  if(!['OK','NO_DATA'].includes(value.status))return false;
  if(row.kind==='CONTINUOUS'){if(!['validN','unknownN'].every(key=>count(value[key]))||!['q1','median','q3','iqr'].every(key=>nullable(value[key])))return false;}
  else if(row.kind==='BINARY'){if(!['numerator','denominator','knownN','unknownN'].every(key=>count(value[key]))||!number(value.value))return false;}
  else{
   const categories=row.metric==='activity'?['remission','low','moderate','high']:['1','2','3'];
   if(row.difference!==null||!['denominator','knownN','unknownN'].every(key=>count(value[key]))||!Array.isArray(value.groups)||value.groups.length!==categories.length||!value.groups.every((group,index)=>object(group)&&group.category===categories[index]&&count(group.count)&&number(group.value)))return false;
  }
 }
 if(row.kind==='COUNT')return true;
 const t=row.test;
 if(!['OK','OVERLAP','INSUFFICIENT_SAMPLE','DEGENERATE'].includes(t.status)||!count(t.nA)||!count(t.nB)||!nullable(t.pValue)||typeof t.displayP!=='string'||!t.displayP||!(t.significant===null||typeof t.significant==='boolean')||!(t.reason===null||['COHORTS_OVERLAP','VALID_N_LT_5','ZERO_RANK_VARIANCE','ZERO_MARGIN'].includes(t.reason))||!Array.isArray(t.warnings)||!t.warnings.every(value=>['SMALL_SAMPLE_TIES','SPARSE_EXPECTED_COUNTS'].includes(value))||typeof t.policyVersion!=='string'||!t.policyVersion)return false;
 const denominator=row.kind==='CONTINUOUS'?'NON_MISSING_METRIC':row.metric==='target'?'EVALUABLE_TARGET':row.metric==='activity'?'EVALUABLE_ACTIVITY':row.metric==='line'?'KNOWN_LINE':'KNOWN_CATEGORY';
 if(t.testDenominator!==denominator)return false;
 if(t.status==='OK'){if(!['FISHER_EXACT','CHI_SQUARE','MANN_WHITNEY_EXACT','MANN_WHITNEY_ASYMPTOTIC'].includes(t.method)||!number(t.pValue)||typeof t.significant!=='boolean')return false;}
 else if(t.method!==null||t.pValue!==null||t.significant!==null||t.displayP!=='—'||t.reason===null)return false;
 if(row.kind!=='CONTINUOUS'&&!['expectedBelow5Cells','expectedCellCount'].every(key=>t[key]===null||count(t[key])))return false;
 return true;
}

function validComparison(data,operation,trace){
 const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value),count=value=>Number.isSafeInteger(value)&&value>=0;
 const instant=value=>typeof value==='string'&&/Z$/.test(value)&&Number.isFinite(Date.parse(value));
 if(!object(data)||typeof data.compareResultId!=='string'||!PRIVATE_UUID.test(data.compareResultId)||!count(data.studyTotal)||!count(data.overlapN)||typeof data.excludeOverlap!=='boolean'||data.excludeOverlap!==operation.body.excludeOverlap||!Array.isArray(data.rows)||data.rows.length!==12||!object(data.meta))return false;
 for(const side of ['a','b']){
  const value=data[side],sent=operation.body[side];
  if(!object(value)||value.source!==sent.source||!normalizedComparisonFilters(value.filters)||!['nBeforeExclusion','n','evalN'].every(key=>count(value[key]))||value.n>value.nBeforeExclusion||value.nBeforeExclusion>data.studyTotal||value.evalN>value.n||data.overlapN>value.nBeforeExclusion||!['submittedUniqueIdsN','effectiveIdsN'].every(key=>value[key]===null||count(value[key])))return false;
  if(sent.source==='FILTERS'){
   if(value.cohortId!==null||value.cohortVersion!==null||!sameComparisonFilters(value.filters,sent.filters))return false;
  }else if(value.cohortId!==sent.cohortId||!Number.isInteger(value.cohortVersion)||value.cohortVersion<1)return false;
 }
 for(let i=0;i<COMPARISON_ROWS.length;i++){
  const row=data.rows[i],[metric,kind]=COMPARISON_ROWS[i];if(!object(row)||row.metric!==metric||row.kind!==kind||!object(row.a)||!object(row.b)||!Object.hasOwn(row,'difference')||(kind==='COUNT'?row.test!==null:!object(row.test))||!validComparisonRow(row))return false;
 }
 const meta=data.meta;
 if(meta.at!==data.a.filters.at||meta.at!==data.b.filters.at||meta.at!==operation.at||typeof meta.asOfDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(meta.asOfDate)||!['readStartedAt','readCompletedAt','computedAt','expiresAt'].every(key=>instant(meta[key]))||typeof meta.traceId!=='string'||!meta.traceId||Boolean(trace&&meta.traceId!==trace)||meta.completion!=='P04_COMPARE'||!object(meta.policyVersions)||!COMPARISON_POLICIES.every(key=>typeof meta.policyVersions[key]==='string'&&meta.policyVersions[key].length>0)||typeof meta.statisticalDisclosure!=='string'||!meta.statisticalDisclosure||!object(meta.sourceDateCoverage))return false;
 for(const side of ['a','b']){
  const coverage=meta.sourceDateCoverage[side];if(!object(coverage))return false;
  for(const [metric] of COMPARISON_ROWS.slice(1)){
   const value=coverage[metric];if(!object(value)||!['validN','datedN','undatedN','missingN'].every(key=>count(value[key]))||!['KNOWN','PARTIAL','UNKNOWN','NO_DATA'].includes(value.status)||!['minDate','maxDate'].every(key=>value[key]===null||(typeof value[key]==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value[key]))))return false;
  }
 }
 return true;
}
const COMPARISON_LABELS={n:'人数',age:'年龄（岁）',duration:'病程（年）',das28At:'DAS28-CRP',crpAt:'CRP（mg/L）',haqAt:'HAQ',female:'女性',sero:'血清学阳性',target:'DAS28 达标',complete:'资料完整',activity:'活动分布',line:'治疗线数'};
function renderComparisonRows(data){
 const rows=$('#compare-rows');rows.replaceChildren();
 for(const row of data.rows){
  const tr=textNode('tr','');tr.dataset.metric=row.metric;tr.dataset.kind=row.kind;tr.append(textNode('th',COMPARISON_LABELS[row.metric]));
  for(const side of ['a','b']){const cell=textNode('td','');cell.dataset.side=side;const keys=row.kind==='COUNT'?['n']:row.kind==='CONTINUOUS'?['q1','median','q3','iqr','validN','unknownN','status']:row.kind==='BINARY'?['numerator','denominator','value','knownN','unknownN','status']:['denominator','knownN','unknownN','status'];const fields=keys.map(key=>`${key}=${row[side][key]===null?'缺失':row[side][key]}`);for(const group of row[side].groups||[])fields.push(`${group.category}: count=${group.count} · value=${group.value}`);cell.textContent=fields.join(' · ');if(row.kind!=='COUNT'){const coverage=data.meta.sourceDateCoverage[side][row.metric];cell.append(textNode('small','来源覆盖 · '+['validN','datedN','undatedN','missingN','minDate','maxDate','status'].map(key=>`${key}=${coverage[key]===null?'未提供':coverage[key]}`).join(' · '),'comparison-coverage'));}tr.append(cell);}
  const difference=textNode('td',row.difference===null?'不适用':`${row.difference}${row.kind==='BINARY'?' 百分点':''}`);difference.dataset.difference='';tr.append(difference);
  const test=textNode('td','不适用');test.dataset.test='';if(row.test){test.textContent=['method','status','pValue','displayP','significant','nA','nB','reason','warnings','policyVersion','testDenominator',...(row.kind==='CONTINUOUS'?[]:['expectedBelow5Cells','expectedCellCount'])].map(key=>{const value=row.test[key];return `${key}=${value===null?'不可用':Array.isArray(value)?(value.join(', ')||'无'):value}`;}).join(' · ');if(row.test.significant===true)test.append(textNode('strong',' 显著（服务端判定）','stat-significant'));}tr.append(test);rows.append(tr);
 }
}

function sameRetainedComparison(data,operation){
 if(data.compareResultId!==operation.snapshot.compareResultId||data.meta.comparisonTraceId!==operation.creationTrace)return false;
 // 只允许本次读取trace变化；比较资源的完整原值、范围、时间和政策逐字段保持。
 const retained=value=>{const copy=comparisonClone(value);delete copy.meta.traceId;delete copy.meta.comparisonTraceId;return copy;};
 const equal=(a,b)=>{if(a===b)return true;if(a===null||b===null||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&equal(a[key],b[key]));};
 return equal(retained(data),retained(operation.snapshot));
}
function startComparisonRead(){
 if(disposed||checkIdentity()||!comparisonResource)return;
 const snapshot=comparisonClone(comparisonResource),creationTrace=snapshot.meta.comparisonTraceId||snapshot.meta.traceId;
 const side=value=>value.source==='SAVED'?{source:'SAVED',cohortId:value.cohortId}:{source:'FILTERS',filters:comparisonClone(value.filters)};
 endComparison('SUPERSEDED');
 const operation={kind:'read',snapshot,creationTrace,generation:comparisonGeneration,identity,at:snapshot.meta.at,body:{a:side(snapshot.a),b:side(snapshot.b),excludeOverlap:snapshot.excludeOverlap},controller:new AbortController(),timer:null,terminal:null};
 comparisonFlight=operation;$('#compare-cancel').hidden=false;comparisonState('loading','正在验证并重读原ID保留结果');
 operation.timer=setTimeout(()=>{finishComparison(operation,null,{code:'REQUEST_TIMEOUT',message:'保留重读超过30秒'});operation.controller.abort();},30000);
 window.RACohortAPI.compareResult(snapshot.compareResultId,{signal:operation.controller.signal}).then(result=>finishComparison(operation,result),error=>finishComparison(operation,null,error));
}

function publishComparison(data){
 renderComparisonRows(data);
 comparisonResource=comparisonClone(data);$('#compare-read').hidden=false;$('#compare-read').disabled=false;$('#compare-result').dataset.compareResultId=data.compareResultId;$('#compare-result').hidden=false;
 $('#compare-summary').textContent=`studyTotal=${data.studyTotal} · overlapN=${data.overlapN}`;
 for(const side of ['a','b']){const q=data[side];$('#compare-side-'+side).textContent=`${side.toUpperCase()} · source=${q.source} · filters=${JSON.stringify(q.filters)} · cohortId=${q.cohortId} · cohortVersion=${Number.isSafeInteger(q.cohortVersion)||q.cohortVersion===null?q.cohortVersion:'超出安全显示范围'} · nBeforeExclusion=${q.nBeforeExclusion} · n=${q.n} · evalN=${q.evalN} · submittedUniqueIdsN=${q.submittedUniqueIdsN} · effectiveIdsN=${q.effectiveIdsN}`;}
 const meta=data.meta;$('#compare-policy').textContent=`excludeOverlap=${data.excludeOverlap} · ${data.excludeOverlap?'双方均排除完整患者交集':'保留重叠患者；交集存在时不能进行独立组检验'} · `+['at','asOfDate','readStartedAt','readCompletedAt','computedAt','expiresAt','traceId','completion'].map(key=>`${key}=${meta[key]}`).join(' · ')+' · '+Object.entries(meta.policyVersions).map(([key,value])=>`${key}=${value}`).join(' · ')+' · comparisonTraceId='+(meta.comparisonTraceId||meta.traceId)+' · '+meta.statisticalDisclosure;comparisonState('success',meta.comparisonTraceId?'原ID保留结果已重读，原数值和有效期保持':'比较完成，完整12行来自同次服务端结果');
}
function isCurrentComparison(operation){return !disposed&&!operation.terminal&&comparisonFlight===operation&&comparisonGeneration===operation.generation;}
function finishComparison(operation,result,error){
 if(!isCurrentComparison(operation))return;
 if(operation.identity!==identityKey()){checkIdentity();return;}
 if(!error&&(!validComparison(result?.data,operation,result?.traceId)||result?.success!==true||result?.code!=='200'||(operation.kind==='read'&&!sameRetainedComparison(result.data,operation))))error={status:result?.status,code:'INVALID_RESPONSE',message:'比较响应不完整',traceId:result?.traceId};
 operation.terminal=error?.code||'SUCCESS';comparisonFlight=null;clearTimeout(operation.timer);$('#compare-cancel').hidden=true;
 if(error){
  clearComparisonResult();
  if(error.status===401){clearPrivate();invalidate(error);}
  if(operation.kind==='read'){const reason=error.status===404?'保留比较不存在':error.status===410?'保留比较已过期':error.status===409&&error.code==='SCOPE_CHANGED'?'授权研究库范围已变化':'无法验证保留结果';comparisonState('error',`${error.status?'HTTP '+error.status+' · ':''}${error.code||'REQUEST_FAILED'}：${reason}，引用已清除，请显式重新比较${error.traceId?' · Trace：'+error.traceId:''}`);return;}
  const unknown=error.status>=500||['NETWORK_ERROR','INVALID_RESPONSE','REQUEST_TIMEOUT','REQUEST_CANCELLED'].includes(error.code);
  comparisonState('error',`${error.status?'HTTP '+error.status+' · ':''}${error.code||'REQUEST_FAILED'}：${error.message||'比较未完成'}${error.traceId?' · Trace：'+error.traceId:''}${unknown?'；结果尚未确认，不能确定是否已提交。显式再次比较可能创建新ID。':''}`);return;
 }
 publishComparison(result.data);
}
function startComparison(){
 if(disposed||checkIdentity()||!comparisonSlots.a||!comparisonSlots.b)return;
 if(comparisonAt(comparisonSlots.a)!==comparisonAt(comparisonSlots.b)){renderComparisonSources();return;}
 endComparison('SUPERSEDED');
 const operation={kind:'compare',generation:comparisonGeneration,identity,at:comparisonAt(comparisonSlots.a),body:comparisonBody(),controller:new AbortController(),timer:null,terminal:null};comparisonFlight=operation;$('#compare-cancel').hidden=false;comparisonState('loading','正在比较，请稍候');
 operation.timer=setTimeout(()=>{finishComparison(operation,null,{code:'REQUEST_TIMEOUT',message:'比较请求超过30秒'});operation.controller.abort();},30000);
 window.RACohortAPI.compare(operation.body,{signal:operation.controller.signal}).then(result=>finishComparison(operation,result),error=>finishComparison(operation,null,error));
}
function removeComparisonDefinition(cohortId){
 const affected=['a','b'].some(side=>comparisonSlots[side]?.source==='SAVED'&&comparisonSlots[side].cohortId===cohortId);
 if(comparisonFlight?.kind==='compare'&&['a','b'].some(side=>comparisonFlight.body[side].source==='SAVED'&&comparisonFlight.body[side].cohortId===cohortId)){endComparison('SOURCE_DELETED');comparisonState('error','来源定义已删除，请显式重选来源');}
 for(const side of ['a','b'])if(comparisonSlots[side]?.source==='SAVED'&&comparisonSlots[side].cohortId===cohortId)comparisonSlots[side]=null;
 if(affected)renderComparisonSources();
 if(comparisonResource&&['a','b'].some(side=>comparisonResource[side].source==='SAVED'&&comparisonResource[side].cohortId===cohortId))$('#compare-definition-note').textContent='来源定义已删除，当前为已保留结果；原ID、数值和有效期保持。';
}
$('#compare-start').addEventListener('click',startComparison);
$('#compare-read').addEventListener('click',startComparisonRead);
$('#compare-swap').addEventListener('click',()=>{if(disposed||checkIdentity())return;endComparison('SWAPPED');[comparisonSlots.a,comparisonSlots.b]=[comparisonSlots.b,comparisonSlots.a];comparisonState('idle','A/B已交换，请显式新比较');renderComparisonSources();});
$('#compare-exclude').addEventListener('change',()=>{if(disposed||checkIdentity())return;endComparison('EXCLUSION_CHANGED');comparisonState('idle','排重选择已改变，请显式新比较');renderComparisonSources();});
$('#compare-cancel').addEventListener('click',()=>{if(!comparisonFlight)return;const read=comparisonFlight.kind==='read';endComparison('REQUEST_CANCELLED');comparisonState('error',read?'REQUEST_CANCELLED：已取消保留重读，引用已清除，请显式重新比较。':'REQUEST_CANCELLED：已取消等待，结果尚未确认，不能确定是否已提交；显式新比较可能创建新ID。');});
window.RACohortComparison=Object.freeze({getResource:()=>comparisonResource===null?null:comparisonClone(comparisonResource)});
// 私有定义只读元信息；列表与保存独立于分析owner，不自动统计人数。
let listFlight=null,listToken=0,listPage=1,privateItems=new Map(),privateDeleted=new Set();
const PRIVATE_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function privateFilters(filters){
  if(!filters||typeof filters!=='object'||Array.isArray(filters)||Object.keys(filters).length!==10||!['studyCode',...Object.keys(SELECTS),'ids'].every(key=>Object.hasOwn(filters,key))||filters.studyCode!=='RA'||!['now','6m'].includes(filters.at))return null;
  const values={studyCode:'RA',ids:filters.ids};
  for(const key of Object.keys(SELECTS)){if(filters[key]!==null&&typeof filters[key]!=='string')return null;values[key]=filters[key]??'';}
  try{return window.RACohortConditions.decode(window.RACohortConditions.encode(values));}catch{return null;}
}
function validPrivateItem(item){
  return item&&typeof item==='object'&&!Array.isArray(item)&&typeof item.cohortId==='string'&&PRIVATE_UUID.test(item.cohortId)&&typeof item.name==='string'&&item.name.length>0&&(item.note===null||typeof item.note==='string')&&Number.isInteger(item.version)&&item.version>0&&['createdAt','updatedAt'].every(key=>typeof item[key]==='string'&&/Z$/.test(item[key])&&Number.isFinite(Date.parse(item[key])))&&item.currentN===null&&privateFilters(item.filters)!==null;
}
function validPrivateMeta(data,trace){return data?.meta&&typeof data.meta.traceId==='string'&&(!trace||data.meta.traceId===trace);}
function privateItemText(item){return `${item.name} · 备注：${item.note===null?'未填写':item.note} · 版本 ${Number.isSafeInteger(item.version)?item.version:'超出安全显示范围'} · 创建 ${item.createdAt} · 更新 ${item.updatedAt} · 条件 ${JSON.stringify(item.filters)} · 打开后计算`;}
function applyPrivateFilters(filters){
  for(const [key,selector] of Object.entries(SELECTS)){
    const select=$(selector);
    if(key==='age'&&filters.age&&!Array.from(select.options||[]).some(option=>option.value===filters.age)){const option=document.createElement('option');option.value=filters.age;option.textContent=filters.age+' 岁';select.append(option);}
    select.value=filters[key];
  }
  entryIds=filters.ids===null?null:[...filters.ids];blockedEntry=false;
  history.replaceState(null,'',location.pathname+window.RACohortConditions.encode(filters)+location.hash);renderChips();saveParametersChanged();
}
function listState(name,message){$('#private-list-state').dataset.state=name;$('#private-list-state').textContent=message;}
function clearPrivate(){
  resetComparison();
  cancelSave();cancelPrivateCommand();privateItems.clear();privateDeleted.clear();const previous=listFlight;listFlight=null;listToken++;if(previous){previous.terminal='IDENTITY_ENDED';clearTimeout(previous.timer);previous.controller.abort();}
  $('#private-edit-name').value='';$('#private-edit-note').value='';$('#private-edit-note-mode').value='preserve';$('#private-command-target').textContent='';listPage=1;$('#private-items').replaceChildren();$('#private-page').textContent='';$('#private-prev').disabled=true;$('#private-open-meta').textContent='';$('#private-name').value='';$('#private-note').value='';listState('idle','尚未加载');
}
function loadPrivateList(page=listPage,refreshEdit=false){
  if(disposed||checkIdentity()||!Number.isSafeInteger(page)||page<1)return;
  const editing=refreshEdit?privateEdit:null;
  if(editing){endPrivateCommand('REFRESHED');privateCommand=null;}else cancelPrivateCommand();
  const previous=listFlight;listFlight=null;listToken++;if(previous){previous.terminal='SUPERSEDED';clearTimeout(previous.timer);previous.controller.abort();}
  listPage=page;const operation={token:listToken,identity,page,controller:new AbortController(),timer:null,terminal:null};listFlight=operation;
  privateItems.clear();$('#private-items').replaceChildren();$('#private-prev').disabled=page===1;$('#private-page').textContent=`第 ${page} 页 · 每页 20 条 · 总数待确认`;listState('loading','正在读取私有条件定义');
  const finishList=(result,error)=>{
    if(disposed||operation.terminal||listFlight!==operation||operation.token!==listToken)return;
    if(operation.identity!==identityKey()){checkIdentity();return;}
    const data=result?.data;
    if(!error&&(!data||!validPrivateMeta(data,result.traceId)||data.page!==operation.page||data.size!==20||!Number.isSafeInteger(data.total)||data.total<0||!Array.isArray(data.items)||data.items.length>20||data.items.length>data.total||!data.items.every(validPrivateItem)||new Set(data.items.map(item=>item.cohortId)).size!==data.items.length))error={status:result?.status,code:'INVALID_RESPONSE',message:'私有定义列表响应不完整',traceId:result?.traceId};
    operation.terminal=error?.code||'SUCCESS';listFlight=null;clearTimeout(operation.timer);
    if(error){if(error.status===401){clearPrivate();invalidate(error);return;}if(editing&&privateEdit===editing){$('#private-version-refresh').hidden=false;$('#private-command-confirm').disabled=true;commandState('error',`元信息刷新失败：${error.code||'REQUEST_FAILED'} ${error.message} ${error.traceId?'Trace：'+error.traceId:''}；原输入已保留，请显式再次刷新。`);}listState('error',`${error.status?'HTTP '+error.status+' · ':''}${error.code||'REQUEST_FAILED'}：${error.message} ${error.traceId?'Trace：'+error.traceId:''}`);return;}
    $('#private-page').textContent=`第 ${data.page} 页 · 每页 ${data.size} 条 · 共 ${data.total} 条`;
    for(const item of data.items){privateItems.set(item.cohortId,item);for(const side of ['a','b'])if(comparisonSlots[side]?.source==='SAVED'&&comparisonSlots[side].cohortId===item.cohortId)comparisonSlots[side].item=comparisonClone(item);const row=textNode('div',privateItemText(item),'private-item');row.dataset.privateCohort=item.cohortId;row.setAttribute('role','listitem');const button=textNode('button','打开并重新分析','button');button.type='button';button.dataset.openCohort=item.cohortId;row.append(button);const edit=textNode('button','修改名称/备注','button');edit.type='button';edit.dataset.editCohort=item.cohortId;edit.disabled=!Number.isSafeInteger(item.version);row.append(edit);const remove=textNode('button','删除','button');remove.type='button';remove.dataset.deleteCohort=item.cohortId;remove.disabled=!Number.isSafeInteger(item.version);row.append(remove);for(const side of ['a','b']){const choose=textNode('button','设为'+side.toUpperCase(),'button');choose.type='button';choose.dataset.compareSide=side;choose.dataset.compareCohort=item.cohortId;row.append(choose);}if(!Number.isSafeInteger(item.version))row.append(textNode('small','版本超出安全整数范围，只能读取或打开'));$('#private-items').append(row);}
    renderComparisonSources();
    if(editing&&privateEdit===editing){const item=privateItems.get(editing.item.cohortId);if(item){editing.item=item;editing.versionConflict=false;$('#private-command-target').textContent=privateItemText(item);$('#private-command-confirm').disabled=!Number.isSafeInteger(item.version);commandState('idle',Number.isSafeInteger(item.version)?'元信息已刷新，请核对输入后确认新命令':'版本超出安全整数范围，只能读取或打开');}else{cancelPrivateCommand();commandState('error','当前页未找到该定义，请加载对应页后重新选择。');}}
    listState(data.items.length?'success':'empty',data.items.length?'列表已读取，人数在打开后计算':'当前页没有私有定义');
  };
  operation.timer=setTimeout(()=>{finishList(null,{code:'REQUEST_TIMEOUT',message:'列表请求超过30秒，请显式重试'});operation.controller.abort();},30000);
  window.RACohortAPI.list({page,size:20},{signal:operation.controller.signal}).then(result=>finishList(result),error=>finishList(null,error));
}
function openPrivate(cohortId){
  if(disposed||checkIdentity()||!PRIVATE_UUID.test(cohortId))return;
  invalidate();const operation={controller:new AbortController(),timer:null,terminal:null,identity,generation,cohortId};flight=operation;waiting();state('loading','正在打开私有条件并重新分析');
  operation.timer=setTimeout(()=>{finish(operation,null,{code:'REQUEST_TIMEOUT',message:'打开请求超过30秒，请显式重试'});operation.controller.abort();},30000);
  window.RACohortAPI.open({cohortId},{signal:operation.controller.signal}).then(result=>finish(operation,result),error=>finish(operation,null,error));
}
$('#private-list-load').addEventListener('click',()=>loadPrivateList(listPage));
$('#private-prev').addEventListener('click',()=>loadPrivateList(listPage-1));
$('#private-next').addEventListener('click',()=>loadPrivateList(listPage+1));
$('#private-items').addEventListener('click',event=>{const source=event.target.closest('[data-compare-cohort]');if(source)selectSavedComparison(source.dataset.compareSide,source.dataset.compareCohort);const button=event.target.closest('[data-open-cohort]');if(button)openPrivate(button.dataset.openCohort);const edit=event.target.closest('[data-edit-cohort]');if(edit)beginPrivateEdit(edit.dataset.editCohort);const remove=event.target.closest('[data-delete-cohort]');if(remove)beginPrivateEdit(remove.dataset.deleteCohort,'delete');});
// 元信息命令只依据实际列表条目；回执从不组装或恢复列表。
let privateEdit=null,privateCommand=null,privateCommandFlight=null,privateCommandToken=0;
function commandState(name,message){$('#private-command-state').dataset.state=name;$('#private-command-state').textContent=message;}
function endPrivateCommand(cause){
  privateCommandToken++;const old=privateCommandFlight;privateCommandFlight=null;
  if(old){old.terminal=cause;clearTimeout(old.timer);}
  $('#private-command-confirm').disabled=Boolean(privateEdit?.versionConflict);$('#private-command-retry').hidden=true;$('#private-version-refresh').hidden=!privateEdit?.versionConflict;
  if(old)old.controller.abort();
}
function cancelPrivateCommand(){privateCommand=null;privateEdit=null;$('#private-command-dialog').hidden=true;commandState('idle','');endPrivateCommand('CANCELLED');}
function beginPrivateEdit(cohortId,action='rename'){
  if(disposed||checkIdentity())return;const item=privateItems.get(cohortId);if(!item||!Number.isSafeInteger(item.version))return;
  cancelPrivateCommand();privateEdit={action,item};$('#private-command-dialog').hidden=false;$('#private-command-title').textContent=action==='delete'?'确认删除私有定义':'修改名称/备注';$('#private-edit-fields').hidden=action==='delete';$('#private-command-confirm').textContent=action==='delete'?'确认删除':'确认修改';$('#private-command-target').textContent=privateItemText(item);$('#private-edit-name').value=item.name;$('#private-edit-note').value=item.note??'';$('#private-edit-note-mode').value='preserve';
}
function privateCommandFields(){
  if(!privateEdit)return null;const item=privateEdit.item,fields={cohortId:item.cohortId,version:item.version};
  if(privateEdit.action==='delete')return fields;
  if($('#private-edit-name').value!==item.name)fields.name=$('#private-edit-name').value;
  const mode=$('#private-edit-note-mode').value;
  if(mode==='clear'&&item.note!==null)fields.note=null;
  if(mode==='value'&&$('#private-edit-note').value!==item.note)fields.note=$('#private-edit-note').value;
  return fields;
}
function privateParametersChanged(){
  if(!privateEdit)return;
  if(privateCommand&&JSON.stringify(privateCommandFields())===JSON.stringify(privateCommand.fields))return;
  endPrivateCommand('PARAMETERS_CHANGED');privateCommand=null;commandState('idle','输入已变化，下次确认将使用新命令');
}
function confirmPrivateCommand(retry=false){
  if(disposed||checkIdentity()||!privateEdit)return;
  privateParametersChanged();if(privateEdit.versionConflict){commandState('error','VERSION_CONFLICT：请先显式刷新元信息，再确认新命令');$('#private-version-refresh').hidden=false;return;}if(retry&&!privateCommand)return;
  const fields=privateCommandFields();if(!Number.isSafeInteger(fields.version)||fields.version<1){commandState('error','版本超出安全整数范围，只能读取或打开');return;}
  if(!retry&&privateEdit.action==='rename'&&!Object.hasOwn(fields,'name')&&!Object.hasOwn(fields,'note')){commandState('idle','名称和备注未变化，无需提交');return;}
  const pending=privateCommand||{action:privateEdit.action,fields,body:{...fields,requestId:crypto.randomUUID()}};
  endPrivateCommand('SUPERSEDED');privateCommand=pending;
  const operation={token:privateCommandToken,identity,edit:privateEdit,pending,controller:new AbortController(),timer:null,terminal:null};privateCommandFlight=operation;
  $('#private-command-confirm').disabled=true;commandState('loading',retry?'正在重试原命令':'正在提交元信息命令');
  const finishCommand=(result,error)=>{
    if(disposed||operation.terminal||privateCommandFlight!==operation||operation.token!==privateCommandToken||privateCommand!==pending||privateEdit!==operation.edit)return;
    if(operation.identity!==identityKey()){checkIdentity();return;}
    const data=result?.data;
    if(!error&&(!data||data.cohortId!==pending.body.cohortId||!Number.isInteger(data.version)||data.version<1||!validPrivateMeta(data,result.traceId)))error={status:result?.status,code:'INVALID_RESPONSE',message:'元信息回执不完整',traceId:result?.traceId};
    operation.terminal=error?.code||'SUCCESS';privateCommandFlight=null;clearTimeout(operation.timer);$('#private-command-confirm').disabled=false;
    if(error){
      if(error.status===401){clearPrivate();invalidate(error);return;}
      const unknown=error.status>=500||['NETWORK_ERROR','REQUEST_TIMEOUT','REQUEST_CANCELLED','INVALID_RESPONSE'].includes(error.code);
      const instruction=unknown?'结果尚未确认，不能确定是否已提交。可显式重试原命令。':error.code==='NAME_CONFLICT'?'名称冲突，请修改名称后重新确认。':error.code==='VERSION_CONFLICT'?'版本冲突，请显式刷新元信息，再核对输入并确认新命令。':error.code==='IDEMPOTENCY_CONFLICT'?'原请求标识对应不同参数，请核对输入；不要盲目重试。':error.status===404?'定义不存在、已删除或不属于当前身份，请重新加载列表。':'';
      if(error.status===404){removeComparisonDefinition(pending.body.cohortId);privateItems.delete(pending.body.cohortId);$(`[data-private-cohort="${pending.body.cohortId}"]`)?.remove();listState('error','条目已不可用，请显式重新加载列表');}
      if(error.code==='VERSION_CONFLICT'){privateEdit.versionConflict=true;$('#private-command-confirm').disabled=true;}
      $('#private-command-retry').hidden=!unknown;$('#private-version-refresh').hidden=error.code!=='VERSION_CONFLICT';if(!unknown)privateCommand=null;
      commandState('error',`${error.status?'HTTP '+error.status+' · ':''}${error.code||'REQUEST_FAILED'}：${error.message} ${instruction} ${error.traceId?'Trace：'+error.traceId:''}`);return;
    }
    if(pending.action==='delete'){privateDeleted.add(pending.body.cohortId);privateItems.delete(pending.body.cohortId);removeComparisonDefinition(pending.body.cohortId);}
    if(pending.action==='delete'&&$('#private-open-meta').dataset.cohortId===pending.body.cohortId){$('#private-open-meta').textContent='该私有定义已删除；当前已保留分析仍遵循原有效期和授权范围。';delete $('#private-open-meta').dataset.cohortId;}
    privateCommand=null;privateEdit=null;$('#private-command-dialog').hidden=true;
    loadPrivateList(listPage);commandState('success',Number.isSafeInteger(data.version)?'元信息命令已确认，按当前列表读取结果':'命令已确认；回执版本超出安全整数范围，刷新后只按安全列表版本操作');
  };
  operation.timer=setTimeout(()=>{finishCommand(null,{code:'REQUEST_TIMEOUT',message:'元信息请求超过30秒'});operation.controller.abort();},30000);
  window.RACohortAPI[pending.action](pending.body,{signal:operation.controller.signal}).then(result=>finishCommand(result),error=>finishCommand(null,error));
}
$('#private-command-confirm').addEventListener('click',()=>confirmPrivateCommand());
$('#private-command-retry').addEventListener('click',()=>confirmPrivateCommand(true));
$('#private-command-cancel').addEventListener('click',cancelPrivateCommand);
$('#private-version-refresh').addEventListener('click',()=>loadPrivateList(listPage,true));
$('#private-edit-name').addEventListener('input',privateParametersChanged);
$('#private-edit-note').addEventListener('input',()=>{$('#private-edit-note-mode').value='value';privateParametersChanged();});
$('#private-edit-note-mode').addEventListener('change',privateParametersChanged);
// 保存命令拥有独立身份；分析代次不改变点击时的冻结参数。
let saveFlight=null,saveCommand=null,saveToken=0;
function saveState(name,message){$('#private-save-state').dataset.state=name;$('#private-save-state').textContent=message;}
function cancelSave(){
  saveToken++;const old=saveFlight;saveFlight=null;saveCommand=null;
  if(old){old.terminal='CANCELLED';clearTimeout(old.timer);old.controller.abort();}
  $('#private-save').disabled=false;$('#private-retry').hidden=true;$('#private-save-dialog').hidden=true;saveState('idle','');
}
function saveParametersChanged(){
  if(!saveCommand)return;
  const signature=command=>JSON.stringify({name:command.name,note:command.note,filters:command.filters});
  if(signature(saveCommand)===signature({name:$('#private-name').value,note:$('#private-note').value,filters:currentFilters()}))return;
  saveToken++;const old=saveFlight;saveFlight=null;saveCommand=null;
  if(old){old.terminal='PARAMETERS_CHANGED';clearTimeout(old.timer);old.controller.abort();}
  $('#private-save').disabled=false;$('#private-retry').hidden=true;saveState('idle','参数已变化，下次保存将使用新命令');
}
function saveCurrent(retry=false){
  if(disposed||checkIdentity()||blockedEntry)return;
  saveParametersChanged();if(retry&&!saveCommand)return;
  const command=retry?saveCommand:{name:$('#private-name').value,note:$('#private-note').value,filters:currentFilters(),requestId:crypto.randomUUID()};
  saveToken++;const previous=saveFlight;saveFlight=null;if(previous){previous.terminal='SUPERSEDED';clearTimeout(previous.timer);previous.controller.abort();}
  saveCommand=command;const operation={token:saveToken,identity,command,controller:new AbortController(),timer:null,terminal:null};saveFlight=operation;
  saveState('loading',retry?'正在重试原保存命令':'正在保存条件，请稍候');$('#private-save').disabled=true;$('#private-retry').hidden=true;
  const finishSave=(result,error)=>{
    if(disposed||operation.terminal||saveFlight!==operation||operation.token!==saveToken||saveCommand!==operation.command)return;
    if(operation.identity!==identityKey()){checkIdentity();return;}
    const data=result?.data;
    if(!error&&(!data||typeof data.cohortId!=='string'||!PRIVATE_UUID.test(data.cohortId)||data.version!==1||!validPrivateMeta(data,result.traceId)))error={status:result?.status,code:'INVALID_RESPONSE',message:'保存回执不完整',traceId:result?.traceId};
    operation.terminal=error?.code||'SUCCESS';saveFlight=null;clearTimeout(operation.timer);$('#private-save').disabled=false;
    if(error){
      if(error.status===401){clearPrivate();invalidate(error);return;}
      const unknown=error.status>=500||['NETWORK_ERROR','REQUEST_TIMEOUT','REQUEST_CANCELLED','INVALID_RESPONSE'].includes(error.code);
      const instruction=unknown?'保存结果尚未确认，不能确定是否已提交。可显式重试原命令。':error.code==='NAME_CONFLICT'?'名称冲突，请修改名称后重新保存。':error.code==='IDEMPOTENCY_CONFLICT'?'请求标识对应不同参数，请核对输入后发起新命令。':'';
      $('#private-retry').hidden=!unknown;if(!unknown)saveCommand=null;
      saveState('error',`${error.status?'HTTP '+error.status+' · ':''}${error.code||'REQUEST_FAILED'}：${error.message} ${instruction} ${error.traceId?'Trace：'+error.traceId:''}`);return;
    }
    saveCommand=null;$('#private-retry').hidden=true;saveState('success','私有条件已保存');loadPrivateList(listPage);
  };
  operation.timer=setTimeout(()=>{finishSave(null,{code:'REQUEST_TIMEOUT',message:'保存请求超过30秒'});operation.controller.abort();},30000);
  window.RACohortAPI.save(command,{signal:operation.controller.signal}).then(result=>finishSave(result),error=>finishSave(null,error));
}
$('#save-cohort').addEventListener('click',()=>{if(disposed||checkIdentity())return;if(blockedEntry){showError(blockedEntry);return;}cancelSave();$('#private-save-dialog').hidden=false;});
$('#private-cancel').addEventListener('click',cancelSave);
$('#private-save').addEventListener('click',()=>saveCurrent());
$('#private-retry').addEventListener('click',()=>saveCurrent(true));
for(const selector of ['#private-name','#private-note'])$(selector).addEventListener('input',saveParametersChanged);
window.addEventListener('pagehide',()=>{disposed=true;clearPrivate();invalidate({code:'REQUEST_CANCELLED',message:'已离开页面，请重新分析'});});
window.addEventListener('pageshow',event=>{if(event.persisted){disposed=false;invalidate();restoreEntry();analyze();}});
window.addEventListener('popstate',()=>{if(!disposed){invalidate();restoreEntry();analyze();}});
window.addEventListener('storage',event=>{if(event.key==='ra-auth')checkIdentity();});
window.addEventListener('focus',checkIdentity);
document.addEventListener('visibilitychange',checkIdentity);
analyze();
