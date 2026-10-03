"use strict";
shell('dashboard');

const section=(title,note="")=>`<div class="section-heading"><h2>${title}</h2><p>${note}</p></div>`;
const metric=(label,value,note,suffix="人",tone="")=>`<article class="panel ${tone}"><p class="metric-label">${label}</p><div class="metric-value">${value}<small>${suffix}</small></div><p class="metric-note">${note}</p></article>`;
const lines=(items)=>items.map(([name,value])=>`<div class="detail-line"><span>${name}</span><b>${value}</b></div>`).join("");
const activity=(items)=>items.map(item=>`<div class="activity"><b>${item.name}</b><span>${item.item}</span><time>${item.date}</time></div>`).join("");

$('#dashboard').innerHTML =
  section('患者规模','活跃指近 6 个月内有随访记录') + `<div class="metric-grid">${metric('总患者数',128,'覆盖 4 家研究中心')}${metric('活跃患者数',103,'占全部患者 80%','人','metric-success')}${metric('本月新增患者',9,'较上月增加 2 人')}${metric('已脱落 / 失访',16,'超过 12 个月无随访','人','metric-danger')}</div>` +
  section('随访管理','按计划随访日期划分，包含逾期患者') + `<div class="metric-grid">${FOLLOWUPS.map(f=>metric(f.label,f.n,f.note,'人',f.warn?'metric-warning':f.label.includes('已完成')?'metric-success':'')).join('')}</div><a class="panel-link" href="patients.html?status=due">查看近期需随访患者 →</a>` +
  `<div class="dashboard-grid"><article class="panel"><h3>异常患者</h3><div class="metric-value danger-text">34<small>人有异常检验结果</small></div>${ABNORMAL.map(a=>`<div class="progress-row"><span>${a.name}</span><progress value="${a.n}" max="34" aria-label="${a.name} ${a.n} 人"></progress><b>${a.n}</b></div>`).join('')}<p class="metric-note">同一患者可计入多项，以最近一次检验结果为准。</p></article>
  <article class="panel"><h3>疾病活动度 · DAS28</h3><p class="metric-note">最近一次评分分布</p>${DAS.map(d=>`<div class="detail-line"><span>${d.label}</span><b>${d.n} 人 · ${d.pct}</b></div>`).join('')}</article>
  <article class="panel"><h3>数据质量</h3><div class="metric-value">82%<small>患者资料完整率</small></div>${lines(MISSING.map(m=>[m.name,`${m.n} 人`]))}<a class="panel-link" href="patients.html">查看待补全患者 →</a></article>
  <article class="panel"><h3>研究数据</h3>${lines([['有效研究样本数','105 人'],['完成访视数','416 次'],...STUDY.map(s=>[s.name,s.v])])}</article></div>` +
  section('风险提醒','点击卡片查看风险条件与名单接入情况') + `<div class="risk-grid">${RISKS.map(r=>`<button class="panel risk-card" data-risk="${r.id}" aria-label="查看${r.name}，${r.n}人"><span class="risk-card-heading"><strong>${r.name}</strong>${badge(r.level+'风险',r.level==='高'?'danger':'warning')}</span><span class="metric-value danger-text">${r.n}<small>人</small></span><span class="metric-note">${r.note}</span><span class="risk-link">查看风险患者 ${icon('chevron')}</span></button>`).join('')}</div>` +
  section('近期动态','原页面最近 7 天记录') + `<div class="dashboard-grid"><article class="panel"><h3>最近新增异常</h3>${activity(NEW_ABNORMAL)}</article><article class="panel"><h3>最近完成随访</h3>${activity(NEW_VISITS)}</article></div>` +
  `<p class="dashboard-note">统计口径：关键数据包括建档必填项、DAS28 评分与基线检验，缺失任一项计入关键数据缺失。此看板保留原文件的示例快照，不随本次会话新增患者变更；列表筛选数量按实际演示记录计算。</p>`;

function showRisk(id){
  const risk=RISKS.find(item=>item.id===id); if(!risk)return;
  $('#risk-title').textContent=risk.name;
  $('#risk-detail').innerHTML=`${badge(risk.level+'风险',risk.level==='高'?'danger':'warning')}<dl class="risk-facts"><div><dt>统计人数</dt><dd>${risk.n} 人 <small>原页面示例快照</small></dd></div><div><dt>风险条件</dt><dd>${escapeHTML(risk.note)}</dd></div></dl><div class="risk-empty">${icon('users')}<h3>患者名单待接入</h3><p>原始数据仅提供汇总人数，未提供对应患者 ID 与风险记录。目前无法确认具体患者，接入名单后可在此逐人查看。</p></div>`;
  $('#risk-dialog').showModal();
}
$('#dashboard').addEventListener('click',e=>{const card=e.target.closest('[data-risk]'); if(card)showRisk(card.dataset.risk);});
document.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>btn.closest('dialog')?.close()));
$('#export-report')?.addEventListener('click',()=>{
  const rows=[['统计快照','2026/09/18 07:44（原始示例）'],['指标','数值'],['总患者数',128],['活跃患者数',103],['本月新增患者',9],['已脱落/失访',16],...FOLLOWUPS.map(f=>[f.label,f.n]),...ABNORMAL.map(a=>[a.name,a.n]),...DAS.map(d=>[d.label,d.n]),['资料完整率','82%'],...MISSING.map(m=>[m.name,m.n]),['有效研究样本数',105],['完成访视数',416],...STUDY.map(s=>[s.name,s.v]),...RISKS.map(r=>[r.name,r.n])];
  const csv='\uFEFF'+rows.map(row=>row.map(cell=>`"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); const a=document.createElement('a'); a.href=url; a.download='RA-统计快照-20260918.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
});
