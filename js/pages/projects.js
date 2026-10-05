/* projects.html 页面脚本（依赖 boot.js → data.js → common.js）
   数据来自后端接口 POST /api/ra/project/projectsData（raapi，口径见 raapi/docs/API.md）。 */
"use strict";
document.addEventListener('DOMContentLoaded',async()=>{
  shell('projects');
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v};
  const pct=(v,digits)=>(v==null?'—':Number(v).toFixed(digits)+'%');
  const IDS=['pv-enrolled','pv-completion','pv-quality','pv-sites','pv-progress','pv-pending','pv-qc','pv-ready'];
  // 加载中：数字位置显示灰色闪动占位条（与患者列表同一效果）
  IDS.forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML='<i class="skeleton pv-skeleton"></i>'});
  $('#pv-progress-note').innerHTML='<i class="skeleton pv-skeleton-note"></i>';
  try{
    const d=await apiPost('/api/ra/project/projectsData',{doctorId:currentDoctorId()});
    // 顶部 4 张卡片
    set('pv-enrolled',d.enrolledPatients);           // 已入组患者
    set('pv-completion',pct(d.followUpCompletionRate,0)); // 计划随访完成率（整数 %）
    set('pv-quality',pct(d.dataQualityRate,1));      // 整体数据质量（1 位小数 %）
    set('pv-sites',d.centerCount);                   // 参与研究中心
    // 研究执行概览
    set('pv-progress',`${d.trackingPatients} / ${d.totalPatients}`);              // 跟踪患者：有效 / 全部
    set('pv-progress-note',`跟踪患者 · ${pct(d.trackingRate,0)}`);
    set('pv-pending',d.pendingFollowUpPatients);     // 待随访患者
    set('pv-qc',d.pendingQcIssues);                  // 待处理质控问题
    set('pv-ready',d.researchUsableRecords);         // 研究级可用记录
  }catch(e){
    console.error(e);
    IDS.forEach(id=>set(id,'—'));set('pv-progress-note','跟踪患者');
    const err=document.getElementById('pv-error');
    if(err){err.hidden=false;err.textContent=`项目总览数据加载失败：${e.message}。请确认后端服务已启动（${API_BASE}）。`;}
  }
});
