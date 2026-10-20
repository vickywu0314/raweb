/* 条件→保留cohort→原签名分页；仅有效本代可发布，后段能力尚未接入。 */
"use strict";
shell('ai');
const ui=window.RAUserDisplay;
const SELECTS = {sex:'#f-sex',age:'#f-age',sero:'#f-sero',tx:'#f-tx',at:'#f-at',act:'#f-act',cm:'#f-cm',data:'#f-data'};
let flight = null, pageFlight = null, resource = null, disposed = false, blockedEntry = false, entryIds = null, generation = 0;
let identity=identityKey();
let exportFlight=null,exportSelection=null,applicationDraft=null,applicationSession=null,applicationFlight=null;
let parseFlight=null,parseCandidate=null,parseToken=0,questionVersion=0,applyFlight=null,applyToken=0;
let entryFlight=null,entryToken=0;
function identityKey(){return JSON.stringify(currentUser());}
function waiting(){ $('#cancel-analysis').hidden=!(flight||pageFlight); }
function invalidate(error=null) {
  endComparison(error?.code||'ANALYSIS_CHANGED');comparisonState('idle','当前条件或分析已变化，请重新比较');renderComparisonSources();
  generation++;const previous=[flight,pageFlight];flight=null;pageFlight=null;
  for(const operation of previous)if(operation){if(!operation.terminal)operation.terminal=error?.code||'SUPERSEDED';clearTimeout(operation.timer);}
  clearResults();waiting();lockControls();updateChatEntry();
  for(const operation of previous)if(operation)operation.controller.abort();
  if(error)showError(error);
}
function checkIdentity(){
  const current=identityKey();if(current===identity)return false;
  identity=current;clearPrivate();invalidate({status:401,code:'UNAUTHENTICATED',message:'登录身份已变化，请重新登录后再分析'});return true;
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
    const entry=window.RACohortConditions.decodeEntry(location.search);blockedEntry=false;
    if(entry.kind==='SIMILAR')return entry;
    const filters=entry.filters;entryIds=filters.ids;
    for(const [key,selector] of Object.entries(SELECTS)) {
      const select=$(selector);
      if(key==='age'&&filters.age&&!Array.from(select.options||[]).some(option=>option.value===filters.age)) {
        const option=document.createElement('option');option.value=filters.age;option.textContent=filters.age+' 岁';select.append(option);
      }
      select.value=filters[key];
    }
    history.replaceState(null,'',location.pathname+window.RACohortConditions.encode(filters)+location.hash);
    return entry;
  }catch(error){blockedEntry=error;}
}
function startEntry(){
  invalidate();const entry=restoreEntry();
  if(!entry){showError(blockedEntry);return;}
  if(entry.kind==='QUESTION'){$('#question').value=entry.question;questionVersion++;parseQuestion(true);}
  else if(entry.kind==='SIMILAR')resolveSimilar(entry.indexPatientId);
  else analyze();
}
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
  return `${ui.code(meta.status)} · ${sample} · 未知 ${meta.unknownN}`;
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
    const node=textNode('div',`${row.label??ui.code(row[key],String(row[key]))} · ${row.count??row.targetN} · ${row.displayText} · ${ui.code(row.status)}`,'statistics-bucket');
    node.dataset[key]=String(row[key]);node.dataset.count=String(row.count??row.targetN);node.dataset.display=row.displayText;node.dataset.status=row.status;
    if(key==='tx')node.append(textNode('small',`成员 ${row.n} · 有效 ${row.evalN} · 达标 ${row.targetN}`));
    const value=key==='tx'?row.rate:row.value;
    if(typeof value==='number'&&Number.isFinite(value))node.style.setProperty('--share',`${value*100}%`);
    container.append(node);
  }
}
function testText(test) {
  if(!test)return '—';
  return `${ui.code(test.method,'未进行检验')} · ${ui.code(test.status)} · P ${test.displayP} · ${test.significant===true?'显著':test.significant===false?'未显著':'显著性不可评估'} · ${ui.code(test.reason,'无额外限制')} · A组有效 ${test.nA??'—'} / B组有效 ${test.nB??'—'} · ${ui.code(test.testDenominator)} · 提示：${ui.list(test.warnings)}`;
}
function renderPanels(data) {
  const activity=data.activity||{},byTx=data.byTx||{},lines=data.lines||{},fm=data.fm||{},meta=data.meta||{};
  renderBuckets('#activity-base',activity.base,'level');renderBuckets('#activity-current',activity.current,'level');
  $('#activity-summary').textContent=`基线有效 ${activity.baseN??'—'} · 未知 ${activity.baseUnknownN??'—'}；${ui.time(meta.at)} · 有效 ${activity.evalN??'—'} · 未知 ${activity.unknownN??'—'}`;
  renderBuckets('#tx-groups',byTx.groups,'tx');$('#tx-summary').textContent=`治疗未知/冲突 ${byTx.unknownTxN??'—'} · 当前无治疗 ${byTx.noCurrentTxN??'—'}`;
  $('#study-target').textContent=`研究库基准 ${byTx.studyTargetMeta?.displayText??'—'} · ${metricDetail(byTx.studyTargetMeta)}`;
  $('#tx-test').textContent=`${testText(byTx.test)} · 纳入组 ${(byTx.test?.includedGroups??[]).map(g=>ui.code(g,'其他治疗组')).join('、')||'无'} · 排除组 ${(byTx.test?.excludedGroups??[]).map(g=>typeof g==='string'?ui.code(g,'其他治疗组'):`${ui.code(g.tx??g.group,'其他治疗组')}（成员 ${g.n??'未知'} 人，有效 ${g.evalN??'未知'} 人）：${ui.code(g.reason)}`).join('；')||'无'} · 检验有效人数 ${(byTx.test?.groupNs??[]).map(g=>`${ui.code(g.tx??g.group,'其他治疗组')} ${g.n??g.evalN??'未知'} 人`).join('；')||'无'}`;
  $('#tx-notice').textContent=byTx.comparisonNotice??'—';
  renderBuckets('#line-groups',lines.groups,'line');$('#line-summary').textContent=`线数未知 ${lines.unknownLineN??'—'} · 分母 ${data.n}`;
  $('#fm-summary').textContent=`FM ${fm.nFM??'—'} · 明确无FM ${fm.nOther??'—'} · 未知 ${fm.unknownN??'—'} · ${ui.code(fm.status)} · ${ui.code(fm.reason,'无额外限制')}`;
  $('#fm-note').textContent=(fm.rows?.length?'':`样本不足 · ${ui.code(fm.reason)}`)+'；疼痛量表尚未核实，缺少可比较的疼痛评分，不能据原始记录推算。';
  $('#fm-rows').replaceChildren();$('#fm-table').hidden=!fm.rows?.length;
  for(const row of fm.rows||[]) {
    const tr=document.createElement('tr');tr.dataset.metric=row.metric;
    tr.append(textNode('td',ui.label(row.metric)),textNode('td',row.displayFM),textNode('td',row.displayOther));
    tr.append(textNode('td',row.displayDifference,row.highlight===true?'difference highlight':'difference'));
    const detail=textNode('td',`${ui.code(row.status)} · ${ui.code(row.reason,'无额外限制')} · 有效 ${row.nFMValid}/${row.nOtherValid} · ${testText(row.test)}`);
    if(row.test?.significant===true)detail.append(textNode('strong','显著','significant'));
    tr.append(detail);$('#fm-rows').append(tr);
  }
  $('#analysis-policy').textContent=`统计口径尚未医学批准。评估时点：${ui.time(meta.at)}；数据截至 ${meta.asOfDate??'未提供'}；读取 ${meta.readStartedAt??'未提供'} 至 ${meta.readCompletedAt??'未提供'}；计算 ${meta.computedAt??'未提供'}；${meta.statisticalDisclosure??'统计结果仅供探索，不表示因果。'}`;$('#analysis-policy').hidden=false;
  $('#clinical-panels').hidden=false;
  if(typeof renderDiscoveries==='function')renderDiscoveries(data);
}
// 自动发现：只用本次分析结果里的数字，描述差异，不做因果判断
function renderDiscoveries(data) {
  if(!$('#insights')||!$('#discoveries'))return; // 页面还是旧版 HTML 时不渲染，避免影响分析结果显示
  const st=data.stats||{},tx=data.byTx||{},fm=data.fm||{},meta=data.meta||{},pct=v=>typeof v==='number'&&Number.isFinite(v)?Math.round(v*100)+'%':'—',cards=[];
  if(typeof st.targetRate==='number'&&st.evaluable)cards.push(['good','达标情况',`队列达标率 ${pct(st.targetRate)}，研究库整体 ${tx.studyTargetMeta?.displayText??'—'}`,`${st.evaluable} 位可评估患者中 ${Math.round(st.targetRate*st.evaluable)} 位 DAS28-CRP ≤ 2.7（低疾病活动或缓解）。`,`评估时点：${ui.time(meta.at)} · 阈值 DAS28-CRP ≤ 2.7`]);
  const groups=(tx.groups||[]).filter(g=>g.evalN>0&&typeof g.rate==='number');
  if(groups.length>=2){const sorted=[...groups].sort((a,b)=>b.rate-a.rate),hi=sorted[0],lo=sorted[sorted.length-1];cards.push(['','治疗分组',`${ui.code(hi.tx,hi.tx)} 组达标率最高（${pct(hi.rate)}），${ui.code(lo.tx,lo.tx)} 组最低（${pct(lo.rate)}）`,`各组可评估人数：${groups.map(g=>`${g.tx} ${g.evalN}`).join(' · ')}。组间基线疾病活动、病程和治疗线数不同，差异不等同于疗效差异。`,'观察性数据的组间描述，未做倾向评分或多因素校正']);}
  const rows=fm.rows||[],top=rows.find(r=>r.highlight===true)||rows[0];
  cards.push(['warn','亚组差异',rows.length?`合并 FM ${fm.nFM} 位 vs 明确无 FM ${fm.nOther} 位：${ui.label(top.metric)} ${top.displayFM} vs ${top.displayOther}`:`合并 FM 亚组样本不足（FM ${fm.nFM??'—'} 位 · 明确无 FM ${fm.nOther??'—'} 位）`,rows.length?rows.map(r=>`${ui.label(r.metric)} 差值 ${r.displayDifference}`).join('；')+'。':'每组至少需要 3 位可比较患者，暂不比较。','压痛相关指标差异明显时，应警惕 DAS28 被 FM 抬高']);
  if(typeof st.completeRate==='number'&&data.n)cards.push(['','数据质量',`${st.incompleteCount??'—'} 位患者（${pct(1-st.completeRate)}）资料待补全`,'缺失项可能影响上述比例的可靠性；可在数据质控中定位并补录。','缺失项来源：数据质控规则','data-quality.html']);
  $('#insights').replaceChildren(...cards.map(([kind,tag,title,text,basis,link])=>{const item=textNode('article','','insight-item'+(kind?' '+kind:'')),box=textNode('div','');box.append(textNode('span',tag,'tag'),textNode('strong',title),textNode('p',text));const small=textNode('small','依据：'+basis);if(link){const a=textNode('a','前往处理 →');a.href=link;small.append(a);}box.append(small);item.append(box);return item;}));
  $('#discoveries').hidden=cards.length===0;
}

