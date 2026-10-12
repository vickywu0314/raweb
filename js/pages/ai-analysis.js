/* 首页只读研究库概览；条件编码由 cohort 协议入口拥有。 */
"use strict";
shell('ai');
document.querySelectorAll('.study-meta').forEach(node=>{node.textContent='RA 研究库 · 当前人数见下方概览';});
const overviewNode=$('#overview'),overviewState=$('#overview-state'),overviewSource=$('#overview-source');
const toQuestion=q=>{
  if(typeof q!=='string'||!q.trim()){$('#ask-message').textContent='请输入研究问题';return;}
  if(!q.isWellFormed()){$('#ask-message').textContent='研究问题包含无效字符，请修改后重试';return;}
  if([...q].length>200){$('#ask-message').textContent='研究问题最多 200 个字符';return;}
  $('#ask-message').textContent='';location.href='ai-cohort.html?q='+encodeURIComponent(q);
};
$('#ask-form').addEventListener('submit',event=>{event.preventDefault();toQuestion($('#ask-input').value);});
const questionExamples=['当前未达标的患者','合并纤维肌痛的患者','资料待补全的患者'];
$('#examples').innerHTML=questionExamples.map(q=>`<button type="button" class="cond-chip example" data-q="${escapeHTML(q)}">${escapeHTML(q)}</button>`).join('');
$('#examples').addEventListener('click',event=>{const button=event.target.closest('[data-q]');if(button)toQuestion(button.dataset.q);});
const searchList=$('#picker-list'),searchState=$('#patient-search-state'),searchPage=$('#patient-search-page');
let searchFlight=null,searchKeyword=null,searchPageNumber=0,searchTotal=0;
function clearSearch(){searchList.innerHTML='';searchList.hidden=true;searchPage.textContent='';searchPageNumber=0;searchTotal=0;$('#patient-search-prev').disabled=true;$('#patient-search-next').disabled=true;}
function searchStatus(state,text){searchState.dataset.state=state;searchState.textContent=text;}
function currentSearch(flight){return searchFlight===flight&&!flight.cause;}
function finishSearch(flight,cause){
  if(!currentSearch(flight))return false;
  flight.cause=cause;searchFlight=null;clearTimeout(flight.timer);
  if(cause!=='success')flight.controller.abort();return true;
}
function cancelSearch(cause='replaced'){if(searchFlight)finishSearch(searchFlight,cause);clearSearch();}
function publishSearch(data){
  searchPageNumber=data.page;searchTotal=data.total;searchList.hidden=data.items.length===0;
  searchList.innerHTML=data.items.map(item=>`<article class="patient-search-row"><div><strong>${escapeHTML(item.name??'姓名未提供')}</strong><span>研究号：${escapeHTML(item.studyNo??'未提供')}</span><small>患者 ID：${escapeHTML(item.patientId)}</small></div><a class="button" href="${escapeHTML('patient-visits.html?id='+encodeURIComponent(item.patientId)+'&from=ai-analysis')}">查看患者档案</a></article>`).join('');
  searchPage.textContent=`第 ${data.page} 页 · 共 ${data.total} 人`;$('#patient-search-prev').disabled=data.page<=1;$('#patient-search-next').disabled=data.page*data.size>=data.total;
  searchStatus(data.items.length?'success':'empty',data.items.length?'当前本人 RA 患者':'没有符合条件的患者');
}
async function loadSearch(page){
  if(!overviewPageActive)return;
  cancelSearch();searchStatus('loading','正在查询本人 RA 患者…');const flight={controller:new AbortController(),cause:null,timer:null};searchFlight=flight;
  flight.timer=setTimeout(()=>{
    if(!finishSearch(flight,'timeout'))return;
    clearSearch();searchStatus('error','REQUEST_TIMEOUT：患者搜索超时，请重新搜索');
  },30000);
  try{const result=await window.RACohortAPI.patientSearch({keyword:searchKeyword,page,size:20},{signal:flight.controller.signal});if(!finishSearch(flight,'success'))return;publishSearch(result.data);}
  catch(error){if(!finishSearch(flight,'error'))return;clearSearch();searchStatus('error',`${error.code||'SERVICE_UNAVAILABLE'}：${error.message||'患者搜索暂不可用'}${error.traceId?' · Trace '+error.traceId:''}`);}
}
$('#patient-search-form').addEventListener('submit',event=>{event.preventDefault();searchKeyword=$('#picker').value;loadSearch(1);});
$('#picker').addEventListener('input',()=>{cancelSearch();searchKeyword=null;searchStatus('idle','关键词已改变，请提交搜索');});
$('#patient-search-prev').addEventListener('click',()=>{if(searchPageNumber>1)loadSearch(searchPageNumber-1);});
$('#patient-search-next').addEventListener('click',()=>{if(searchPageNumber*20<searchTotal)loadSearch(searchPageNumber+1);});
function revokeSearch(cause){cancelSearch(cause);searchKeyword=null;$('#picker').value='';searchStatus('idle','提交搜索后显示当前本人 RA 患者');}
revokeSearch('initial');
function clearOverview(){overviewNode.innerHTML='';overviewSource.textContent='';}
function overviewStatus(state,text){overviewState.dataset.state=state;overviewState.textContent=text;}
function publishOverview(d){
  const target=d.targetRate.meta;
  const cards=[
    ['研究库患者',String(d.studyTotal),'人',d.studyTotal===0?'当前研究库为空':'本人 RA 研究库，含已脱落关系',{}],
    ['当前达标率',target.status==='NO_DATA'?'暂无可评估患者':target.displayText,'',`有效 ${target.denominator} 人 · 未知 ${target.unknownN} 人；DAS28-CRP ≤ 2.7`,{act:'target'}],
    ['未达标患者',String(d.modHighN),'人','DAS28-CRP > 2.7',{act:'mod-high'}],
    ['合并纤维肌痛',String(d.fmN),'人','仅统计明确记录的 FM',{cm:'FM'}],
    ['资料待补全',String(d.missingN),'人','按当前资料完整性政策',{data:'missing'}]
  ];
  overviewNode.innerHTML=cards.map(([label,value,unit,note,filters])=>`<a class="stat-tile" href="ai-cohort.html${window.RACohortConditions.encode(filters)}"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}<small>${escapeHTML(unit)}</small></strong><em>${escapeHTML(note)}</em></a>`).join('');
  overviewSource.textContent=`本人 RA · 当前 now · 源日期 ${d.meta.asOfDate} · 读取 ${d.meta.readCompletedAt} · 开发口径：${Object.entries(d.meta.policyVersions).map(([key,value])=>key+'='+value).join('；')}`;
  overviewStatus('success',d.studyTotal===0?'当前研究库为空':'当前研究库概览');
}
let overviewFlight=null,overviewPageActive=true;
function currentOverview(flight){return overviewFlight===flight&&!flight.cause;}
function finishOverview(flight,cause){
  if(!currentOverview(flight))return false;
  flight.cause=cause;overviewFlight=null;clearTimeout(flight.timer);
  if(cause!=='success')flight.controller.abort();
  return true;
}
async function loadOverview(){
  if(!overviewPageActive)return;
  if(overviewFlight)finishOverview(overviewFlight,'replaced');
  clearOverview();overviewStatus('loading','正在读取当前研究库…');
  const flight={controller:new AbortController(),cause:null,timer:null};overviewFlight=flight;
  flight.timer=setTimeout(()=>{
    if(!finishOverview(flight,'timeout'))return;
    clearOverview();overviewStatus('error','REQUEST_TIMEOUT：读取超时，请重新读取');
  },30000);
  try{
    const result=await window.RACohortAPI.overview({signal:flight.controller.signal});
    if(!finishOverview(flight,'success'))return;publishOverview(result.data);
  }catch(error){
    if(!finishOverview(flight,'error'))return;
    clearOverview();overviewStatus('error',`${error.code||'SERVICE_UNAVAILABLE'}：${error.message||'概览暂不可用'}${error.traceId?' · Trace '+error.traceId:''}`);
  }
}
function revokeOverview(cause){
  if(overviewFlight)finishOverview(overviewFlight,cause);
  clearOverview();overviewStatus('cancelled','当前展示已清除，请重新读取');
}
window.addEventListener('pagehide',()=>{overviewPageActive=false;revokeOverview('pagehide');revokeSearch('pagehide');});
window.addEventListener('storage',event=>{if(event.key==='ra-auth'||event.key===null){revokeOverview('identity');revokeSearch('identity');}});
window.addEventListener('ra-auth-changed',()=>{revokeOverview('identity');revokeSearch('identity');});
window.addEventListener('pageshow',event=>{if(event.persisted){overviewPageActive=true;revokeSearch('restore');loadOverview();}});
$('#overview-retry').addEventListener('click',loadOverview);
loadOverview();
