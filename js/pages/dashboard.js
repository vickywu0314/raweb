/* dashboard.html 页面脚本（依赖 boot.js → common.js）
   数据来自后端 POST /api/ra/dashboard/summary：只统计当前医生名下的 RA 患者；
   随访状态、DAS28 活动度、资料完整性与患者列表同一口径，逾期 / 到期 / 按期随访率 / 疑似失访与随访管理同一口径。
   「智能研究队列」暂不做（页面已隐藏）。 */
"use strict";
shell('dashboard');

const section = (title, note = "") => `<div class="section-heading"><h2>${title}</h2><p>${note}</p></div>`;
const metric = (label, value, note, suffix = "人", tone = "", href = "") => `<${href ? `a href="${href}"` : 'article'} class="panel ${tone}${href ? ' metric-link' : ''}"><p class="metric-label">${label}</p><div class="metric-value">${value ?? '—'}<small>${value == null ? '' : suffix}</small></div><p class="metric-note">${note}</p></${href ? 'a' : 'article'}>`;
const lines = items => items.map(([name, value, href]) => `<div class="detail-line"><span>${href ? `<a href="${href}">${name}</a>` : name}</span><b>${value}</b></div>`).join("");
const md = d => d ? d.slice(5).replace('-', '/') : '—';
const pctOf = (n, d) => d ? Math.round(n / d * 100) : 0;
const visitsHref = id => `patient-visits.html?id=${encodeURIComponent(id)}&from=dashboard`;
let D = null;

function render() {
  const s = D.scale, f = D.followup, a = D.activity, t = D.attention, q = D.quality, r = D.research, N = s.total;
  $('#stat-date').textContent = `我名下的 RA 患者 · 统计截至 ${D.asOf}，每次打开页面重新计算`;
  $('#dashboard').innerHTML =
    section('患者规模', '活跃指未脱落、近 6 个月内有随访记录') + `<div class="metric-grid">${metric('总患者数', N, '我名下的 RA 患者（含已脱落）', '人', '', 'patients.html')}${metric('活跃患者数', s.active, `占全部患者 ${pctOf(s.active, N)}%`, '人', 'metric-success')}${metric('本月新增患者', s.newThisMonth, `${D.asOf.slice(0, 7).replace('-', ' 年 ')} 月建档`)}${metric('已脱落 / 疑似失访', `${s.withdrawn} / ${s.lost}`, '已标记脱落 / 超过 2 年未随访', '人', 'metric-danger', 'followups.html?status=lost')}</div>` +
    section('随访管理', '与随访管理页同一口径（不含已脱落、疑似失访）') + `<div class="metric-grid">${metric('已逾期', f.overdue, '优先安排随访', '人', 'metric-warning', 'followups.html?status=overdue')}${metric('7 日内待随访', f.due7, '需提前电话确认', '人', '', 'followups.html?status=soon')}${metric('30 日内待随访', f.due30, '含 7 日内')}${metric('按期随访率', f.onTimeRate, `已做基线的 ${f.planned - f.pendingFirst} 项随访计划 · 另有 ${f.pendingFirst} 位待首次随访`, '%', 'metric-success')}</div><a class="panel-link" href="followups.html">进入随访管理 →</a>` +
    `<div class="dashboard-grid"><article class="panel"><h3>需关注患者</h3><div class="metric-value danger-text">${t.notTarget}<small>人未达标（中高疾病活动）</small></div>${[['炎症指标升高（最近一次 CRP > 10 mg/L）', t.highCrp, ''], ['高疾病活动（DAS28-CRP > 4.1）', t.highActivity, 'ai-cohort.html?act=high'], ['合并 FM · 评分需复核', t.fm, 'ai-cohort.html?cm=FM']].map(([n, v, h]) => `<div class="progress-row"><span>${h ? `<a href="${h}">${n}</a>` : n}</span><progress value="${v}" max="${N || 1}" aria-label="${n} ${v} 人"></progress><b>${v}</b></div>`).join('')}<p class="metric-note">同一患者可计入多项，以最近一次访视为准。</p></article>
    <article class="panel"><h3>疾病活动度 · DAS28-CRP</h3><p class="metric-note">最近一次评分分布（${a.evaluable} 人有评分）· 达标率 ${a.targetRate ?? '—'}%</p>${a.dist.map(d => `<div class="detail-line"><span><a href="ai-cohort.html?act=${d.key}">${escapeHTML(d.label)}</a></span><b>${d.n} 人 · ${pctOf(d.n, a.evaluable)}%</b></div>`).join('')}</article>
    <article class="panel"><h3>数据质量</h3><div class="metric-value">${q.completeRate ?? '—'}%<small>患者资料完整率</small></div>${lines(q.byItem.map(x => [escapeHTML(x.item), `${x.n} 人`]))}<a class="panel-link" href="patients.html?data=missing">查看待补全患者 →</a></article>
    <article class="panel"><h3>研究数据</h3>${lines([['有效研究样本数', `${r.validSample} 人`], ['累计完成访视', `${r.totalVisits} 次`], ['近 30 天有随访', `${r.visited30} 人`], ['近 90 天有随访', `${r.visited90} 人`]])}<a class="panel-link" href="ai-cohort.html">进入队列分析 →</a></article></div>` +
    section('风险提醒', '点击卡片查看名单') + `<div class="risk-grid">${D.risks.map(x => `<button class="panel risk-card" data-risk="${x.key}" aria-label="查看${escapeHTML(x.name)}，${x.count}人"><span class="risk-card-heading"><strong>${escapeHTML(x.name)}</strong>${badge(x.level + '风险', x.level === '高' ? 'danger' : 'warning')}</span><span class="metric-value danger-text">${x.count}<small>人</small></span><span class="metric-note">${escapeHTML(x.note)}</span><span class="risk-link">查看风险患者 ${icon('chevron')}</span></button>`).join('')}</div>` +
    section('近期动态', '按访视日期，最近的在前') + `<div class="dashboard-grid"><article class="panel"><h3>最近炎症指标偏高（CRP > 20 mg/L）</h3>${D.recentHighCrp.length ? D.recentHighCrp.map(p => `<div class="activity"><b><a href="${visitsHref(p.patientId)}">${escapeHTML(p.name)}</a></b><span>CRP ${escapeHTML(p.crp)} mg/L</span><time>${md(p.visitDate)}</time></div>`).join('') : '<p class="metric-note">暂无</p>'}</article><article class="panel"><h3>最近完成随访</h3>${D.recentVisits.length ? D.recentVisits.map(p => `<div class="activity"><b><a href="${withFrom(`visit-detail.html?id=${encodeURIComponent(p.patientId)}&visit=${encodeURIComponent(p.visitId)}`)}">${escapeHTML(p.name)}</a></b><span>${escapeHTML(p.label)} · 已完成</span><time>${md(p.visitDate)}</time></div>`).join('') : '<p class="metric-note">暂无</p>'}</article></div>` +
    `<p class="dashboard-note">统计口径：只统计您名下的 RA 患者。随访状态、DAS28-CRP 活动度（CRP 阈值：缓解 &lt;2.3、低 ≤2.7、中 ≤4.1、高 &gt;4.1）、资料完整性与患者列表一致；逾期、到期、按期随访率、疑似失访与随访管理一致。</p>`;
}

