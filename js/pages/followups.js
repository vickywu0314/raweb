/* followups.html 页面脚本（依赖 boot.js → data.js → common.js）
   数据来自后端：POST /api/ra/followup/plans（当前医生名下未脱落的 RA 患者的下次随访计划，不分页；检索、筛选、分页在页面完成）
   点患者进入患者详情（patient-visits.html?from=followups），详情页「返回」回到本页（history.back，保留检索和页码）。 */
"use strict";
shell('followups');
// 状态与患者列表同一规则（后端 FollowupServiceImpl）：还没有随访 → 待首次随访；再按预计日期 逾期 / 14 天内 / 随访中
const STATUS={pending_first:['待首次随访','neutral'],overdue:['随访逾期','danger'],soon:['近期需随访','warning'],active:['随访中','success'],lost:['疑似失访','neutral']};
let plans=[];
let state=loadListState('followups',{q:'',status:'',plan:'',page:1,perPage:8}), picked='';
if(queryParam('status'))state.status=queryParam('status'); // 看板等页面带条件进入

// 计数口径：只建档没录随访 = 0 次；第一条随访记录是基线访视，之后的才是第 1、2… 次随访
// 统计不含「疑似失访」（最近一次随访 / 建档距今超过 2 年，后端 ra.followup.lost-months），失访单独一张卡片，点开筛出名单
function kpi(){
  const n=s=>plans.filter(x=>x.status===s).length, total=plans.length-n('lost');
  // 按期随访率 = (计划数 − 逾期数) / 计划数
  const based=total-n('pending_first');   // 已做过基线访视的
  const rate=based?Math.round((based-n('overdue'))/based*100):0;
  // [数字, 名称, 点击后的状态筛选（all = 全部，不含疑似失访；空 = 不可点）, 口径说明]
  const cards=[
    [total,'计划中随访','all','您名下、未脱落的 RA 患者，每人一条下次随访计划（不含疑似失访）。预计日期 = 最近一次随访日期 + 随访周期；还没有随访的取建档日期（基线访视）。'],
    [n('overdue'),'已逾期','overdue','已做过基线访视、预计日期（最近一次随访 + 随访周期）早于今天的人数。还没做基线访视的算「待首次随访」，不在此列。'],
    [n('soon'),'未来 14 天到期','soon','已做过基线访视、预计日期在今天到 14 天后（含今天）的人数。'],
    [rate+'%','按期随访率','','（已做基线的计划数 − 已逾期）÷ 已做基线的计划数，四舍五入取整；待首次随访、疑似失访不计入。'],
    [n('lost'),'疑似失访 · 超过 2 年未随访','lost','最近一次随访（还没有随访的取建档日期）距今超过 2 年的患者，不计入前面 4 项统计。确认不再随访的，可在患者详情「标记脱落」。']
  ];
  $('#fu-kpi').innerHTML=cards.map(([v,l,s,tip])=>`<article${s?` class="kpi-link" data-status="${s}" role="button" tabindex="0" title="点击筛选列表"`:''}><strong>${v}</strong><span>${l}<i class="kpi-info" tabindex="0" role="note" aria-label="${escapeHTML(tip)}" data-tip="${escapeHTML(tip)}">i</i></span></article>`).join('');
  markKpi();
  $('#fu-summary').textContent=`共 ${total} 项随访计划 · ${n('overdue')} 项已逾期，优先处理${n('pending_first')?` · ${n('pending_first')} 位待首次随访（未做基线访视）`:''}${n('lost')?` · 另有 ${n('lost')} 位超过 2 年未随访（疑似失访）`:''}`;
}
// 点卡片 = 按该状态筛选列表（与上方「随访状态」下拉同一个条件）；按期随访率不可点；点「i」只看说明
$('#fu-kpi').addEventListener('click',e=>{if(e.target.closest('.kpi-info'))return;const a=e.target.closest('[data-status]');if(!a)return;state.status=a.dataset.status==='all'?'':a.dataset.status;$('#fu-status').value=state.status;state.page=1;render()});
function markKpi(){$('#fu-kpi').querySelectorAll('[data-status]').forEach(a=>a.classList.toggle('is-active',a.dataset.status===(state.status||'all')))}
$('#fu-kpi').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.target.closest('.kpi-info'))e.target.closest('[data-status]')?.click()});
const rel=x=>x.days==null?'建档日期未知':x.first?(x.days<0?`建档已 ${-x.days} 天`:'今天建档'):x.days<0?`已逾期 ${-x.days} 天`:x.days===0?'今天':`${x.days} 天后`;
function row(x){const id=String(x.patientId),[label,tone]=STATUS[x.status]||STATUS.active;return `<div class="patient-card selectable${picked===id?' is-picked':''}"><span class="check-col"><input type="radio" name="fu-pick" value="${escapeHTML(id)}" aria-label="选择 ${escapeHTML(x.name)} 新增随访" ${picked===id?'checked':''}></span><a class="patient-card-link" href="patient-visits.html?id=${encodeURIComponent(id)}&from=followups"><span class="patient-identity"><span class="record-icon">${icon('record')}</span><span class="patient-info"><span class="patient-name">${escapeHTML(x.name||'未填姓名')}</span><span class="patient-meta">${escapeHTML(x.sex||'性别未填')} · ${x.birthYear?`${x.birthYear} 年`:'出生年份未知'}</span><span class="patient-meta">ID号: ${escapeHTML(id)}</span></span></span><span class="patient-cell research-cell"><span class="cell-label">研究信息</span><span class="study-code">${escapeHTML(x.studyNo||'—')}</span><span class="cell-note">${x.visitCount?`基线已完成 · 已随访 ${x.visitCount-1} 次`:'只建档，尚未基线访视'}</span></span><span class="patient-cell plan-cell"><span class="cell-label">随访计划</span><span class="plan-name">${x.first?'基线访视':`第 ${x.nth} 次随访`}</span><span class="cell-note">随访周期：${cycleLabel(x.followCycle)}</span></span><span class="patient-cell date-cell"><span class="cell-label">预计日期</span><span class="last-visit">${icon('calendar')}${escapeHTML(x.dueDate||'—')}</span><span class="cell-note">${rel(x)}</span></span><span class="patient-cell status-cell"><span class="cell-label">随访状态</span>${badge(label,tone)}</span>${icon('chevron','chevron')}</a></div>`}
function rows(){return plans.filter(x=>(!state.q||[x.name,String(x.patientId),x.studyNo].some(v=>v&&v.toLowerCase().includes(state.q)))&&(state.status?x.status===state.status:x.status!=='lost')&&(!state.plan||String(x.followCycle)===state.plan))}
function syncPick(){const b=$('#add-followup'),p=picked&&plans.find(x=>String(x.patientId)===picked);b.disabled=!p;b.textContent=p?`＋ 新增随访（${p.name}）`:'＋ 新增随访';$('#pick-hint').hidden=!!p}
function render(){saveListState('followups',state);markKpi();const list=rows(),pages=Math.max(1,Math.ceil(list.length/state.perPage));state.page=Math.min(state.page,pages);const start=(state.page-1)*state.perPage,pageRows=list.slice(start,start+state.perPage);
  $('#rows').innerHTML=pageRows.map(row).join('');$('#empty').hidden=!!list.length;
  $('#result-count').textContent=list.length?`显示第 ${start+1}–${Math.min(start+state.perPage,list.length)} 条，共 ${list.length} 条`:'共 0 条匹配记录';
  const firstPage=Math.max(1,state.page-2),lastPage=Math.min(pages,Math.max(5,state.page+2));
  $('#pagination').innerHTML=Array.from({length:Math.max(0,lastPage-firstPage+1)},(_,offset)=>{const page=firstPage+offset;return `<button data-page="${page}" class="${page===state.page?'active':''}">${page}</button>`}).join('');syncPick()}
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
  }catch(e){console.error(e);$('#rows').innerHTML=`<p class="pv-load-error">随访计划加载失败：${escapeHTML(apiErrorMessage(e))}</p>`;$('#result-count').textContent='';}
}
load();
