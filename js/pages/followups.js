/* followups.html 页面脚本（依赖 boot.js → data.js → common.js） */
"use strict";
shell('followups');
// 随访计划：未脱落患者，按「上次随访 + 该患者的随访周期」推算下次预计日期；尚无访视的患者以「随访观察起始」为首次应访日期
const plans=patients.map(p=>({p,n:nextFollowup(p)})).filter(x=>x.n).map(({p,n})=>({p,nth:(p.visits||0)+1,first:n.first,cycle:n.cycle,due:n.due,days:n.days,status:n.status})).sort((a,b)=>a.days-b.days);
const STATUS={overdue:['已逾期','danger'],soon:['14 天内到期','warning'],later:['待随访','neutral']};
let state=loadListState('followups',{q:'',status:'',plan:'',page:1,perPage:8}), picked='';
if(queryParam('status'))state.status=queryParam('status'); // 看板等页面带条件进入

function kpi(){
  const n=s=>plans.filter(x=>x.status===s).length;
  // 按期随访率 = (计划数 − 逾期数) / 计划数，与数据看板同一口径
  const rate=plans.length?Math.round((plans.length-n('overdue'))/plans.length*100):0;
  $('#fu-kpi').innerHTML=[[plans.length,'计划中随访'],[n('overdue'),'已逾期'],[n('soon'),'未来 14 天到期'],[rate+'%','按期随访率']].map(([v,l])=>`<article><strong>${v}</strong><span>${l}</span></article>`).join('');
  $('#fu-summary').textContent=`共 ${plans.length} 项随访计划 · ${n('overdue')} 项已逾期，优先处理`;
}
const rel=x=>x.days<0?`已逾期 ${-x.days} 天`:x.days===0?'今天':`${x.days} 天后`;
function row(x){const p=x.p,[label,tone]=STATUS[x.status];return `<div class="patient-card selectable${picked===p.id?' is-picked':''}"><span class="check-col"><input type="radio" name="fu-pick" value="${escapeHTML(p.id)}" aria-label="选择 ${escapeHTML(p.name)} 新增随访" ${picked===p.id?'checked':''}></span><a class="patient-card-link" href="patient-visits.html?id=${encodeURIComponent(p.id)}&from=followups"><span class="patient-identity"><span class="record-icon">${icon('record')}</span><span class="patient-info"><span class="patient-name">${escapeHTML(p.name)}</span><span class="patient-meta">${escapeHTML(p.sex)} · ${p.year} 年</span><span class="patient-meta">ID号: ${escapeHTML(p.id)}</span></span></span><span class="patient-cell research-cell"><span class="cell-label">研究信息</span><span class="study-code">${escapeHTML(p.code)}</span><span class="cell-note">已随访 ${p.visits} 次</span></span><span class="patient-cell plan-cell"><span class="cell-label">随访计划</span><span class="plan-name">第 ${x.nth} 次随访${x.first?'（基线）':''}</span><span class="cell-note">随访周期：${cycleLabel(x.cycle)}</span></span><span class="patient-cell date-cell"><span class="cell-label">预计日期</span><span class="last-visit">${icon('calendar')}${x.due}</span><span class="cell-note">${rel(x)}</span></span><span class="patient-cell status-cell"><span class="cell-label">随访状态</span>${badge(label,tone)}</span>${icon('chevron','chevron')}</a></div>`}
function rows(){return plans.filter(x=>(!state.q||[x.p.name,x.p.id,x.p.code].some(v=>v.toLowerCase().includes(state.q)))&&(!state.status||x.status===state.status)&&(!state.plan||String(x.cycle)===state.plan))}
function syncPick(){const b=$('#add-followup'),p=picked&&patientById(picked);b.disabled=!picked;b.textContent=picked?`＋ 新增随访（${p.name}）`:'＋ 新增随访';$('#pick-hint').hidden=!!picked}
function render(){saveListState('followups',state);const list=rows(),pages=Math.max(1,Math.ceil(list.length/state.perPage));state.page=Math.min(state.page,pages);const start=(state.page-1)*state.perPage,pageRows=list.slice(start,start+state.perPage);
  $('#rows').innerHTML=pageRows.map(row).join('');$('#empty').hidden=!!list.length;
  $('#result-count').textContent=list.length?`显示第 ${start+1}–${Math.min(start+state.perPage,list.length)} 条，共 ${list.length} 条`:'共 0 条匹配记录';
  $('#pagination').innerHTML=Array.from({length:pages},(_,i)=>`<button data-page="${i+1}" class="${i+1===state.page?'active':''}">${i+1}</button>`).slice(Math.max(0,state.page-3),Math.max(5,state.page+2)).join('');syncPick()}
$('#rows').addEventListener('change',e=>{if(e.target.name!=='fu-pick')return;picked=e.target.value;$('#rows').querySelectorAll('.patient-card').forEach(c=>c.classList.toggle('is-picked',c.querySelector('input').checked));syncPick()});
$('#add-followup').onclick=()=>{if(picked)location.href=`visit-create.html?id=${encodeURIComponent(picked)}`};
$('#search-form').addEventListener('submit',e=>{e.preventDefault();state.q=$('#query').value.trim().toLowerCase();state.status=$('#fu-status').value;state.plan=$('#fu-plan').value;state.page=1;render()});
$('#fu-status').addEventListener('change',e=>{state.status=e.target.value;state.page=1;render()});
$('#fu-plan').addEventListener('change',e=>{state.plan=e.target.value;state.page=1;render()});
$('#pagination').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b){state.page=+b.dataset.page;render()}});
$('#page-size').addEventListener('change',e=>{state.perPage=+e.target.value;state.page=1;render()});
$('#reset').onclick=()=>{state={q:'',status:'',plan:'',page:1,perPage:state.perPage};$('#query').value='';$('#fu-status').value='';$('#fu-plan').value='';render()};
$('#query').value=state.q;$('#fu-status').value=state.status;$('#fu-plan').value=state.plan;$('#page-size').value=state.perPage;kpi();render();
