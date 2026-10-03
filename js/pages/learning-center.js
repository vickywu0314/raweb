/* learning-center.html 页面脚本（依赖 boot.js → data.js → common.js → shared/guidelines-data.js） */
"use strict";
document.addEventListener('DOMContentLoaded',()=>{
  shell('learning');
  const KIND_TONE={'国际推荐':'intl','西医指南':'west','中医指南':'tcm','中西医结合共识':'mix'};
  // 最新国内外指南：卡片 + 下载 + 查看要点
  document.getElementById('gl-grid').innerHTML=GUIDELINES.map(g=>{const m=g.meta;return `<article class="gl-card ${KIND_TONE[m.kind]||''}">
    <div class="gl-tags"><span class="gl-kind">${escapeHTML(m.kind)}</span><span class="gl-region">${escapeHTML(m.region)} · ${m.year}</span></div>
    <h3>${escapeHTML(m.titleZh||m.title)}</h3>${m.titleZh?`<p class="gl-en">${escapeHTML(m.title)}</p>`:''}
    <p class="gl-src">${escapeHTML(m.org)}<br>${escapeHTML(m.journal)}</p>
    <ul class="gl-hl">${m.highlights.slice(0,3).map(h=>`<li>${escapeHTML(h)}</li>`).join('')}</ul>
    <div class="gl-actions"><a class="button primary compact" href="guideline-kb.html?g=${m.id}">查看要点 · ${g.points.length} 条</a><a class="button compact" href="${encodeURI(m.file)}" download>下载 PDF</a><a class="gl-open" href="${encodeURI(m.file)}" target="_blank" rel="noopener">在线阅读 ↗</a></div>
  </article>`}).join('');
  // 指南速查入口：统计 + 热门主题
  const pts=GUIDELINES.reduce((n,g)=>n+g.points.length,0), cs=GUIDELINES.reduce((n,g)=>n+g.cases.length,0);
  document.getElementById('kb-stat').textContent=`从 ${GUIDELINES.length} 部指南中提炼 ${pts} 条要点与 ${cs} 个治疗案例：推荐意见、关键阈值、用药与辨证，按主题快速检索，每条都标注出处页码。`;
  const topics={};GUIDELINES.forEach(g=>g.points.forEach(p=>topics[p.topic]=(topics[p.topic]||0)+1));
  document.getElementById('kb-chips').innerHTML='<span>按主题：</span>'+Object.entries(topics).sort((a,b)=>b[1]-a[1]).map(([t,n])=>`<a href="guideline-kb.html?topic=${encodeURIComponent(t)}">${escapeHTML(t)}<small>${n}</small></a>`).join('')+'<a class="case-link" href="guideline-kb.html?type=case">治疗案例<small>'+cs+'</small></a>';
});
