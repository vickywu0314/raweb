/* dashboard.html 页面脚本（依赖 boot.js → data.js → common.js → shared/ai-analytics.js）
   所有数字由患者数据实时计算，与患者列表、随访管理、数据质控、AI 分析同一口径。 */
"use strict";
shell('dashboard');

const section = (title, note = "") => `<div class="section-heading"><h2>${title}</h2><p>${note}</p></div>`;
const metric = (label, value, note, suffix = "人", tone = "", href = "") => `<${href ? `a href="${href}"` : 'article'} class="panel ${tone}${href ? ' metric-link' : ''}"><p class="metric-label">${label}</p><div class="metric-value">${value}<small>${suffix}</small></div><p class="metric-note">${note}</p></${href ? 'a' : 'article'}>`;
const lines = items => items.map(([name, value, href]) => `<div class="detail-line"><span>${href ? `<a href="${href}">${name}</a>` : name}</span><b>${value}</b></div>`).join("");
const md = d => d ? d.slice(5).replace('-', '/') : '—';

// ---------- 统计 ----------
const N = patients.length, thisMonth = ymd(TODAY).slice(0, 7);
const within = (d, days) => d && (TODAY - new Date(d)) / DAY_MS <= days;
const active = patients.filter(p => !p.lost && within(p.last, 183)).length;
const newThisMonth = patients.filter(p => (p.created || (p.visits === 1 ? p.last : ''))?.startsWith(thisMonth)).length;
const lost = patients.filter(p => p.lost).length;
const plans = patients.map(p => ({ p, n: nextFollowup(p) })).filter(x => x.n);
const fu = { overdue: plans.filter(x => x.n.days < 0).length, d7: plans.filter(x => x.n.days >= 0 && x.n.days <= 7).length, d30: plans.filter(x => x.n.days >= 0 && x.n.days <= 30).length };
const onTime = pct(plans.length - fu.overdue, plans.length);
const S = cohortStats(patients);
const cnt = f => applyFilters({ ...AI_FILTER_DEFAULT, ...f }).length;
const inflam = patients.filter(p => aiOf(p).crpNow > 10).length;
const incomplete = patients.filter(p => p.incomplete);
const byMissing = MISSING_ITEMS.map(m => [m, incomplete.filter(p => p.missing === m).length]);
const validSample = patients.filter(p => p.visits > 0 && !p.incomplete && !p.lost).length;
const totalVisits = patients.reduce((s, p) => s + (p.visits || 0), 0);

// 风险名单（可逐人查看）
const RISK_LISTS = {
  activity: { name: '疾病活动度回升', level: '高', note: '治疗 6 个月后 DAS28 回升 ≥ 0.6', list: patients.filter(p => { const a = aiOf(p); return a.das6 != null && a.dasNow - a.das6 >= 0.6; }), row: p => `DAS28 ${fmt1(aiOf(p).das6)} → ${fmt1(aiOf(p).dasNow)}`, link: p => `patient-insight.html?id=${encodeURIComponent(p.id)}` },
  high: { name: '高疾病活动', level: '高', note: '最近一次 DAS28 > 5.1', list: patients.filter(p => aiOf(p).dasNow > 5.1), row: p => `DAS28 ${fmt1(aiOf(p).dasNow)} · ${aiOf(p).tx}`, link: p => `patient-insight.html?id=${encodeURIComponent(p.id)}`, more: 'ai-cohort.html?act=high' },
  overdue: { name: '随访逾期超 3 个月', level: '中', note: '存在失访风险，建议电话随访', list: plans.filter(x => x.n.days < -90).map(x => x.p), row: p => `应于 ${nextFollowup(p).due} 随访 · 逾期 ${-nextFollowup(p).days} 天`, link: p => `patient-visits.html?id=${encodeURIComponent(p.id)}&from=followups`, more: 'followups.html?status=overdue' }
};
const recentAbn = patients.filter(p => aiOf(p).crpNow > 20 && p.last).sort((a, b) => b.last.localeCompare(a.last)).slice(0, 5);
const recentVisits = patients.filter(p => p.last && p.visits).sort((a, b) => b.last.localeCompare(a.last)).slice(0, 5);

