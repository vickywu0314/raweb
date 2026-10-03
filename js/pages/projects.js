/* projects.html 页面脚本（依赖 boot.js → data.js → common.js → shared/qc-rules.js）
   8 个数字按接口 P01 的口径实时计算（口径编号 P-01 ~ P-08，见《后端接口说明》计算口径表）。 */
"use strict";
document.addEventListener('DOMContentLoaded',()=>{
  shell('projects');
  const N=patients.length, qc=qcSummary(), SITE_COUNT=1, TARGET=N; // 计划入组数：暂定为全部患者数
  // P-02 计划随访完成率：截至今天应完成的计划访视中，实际已完成的比例（访视级，不设窗口）
  const monthsBetween=(a,b)=>{a=new Date(a);b=new Date(b);return (b.getFullYear()-a.getFullYear())*12+(b.getMonth()-a.getMonth())-(b.getDate()<a.getDate()?1:0)};
  let expected=0, done=0;
  patients.forEach(p=>{
    const cycle=+p.followCycle||6;
    const start=p.followStart||p.created||(p.last?ymd(addMonths(p.last,-cycle*Math.max(0,(p.visits||1)-1))):null); if(!start)return;
    const end=p.lost?(p.withdrawal?.date||p.last||ymd(TODAY)):ymd(TODAY); if(end<start)return;
    const e=Math.floor(monthsBetween(start,end)/cycle)+1; expected+=e; done+=Math.min(p.visits||0,e);
  });
  const pending=patients.filter(p=>['随访逾期','近期需随访'].includes(followupStatus(p).label)).length;
  const openIds=new Set(qcIssues().filter(x=>x.state!=='已处理').map(x=>x.p.id));
  const ready=patients.filter(p=>!openIds.has(p.id)).reduce((s,p)=>s+(p.visits||0),0);
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v};
  set('pv-enrolled',N); set('pv-completion',(expected?Math.round(done/expected*100):0)+'%'); set('pv-quality',(qc.rate*100).toFixed(1)+'%'); set('pv-sites',SITE_COUNT);
  set('pv-progress',`${N} / ${TARGET}`); set('pv-progress-note',`跟踪患者 · ${TARGET?Math.round(N/TARGET*100):0}%`);
  set('pv-pending',pending); set('pv-qc',qc.open); set('pv-ready',ready);
});
