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
    countUp(document.querySelector('main')||document);
  }catch(e){
    console.error(e);
    IDS.forEach(id=>set(id,'—'));set('pv-progress-note','跟踪患者');
    const err=document.getElementById('pv-error');
    if(err){err.hidden=false;err.textContent=`项目总览数据加载失败：${apiErrorMessage(e)}`;}
  }
});
