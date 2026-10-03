/* 数据质控规则（演示）：data-quality.html 与 projects.html 共用，保证两页数字同一口径。
   一期只做「缺失」（QC-M01~M04）和「逻辑冲突」（QC-L01/L02）；异常值（QC-O01）、随访缺失（QC-F01）二期再做。
   状态一期只有「待处理 → 已处理」。依赖 common.js。 */
"use strict";
const QC_MISSING_TEXT={'缺 DAS28 评分':'基线 DAS28 缺少 TJC28 / SJC28 组成项','缺基线检验':'基线 ESR / CRP 检验未录入','缺合并疾病记录':'合并疾病（其他病史）未记录','缺用药史':'基线用药明细缺失'};
const QC_RULE={'缺 DAS28 评分':'QC-M01','缺基线检验':'QC-M02','缺合并疾病记录':'QC-M03','缺用药史':'QC-M04'};
function qcIssues(){
  const issues=[];
  patients.forEach((p,i)=>{
    const add=(type,rule,text)=>{const key=`${p.id}|${type}|${text}`;issues.push({p,type,rule,text,key,state:store.qc[key]||(issues.length%3===2?'已处理':'待处理')})};
    if(p.incomplete&&!(p.missing==='缺合并疾病记录'&&(p.comorbidNone||comorbidCodes(p).length))) add('缺失',QC_RULE[p.missing]||'QC-M01',QC_MISSING_TEXT[p.missing]||p.missing);
    if(i%11===5&&p.visits) add('逻辑冲突','QC-L01','用药起始日期晚于本次访视日期');
  });
  return issues;
}
// 汇总：与数据质控页顶部指标、项目总览同一口径
function qcSummary(issues=qcIssues()){
  const open=issues.filter(x=>x.state!=='已处理'), pts=new Set(open.map(x=>x.p.id)).size, N=patients.length;
  return {total:issues.length,open:open.length,affected:pts,ready:N-pts,rate:N?(N-pts)/N:0};
}