function clearResults() {
  $('#cohort-n').textContent = '—'; $('#study-total').textContent = '—';
  for(const id of ['age-median','duration-median','target-rate','complete-rate','cohort-detail','age-detail','female-detail','duration-detail','sero-detail','target-detail','complete-detail','qc-detail'])$('#'+id).textContent='—';
  $('#patient-rows').replaceChildren(); $('#list-count').textContent = '';
  $('#numeric-computed-at').textContent='';$('#display-read-at').textContent='';
  for(const selector of ['#activity-base','#activity-current','#tx-groups','#line-groups','#fm-rows'])$(selector).replaceChildren();
  for(const id of ['activity-summary','tx-summary','study-target','tx-test','tx-notice','line-summary','fm-summary','fm-note','analysis-policy'])$('#'+id).textContent='';
  $('#clinical-panels').hidden=true;$('#analysis-policy').hidden=true;if($('#insights'))$('#insights').replaceChildren();if($('#discoveries'))$('#discoveries').hidden=true;
  $('#results').hidden = true; $('#no-result').hidden = true; $('#analysis-error').hidden = true;
  $('#login-return').hidden = true; $('#more').hidden = true; $('#more').disabled=true;
  $('#export').disabled=true;resource=null;delete $('#results').dataset.analysisId;$('#private-open-meta').textContent='';delete $('#private-open-meta').dataset.cohortId;
}
function state(name, message) {
  $('#cohort-state').dataset.state = name; $('#cohort-state').textContent = message;
}
function updateChatEntry(){
  const link=$('#ask-current-cohort');if(!link||!window.RACohortChatEntry)return;
  link.removeAttribute('href');link.setAttribute('aria-disabled','true');
  if(disposed||blockedEntry||!currentUser()||identity!==identityKey())return;
  try{const filters=window.RACohortChatEntry.normalize(currentFilters());link.href='ai-chat.html'+window.RACohortChatEntry.encode({kind:'COHORT',filters});link.setAttribute('aria-disabled','false');}catch{}
}
$('#ask-current-cohort')?.addEventListener('click',event=>{if(disposed||checkIdentity()||blockedEntry){event.preventDefault();return;}updateChatEntry();if(!$('#ask-current-cohort').hasAttribute('href'))event.preventDefault();});
function renderChips() {
  updateChatEntry();
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
  state(resourceState,resourceState==='expired'?'分析结果已过期，请重新分析':resourceState==='scope-changed'?'授权范围已变化，请重新分析':error.status===404?'分析资源不存在，请重新分析':'分析失败，请确认条件后重新分析');
  $('#analysis-error').hidden = false;
  $('#error-message').textContent = ui.error(error);
  const traceBox=$('#error-trace');traceBox.textContent='';
  // 只显示受限诊断标识，后端message和任意响应内容不得成为诊断正文。
  if(typeof error.traceId==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(error.traceId)){
    const trace=error.traceId,value=document.createElement('span'),copy=document.createElement('button');
    value.textContent=trace;traceBox.textContent='诊断编号：';copy.type='button';copy.className='button compact';copy.textContent='复制诊断编号';
    copy.addEventListener('click',async()=>{
      if(copy.disabled)return;copy.disabled=true;
      try{if(!window.navigator?.clipboard?.writeText)throw new Error('clipboard unavailable');await window.navigator.clipboard.writeText(trace);copy.textContent='已复制';}
      catch{
        const selection=window.getSelection?.();
        if(selection&&document.createRange){const range=document.createRange();range.selectNodeContents(value);selection.removeAllRanges();selection.addRange(range);copy.textContent='请复制已选编号';}
        else copy.textContent='请选中编号手动复制';
      }finally{copy.disabled=false;}
    });
    traceBox.append(value,copy);
  }
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
  return `${label} CRP ${clinicalText(value.value)} ${clinicalText(value.unit)} · 访视 ${clinicalText(value.sourceVisitId)} · ${ui.label(value.sourceField)} · ${clinicalText(value.observedAt)} · 缺失原因：${ui.code(value.missingReason,'无')} · 资料质量：${ui.list(value.quality)}`;
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
  const block=textNode('div','',className);block.append(textNode('strong',label.startsWith('evaluation ')?ui.label(label.slice(11)):label.startsWith('clinicalProvenance ')?ui.label(label.slice(19))+'来源':ui.label(label)));
  for(const key of keys.filter(k=>!['ruleVersion','dictionaryVersion','fmSource'].includes(k)))block.append(textNode('span',`${ui.label(key)}：${ui.fieldValue(key,value[key])}`));
  return block;
}
function patientSources(patient,meta) {
  const details=document.createElement('details');details.className='patient-provenance';details.append(textNode('summary','临床来源与质量'));
  const body=textNode('div','','patient-sources');
  if(patient.clinicalProvenance.fm.source==='CONFIGURED_FM_EVIDENCE')body.append(textNode('div','纤维肌痛：使用已核定的来源依据','patient-fm-version'));
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
    const keys=key==='sero'?['sourceVisitId','sourceField','observedAt','status']:key==='fm'&&value.source==='CONFIGURED_FM_EVIDENCE'?['evidenceId','observedAt','fmState']:['sourceRowId','sinceYear'];
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
function patientLongId(id){return typeof id==='string'&&/^[1-9][0-9]*$/.test(id)&&(id.length<19||(id.length===19&&id<='9223372036854775807'));}
function compactCells(patient) {
  const c=patient.clinical,t=patient.treatment,v=x=>typeof x==='number'&&Number.isFinite(x)?String(Math.round(x*100)/100):'—';
  const cell=(main,sub,cls)=>{const node=textNode('div','','patient-cell '+cls);node.append(textNode('b',main),textNode('small',sub));return node;};
  const drugs=t.genericDrugIds.length?t.genericDrugIds.map(ui.drugLabel).join('、'):'未记录药物';
  const activity={remission:'缓解',low:'低疾病活动',moderate:'中疾病活动',high:'高疾病活动'};
  const pill=textNode('div','','patient-cell cell-activity');pill.append(textNode('span',activity[patient.activity]??'未知','activity-pill'+(Object.hasOwn(activity,patient.activity)?' activity-'+patient.activity:'')));
  const crp=patient.crpCurrent?.value??patient.crpAt?.value;
  const comorbid=[c.fm==='TRUE'?'FM':null,c.as==='TRUE'?'AS':null].filter(Boolean).join(' / ')||(c.fm==='FALSE'&&c.as==='FALSE'?'无':'未知');
  return [cell(t.category||'未知方案',drugs+(t.line?` · ${t.line} 线`:''),'cell-tx'),cell(t.schemeDurationMonths==null?'未知':`${t.schemeDurationMonths} 个月`,'当前方案时长','cell-duration'),
    cell(`${v(patient.das28Base)} → ${v(patient.das28Current??patient.das28At)}`,'DAS28-CRP 基线 → 当前','cell-das'),pill,cell(v(crp),'CRP mg/L','cell-crp'),cell(comorbid,'其他病史','cell-comorbid')];
}
function appendPatients(items,meta) {
  for (const patient of items) {
    const row=document.createElement('div');row.className='ai-row';row.dataset.patientId=patient.patientId;row.setAttribute('role','listitem');
    const c=patient.clinical,t=patient.treatment;
    const personal=textNode('div','', 'patient-clinical');
    for(const value of [patient.name??'未记录姓名',patient.studyNo??'未记录研究号',patient.patientId])personal.append(textNode('span',value));
    if(patientLongId(patient.patientId)){const link=textNode('a','查看患者档案');link.href='patient-visits.html?id='+encodeURIComponent(patient.patientId)+'&from=ai-cohort';personal.append(link);}
    personal.append(textNode('small',`${ui.code(c.sex,'未知')} · 年龄 ${clinicalText(c.age)} · 病程年 ${clinicalText(c.diseaseDurationYears)} · 血清 ${ui.code(c.sero,'未知')}`));row.append(personal);
    if(typeof compactCells==='function')row.append(...compactCells(patient));
    row.append(textNode('div',`${ui.code(t.state,'未知')} · ${ui.code(t.category,'未知方案')} · 线数 ${clinicalText(t.line)} · 靶向药史 ${clinicalText(t.targetedDrugHistoryN)} · 用药记录 ${t.genericDrugIds.length} 项 · ${t.genericDrugIds.length?t.genericDrugIds.map(ui.drugLabel).join('、'):'未记录'}`,'patient-treatment'));
    row.append(textNode('div',`方案月数 ${clinicalText(t.schemeDurationMonths)} · 明确起点 ${clinicalText(t.startDate)} · 估算起点 ${clinicalText(t.estimatedStartDate)} · ${ui.code(t.startConfidence,'未知')} · 结束 ${clinicalText(t.endDate)}`,'patient-duration'));
    row.append(textNode('div',`DAS28-CRP 基线 ${clinicalText(patient.das28Base)} → 评估 ${clinicalText(patient.das28At)}；当前 ${clinicalText(patient.das28Current)}；差值 ${clinicalText(patient.deltaDas28)}`,'patient-das28'));
    const activity={remission:'缓解',low:'低',moderate:'中',high:'高'};
    row.append(textNode('div',`DAS28-CRP 活动 ${activity[patient.activity]??'未知'}`,'patient-activity'+(Object.hasOwn(activity,patient.activity)?' activity-'+patient.activity:'')));
    row.append(textNode('div',crpText('评估',patient.crpAt)+'；'+crpText('当前',patient.crpCurrent),'patient-crp'));
    row.append(textNode('div',`FM ${ui.patientFm(c.fm,patient.clinicalProvenance.fm)} · AS ${ui.code(c.as,'未知')}`,'patient-comorbidity'));
    row.append(patientSources(patient,meta));$('#patient-rows').append(row);
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
  $('#results').dataset.analysisId=data.analysisId;$('#export').disabled=false;
  $('#cohort-n').textContent = String(data.n); $('#study-total').textContent = String(data.studyTotal);
  renderCards(data);
  if (data.n === 0) {
    state('empty','分析完成，当前条件下没有患者'); $('#no-result').hidden = false; return;
  }
  renderPanels(data);
  appendPatients(data.patients.items,data.meta);renderPatientTimes(data.meta);renderPageRights();
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
    endOperation(operation,'page','INVALID_RESPONSE');endExport('INVALID_RESPONSE');clearResults();showError({status:result.status,code:'INVALID_RESPONSE',message:'分页响应不完整',traceId:result.traceId});return;
  }
  endOperation(operation,'page','SUCCESS');
  resource.consumed.add(operation.cursor);appendPatients(data.patients.items,data.meta);resource.loaded+=data.patients.items.length;resource.cursor=data.patients.nextCursor;
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
function analyze(completeFilters=null) {
  if (disposed) return;
  checkIdentity();saveParametersChanged();invalidate();identity=identityKey();renderChips();
  if (blockedEntry) {
    showError(blockedEntry); return;
  }
  const complete=completeFilters?.studyCode==='RA'&&privateFilters(completeFilters)!==null;
  const filters = complete?completeFilters:currentFilters();
  history.replaceState(null,'',location.pathname+window.RACohortConditions.encode({...filters,ids:entryIds})+location.hash);
  const operation = {controller:new AbortController(),timer:null,terminal:null,identity,generation};
  flight = operation;waiting();state('loading','正在分析，请稍候'); lockControls(true);
  operation.timer = setTimeout(()=>{
    finish(operation,null,{code:'REQUEST_TIMEOUT',message:'请求超过30秒，请重新分析'});
    operation.controller.abort();
  },30_000);
  window.RACohortAPI.cohort(filters,{signal:operation.controller.signal,completeFilters:complete}).then(result=>finish(operation,result),error=>finish(operation,null,error));
}
Object.values(SELECTS).forEach(selector=>$(selector).addEventListener('change',analyze));
$('#chips').addEventListener('click',event=>{
  const button=event.target.closest('[data-key]'); if (!button || disposed) return;
  if(button.dataset.key==='ids')entryIds=null;
  else $(SELECTS[button.dataset.key]).value=button.dataset.key==='at'?'now':'';
  analyze();
});
function parseState(name,message){$('#parse-state').dataset.state=name;$('#parse-state').textContent=message;}
const PARSE_FIELDS={sex:['F','M'],sero:['1'],tx:['csDMARD','bio','TNFi','JAKi','IL-6i','Abatacept'],at:['now','6m'],act:['target','mod-high','remission','low','moderate','high'],cm:['FM','AS','none'],data:['complete','missing']};
const PARSE_ORDER=['tx','at','act','sex','age','cm','sero','data'];
const PARSE_FALLBACKS=['AI_NOT_ENABLED','AI_NOT_APPROVED','AI_CONFIG_UNAVAILABLE','AI_NOT_APPLICABLE','AI_SAFETY_BLOCKED','AI_BUSY','AI_TIMEOUT','AI_HTTP_ERROR','AI_IO_ERROR','AI_INVALID_RESPONSE'];
function validParse(data,trace){
 const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)),count=n=>Number.isSafeInteger(n)&&n>=0;
 if(!exact(data,['questionRef','candidateFilters','parseStatus','applyMode','engine','matched','unrecognized','rejectedFields','warnings','notice','fallbackReason','meta'])||!(typeof data.questionRef==='string'&&PRIVATE_UUID.test(data.questionRef))||!['RULE','AI'].includes(data.engine)||!(data.fallbackReason===null||PARSE_FALLBACKS.includes(data.fallbackReason))||typeof data.notice!=='string'||[...data.notice].length>200)return false;
 if(!exact(data.meta,['traceId','ruleVersion','schemaVersion','modelVersion','promptVersion','durationMs'])||data.meta.traceId!==trace||data.meta.ruleVersion!=='dev-parse-rules-v02'||data.meta.schemaVersion!=='dev-parse-schema-v01'||!count(data.meta.durationMs)||!['modelVersion','promptVersion'].every(k=>data.meta[k]===null||typeof data.meta[k]==='string'))return false;
 const modes={OK:'REPLACE_EXCEPT_IDS',PARTIAL:'REQUIRE_CONFIRMATION',EMPTY:'KEEP_CURRENT',UNRECOGNIZED:'KEEP_CURRENT',UNSUPPORTED:'KEEP_CURRENT'};
 if(!Object.hasOwn(modes,data.parseStatus)||data.applyMode!==modes[data.parseStatus])return false;
 const candidate=data.candidateFilters;
 if(['OK','PARTIAL'].includes(data.parseStatus)){if(!object(candidate)||!Object.keys(candidate).length)return false;}else if(candidate!==null)return false;
 for(const [key,value] of Object.entries(candidate||{})){
  if(typeof value!=='string'||!PARSE_ORDER.includes(key))return false;
  if(key==='age'){const parts=value.match(/^(\d{1,3})-(\d{1,3})?$/);if(!parts||Number(parts[1])>120||(parts[2]!==undefined&&(Number(parts[2])>120||Number(parts[1])>Number(parts[2]))))return false;}
  else if(!PARSE_FIELDS[key].includes(value))return false;
 }
 const expected=PARSE_ORDER.filter(k=>Object.hasOwn(candidate||{},k));
 if(!Array.isArray(data.matched)||data.matched.length!==expected.length||!data.matched.every((x,i)=>exact(x,['field','value'])&&x.field===expected[i]&&x.value===candidate[x.field]))return false;
 if(!Array.isArray(data.unrecognized)||data.unrecognized.length>1||!data.unrecognized.every(x=>exact(x,['reason','count'])&&x.reason==='UNMAPPED_TEXT'&&count(x.count)&&x.count>0))return false;
 const rejectedFields=[...PARSE_ORDER,'ids','studyCode','doctorId','sql','url','OTHER'],reasons=['FORBIDDEN_FIELD','UNKNOWN_FIELD','INVALID_TYPE','INVALID_VALUE','OUT_OF_RANGE','CONFLICT'];
 if(!Array.isArray(data.rejectedFields)||data.rejectedFields.length>16||!data.rejectedFields.every(x=>exact(x,['field','reason'])&&rejectedFields.includes(x.field)&&reasons.includes(x.reason))||new Set(data.rejectedFields.map(x=>x.field)).size!==data.rejectedFields.length||(data.engine==='RULE'&&data.rejectedFields.length))return false;
 return Array.isArray(data.warnings)&&new Set(data.warnings).size===data.warnings.length&&data.warnings.every(x=>[...PARSE_FALLBACKS,'MODEL_FIELDS_REJECTED','PARTIAL_REQUIRES_CONFIRMATION','UNSUPPORTED_OR','UNSUPPORTED_NEGATION','CONFLICTING_CONDITIONS','AGE_OUT_OF_RANGE'].includes(x));
}
function clearParse(){$('#parse-apply').hidden=true;$('#parse-note-context').hidden=true;$('#parse-note-context').textContent='';delete $('.parse-panel').dataset.parseStatus;for(const id of ['parse-candidate','parse-details','parse-note'])$('#'+id).textContent='';$('#parse-note').hidden=true;}
function showParse(data,applied=false){
 $('.parse-panel').dataset.parseStatus=data.parseStatus;
 $('#parse-candidate').textContent=(data.candidateFilters?ui.conditions(data.candidateFilters):'')||'暂无可用候选，保留当前条件';
 const unresolved=(data.unrecognized||[]).reduce((n,x)=>n+x.count,0);
 $('#parse-details').textContent=[data.parseStatus==='PARTIAL'?(applied?'仅识别了部分内容，已明确确认并应用已识别条件':'仅识别了部分内容，确认前不会应用'):data.parseStatus==='OK'?'已识别可用条件':ui.code(data.parseStatus),unresolved?`仍有部分文字未识别（${unresolved}个字符），未用于筛选`:'',...(data.rejectedFields||[]).map(x=>`${ui.label(x.field)}：${ui.code(x.reason)}`),...new Set((data.warnings||[]).filter(x=>!(applied&&x==='PARTIAL_REQUIRES_CONFIRMATION')).map(x=>ui.code(x)))].filter(Boolean).join('；');
 $('#parse-note').hidden=false;$('#parse-note').textContent=data.notice;$('#parse-note-context').hidden=!applied;$('#parse-note-context').textContent=applied?'解析时说明（应用前）':'';
 parseState('success',applied?'候选已应用':data.parseStatus==='PARTIAL'?'部分候选尚未应用，需要明确确认后才可应用':'候选尚未应用，当前条件保持不变');
}
function settleParse(operation,cause){
 if(operation.terminal)return false;operation.terminal=cause;
 if(parseFlight===operation)parseFlight=null;clearTimeout(operation.timer);$('#parse-cancel').hidden=true;
 return true;
}
function endParse(cause='SUPERSEDED'){
 endEntry(cause);
 endApply(cause);
 const previous=parseFlight;parseToken++;
 if(previous)settleParse(previous,cause);
 parseCandidate=null;clearParse();$('#parse-cancel').hidden=true;$('#parse-dismiss').hidden=true;parseState('idle','候选已结束，当前有效条件保持不变');
 if(previous)previous.controller.abort();
}
function isCurrentParse(operation){return !disposed&&!operation.terminal&&parseFlight===operation&&parseToken===operation.token&&questionVersion===operation.questionVersion&&JSON.stringify(currentFilters())===operation.context;}
function finishParse(operation,result,error){
 if(!isCurrentParse(operation))return;
 if(operation.identity!==identityKey()){checkIdentity();return;}
 if(!error&&(result?.success!==true||result?.code!=='200'||!validParse(result.data,result.traceId)))error={status:result?.status,code:'INVALID_RESPONSE',message:'解析候选响应不完整',traceId:result?.traceId};
 if(!settleParse(operation,error?.code||'SUCCESS'))return;
 if(error){
  parseCandidate=null;clearParse();$('#parse-dismiss').hidden=true;
  if(error.status===401){clearPrivate();invalidate(error);}
  parseState('error',`${ui.error(error)} `);return;
 }
 parseCandidate={fromEntry:operation.fromEntry,data:result.data,token:operation.token,identity:operation.identity,questionVersion:operation.questionVersion,context:operation.context};
 showParse(result.data);$('#parse-dismiss').hidden=result.data.candidateFilters===null;$('#parse-apply').hidden=result.data.parseStatus!=='PARTIAL';if(result.data.parseStatus==='OK')applyCandidate();
}
function parseQuestion(fromEntry=false){
 if(disposed||checkIdentity())return;
 endParse('SUPERSEDED');
 const operation={fromEntry:fromEntry===true,token:parseToken,identity:identityKey(),questionVersion,context:JSON.stringify(currentFilters()),controller:new AbortController(),timer:null,terminal:null};parseFlight=operation;
 $('#parse-cancel').hidden=false;parseState('loading',[...$('#question').value].length>200?'问题超过200个字符，正在检查':'正在解析问题');
 operation.timer=setTimeout(()=>{finishParse(operation,null,{code:'REQUEST_TIMEOUT',message:'解析等待超过30秒，本地等待已结束；不能确认服务端审计是否已提交'});operation.controller.abort();},30000);
 window.RACohortAPI.parse($('#question').value,{signal:operation.controller.signal}).then(result=>finishParse(operation,result),error=>finishParse(operation,null,error));
}
function validApply(data,command,trace){
 const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
 const mode=command.parseStatus==='OK'?'REPLACE_EXCEPT_IDS':'REQUIRE_CONFIRMATION';
 if(!exact(data,['questionRef','parseStatus','applyMode','applied','filters','meta'])||data.questionRef!==command.questionRef||data.parseStatus!==command.parseStatus||data.applyMode!==mode||typeof data.applied!=='boolean')return null;
 if(!exact(data.meta,['traceId','ruleVersion','schemaVersion','modelVersion','promptVersion','durationMs'])||data.meta.traceId!==trace||data.meta.ruleVersion!=='dev-parse-rules-v02'||data.meta.schemaVersion!=='dev-parse-schema-v01'||data.meta.modelVersion!==null||data.meta.promptVersion!==null||!Number.isSafeInteger(data.meta.durationMs)||data.meta.durationMs<0)return null;
 const filters=privateFilters(data.filters);if(!filters||Object.keys(SELECTS).some(key=>data.filters[key]===''))return null;
 const expectedIds=command.currentFilters.ids==null?null:[...new Set(command.currentFilters.ids)].sort((a,b)=>a.length-b.length||a.localeCompare(b));
 if(JSON.stringify(filters.ids)!==JSON.stringify(expectedIds))return null;
 return filters;
}
function settleApply(operation,cause){
 if(operation.terminal)return false;operation.terminal=cause;
 if(applyFlight===operation){applyFlight=null;$('#apply-cancel').hidden=true;}
 clearTimeout(operation.timer);return true;
}
function endApply(cause='SUPERSEDED'){
 const previous=applyFlight;applyToken++;
 if(previous)settleApply(previous,cause);
 $('#apply-cancel').hidden=true;
 if(previous)previous.controller.abort();
}
function isCurrentApply(operation){return !disposed&&!operation.terminal&&applyFlight===operation&&applyToken===operation.token&&parseToken===operation.parseToken&&questionVersion===operation.questionVersion&&JSON.stringify(currentFilters())===operation.context;}
function finishApply(operation,result,error){
 if(!isCurrentApply(operation))return;
 if(operation.identity!==identityKey()){checkIdentity();return;}
 const filters=!error&&validApply(result?.data,operation.command,result?.traceId);
 if(!error&&(result?.success!==true||result?.code!=='200'||!filters))error={status:result?.status,code:'INVALID_RESPONSE',message:'应用响应不完整',traceId:result?.traceId};
 if(!settleApply(operation,error?.code||'SUCCESS'))return;
 parseCandidate=null;$('#parse-apply').hidden=true;$('#parse-dismiss').hidden=true;
 if(error){
  clearParse();if(error.status===401){clearPrivate();invalidate(error);}
  parseState('error',`${ui.error(error)} `);return;
 }
 if(!result.data.applied){parseState('success','候选未应用，当前条件保持不变');return;}
 // 本owner先退休，再进入原条件/分析链；invalidate单向退休通知不会反调旧完成。
 applyPrivateFilters(filters);analyze(operation.fromEntry?result.data.filters:null);showParse(operation.data,true);
}
function applyCandidate(confirmPartial=false){
 if(disposed||checkIdentity())return;
 const candidate=parseCandidate;if(!candidate||candidate.token!==parseToken||candidate.identity!==identityKey()||candidate.questionVersion!==questionVersion||candidate.context!==JSON.stringify(currentFilters())||!['OK','PARTIAL'].includes(candidate.data.parseStatus)||(candidate.data.parseStatus==='PARTIAL'&&!confirmPartial))return;
 const data=candidate.data,command={currentFilters:JSON.parse(candidate.context),candidateFilters:data.candidateFilters,parseStatus:data.parseStatus,questionRef:data.questionRef};
 if(confirmPartial)command.confirmPartial=true;
 endApply();const operation={fromEntry:candidate.fromEntry,token:applyToken,parseToken:candidate.token,identity:candidate.identity,questionVersion:candidate.questionVersion,context:candidate.context,data,command,controller:new AbortController(),timer:null,terminal:null};applyFlight=operation;parseCandidate=null;
 $('#parse-apply').hidden=true;$('#apply-cancel').hidden=false;parseState('loading','正在应用候选条件');
 operation.timer=setTimeout(()=>{finishApply(operation,null,{code:'REQUEST_TIMEOUT',message:'应用等待超过30秒，本地等待已结束；不能确认服务端审计是否已提交'});operation.controller.abort();},30000);
 window.RACohortAPI.applyParse(command,{signal:operation.controller.signal}).then(result=>finishApply(operation,result),error=>finishApply(operation,null,error));
}
$('#parse-apply').addEventListener('click',()=>applyCandidate(true));
$('#apply-cancel').addEventListener('click',()=>{if(!applyFlight)return;const operation=applyFlight;finishApply(operation,null,{code:'REQUEST_CANCELLED',message:'本地应用等待已取消；不能确认服务端审计是否已提交'});operation.controller.abort();});
$('#question-form').addEventListener('submit',event=>{event.preventDefault();parseQuestion();});
$('#question').addEventListener('input',()=>{questionVersion++;endParse('QUESTION_CHANGED');});
$('#parse-cancel').addEventListener('click',()=>{if(!parseFlight)return;const operation=parseFlight;finishParse(operation,null,{code:'REQUEST_CANCELLED',message:'本地解析等待已取消；不能确认服务端审计是否已提交'});operation.controller.abort();});
$('#parse-dismiss').addEventListener('click',()=>endParse('CANDIDATE_CANCELLED'));
$('#reanalyze').addEventListener('click',analyze);
function entryState(name,message){$('#entry-state').dataset.state=name;$('#entry-state').textContent=message;}
function settleEntry(operation,cause){
 if(operation.terminal)return false;operation.terminal=cause;
 if(entryFlight===operation)entryFlight=null;clearTimeout(operation.timer);$('#entry-cancel').hidden=true;return true;
}
function endEntry(cause='SUPERSEDED'){
 const old=entryFlight;entryToken++;if(old)settleEntry(old,cause);$('#entry-cancel').hidden=true;
 if(old){entryState('idle','旧入口已结束，请选择当前入口');old.controller.abort();}
}
function isCurrentEntry(operation){return !disposed&&!operation.terminal&&entryFlight===operation&&entryToken===operation.token&&identity===operation.identity&&identityKey()===operation.identity&&generation===operation.generation;}
function validEntry(data,trace){
 const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
 if(!exact(data,['source','filters','missingBasis','status','canApply','reason','meta'])||data.source!=='SIMILAR'||!exact(data.meta,['asOf','readStartedAt','readCompletedAt','traceId','policyVersion'])||data.meta.traceId!==trace||data.meta.policyVersion!=='dev-similar-v01'||!/^\d{4}-\d{2}-\d{2}$/.test(data.meta.asOf)||!['readStartedAt','readCompletedAt'].every(k=>typeof data.meta[k]==='string'&&/Z$/.test(data.meta[k])&&Number.isFinite(Date.parse(data.meta[k])))||Date.parse(data.meta.readStartedAt)>Date.parse(data.meta.readCompletedAt))return null;
 const order=['sex','age','sero'];if(!Array.isArray(data.missingBasis)||!data.missingBasis.every((key,i)=>order.includes(key)&&(i===0||order.indexOf(key)>order.indexOf(data.missingBasis[i-1]))))return null;
 if(['READY','PARTIAL_BASIS'].includes(data.status)){
  const filters=privateFilters(data.filters);if(data.canApply!==true||data.reason!==null||!filters||Object.keys(SELECTS).some(k=>data.filters[k]==='')||data.filters.studyCode!=='RA'||data.filters.at!=='now'||data.filters.ids!==null||['tx','act','cm','data'].some(k=>data.filters[k]!==null)||!['sex','age','sero'].some(k=>data.filters[k]!==null)||(data.status==='READY')!==(data.missingBasis.length===0)||data.missingBasis.some(k=>data.filters[k]!==null))return null;
  return filters;
 }
 if(data.canApply!==false||data.filters!==null)return null;
 if(data.status==='NO_BASIS'&&data.reason===null)return false;
 if(data.status==='UNSUPPORTED_BASIS'&&data.reason==='AGE_OUT_OF_SUPPORTED_RANGE')return false;
 return null;
}
function finishEntry(operation,result,error){
 if(!disposed&&operation.identity!==identityKey()){checkIdentity();return;}
 if(!isCurrentEntry(operation))return;
 const filters=!error?validEntry(result?.data,result?.traceId):null;
 if(!error&&(result?.success!==true||result?.code!=='200'||filters===null))error={status:result?.status,code:'INVALID_RESPONSE',message:'相似入口响应不完整',traceId:result?.traceId};
 settleEntry(operation,error?.code||result.data.status);
 if(error){if(error.status===401){clearPrivate();invalidate(error);}entryState('error',`${ui.error(error,'入口等待已结束')} `);return;}
 const fact=`${ui.code(result.data.status)} · 缺少依据：${result.data.missingBasis.map(ui.label).join('、')||'无'}${result.data.reason?' · '+ui.code(result.data.reason):''}`;
 if(filters===false){entryState('empty',fact+'，未创建分析');return;}
 applyPrivateFilters(filters);analyze(result.data.filters);entryState('success','按以下特征筛选，包含当前患者；'+ui.conditions(filters)+'。'+fact);
}
function resolveSimilar(indexPatientId){
 if(disposed||checkIdentity())return;endEntry();
 const operation={indexPatientId,token:entryToken,identity:identityKey(),generation,controller:new AbortController(),timer:null,terminal:null};entryFlight=operation;
 $('#entry-cancel').hidden=false;entryState('loading','正在读取授权相似依据');
 operation.timer=setTimeout(()=>{finishEntry(operation,null,{code:'REQUEST_TIMEOUT',message:'入口等待超过30秒，本地等待已结束'});operation.controller.abort();},30000);
 window.RACohortAPI.resolveEntry(indexPatientId,{signal:operation.controller.signal}).then(result=>finishEntry(operation,result),error=>finishEntry(operation,null,error));
}
$('#entry-cancel').addEventListener('click',()=>{if(!entryFlight)return;const old=entryFlight;finishEntry(old,null,{code:'REQUEST_CANCELLED',message:'已取消入口等待'});old.controller.abort();});
$('#reset').addEventListener('click',()=>{
  if (disposed) return;
  Object.entries(SELECTS).forEach(([key,selector])=>$(selector).value=key==='at'?'now':'');
  $('#question').value=''; $('#parse-note').hidden=true; blockedEntry=false; entryIds=null;
  history.replaceState(null,'',location.pathname+location.hash); analyze();
});
const EXPORT_FIELDS=['patientId','sex','age','studyNo','treatmentCategory','genericDrugIds','line','schemeDurationMonths','das28Base','das28At','das28Current','crpCurrent','fm','as','completeness'];
function exportState(name,message){$('#export-state').dataset.state=name;$('#export-state').textContent=message;}
const EXPORT_METRICS=['n','age','duration','das28At','crpAt','haqAt','female','sero','target','complete','activity','line'];
const exportCatalog=source=>source==='COMPARE'?EXPORT_METRICS:EXPORT_FIELDS;
function validExportDecision(data,command){
 const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 const keys=(v,wanted)=>record(v)&&Object.keys(v).sort().join(',')===[...wanted].sort().join(',');
 const catalog=exportCatalog(command.source),chosen=command.source==='COMPARE'?command.metrics:command.fields;
 const selection=v=>Array.isArray(v)&&v.every(f=>catalog.includes(f))&&new Set(v).size===v.length;
 const requested=chosen||catalog;
 return keys(data,['decision','source','referenceId','selectionMode','requested','eligible','blocked','freeStart','today','policyVersion'])&&data.decision==='NEED_APPLY'&&data.source===command.source&&data.referenceId===(command.source==='COMPARE'?command.compareResultId:command.analysisId)&&data.selectionMode===(chosen?'EXPLICIT':'DEFAULT')&&selection(data.requested)&&JSON.stringify(data.requested)===JSON.stringify(requested)&&selection(data.eligible)&&Array.isArray(data.blocked)&&data.blocked.length>0&&data.blocked.every(b=>keys(b,['field','side','reason','affectedN'])&&requested.includes(b.field)&&!data.eligible.includes(b.field)&&(command.source==='COMPARE'?['A','B'].includes(b.side):b.side===null)&&['NO_VALID_CONTRIBUTION','INCOMPLETE_SOURCE_EVIDENCE','MISSING_SOURCE_DATE','SOURCE_BEFORE_WINDOW','SOURCE_AFTER_TODAY'].includes(b.reason)&&Number.isInteger(b.affectedN)&&b.affectedN>=0)&&[data.freeStart,data.today].every(v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v))&&typeof data.policyVersion==='string';
}
function showExportFields(selected=[]){
 $('#export-fields').replaceChildren();
 for(const field of exportCatalog(exportSelection?.source)){const label=textNode('label',ui.label(field));const input=document.createElement('input');input.type='checkbox';input.value=field;input.checked=selected.includes(field);label.prepend(input);$('#export-fields').append(label);}
}
function exportButtons(busy){for(const id of ['export-default','export-confirm','export-eligible'])$('#'+id).disabled=busy;}
function settleExport(operation,cause){
 if(operation.terminal)return false;
 operation.terminal=cause;
 if(exportFlight===operation){exportFlight=null;exportButtons(false);}
 clearTimeout(operation.timer);
 if(operation.url){URL.revokeObjectURL(operation.url);operation.url=null;}
 return true;
}
function endExport(cause='SUPERSEDED'){
 const old=exportFlight;
 if(old)settleExport(old,cause);
 applicationDraft=null;$('#application-form').hidden=true;$('#application-open').hidden=true;
 exportSelection=null;$('#export-dialog').hidden=true;$('#export-decision').hidden=true;$('#export-eligible').hidden=true;
 exportState('idle','当前引用已变化，请重新选择导出内容');
 if(old)old.controller.abort();
}
function exportReferenceCurrent(selection){
 const current=selection.source==='COMPARE'?comparisonResource:resource;
 const currentGeneration=selection.source==='COMPARE'?comparisonGeneration:generation;
 const currentId=current&&(selection.source==='COMPARE'?current.compareResultId:current.analysisId);
 return current===selection.resource&&currentId===selection.referenceId&&currentGeneration===selection.generation&&identity===selection.identity&&identityKey()===selection.identity;
}
function exportMayPublish(operation){
 return !disposed&&!operation.terminal&&exportFlight===operation&&exportReferenceCurrent(operation);
}
function openExport(source='COHORT'){
 if(disposed||checkIdentity()||exportFlight)return;
 const current=source==='COMPARE'?comparisonResource:resource;
 if(!current||(source==='COHORT'&&current.generation!==generation))return;
 exportSelection={source,resource:current,referenceId:source==='COMPARE'?current.compareResultId:current.analysisId,generation:source==='COMPARE'?comparisonGeneration:generation,identity};
 $('#export-dialog').hidden=false;$('#export-decision').hidden=true;$('#export-eligible').hidden=true;$('#application-open').hidden=true;
 $('#export-content-kind').textContent=source==='COMPARE'?'比较指标：默认包含完整12项；明确选择仍保留原A/B统计。':'队列字段：默认包含完整15字段；明确选择仍导出完整队列。';
 showExportFields();exportButtons(false);exportState('selecting',source==='COMPARE'?'请明确确认比较的默认或所选指标':'请明确确认队列的默认或所选字段');
}
async function requestExport(selected){
 if(disposed||checkIdentity()||!exportSelection||!exportReferenceCurrent(exportSelection)||exportFlight)return;
 const catalog=exportCatalog(exportSelection.source);
 if(selected&&(!selected.length||new Set(selected).size!==selected.length||selected.some(f=>!catalog.includes(f)))){exportState('error','请选择至少一个导出项');return;}
 const source=exportSelection.source,selector=source==='COMPARE'?'metrics':'fields',key=source==='COMPARE'?'compareResultId':'analysisId';
 const command=Object.freeze({source,[key]:exportSelection.referenceId,...(selected?{[selector]:Object.freeze(catalog.filter(f=>selected.includes(f)))}:{})});
 const operation={...exportSelection,command,controller:new AbortController(),timer:null,terminal:null,url:null};
 exportFlight=operation;exportButtons(true);exportState('loading','正在请求导出');
 operation.timer=setTimeout(()=>{if(!disposed&&operation.identity!==identityKey())checkIdentity();if(!exportMayPublish(operation))return;settleExport(operation,'REQUEST_TIMEOUT');exportState('error','本次文件等待已结束，不能确定服务器是否已写出；可明确重新请求');operation.controller.abort();},30000);
 try{
  const result=await RACohortAPI.exportXlsx(command,{signal:operation.controller.signal});
  if(!disposed&&operation.identity!==identityKey())checkIdentity();
  // Complete native body is a separate cut: authority must still belong to this operation.
  if(!exportMayPublish(operation))return;
  settleExport(operation,'SUCCESS');
  const link=document.createElement('a');
  try{operation.url=URL.createObjectURL(result.blob);link.href=operation.url;link.download=result.filename;document.body.append(link);link.click();}
  catch(downloadError){exportState('error','文件下载失败，请重试：浏览器无法开始本次下载，请明确重新请求');return;}
  finally{link.remove();if(operation.url){URL.revokeObjectURL(operation.url);operation.url=null;}}
  $('#export-dialog').hidden=true;exportState('success','文件下载已开始');
 }catch(error){
  if(!disposed&&operation.identity!==identityKey())checkIdentity();
  if(!exportMayPublish(operation))return;
  settleExport(operation,error.code||'REQUEST_FAILED');
  if(error.status===401){clearPrivate();invalidate(error);return;}
  if([404,410].includes(error.status)||error.code==='SCOPE_CHANGED'){invalidate(error);return;}
  if(error.status===409&&error.code==='NEED_APPLY'&&validExportDecision(error.data,command)){
   exportSelection.decision=JSON.parse(JSON.stringify(error.data));exportSelection.explicitCommand=command;exportSelection.eligible=[...error.data.eligible];$('#application-open').hidden=false;$('#application-open').disabled=error.data.selectionMode!=='EXPLICIT';$('#export-decision').hidden=false;$('#export-decision').textContent=`直接导出日期范围：${error.data.freeStart} 至 ${error.data.today}\n可直接导出：${error.data.eligible.map(ui.label).join('、')||'无'}\n需申请的内容：\n`+error.data.blocked.map(b=>`${ui.label(b.field)}${b.side?' · '+b.side+'组':''} · ${ui.code(b.reason)} · 影响 ${b.affectedN} 人`).join('\n');$('#export-eligible').hidden=false;exportState('need-apply',`所选导出内容需要申请 · `);
  }else exportState('error',`${ui.error(error.code==='NEED_APPLY'?{code:'INVALID_RESPONSE'}:error,undefined,'export')} `);
 }
}
const APPLICATION_REASONS={NOT_CONFIGURED:'通知尚未配置',INVALID_MAIL_CONFIG:'通知配置无效',RECIPIENT_CHANGED:'通知收件设置已变化',NOTIFICATION_BUSY:'通知正在处理中',PRE_DATA_REJECTED:'邮件服务在发送前拒绝',PRE_DATA_IO_FAILED:'邮件服务在发送前连接失败',DATA_OUTCOME_UNKNOWN:'正文发送结果未知',DEADLINE:'通知等待已到期',CALLER_INTERRUPTED:'通知等待已中断',SERVICE_STOPPED:'通知服务已结束',STATE_UPDATE_UNCONFIRMED:'通知状态提交尚未确认',IN_PROGRESS_OR_UNCERTAIN:'通知正在处理中或结果不确定'};
const applicationKeys=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
function validApplicationReceipt(data,expectedId=null){
 if(!applicationKeys(data,['applicationId','status','notification'])||data.status!=='APPLICATION_RECORDED'||typeof data.applicationId!=='string'||!/^([1-9][0-9]*)$/.test(data.applicationId)||data.applicationId.length>19||(data.applicationId.length===19&&data.applicationId>'9223372036854775807')||(expectedId&&data.applicationId!==expectedId))return false;
 const n=data.notification;if(!applicationKeys(n,['mailStatus','attemptId','retryable','smtpAccepted','statusConfirmed','reason','deliveryStatus'])||n.deliveryStatus!=='UNKNOWN'||typeof n.retryable!=='boolean'||typeof n.statusConfirmed!=='boolean'||![true,false,null].includes(n.smtpAccepted)||!(n.reason===null||Object.hasOwn(APPLICATION_REASONS,n.reason))||!(n.attemptId===null||typeof n.attemptId==='string'&&PRIVATE_UUID.test(n.attemptId)))return false;
 if(n.mailStatus==='PENDING')return n.attemptId===null&&n.retryable&&n.smtpAccepted===null&&n.statusConfirmed&&n.reason===null;
 if(n.mailStatus==='FAILED')return n.attemptId!==null&&n.retryable&&n.smtpAccepted===false&&n.statusConfirmed&&n.reason!==null;
 if(n.mailStatus==='SENT')return n.attemptId!==null&&!n.retryable&&n.smtpAccepted===true&&n.statusConfirmed&&n.reason===null;
 return n.mailStatus==='UNKNOWN'&&!n.retryable&&n.reason!==null&&(n.attemptId!==null||!n.statusConfirmed)&&(n.statusConfirmed||n.reason==='STATE_UPDATE_UNCONFIRMED');
}
function applicationState(name,message){$('#application-state').dataset.state=name;$('#application-state').textContent=message;}
function applicationButtons(){
 const busy=!!applicationFlight;
 $('#application-submit').disabled=busy;$('#application-replay').disabled=busy;$('#application-replay').hidden=!applicationSession?.sent;
 $('#application-cancel').hidden=!busy;
 const n=applicationSession?.receipt?.notification;
 $('#application-retry-notification').hidden=!(applicationSession?.notificationTrusted&&n?.retryable===true&&n.statusConfirmed===true&&['PENDING','FAILED'].includes(n.mailStatus));$('#application-retry-notification').disabled=busy;
}
function settleApplication(operation,cause){
 if(operation.terminal)return false;operation.terminal=cause;clearTimeout(operation.timer);if(applicationFlight===operation)applicationFlight=null;applicationButtons();return true;
}
function revokeApplication(cause='IDENTITY_ENDED'){
 const old=applicationFlight;if(old)settleApplication(old,cause);applicationDraft=null;applicationSession=null;$('#application-panel').hidden=true;$('#application-form').hidden=true;$('#application-receipt').hidden=true;$('#application-receipt').textContent='';$('#application-reason').value='';$('#application-start').value='';$('#application-end').value='';$('#application-change-note').hidden=true;applicationState('idle','申请仅记录需求，不表示审批或已生成历史文件。');applicationButtons();if(old)old.controller.abort();
}
function showApplicationReceipt(session){
 const d=session.receipt,n=d.notification,accepted=n.smtpAccepted===true?'邮件服务已受理':n.smtpAccepted===false?'邮件服务尚未受理':'邮件受理状态未知';
 $('#application-receipt').hidden=false;$('#application-receipt').textContent=`申请 #${d.applicationId} 已记录 · ${n.mailStatus==='FAILED'&&n.reason==='NOT_CONFIGURED'?'通知未发送，尚未配置':ui.code(n.mailStatus)}\n${accepted}，送达待确认\n${n.statusConfirmed?'通知状态已确认':'状态提交尚未确认'}${n.reason?' · '+APPLICATION_REASONS[n.reason]:''}\n申请记录不表示审批或已生成历史文件。`;
}
function applicationMayPublish(operation){return !disposed&&!operation.terminal&&applicationFlight===operation&&applicationSession===operation.session&&identity===operation.identity&&identityKey()===operation.identity;}
function finishApplication(operation,result,error){
 if(!disposed&&operation.identity!==identityKey()){checkIdentity();return;}if(!applicationMayPublish(operation))return;
 const expected=operation.session.receipt?.applicationId||null;
 if(!error&&(result?.status!==200||result?.success!==true||result?.code!=='200'||!validApplicationReceipt(result?.data,expected)))error={status:result?.status,code:'INVALID_RESPONSE',traceId:result?.traceId,message:'申请回执不完整'};
 if(!settleApplication(operation,error?.code||'SUCCESS'))return;
 const session=operation.session;
 if(error){
  session.notificationTrusted=false;session.lastError={status:error.status??0,code:error.code||'REQUEST_FAILED',data:error.data??null,traceId:error.traceId??null};applicationButtons();
  if(error.status===401){clearPrivate();invalidate(error);return;}
  const unknown=error.status>=500||['NETWORK_ERROR','INVALID_RESPONSE','REQUEST_TIMEOUT','REQUEST_CANCELLED'].includes(error.code);
  applicationState(unknown&&!session.receipt?'uncertain':'error',`${ui.error(error)}；${session.receipt?'原申请已记录事实保留，通知现态尚未确认。':unknown?'申请可能已经记录，已保留原申请内容和重试标识。':'本次请求未确认，原命令和输入保留。'}请明确使用同参数重试 / 刷新本申请。`);return;
 }
 session.receipt=JSON.parse(JSON.stringify(result.data));session.lastError=null;session.notificationTrusted=true;showApplicationReceipt(session);applicationState('recorded',`申请已记录；通知结果见本申请回执。`);applicationButtons();
}
function sendApplication(session,kind='apply'){
 if(disposed||checkIdentity()||applicationFlight||!session||applicationSession!==session||session.identity!==identityKey())return;
 if(kind==='retry'&&!(session.notificationTrusted&&session.receipt?.notification.retryable===true&&session.receipt.notification.statusConfirmed===true&&['PENDING','FAILED'].includes(session.receipt.notification.mailStatus)))return;
 const command=kind==='retry'?Object.freeze({applicationId:session.receipt.applicationId}):session.command;
 const operation={session,identity:session.identity,kind,command,controller:new AbortController(),timer:null,terminal:null};applicationFlight=operation;session.sent=true;session.notificationTrusted=false;$('#application-panel').hidden=false;applicationButtons();applicationState('loading',kind==='retry'?'正在重试本申请通知':'正在提交或同参数读取本申请');
 operation.timer=setTimeout(()=>{finishApplication(operation,null,{code:'REQUEST_TIMEOUT'});operation.controller.abort();},30000);
 window.RACohortAPI[kind==='retry'?'retryNotification':'applyAnalysis'](command,{signal:operation.controller.signal}).then(result=>finishApplication(operation,result),error=>finishApplication(operation,null,error));
}
function applicationDate(value){
 if(typeof value!=='string'||!/^([1-9][0-9]{3})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(value))return false;
 const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
function applicationReason(value){
 const reason=value.trim();if([...reason].length<1||[...reason].length>1000)return null;
 for(let i=0;i<reason.length;i++){const c=reason.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const low=reason.charCodeAt(++i);if(!(low>=0xdc00&&low<=0xdfff))return null;}else if(c>=0xdc00&&c<=0xdfff)return null;}return reason;
}
$('#application-open').addEventListener('click',()=>{
 if(disposed||checkIdentity()||exportFlight||!exportSelection||!exportReferenceCurrent(exportSelection)||exportSelection.decision?.selectionMode!=='EXPLICIT')return;
 applicationDraft={...exportSelection};$('#application-panel').hidden=false;$('#application-form').hidden=false;$('#application-selection').textContent=(applicationDraft.source==='COMPARE'?'队列比较':'当前队列')+' · '+applicationDraft.decision.requested.map(ui.label).join('、');$('#application-change-note').hidden=!(applicationSession?.sent&&!applicationSession.receipt);applicationButtons();
});
$('#application-form').addEventListener('submit',event=>{
 event.preventDefault();if(disposed||checkIdentity()||applicationFlight||!applicationDraft||!exportReferenceCurrent(applicationDraft)||applicationDraft.decision?.selectionMode!=='EXPLICIT')return;
 const startDate=$('#application-start').value,endDate=$('#application-end').value,purposeCode=$('#application-purpose').value,reason=applicationReason($('#application-reason').value);
 if(!applicationDate(startDate)||!applicationDate(endDate)||startDate>endDate||!['RESEARCH','DATA_CHECK','OTHER'].includes(purposeCode)||reason===null){applicationState('error','请填写有效日期、用途及1～1000个字符的申请说明。');return;}
 const selected=applicationDraft.explicitCommand,exportCommand=Object.freeze({...selected,[selected.source==='COMPARE'?'metrics':'fields']:Object.freeze([...applicationDraft.decision.requested])});
 const input={export:exportCommand,startDate,endDate,purposeCode,reason},signature=JSON.stringify(input);
 if(!applicationSession||applicationSession.signature!==signature){const previous=applicationSession;applicationSession={identity,signature,command:Object.freeze({requestId:crypto.randomUUID(),...input}),sent:false,receipt:null,notificationTrusted:false};$('#application-receipt').hidden=true;$('#application-receipt').textContent='';if(previous?.sent&&!previous.receipt)$('#application-change-note').hidden=false;}
 sendApplication(applicationSession);
});
$('#application-dismiss').addEventListener('click',()=>{applicationDraft=null;$('#application-form').hidden=true;});
$('#application-replay').addEventListener('click',()=>sendApplication(applicationSession));
$('#application-retry-notification').addEventListener('click',()=>sendApplication(applicationSession,'retry'));
$('#application-cancel').addEventListener('click',()=>{const old=applicationFlight;if(!old)return;finishApplication(old,null,{code:'REQUEST_CANCELLED'});old.controller.abort();});
$('#application-form').addEventListener('input',()=>{if(applicationSession?.sent&&!applicationSession.receipt)$('#application-change-note').hidden=false;});
$('#export-fields').addEventListener('change',()=>{if(!exportFlight&&exportSelection){exportSelection.decision=null;exportSelection.explicitCommand=null;applicationDraft=null;$('#application-open').hidden=true;$('#application-form').hidden=true;}});
$('#export').addEventListener('click',()=>openExport('COHORT'));
$('#compare-export').addEventListener('click',()=>openExport('COMPARE'));
$('#export-default').addEventListener('click',()=>requestExport());
$('#export-confirm').addEventListener('click',()=>requestExport([...$('#export-fields').querySelectorAll('input:checked')].map(input=>input.value)));
$('#export-eligible').addEventListener('click',()=>{if(!exportFlight&&exportSelection?.eligible){showExportFields(exportSelection.eligible);exportState('selecting','建议字段已选，请明确确认后请求');}});
$('#export-cancel').addEventListener('click',()=>{endExport('REQUEST_CANCELLED');exportState('cancelled','已取消本次文件等待，不能确定服务器是否已写出');});
$('#cancel-analysis').addEventListener('click',()=>{if(flight||pageFlight)invalidate({code:'REQUEST_CANCELLED',message:'请求已取消，请重新分析'});});
// 比较拥有独立operation/代次与保留资源，原分析owner不参与发布。
let comparisonSlots={a:null,b:null},comparisonResource=null,comparisonFlight=null,comparisonGeneration=0;
const COMPARISON_ROWS=[['n','COUNT'],['age','CONTINUOUS'],['duration','CONTINUOUS'],['das28At','CONTINUOUS'],['crpAt','CONTINUOUS'],['haqAt','CONTINUOUS'],['female','BINARY'],['sero','BINARY'],['target','BINARY'],['complete','BINARY'],['activity','DISTRIBUTION'],['line','DISTRIBUTION']];
const COMPARISON_POLICIES=['statistics','descriptive','qc','crp','now','clinical','serology','treatment','visitMatcher','drugDictionary','comparison'];
const comparisonClone=value=>JSON.parse(JSON.stringify(value));
function comparisonState(name,message){$('#compare-state').dataset.state=name;$('#compare-state').textContent=message;}
function clearComparisonResult(){comparisonResource=null;$('#compare-export').disabled=true;$('#compare-export').hidden=true;$('#compare-read').hidden=true;$('#compare-read').disabled=true;$('#compare-rows').replaceChildren();$('#compare-result').hidden=true;delete $('#compare-result').dataset.compareResultId;for(const id of ['compare-summary','compare-side-a','compare-side-b','compare-policy','compare-definition-note'])$('#'+id).textContent='';}
function endComparison(cause,clear=true){
 endExport(cause);
 endParse(cause);
 comparisonGeneration++;const old=comparisonFlight;
 if(old&&!old.terminal)old.terminal=cause;
 comparisonFlight=null;if(old)clearTimeout(old.timer);
 if(clear)clearComparisonResult();$('#compare-cancel').hidden=true;
 if(old)old.controller.abort();
}
function resetComparison(cause='IDENTITY_ENDED'){endComparison(cause);comparisonSlots={a:null,b:null};renderComparisonSources();comparisonState('idle','请选择 A/B 来源');}
function comparisonAt(slot){return slot?.source==='SAVED'?slot.item.filters.at:slot?.filters.at;}
function renderComparisonSources(){
 for(const side of ['a','b']){const slot=comparisonSlots[side];$('#compare-source-'+side).textContent=!slot?'尚未选择':slot.source==='FILTERS'?`已选条件 · ${ui.conditions(slot.filters)}`:`已选保存条件 · 条件编号 ${slot.cohortId} · ${privateItemText(slot.item)}`;}
 const mismatch=comparisonSlots.a&&comparisonSlots.b&&comparisonAt(comparisonSlots.a)!==comparisonAt(comparisonSlots.b);
 $('#compare-start').disabled=!comparisonSlots.a||!comparisonSlots.b||Boolean(mismatch);
 if(mismatch)comparisonState('error','A/B评估时点须相同，请重新选择来源');
}
function selectComparison(side,slot){
 if(disposed||checkIdentity()||blockedEntry)return;
 endComparison('SOURCE_CHANGED');comparisonSlots[side]=slot;comparisonState('idle','来源已选择，请比较');renderComparisonSources();
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
  for(const side of ['a','b']){const cell=textNode('td','');cell.dataset.side=side;const keys=row.kind==='COUNT'?['n']:row.kind==='CONTINUOUS'?['q1','median','q3','iqr','validN','unknownN','status']:row.kind==='BINARY'?['numerator','denominator','value','knownN','unknownN','status']:['denominator','knownN','unknownN','status'];const fields=keys.map(key=>`${ui.label(key)}：${key==='status'?ui.code(row[side][key]):row[side][key]===null?'缺失':row[side][key]}`);for(const group of row[side].groups||[])fields.push(`${ui.code(group.category,group.category)}：${group.count} 人 · 比例 ${group.value}`);cell.textContent=fields.join(' · ');if(row.kind!=='COUNT'){const coverage=data.meta.sourceDateCoverage[side][row.metric];cell.append(textNode('small','来源覆盖 · '+['validN','datedN','undatedN','missingN','minDate','maxDate','status'].map(key=>`${ui.label(key)}：${key==='status'?(coverage[key]==='PARTIAL'?'部分来源日期缺失':ui.code(coverage[key])):coverage[key]===null?'未提供':coverage[key]}`).join(' · '),'comparison-coverage'));}tr.append(cell);}
  const difference=textNode('td',row.difference===null?'不适用':`${row.difference}${row.kind==='BINARY'?' 百分点':''}`);difference.dataset.difference='';tr.append(difference);
  const test=textNode('td','不适用');test.dataset.test='';if(row.test){test.textContent=testText(row.test)+(row.kind==='CONTINUOUS'?'':` · 期望频数低于5的单元数 ${row.test.expectedBelow5Cells??'不适用'} · 单元总数 ${row.test.expectedCellCount??'不适用'}`);if(row.test.significant===true)test.append(textNode('strong',' 显著','stat-significant'));}tr.append(test);rows.append(tr);
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
 comparisonResource=comparisonClone(data);$('#compare-export').disabled=false;$('#compare-export').hidden=false;$('#compare-read').hidden=false;$('#compare-read').disabled=false;$('#compare-result').dataset.compareResultId=data.compareResultId;$('#compare-result').hidden=false;
 $('#compare-summary').textContent=`研究库 ${data.studyTotal} 人 · 两组重叠 ${data.overlapN} 人`;
 for(const side of ['a','b']){const q=data[side];$('#compare-side-'+side).textContent=`${side.toUpperCase()}组 · ${q.source==='SAVED'?'已保存条件':'当前筛选条件'} · ${ui.conditions(q.filters)}${q.source==='SAVED'?` · 条件编号 ${q.cohortId} · 版本 ${Number.isSafeInteger(q.cohortVersion)?q.cohortVersion:'超出安全显示范围'}`:''} · 排重前 ${q.nBeforeExclusion} 人 · 本组 ${q.n} 人 · 可评估 ${q.evalN} 人 · 指定患者 ${q.submittedUniqueIdsN??'未指定'} 人 · 其中有效 ${q.effectiveIdsN??'未指定'} 人`; }
 const meta=data.meta;$('#compare-policy').textContent=`${data.excludeOverlap?'双方均排除重叠患者':'保留重叠患者；交集存在时不能进行独立组检验'} · 评估时点 ${ui.time(meta.at)} · 数据截至 ${meta.asOfDate} · 读取 ${meta.readStartedAt} 至 ${meta.readCompletedAt} · 计算 ${meta.computedAt} · 有效期至 ${meta.expiresAt} · ${meta.statisticalDisclosure}`;comparisonState('success',meta.comparisonTraceId?'已重新读取原结果，数值和有效期保持不变':'比较完成，12项指标来自同次分析');
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
  if(operation.kind==='read'){const reason=error.status===404?'保留比较不存在':error.status===410?'保留比较已过期':error.status===409&&error.code==='SCOPE_CHANGED'?'授权研究库范围已变化':'无法验证保留结果';comparisonState('error',`${ui.error(error)}：${reason}，引用已清除，请重新比较`);return;}
  const unknown=error.status>=500||['NETWORK_ERROR','INVALID_RESPONSE','REQUEST_TIMEOUT','REQUEST_CANCELLED'].includes(error.code);
  comparisonState('error',`${ui.error(error,'比较未完成')}${unknown?'；结果尚未确认，不能确定是否已提交。再次比较会生成一条新结果。':''}`);return;
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
 if(comparisonFlight?.kind==='compare'&&['a','b'].some(side=>comparisonFlight.body[side].source==='SAVED'&&comparisonFlight.body[side].cohortId===cohortId)){endComparison('SOURCE_DELETED');comparisonState('error','来源定义已删除，请重选来源');}
 for(const side of ['a','b'])if(comparisonSlots[side]?.source==='SAVED'&&comparisonSlots[side].cohortId===cohortId)comparisonSlots[side]=null;
 if(affected)renderComparisonSources();
 if(comparisonResource&&['a','b'].some(side=>comparisonResource[side].source==='SAVED'&&comparisonResource[side].cohortId===cohortId))$('#compare-definition-note').textContent='来源定义已删除，当前为已保留结果；原ID、数值和有效期保持。';
}
$('#compare-start').addEventListener('click',startComparison);
$('#compare-read').addEventListener('click',startComparisonRead);
$('#compare-swap').addEventListener('click',()=>{if(disposed||checkIdentity())return;endComparison('SWAPPED');[comparisonSlots.a,comparisonSlots.b]=[comparisonSlots.b,comparisonSlots.a];comparisonState('idle','A/B已交换，请新比较');renderComparisonSources();});
$('#compare-exclude').addEventListener('change',()=>{if(disposed||checkIdentity())return;endComparison('EXCLUSION_CHANGED');comparisonState('idle','排重选择已改变，请新比较');renderComparisonSources();});
$('#compare-cancel').addEventListener('click',()=>{if(!comparisonFlight)return;const read=comparisonFlight.kind==='read';endComparison('REQUEST_CANCELLED');comparisonState('error',read?'已取消保留重读，引用已清除，请重新比较。':'已取消等待，结果尚未确认，不能确定是否已提交；重新比较会生成一条新结果。');});
window.RACohortComparison=Object.freeze({getResource:()=>comparisonResource===null?null:comparisonClone(comparisonResource)});
// 私有定义只读元信息；列表与保存独立于分析owner，不自动统计人数。
let listFlight=null,listToken=0,listPage=1,listTotal=null,privateItems=new Map(),privateDeleted=new Set();
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
function privateItemText(item){return `${item.name} · 备注：${item.note===null?'未填写':item.note} · 版本 ${Number.isSafeInteger(item.version)?item.version:'超出安全显示范围'} · 创建 ${item.createdAt} · 更新 ${item.updatedAt} · 条件 ${ui.conditions(item.filters)} · 打开后计算`;}
function applyPrivateFilters(filters){
  for(const [key,selector] of Object.entries(SELECTS)){
    const select=$(selector);
    if(key==='age'&&filters.age&&!Array.from(select.options||[]).some(option=>option.value===filters.age)){const option=document.createElement('option');option.value=filters.age;option.textContent=filters.age+' 岁';select.append(option);}
    select.value=filters[key];
  }
  entryIds=filters.ids===null?null:[...filters.ids];blockedEntry=false;
  history.replaceState(null,'',location.pathname+window.RACohortConditions.encode(filters)+location.hash);renderChips();saveParametersChanged();
}
function privatePagination(){
  $('#private-prev').disabled=Boolean(listFlight)||listPage<=1;
  $('#private-next').disabled=Boolean(listFlight)||listTotal===null||listPage>=Math.max(1,Math.ceil(listTotal/20));
  const pager=$('#private-prev').parentElement;
  if(pager)pager.hidden=listTotal===null||listTotal<=20;
}
function listState(name,message){$('#private-list-state').dataset.state=name;$('#private-list-state').textContent=message;}
function clearPrivate(){
  revokeApplication();
  resetComparison();
  cancelSave();cancelPrivateCommand();privateItems.clear();privateDeleted.clear();const previous=listFlight;listFlight=null;listToken++;if(previous){previous.terminal='IDENTITY_ENDED';clearTimeout(previous.timer);previous.controller.abort();}
  $('#private-edit-name').value='';$('#private-edit-note').value='';$('#private-edit-note-mode').value='preserve';$('#private-command-target').textContent='';listPage=1;listTotal=null;privatePagination();$('#private-items').replaceChildren();$('#private-page').textContent='';$('#private-prev').disabled=true;$('#private-open-meta').textContent='';$('#private-name').value='';$('#private-note').value='';listState('idle','尚未加载');
}
function loadPrivateList(page=listPage,refreshEdit=false,fallbackRemaining=1){
  if(disposed||checkIdentity()||!Number.isSafeInteger(page)||page<1)return;
  const editing=refreshEdit?privateEdit:null;
  if(editing){endPrivateCommand('REFRESHED');privateCommand=null;}else cancelPrivateCommand();
  const previous=listFlight;listFlight=null;listToken++;if(previous){previous.terminal='SUPERSEDED';clearTimeout(previous.timer);previous.controller.abort();}
  listPage=page;const operation={token:listToken,identity,page,controller:new AbortController(),timer:null,terminal:null};listFlight=operation;
  privateItems.clear();$('#private-items').replaceChildren();privatePagination();$('#private-page').textContent=`第 ${page} 页 · 每页 20 条 · 总数待确认`;listState('loading','正在读取私有条件定义');
  const finishList=(result,error)=>{
    if(disposed||operation.terminal||listFlight!==operation||operation.token!==listToken)return;
    if(operation.identity!==identityKey()){checkIdentity();return;}
    const data=result?.data;
    if(!error&&(!data||!validPrivateMeta(data,result.traceId)||data.page!==operation.page||data.size!==20||!Number.isSafeInteger(data.total)||data.total<0||!Array.isArray(data.items)||data.items.length>20||data.items.length>data.total||!data.items.every(validPrivateItem)||new Set(data.items.map(item=>item.cohortId)).size!==data.items.length))error={status:result?.status,code:'INVALID_RESPONSE',message:'私有定义列表响应不完整',traceId:result?.traceId};
    operation.terminal=error?.code||'SUCCESS';listFlight=null;clearTimeout(operation.timer);privatePagination();
    if(error){if(error.status===401){clearPrivate();invalidate(error);return;}if(editing&&privateEdit===editing){$('#private-version-refresh').hidden=false;$('#private-command-confirm').disabled=true;commandState('error',`元信息刷新失败：${ui.error(error)} ；原输入已保留，请再次刷新。`);}listState('error',`${ui.error(error)} `);return;}
    listTotal=data.total;
    const lastPage=Math.max(1,Math.ceil(listTotal/20));
    if(operation.page>lastPage){if(fallbackRemaining>0)loadPrivateList(lastPage,refreshEdit,fallbackRemaining-1);else{privatePagination();listState('error','列表在读取时发生变化，请重新加载');}return;}
    privatePagination();
    $('#private-page').textContent=`第 ${data.page} 页 · 每页 ${data.size} 条 · 共 ${data.total} 条`;
    for(const item of data.items){privateItems.set(item.cohortId,item);for(const side of ['a','b'])if(comparisonSlots[side]?.source==='SAVED'&&comparisonSlots[side].cohortId===item.cohortId)comparisonSlots[side].item=comparisonClone(item);const row=textNode('div',privateItemText(item),'private-item');row.dataset.privateCohort=item.cohortId;row.setAttribute('role','listitem');const button=textNode('button','打开并重新分析','button');button.type='button';button.dataset.openCohort=item.cohortId;row.append(button);const edit=textNode('button','修改名称/备注','button');edit.type='button';edit.dataset.editCohort=item.cohortId;edit.disabled=!Number.isSafeInteger(item.version);row.append(edit);const remove=textNode('button','删除','button');remove.type='button';remove.dataset.deleteCohort=item.cohortId;remove.disabled=!Number.isSafeInteger(item.version);row.append(remove);for(const side of ['a','b']){const choose=textNode('button','设为'+side.toUpperCase(),'button');choose.type='button';choose.dataset.compareSide=side;choose.dataset.compareCohort=item.cohortId;row.append(choose);}if(!Number.isSafeInteger(item.version))row.append(textNode('small','版本超出安全整数范围，只能读取或打开'));$('#private-items').append(row);}
    renderComparisonSources();
    if(editing&&privateEdit===editing){const item=privateItems.get(editing.item.cohortId);if(item){editing.item=item;editing.versionConflict=false;$('#private-command-target').textContent=privateItemText(item);$('#private-command-confirm').disabled=!Number.isSafeInteger(item.version);commandState('idle',Number.isSafeInteger(item.version)?'元信息已刷新，请核对输入后确认新命令':'版本超出安全整数范围，只能读取或打开');}else{cancelPrivateCommand();commandState('error','当前页未找到该定义，请加载对应页后重新选择。');}}
    listState(data.items.length?'success':'empty',data.items.length?'列表已读取，人数在打开后计算':'当前页没有私有定义');
  };
  operation.timer=setTimeout(()=>{finishList(null,{code:'REQUEST_TIMEOUT',message:'列表请求超过30秒，请重试'});operation.controller.abort();},30000);
  window.RACohortAPI.list({page,size:20},{signal:operation.controller.signal}).then(result=>finishList(result),error=>finishList(null,error));
}
function openPrivate(cohortId){
  if(disposed||checkIdentity()||!PRIVATE_UUID.test(cohortId))return;
  invalidate();const operation={controller:new AbortController(),timer:null,terminal:null,identity,generation,cohortId};flight=operation;waiting();state('loading','正在打开私有条件并重新分析');
  operation.timer=setTimeout(()=>{finish(operation,null,{code:'REQUEST_TIMEOUT',message:'打开请求超过30秒，请重试'});operation.controller.abort();},30000);
  window.RACohortAPI.open({cohortId},{signal:operation.controller.signal}).then(result=>finish(operation,result),error=>finish(operation,null,error));
}
$('#private-list-load').addEventListener('click',()=>loadPrivateList(listPage));
$('#private-prev').addEventListener('click',()=>{if(!listFlight&&listPage>1)loadPrivateList(listPage-1);});
$('#private-next').addEventListener('click',()=>{if(!listFlight&&listTotal!==null&&listPage<Math.ceil(listTotal/20))loadPrivateList(listPage+1);});
privatePagination();
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
  privateParametersChanged();if(privateEdit.versionConflict){commandState('error','记录已更新，请先刷新并核对输入，再确认修改');$('#private-version-refresh').hidden=false;return;}if(retry&&!privateCommand)return;
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
      const instruction=unknown?'结果尚未确认，不能确定是否已提交。可点重试。':error.code==='NAME_CONFLICT'?'名称冲突，请修改名称后重新确认。':error.code==='VERSION_CONFLICT'?'版本冲突，请刷新元信息，再核对输入并确认新命令。':error.code==='IDEMPOTENCY_CONFLICT'?'原请求标识对应不同参数，请核对输入；不要盲目重试。':error.status===404?'定义不存在、已删除或不属于当前身份，请重新加载列表。':'';
      if(error.status===404){removeComparisonDefinition(pending.body.cohortId);privateItems.delete(pending.body.cohortId);$(`[data-private-cohort="${pending.body.cohortId}"]`)?.remove();listState('error','条目已不可用，请重新加载列表');}
      if(error.code==='VERSION_CONFLICT'){privateEdit.versionConflict=true;$('#private-command-confirm').disabled=true;}
      $('#private-command-retry').hidden=!unknown;$('#private-version-refresh').hidden=error.code!=='VERSION_CONFLICT';if(!unknown)privateCommand=null;
      commandState('error',`${ui.error(error)} ${instruction} `);return;
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
      const instruction=unknown?'保存结果尚未确认，不能确定是否已提交。可点重试。':error.code==='NAME_CONFLICT'?'名称冲突，请修改名称后重新保存。':error.code==='IDEMPOTENCY_CONFLICT'?'请求标识对应不同参数，请核对输入后发起新命令。':'';
      $('#private-retry').hidden=!unknown;if(!unknown)saveCommand=null;
      saveState('error',`${ui.error(error)} ${instruction} `);return;
    }
    saveCommand=null;$('#private-retry').hidden=true;saveState('success','私有条件已保存');loadPrivateList(listPage);
  };
  operation.timer=setTimeout(()=>{finishSave(null,{code:'REQUEST_TIMEOUT',message:'保存请求超过30秒'});operation.controller.abort();},30000);
  window.RACohortAPI.save(command,{signal:operation.controller.signal}).then(result=>finishSave(result),error=>finishSave(null,error));
}
$('#save-cohort').addEventListener('click',()=>{if(disposed||checkIdentity())return;if(blockedEntry){showError(blockedEntry);return;}cancelSave();const dialog=$('#private-save-dialog');dialog.hidden=false;dialog.scrollIntoView?.({block:'center',behavior:'smooth'});$('#private-name').focus?.();});
$('#private-cancel').addEventListener('click',cancelSave);
$('#private-save').addEventListener('click',()=>saveCurrent());
$('#private-retry').addEventListener('click',()=>saveCurrent(true));
for(const selector of ['#private-name','#private-note'])$(selector).addEventListener('input',saveParametersChanged);
window.addEventListener('pagehide',()=>{disposed=true;clearPrivate();invalidate({code:'REQUEST_CANCELLED',message:'已离开页面，请重新分析'});});
window.addEventListener('pageshow',event=>{if(event.persisted){disposed=false;startEntry();}});
window.addEventListener('popstate',()=>{if(!disposed)startEntry();});
window.addEventListener('storage',event=>{if(event.key==='ra-auth')checkIdentity();});
window.addEventListener('focus',checkIdentity);
document.addEventListener('visibilitychange',checkIdentity);
startEntry();
