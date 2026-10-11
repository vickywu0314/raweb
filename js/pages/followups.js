/* followups.html 页面脚本（依赖 boot.js → data.js → common.js）
   数据来自后端：POST /api/ra/followup/plans（当前医生名下未脱落的 RA 患者的下次随访计划，不分页；检索、筛选、分页在页面完成）
   点患者进入患者详情（patient-visits.html?from=followups），详情页「返回」回到本页（history.back，保留检索和页码）。 */
"use strict";
shell('followups');
const STATUS={overdue:['已逾期','danger'],soon:['14 天内到期','warning'],later:['待随访','neutral'],lost:['疑似失访','neutral']};
let plans=[];
let state=loadListState('followups',{q:'',status:'',plan:'',page:1,perPage:8}), picked='';
if(queryParam('status'))state.status=queryParam('status'); // 看板等页面带条件进入

// 统计不含「疑似失访」（最近一次随访 / 建档距今超过 2 年，后端 ra.followup.lost-months），失访单独一张卡片，点开筛出名单
function kpi(){
  const n=s=>plans.filter(x=>x.status===s).length, total=plans.length-n('lost');
  // 按期随访率 = (计划数 − 逾期数) / 计划数
  const rate=total?Math.round((total-n('overdue'))/total*100):0;
  $('#fu-kpi').innerHTML=[[total,'计划中随访',''],[n('overdue'),'已逾期','overdue'],[n('soon'),'未来 14 天到期','soon'],[rate+'%','按期随访率',''],[n('lost'),'疑似失访 · 超过 2 年未随访','lost']].map(([v,l,s])=>`<article${s?` class="kpi-link" data-status="${s}" role="button" tabindex="0" title="查看名单"`:''}><strong>${v}</strong><span>${l}</span></article>`).join('');
  $('#fu-summary').textContent=`共 ${total} 项随访计划 · ${n('overdue')} 项已逾期，优先处理${n('lost')?` · 另有 ${n('lost')} 位超过 2 年未随访（疑似失访）`:''}`;
}
$('#fu-kpi').addEventListener('click',e=>{const a=e.target.closest('[data-status]');if(!a)return;state.status=a.dataset.status;$('#fu-status').value=state.status;state.page=1;render()});
$('#fu-kpi').addEventListener('keydown',e=>{if(e.key==='Enter')e.target.closest('[data-status]')?.click()});
const rel=x=>x.days==null?'建档日期未知':x.days<0?`已逾期 ${-x.days} 天`:x.days===0?'今天':`${x.days} 天后`;
function row(x){const id=String(x.patientId),[label,tone]=STATUS[x.status]||STATUS.later;return `<div class="patient-card selectable${picked===id?' is-picked':''}"><span class="check-col"><input type="radio" name="fu-pick" value="${escapeHTML(id)}" aria-label="选择 ${escapeHTML(x.name)} 新增随访" ${picked===id?'checked':''}></span><a class="patient-card-link" href="patient-visits.html?id=${encodeURIComponent(id)}&from=followups"><span class="patient-identity"><span class="record-icon">${icon('record')}</span><span class="patient-info"><span class="patient-name">${escapeHTML(x.name||'未填姓名')}</span><span class="patient-meta">${escapeHTML(x.sex||'性别未填')} · ${x.birthYear?`${x.birthYear} 年`:'出生年份未知'}</span><span class="patient-meta">ID号: ${escapeHTML(id)}</span></span></span><span class="patient-cell research-cell"><span class="cell-label">研究信息</span><span class="study-code">${escapeHTML(x.studyNo||'—')}</span><span class="cell-note">已随访 ${x.visitCount} 次</span></span><span class="patient-cell plan-cell"><span class="cell-label">随访计划</span><span class="plan-name">第 ${x.nth} 次随访${x.first?'（基线）':''}</span><span class="cell-note">随访周期：${cycleLabel(x.followCycle)}</span></span><span class="patient-cell date-cell"><span class="cell-label">预计日期</span><span class="last-visit">${icon('calendar')}${escapeHTML(x.dueDate||'—')}</span><span class="cell-note">${rel(x)}</span></span><span class="patient-cell status-cell"><span class="cell-label">随访状态</span>${badge(label,tone)}</span>${icon('chevron','chevron')}</a></div>`}
function rows(){return plans.filter(x=>(!state.q||[x.name,String(x.patientId),x.studyNo].some(v=>v&&v.toLowerCase().includes(state.q)))&&(state.status?x.status===state.status:x.status!=='lost')&&(!state.plan||String(x.followCycle)===state.plan))}
function syncPick(){const b=$('#add-followup'),p=picked&&plans.find(x=>String(x.patientId)===picked);b.disabled=!p;b.textContent=p?`＋ 新增随访（${p.name}）`:'＋ 新增随访';$('#pick-hint').hidden=!!p}
function render(){saveListState('followups',state);const list=rows(),pages=Math.max(1,Math.ceil(list.length/state.perPage));state.page=Math.min(state.page,pages);const start=(state.page-1)*state.perPage,pageRows=list.slice(start,start+state.perPage);
  $('#rows').innerHTML=pageRows.map(row).join('');$('#empty').hidden=!!list.length;
  $('#result-count').textContent=list.length?`显示第 ${start+1}–${Math.min(start+state.perPage,list.length)} 条，共 ${list.length} 条`:'共 0 条匹配记录';
  $('#pagination').innerHTML=Array.from({length:pages},(_,i)=>`<button data-page="${i+1}" class="${i+1===state.page?'active':''}">${i+1}</button>`).slice(Math.max(0,state.page-3),Math.max(5,state.page+2)).join('');syncPick()}
$('#rows').addEventListener('change',e=>{if(e.target.name!=='fu-pick')return;picked=e.target.value;$('#rows').querySelectorAll('.patient-card').forEach(c=>c.classList.toggle('is-picked',c.querySelector('input').checked));syncPick()});
$('#add-followup').onclick=()=>{if(picked)location.href=`visit-create.html?id=${encodeURIComponent(picked)}&from=followups`};
$('#search-form').addEventListener('submit',e=>{e.preventDefault();state.q=$('#query').value.trim().toLowerCase();state.status=$('#fu-status').value;state.plan=$('#fu-plan').value;state.page=1;render()});
$('#fu-status').addEventListener('change',e=>{state.status=e.target.value;state.page=1;render()});
$('#fu-plan').addEventListener('change',e=>{state.plan=e.target.value;state.page=1;render()});
$('#pagination').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b){state.page=+b.dataset.page;render()}});
$('#page-size').addEventListener('change',e=>{state.perPage=+e.target.value;state.page=1;render()});
$('#reset').onclick=()=>{state={q:'',status:'',plan:'',page:1,perPage:state.perPage};$('#query').value='';$('#fu-status').value='';$('#fu-plan').value='';render()};
$('#query').value=state.q;$('#fu-status').value=state.status;$('#fu-plan').value=state.plan;$('#page-size').value=state.perPage;

async function load(){
  $('#rows').innerHTML='<p class="audit-empty">正在加载随访计划…</p>';$('#empty').hidden=true;
  try{
    plans=await apiPost('/api/ra/followup/plans',{doctorId:currentDoctorId()})||[];
    kpi();render();
  }catch(e){console.error(e);$('#rows').innerHTML=`<p class="pv-load-error">随访计划加载失败：${escapeHTML(e.message)}。请确认后端服务已启动后刷新页面。</p>`;$('#result-count').textContent='';}
}
load();