const RISK_LINK = { overdue: id => `patient-visits.html?id=${encodeURIComponent(id)}&from=followups`, rebound: visitsHref, high: visitsHref };
const RISK_MORE = { overdue: 'followups.html?status=overdue', high: 'ai-cohort.html?act=high' };
function showRisk(key) {
  const r = D.risks.find(x => x.key === key); if (!r) return;
  $('#risk-title').textContent = r.name;
  $('#risk-detail').innerHTML = `${badge(r.level + '风险', r.level === '高' ? 'danger' : 'warning')}<dl class="risk-facts"><div><dt>统计人数</dt><dd>${r.count} 人</dd></div><div><dt>风险条件</dt><dd>${escapeHTML(r.note)}</dd></div></dl>` +
    (r.count ? `<div class="risk-list">${r.patients.slice(0, 12).map(p => `<a href="${RISK_LINK[key](p.patientId)}"><b>${escapeHTML(p.name)}</b><span>${escapeHTML(p.studyNo || '—')}</span><em>${escapeHTML(p.detail)}</em></a>`).join('')}</div>${r.count > 12 ? `<p class="metric-note">仅显示前 12 位，共 ${r.count} 位</p>` : ''}${RISK_MORE[key] ? `<a class="panel-link" href="${RISK_MORE[key]}">查看全部 →</a>` : ''}` : '<p class="metric-note">当前没有符合条件的患者。</p>');
  $('#risk-dialog').showModal();
}
$('#dashboard').addEventListener('click', e => { const card = e.target.closest('[data-risk]'); if (card) showRisk(card.dataset.risk); });
document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => btn.closest('dialog')?.close()));

// 导出统计报表（CSV，与页面同一份数据）
$('#export-report')?.addEventListener('click', () => {
  if (!D) return;
  const s = D.scale, f = D.followup, a = D.activity, t = D.attention, q = D.quality, r = D.research;
  const rows = [['统计范围', '我名下的 RA 患者'], ['统计时间', D.asOf], ['指标', '数值'], ['总患者数', s.total], ['活跃患者数', s.active], ['本月新增患者', s.newThisMonth], ['已脱落', s.withdrawn], ['疑似失访（超过 2 年未随访）', s.lost], ['随访已逾期', f.overdue], ['7日内待随访', f.due7], ['30日内待随访', f.due30], ['待首次随访', f.pendingFirst], ['按期随访率', f.onTimeRate == null ? '' : f.onTimeRate + '%'], ['未达标（中高疾病活动）', t.notTarget], ['炎症指标升高（CRP>10）', t.highCrp], ['合并 FM', t.fm], ['有 DAS28-CRP 评分人数', a.evaluable], ['达标率', a.targetRate == null ? '' : a.targetRate + '%'], ...a.dist.map(d => [d.label, d.n]), ['资料完整率', q.completeRate == null ? '' : q.completeRate + '%'], ...q.byItem.map(x => [x.item, x.n]), ['有效研究样本数', r.validSample], ['累计完成访视', r.totalVisits], ['近 30 天有随访', r.visited30], ['近 90 天有随访', r.visited90], ...D.risks.map(x => [x.name, x.count])];
  const csv = '﻿' + rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const el = document.createElement('a'); el.href = url; el.download = `RA-统计报表-${D.asOf}.csv`; el.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});

async function load() {
  $('#dashboard').innerHTML = '<p class="metric-note">正在统计…</p>';
  try { D = await apiPost('/api/ra/dashboard/summary', { doctorId: currentDoctorId() }); render(); }
  catch (e) { console.error(e); $('#dashboard').innerHTML = `<p class="pv-load-error">看板数据加载失败：${escapeHTML(e.message)}。请确认后端服务已启动后刷新页面。</p>`; }
}
load();
