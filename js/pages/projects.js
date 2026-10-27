/* projects.html 页面脚本（依赖 boot.js → data.js → common.js）
   数据来自后端接口 POST /api/ra/project/projectsData（raapi，口径见 raapi/docs/API.md）。 */
"use strict";
document.addEventListener('DOMContentLoaded',async()=>{
  shell('projects');
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v};
  // 数字：千分位 + data-count（countUp 从 0 增长到同一文字，结束后与直接显示一致）；没有值显示 —
  const setNum=(id,v)=>{const el=document.getElementById(id);if(!el)return;const t=v==null||v===''?'—':fmtN(v);el.textContent=t;if(t!=='—')el.dataset.count=t;else delete el.dataset.count;};
  const pct=(v,digits)=>(v==null?'—':Number(v).toFixed(digits)+'%');
  const IDS=['pv-enrolled','pv-times2','pv-times3','pv-times4','pv-quality','pv-sites','pv-progress','pv-pending','pv-qc','pv-ready'];
  // 加载中：数字位置显示灰色闪动占位条（与患者列表同一效果）
  IDS.forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML='<i class="skeleton pv-skeleton"></i>'});
  $('#pv-progress-note').innerHTML='<i class="skeleton pv-skeleton-note"></i>';
  const trend=document.getElementById('pv-trend');if(trend)trend.innerHTML='<i class="skeleton enroll-skeleton"></i>';
  try{
    const d=await apiPost('/api/ra/project/projectsData',{doctorId:currentDoctorId()});
    // 顶部 4 张卡片
    setNum('pv-enrolled',d.enrolledPatients);           // 已入组患者
    // 随访完成 2 / 3 / 4 次率（不含基线访视；分母 = 已入组患者）
    [2,3,4].forEach(n=>{setNum('pv-times'+n,d['followUp'+n+'Rate']==null?null:pct(d['followUp'+n+'Rate'],1));const el=document.getElementById('pv-times'+n);if(el)el.title=`${d['followUp'+n+'Count']==null?'—':fmtN(d['followUp'+n+'Count'])} 位患者完成 ≥${n} 次随访`;});
    setNum('pv-quality',d.dataQualityRate==null?null:pct(d.dataQualityRate,1));      // 整体数据质量（1 位小数 %）
    setNum('pv-sites',d.centerCount);                   // 参与研究中心
    // 研究执行概览
    set('pv-progress',`${fmtN(d.trackingPatients)} / ${fmtN(d.totalPatients)}`);              // 跟踪患者：有效 / 全部
    set('pv-progress-note',`跟踪患者 · ${pct(d.trackingRate,0)}`);
    setNum('pv-pending',d.pendingFollowUpPatients);     // 待随访患者
    setNum('pv-qc',d.pendingQcIssues);                  // 待处理质控问题
    setNum('pv-ready',d.researchUsableRecords);      // 研究级可用记录
    renderEnrollTrend(d.enrollByMonth);
    countUp(document.querySelector('main')||document);
  }catch(e){
    console.error(e);
    IDS.forEach(id=>set(id,'—'));set('pv-progress-note','跟踪患者');
    const trend=document.getElementById('pv-trend');if(trend)trend.innerHTML='<p class="enroll-empty">入组趋势暂不可用</p>';
    const err=document.getElementById('pv-error');
    if(err){err.hidden=false;err.textContent=`项目总览数据加载失败：${apiErrorMessage(e)}`;}
  }
});

// 入组趋势：后端 enrollByMonth = 最近 12 个月（含本月，月份升序）每月新入组人数，按建档日期计数（raapi docs/API.md §1.1）。
// 累计只在这 12 个月内滚动相加，标为「近 12 个月累计」，不代表全部已入组患者。
function renderEnrollTrend(list){
  const box=document.getElementById('pv-trend'),note=document.getElementById('pv-trend-note');if(!box)return;
  const rows=Array.isArray(list)?list.filter(x=>x&&/^\d{4}-\d{2}$/.test(x.month)&&Number.isInteger(x.count)&&x.count>=0):[];
  if(!rows.length||rows.length!==list.length){box.innerHTML='<p class="enroll-empty">暂无入组趋势数据</p>';return;}
  const max=Math.max(...rows.map(x=>x.count),1),total=rows.reduce((s,x)=>s+x.count,0);
  let cum=0;
  box.innerHTML=`<div class="enroll-bars" role="list">${rows.map((x,i)=>{cum+=x.count;const [y,m]=x.month.split('-'),mm=Number(m);
    const tip=`${y} 年 ${mm} 月 · 新增 ${fmtN(x.count)} 人 · 近 12 个月累计 ${fmtN(cum)} 人`;
    return `<div class="enroll-col${x.count?'':' is-zero'}" role="listitem" tabindex="0" data-tip="${tip}" aria-label="${tip}"><i style="height:${(x.count/max*100).toFixed(1)}%;animation-delay:${i*30}ms">${x.count?`<b>${fmtN(x.count)}</b>`:''}</i><small>${mm}<span class="enroll-unit"> 月</span>${i===0||mm===1?`<em>${y}</em>`:''}</small></div>`;}).join('')}</div>`;
  // 近 3 个月：本月之前的 3 个完整月（本月尚未结束，不计入平均）
  const recent=rows.slice(-4,-1),avg=recent.length?recent.reduce((s,x)=>s+x.count,0)/recent.length:null;
  if(note)note.textContent=`近 12 个月新入组 ${fmtN(total)} 人${avg==null?'':`，近 3 个月（${recent[0].month.replace('-','.')}–${recent.at(-1).month.replace('-','.')}）月均 ${avg.toFixed(1).replace(/\.0$/,'')} 人`}（按建档日期，含已脱落）`;
  // 悬停 / 键盘聚焦显示：月份 · 新增 N 人 · 近 12 个月累计 M 人
  let tipEl=document.querySelector('.viz-tip');
  if(!tipEl){tipEl=document.createElement('div');tipEl.className='viz-tip';tipEl.setAttribute('role','tooltip');tipEl.hidden=true;document.body.appendChild(tipEl);}
  const show=(col,x,y)=>{tipEl.textContent=col.dataset.tip;tipEl.hidden=false;tipEl.style.left=Math.max(8,Math.min(x+14,innerWidth-tipEl.offsetWidth-8))+'px';tipEl.style.top=Math.max(8,y-tipEl.offsetHeight-12)+'px';};
  const hide=()=>{tipEl.hidden=true;};
  if(box.dataset.tipBound)return;box.dataset.tipBound='1';
  box.addEventListener('mousemove',e=>{const c=e.target.closest('[data-tip]');if(c)show(c,e.clientX,e.clientY);else hide();});
  box.addEventListener('mouseleave',hide);
  box.addEventListener('focusin',e=>{const c=e.target.closest('[data-tip]');if(!c)return;const r=c.getBoundingClientRect();show(c,r.left+r.width/2-14,r.top);});
  box.addEventListener('focusout',hide);
  box.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
}