$('#stat-date').textContent = `全部研究中心 · 统计截至 ${ymd(TODAY)}，随数据实时更新`;
$('#dashboard').innerHTML =
  section('患者规模', '活跃指近 6 个月内有随访记录') + `<div class="metric-grid">${metric('总患者数', N, '覆盖 1 家研究中心', '人', '', 'patients.html')}${metric('活跃患者数', active, `占全部患者 ${pct(active, N)}%`, '人', 'metric-success')}${metric('本月新增患者', newThisMonth, `${thisMonth.replace('-', ' 年 ')} 月`)}${metric('已脱落 / 失访', lost, '不再纳入随访计划', '人', 'metric-danger')}</div>` +
  section('随访管理', '按「上次随访 + 患者随访周期」推算') + `<div class="metric-grid">${metric('已逾期', fu.overdue, '优先安排随访', '人', 'metric-warning', 'followups.html?status=overdue')}${metric('7 日内待随访', fu.d7, '需提前电话确认', '人', '', 'followups.html?status=soon')}${metric('30 日内待随访', fu.d30, '含 7 日内')}${metric('按期随访率', onTime, `${plans.length} 项随访计划`, '%', 'metric-success')}</div><a class="panel-link" href="followups.html">进入随访管理 →</a>` +
  `<div class="dashboard-grid"><article class="panel"><h3>需关注患者</h3><div class="metric-value danger-text">${cnt({ act: 'mod-high' })}<small>人未达标（中高疾病活动）</small></div>${[['炎症指标升高（CRP > 10）', inflam, ''], ['高疾病活动（DAS28 > 5.1）', cnt({ act: 'high' }), 'ai-cohort.html?act=high'], ['合并 FM · 评分需复核', cnt({ cm: 'FM' }), 'ai-cohort.html?cm=FM']].map(([n, v, h]) => `<div class="progress-row"><span>${h ? `<a href="${h}">${n}</a>` : n}</span><progress value="${v}" max="${N}" aria-label="${n} ${v} 人"></progress><b>${v}</b></div>`).join('')}<p class="metric-note">同一患者可计入多项，以最近一次访视为准。</p></article>
  <article class="panel"><h3>疾病活动度 · DAS28</h3><p class="metric-note">最近一次评分分布 · 达标率 ${S.target}%</p>${S.distNow.map(d => `<div class="detail-line"><span><a href="ai-cohort.html?act=${d.key}">${d.label}</a></span><b>${d.n} 人 · ${pct(d.n, S.evaluable)}%</b></div>`).join('')}</article>
  <article class="panel"><h3>数据质量</h3><div class="metric-value">${pct(N - incomplete.length, N)}%<small>患者资料完整率</small></div>${lines(byMissing.map(([m, n]) => [m, `${n} 人`, `data-quality.html?type=${encodeURIComponent('缺失')}`]))}<a class="panel-link" href="data-quality.html">进入数据质控 →</a></article>
  <article class="panel"><h3>研究数据</h3>${lines([['有效研究样本数', `${validSample} 人`], ['累计完成访视', `${totalVisits} 次`], ['当前方案持续 ≥ 12 个月', `${patients.filter(p => aiOf(p).months >= 12).length} 人`], ['近 90 天有随访', `${patients.filter(p => within(p.last, 90)).length} 人`]])}<a class="panel-link" href="ai-cohort.html">进入队列分析 →</a></article></div>` +
  section('风险提醒', '点击卡片查看名单') + `<div class="risk-grid">${Object.entries(RISK_LISTS).map(([id, r]) => `<button class="panel risk-card" data-risk="${id}" aria-label="查看${r.name}，${r.list.length}人"><span class="risk-card-heading"><strong>${r.name}</strong>${badge(r.level + '风险', r.level === '高' ? 'danger' : 'warning')}</span><span class="metric-value danger-text">${r.list.length}<small>人</small></span><span class="metric-note">${r.note}</span><span class="risk-link">查看风险患者 ${icon('chevron')}</span></button>`).join('')}</div>` +
  section('近期动态', '按最近一次访视日期') + `<div class="dashboard-grid"><article class="panel"><h3>最近炎症指标偏高</h3>${recentAbn.map(p => `<div class="activity"><b><a href="patient-insight.html?id=${encodeURIComponent(p.id)}">${escapeHTML(p.name)}</a></b><span>CRP ${fmt1(aiOf(p).crpNow)} mg/L</span><time>${md(p.last)}</time></div>`).join('')}</article><article class="panel"><h3>最近完成随访</h3>${recentVisits.map(p => `<div class="activity"><b><a href="patient-visits.html?id=${encodeURIComponent(p.id)}">${escapeHTML(p.name)}</a></b><span>第 ${p.visits} 次随访 · 已完成</span><time>${md(p.last)}</time></div>`).join('')}</article></div>` +
  `<p class="dashboard-note">统计口径：资料完整指建档必填项、DAS28 评分、基线检验、合并疾病与用药史均已录入；DAS28 等分析字段为演示数据（规则生成），与 AI 分析页同源。</p>`;

