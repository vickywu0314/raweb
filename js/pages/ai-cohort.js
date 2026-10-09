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
function clearResults() {
  $('#cohort-n').textContent = '—'; $('#study-total').textContent = '—';
  $('#patient-rows').replaceChildren(); $('#list-count').textContent = '';
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
  return patients && patients.total===total && Number.isInteger(patients.returnedCount) && Array.isArray(patients.items) && patients.returnedCount===patients.items.length && patients.items.length===Math.min(total-loaded,max) && patients.items.every(patient=>typeof patient.patientId==='string'&&/^[1-9][0-9]*$/.test(patient.patientId)) && new Set(patients.items.map(patient=>patient.patientId)).size===patients.items.length && typeof patients.hasMore==='boolean' && patients.hasMore===(loaded+patients.items.length<total) && (patients.hasMore?typeof patients.nextCursor==='string'&&patients.nextCursor.length>0:patients.nextCursor===null);
}
function appendPatients(items) {
  for (const patient of items) {
    const row=document.createElement('div');row.className='ai-row';row.dataset.patientId=patient.patientId;row.setAttribute('role','listitem');
    for(const value of [patient.name??'未记录姓名',patient.studyNo??'未记录研究号',patient.patientId]){const cell=document.createElement('span');cell.textContent=value;row.append(cell);}
    $('#patient-rows').append(row);
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
  if (!data || !Number.isInteger(data.n) || !Number.isInteger(data.studyTotal) || data.n<0 || data.studyTotal<data.n || typeof data.analysisId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(data.analysisId) || !validPatients(data.patients,data.n,0,10)) {
    endOperation(operation,'cohort','INVALID_RESPONSE');showError({status:result.status,code:'INVALID_RESPONSE',message:'队列响应不完整',traceId:result.traceId});return;
  }
  endOperation(operation,'cohort','SUCCESS');
  resource={generation,analysisId:data.analysisId,cursor:data.patients.nextCursor,n:data.n,loaded:data.patients.items.length,consumed:new Set()};
  $('#results').dataset.analysisId=data.analysisId;
  $('#cohort-n').textContent = String(data.n); $('#study-total').textContent = String(data.studyTotal);
  if (data.n === 0) {
    state('empty','分析完成，当前条件下没有患者'); $('#no-result').hidden = false; return;
  }
  appendPatients(data.patients.items);renderPageRights();
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
