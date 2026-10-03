/* ai-analysis.html 页面脚本（依赖 boot.js → data.js → common.js → shared/ai-analytics.js） */
"use strict";
shell('ai');
const toCohort = q => location.href = `ai-cohort.html?${q}`;

// 研究问题 → 队列分析（带 q 参数，由队列页解析）
$('#ask-form').addEventListener('submit', e => { e.preventDefault(); const q = $('#ask-input').value.trim() || $('#ask-input').placeholder.replace(/^例如：/, ''); toCohort(`q=${encodeURIComponent(q)}`); });
$('#examples').innerHTML = AI_EXAMPLES.map(q => `<button type="button" class="cond-chip example" data-q="${escapeHTML(q)}">${escapeHTML(q)}</button>`).join('');
$('#examples').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) toCohort(`q=${encodeURIComponent(b.dataset.q)}`); });

// 个体分析：选择患者 → 病程分析
bindPatientPicker($('#picker'), $('#picker-list'), p => location.href = `patient-insight.html?id=${encodeURIComponent(p.id)}&from=ai`);

// 研究库速览：每个指标都是一个预设队列
const s = cohortStats(patients);
const n = f => applyFilters({ ...AI_FILTER_DEFAULT, ...f }).length;
const tiles = [
  ['研究库患者', patients.length, '人', `女性 ${s.female}% · 年龄中位 ${s.ageMedian} 岁`, ''],
  ['当前达标率', s.target, '%', 'DAS28 ≤ 3.2', 'act=target'],
  ['未达标患者', n({ act: 'mod-high' }), '人', '中高疾病活动', 'act=mod-high'],
  ['合并纤维肌痛', n({ cm: 'FM' }), '人', 'DAS28 可能被抬高', 'cm=FM'],
  ['资料待补全', n({ data: 'missing' }), '人', '影响分析可靠性', 'data=missing']
];
$('#overview').innerHTML = tiles.map(([l, v, u, note, q]) => `<a class="stat-tile" href="ai-cohort.html${q ? '?' + q : ''}"><span>${l}</span><strong>${v}<small>${u}</small></strong><em>${note}</em></a>`).join('');