function showRisk(id) {
  const r = RISK_LISTS[id]; if (!r) return;
  $('#risk-title').textContent = r.name;
  $('#risk-detail').innerHTML = `${badge(r.level + '风险', r.level === '高' ? 'danger' : 'warning')}<dl class="risk-facts"><div><dt>统计人数</dt><dd>${r.list.length} 人</dd></div><div><dt>风险条件</dt><dd>${escapeHTML(r.note)}</dd></div></dl>` +
    (r.list.length ? `<div class="risk-list">${r.list.slice(0, 12).map(p => `<a href="${r.link(p)}"><b>${escapeHTML(p.name)}</b><span>${escapeHTML(p.code)}</span><em>${escapeHTML(r.row(p))}</em></a>`).join('')}</div>${r.list.length > 12 ? `<p class="metric-note">仅显示前 12 位，共 ${r.list.length} 位</p>` : ''}${r.more ? `<a class="panel-link" href="${r.more}">查看全部 →</a>` : ''}` : '<p class="metric-note">当前没有符合条件的患者。</p>');
  $('#risk-dialog').showModal();
}
$('#dashboard').addEventListener('click', e => { const card = e.target.closest('[data-risk]'); if (card) showRisk(card.dataset.risk); });
document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => btn.closest('dialog')?.close()));

// ---------- 智能研究队列（与队列分析同一解析规则） ----------
function previewCohort() {
  const q = $('#cohort-q').value.trim(), r = parseQuestion(q), list = applyFilters(r.filters), s = cohortStats(list, r.filters.at);
  const chips = filterChips(r.filters);
  $('#cohort-chips').innerHTML = chips.length ? chips.map(c => `<span>${escapeHTML(c.label)}</span>`).join('') : '<span>未识别到条件 · 将以研究库全部患者为队列</span>';
  $('#cohort-result').innerHTML = [[list.length, '符合条件患者'], [s.complete + '%', '资料完整度'], [list.filter(p => aiOf(p).months >= 3).length, '方案 ≥ 3 个月'], [list.filter(p => aiOf(p).months >= 6).length, '方案 ≥ 6 个月']].map(([v, l]) => `<div><strong>${v}</strong><span>${l}</span></div>`).join('');
}
$('#cohort-form').addEventListener('submit', e => { e.preventDefault(); previewCohort(); });
$('#create-cohort').onclick = () => location.href = `ai-cohort.html?q=${encodeURIComponent($('#cohort-q').value.trim())}`;
previewCohort();

$('#export-report')?.addEventListener('click', () => {
  const rows = [['统计时间', ymd(TODAY)], ['指标', '数值'], ['总患者数', N], ['活跃患者数', active], ['本月新增患者', newThisMonth], ['已脱落/失访', lost], ['随访已逾期', fu.overdue], ['7日内待随访', fu.d7], ['30日内待随访', fu.d30], ['按期随访率', onTime + '%'], ['达标率', S.target + '%'], ...S.distNow.map(d => [d.label, d.n]), ['资料完整率', pct(N - incomplete.length, N) + '%'], ...byMissing, ['有效研究样本数', validSample], ['累计完成访视', totalVisits], ...Object.values(RISK_LISTS).map(r => [r.name, r.list.length])];
  const csv = '﻿' + rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `RA-统计报表-${ymd(TODAY)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
