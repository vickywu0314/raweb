/* 首页只读研究库概览；条件编码由 cohort 协议入口拥有。 */
"use strict";
shell('ai');
const display=window.RAUserDisplay;
document.querySelectorAll('.study-meta').forEach(node=>{node.textContent='RA 研究库 · 当前人数见下方概览';});
const overviewNode=$('#overview'),overviewState=$('#overview-state'),overviewSource=$('#overview-source');
const toQuestion=q=>{
  if(typeof q!=='string'||!q.trim()){$('#ask-message').textContent='请输入研究问题';return;}
  if(!q.isWellFormed()){$('#ask-message').textContent='研究问题包含无效字符，请修改后重试';return;}
  if([...q].length>200){$('#ask-message').textContent='研究问题最多 200 个字符';return;}
  $('#ask-message').textContent='';location.href='ai-cohort.html?q='+encodeURIComponent(q);
};
$('#ask-form').addEventListener('submit',event=>{event.preventDefault();toQuestion($('#ask-input').value);});
const questionExamples=['TNFi 治疗 6 个月后仍处于中高疾病活动的患者','合并纤维肌痛的患者疾病活动情况','60 岁以上女性患者的达标率','JAK 抑制剂治疗的患者'];
$('#examples').innerHTML=questionExamples.map(q=>`<button type="button" class="cond-chip example" data-q="${escapeHTML(q)}">${escapeHTML(q)}</button>`).join('');
$('#examples').addEventListener('click',event=>{const button=event.target.closest('[data-q]');if(button)toQuestion(button.dataset.q);});
// 个体分析：按原型下拉选择患者（输入即查本人 RA 患者，最多 8 位），选中进入病程分析
const SEARCH_SIZE=8,SEARCH_DELAY=250;
const picker=$('#picker'),searchList=$('#picker-list'),searchState=$('#patient-search-state');
let searchFlight=null,searchItems=[],searchActive=-1,searchDebounce=null,searchShown=null;
function closeSearchList(){searchList.hidden=true;picker.setAttribute('aria-expanded','false');picker.removeAttribute('aria-activedescendant');searchActive=-1;}
function clearSearch(){searchList.innerHTML='';searchItems=[];searchShown=null;closeSearchList();}
function searchStatus(state,text){searchState.dataset.state=state;searchState.textContent=text;}
function currentSearch(flight){return searchFlight===flight&&!flight.cause;}
function finishSearch(flight,cause){
  if(!currentSearch(flight))return false;
  flight.cause=cause;searchFlight=null;clearTimeout(flight.timer);
  if(cause!=='success')flight.controller.abort();return true;
}
function cancelSearch(cause='replaced'){clearTimeout(searchDebounce);searchDebounce=null;if(searchFlight)finishSearch(searchFlight,cause);clearSearch();}
function drawSearch(){
  searchList.innerHTML=searchItems.length?searchItems.map((item,i)=>`<button type="button" role="option" id="picker-option-${i}" data-i="${i}" class="${i===searchActive?'active':''}" aria-selected="${i===searchActive}"><b>${escapeHTML(item.name??'姓名未提供')}</b><span>研究号 ${escapeHTML(item.studyNo??'未提供')} · 患者编号 ${escapeHTML(item.patientId)}</span></button>`).join('')+(searchShown.total>searchItems.length?`<p class="picker-empty">共 ${searchShown.total} 位，继续输入缩小范围</p>`:''):'<p class="picker-empty">没有匹配的患者</p>';
  if(searchActive>=0)picker.setAttribute('aria-activedescendant','picker-option-'+searchActive);else picker.removeAttribute('aria-activedescendant');
  searchList.hidden=false;picker.setAttribute('aria-expanded','true');
}
function publishSearch(keyword,data){
  searchItems=data.items;searchShown={keyword,total:data.total};searchActive=-1;
  searchStatus(data.items.length?'success':'empty','');
  if(document.activeElement===picker)drawSearch();
}
async function loadSearch(keyword){
  if(!overviewPageActive)return;
  cancelSearch();searchStatus('loading','正在查询本人 RA 患者…');const flight={controller:new AbortController(),cause:null,timer:null};searchFlight=flight;
  flight.timer=setTimeout(()=>{
    if(!finishSearch(flight,'timeout'))return;
    clearSearch();searchStatus('error','患者搜索超时，请重新输入');
  },30000);
  try{const result=await window.RACohortAPI.patientSearch({keyword,page:1,size:SEARCH_SIZE},{signal:flight.controller.signal});if(!finishSearch(flight,'success'))return;publishSearch(keyword,result.data);}
  catch(error){if(!finishSearch(flight,'error'))return;clearSearch();searchStatus('error',display.error(error,'患者搜索暂不可用'));}
}
function pickPatient(item){if(item){closeSearchList();location.href='patient-insight.html?id='+encodeURIComponent(item.patientId)+'&from=ai-analysis';}}
picker.addEventListener('focus',()=>{if(searchShown&&searchShown.keyword===picker.value)drawSearch();else if(!searchFlight)loadSearch(picker.value);});
picker.addEventListener('input',()=>{cancelSearch();searchStatus('idle','');const keyword=picker.value;searchDebounce=setTimeout(()=>{searchDebounce=null;loadSearch(keyword);},SEARCH_DELAY);});
picker.addEventListener('keydown',event=>{
  if(event.key==='Escape'){closeSearchList();return;}
  if(searchList.hidden||!searchItems.length)return;
  if(event.key==='ArrowDown'){searchActive=Math.min(searchItems.length-1,searchActive+1);drawSearch();event.preventDefault();}
  else if(event.key==='ArrowUp'){searchActive=Math.max(0,searchActive-1);drawSearch();event.preventDefault();}
  else if(event.key==='Enter'){pickPatient(searchItems[Math.max(0,searchActive)]);event.preventDefault();}
});
searchList.addEventListener('mousedown',event=>{const option=event.target.closest('[data-i]');if(option){event.preventDefault();pickPatient(searchItems[Number(option.dataset.i)]);}});
picker.addEventListener('blur',()=>setTimeout(closeSearchList,120));
function revokeSearch(cause){cancelSearch(cause);picker.value='';searchStatus('idle','');}
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
  overviewSource.textContent=`本人 RA · 当前记录 · 源日期 ${d.meta.asOfDate} · 读取 ${d.meta.readCompletedAt} · 统计口径仍待医学核验`;
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
    clearOverview();overviewStatus('error','读取超时，请重新读取');
  },30000);
  try{
    const result=await window.RACohortAPI.overview({signal:flight.controller.signal});
    if(!finishOverview(flight,'success'))return;publishOverview(result.data);
  }catch(error){
    if(!finishOverview(flight,'error'))return;
    clearOverview();overviewStatus('error',display.error(error,'概览暂不可用'));
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
