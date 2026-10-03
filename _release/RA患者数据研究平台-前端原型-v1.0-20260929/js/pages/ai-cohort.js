/* ai-cohort.html 页面脚本（依赖 boot.js → data.js → common.js → shared/ai-analytics.js） */
"use strict";
shell('ai');
const params = new URLSearchParams(location.search);
let filters = filtersFromParams(params);
let listShown = 10;

// URL 带入：?q= 自然语言问题；?preset=similar&id= 相似患者；?ids= 患者列表勾选
if (params.get('q')) {
  $('#question').value = params.get('q');
  const r = parseQuestion(params.get('q'));
  filters = { ...r.filters, ids: filters.ids };
  showParse(r.matched);
}
if (params.get('preset') === 'similar' && params.get('id')) {
  const p = patientById(params.get('id')), a = aiOf(p);
  filters = { ...AI_FILTER_DEFAULT, sex: p.sex, age: `${a.age - 5}-${a.age + 5}`, sero: a.sero ? '1' : '' };
  $('#question').value = `与 ${p.name} 基线特征相似的患者（${p.sex}，${a.age - 5}–${a.age + 5} 岁${a.sero ? '，RF / ACPA 阳性' : ''}）`;
  showParse(['相似患者：同性别、年龄 ±5 岁' + (a.sero ? '、血清学阳性' : '')]);
}
if (filters.ids) $('#question').placeholder = `已带入患者列表中勾选的 ${filters.ids.split(',').length} 位患者，可继续追加条件`;

function showParse(matched) {
  const box = $('#parse-note');
  box.hidden = false;
  box.innerHTML = matched.length
    ? `<span class="demo-flag">规则解析</span> 识别到：${matched.map(escapeHTML).join('、')}。以下条件可直接修改或删除。`
    : '<span class="demo-flag">规则解析</span> 未识别到可用条件，已展示研究库整体；可在下方手动选择条件。';
}

// 条件 ↔ 下拉框
const SELECTS = { sex: '#f-sex', age: '#f-age', sero: '#f-sero', tx: '#f-tx', at: '#f-at', act: '#f-act', cm: '#f-cm', data: '#f-data' };
function syncSelects() {
  Object.entries(SELECTS).forEach(([k, sel]) => {
    const el = $(sel);
    if (filters[k] && ![...el.options].some(o => o.value === filters[k])) el.add(new Option(AI_FILTER_LABELS[k](filters[k]), filters[k]));
    el.value = filters[k];
  });
}
Object.entries(SELECTS).forEach(([k, sel]) => $(sel).addEventListener('change', e => { filters[k] = e.target.value; update(); }));

function renderChips() {
  const chips = filterChips(filters);
  $('#chips').innerHTML = chips.length
    ? chips.map(c => `<span class="cond-chip">${escapeHTML(c.label)}<button type="button" data-key="${c.key}" aria-label="移除条件 ${escapeHTML(c.label)}">×</button></span>`).join('')
    : '<span class="cond-empty">未设置条件 · 当前为研究库全部患者</span>';
}
$('#chips').addEventListener('click', e => { const b = e.target.closest('[data-key]'); if (!b) return; filters[b.dataset.key] = AI_FILTER_DEFAULT[b.dataset.key]; update(); });

function statTiles(list, s) {
  const tiles = [
    ['队列人数', s.n, '人', `占研究库 ${pct(s.n, patients.length)}%`],
    ['年龄中位数', s.ageMedian ?? '—', '岁', `女性 ${s.female}%`],
    ['病程中位数', s.durationMedian ?? '—', '年', `血清学阳性 ${s.sero}%`],
    ['达标率', s.target, '%', `${s.evaluable} 位可评估 · DAS28 ≤ 3.2`],
    ['资料完整', s.complete, '%', `${list.filter(p => p.incomplete).length} 位待补全`]
  ];
  return tiles.map(([l, v, u, n]) => `<div class="stat-tile"><span>${l}</span><strong>${v}<small>${u}</small></strong><em>${n}</em></div>`).join('');
}

function compareTable(list) {
  const fm = subgroupFM(list);
  if (fm.nFM < 3 || fm.nOther < 3) return `<p class="cond-empty">当前队列中合并 FM 或未合并 FM 的患者不足 3 位，暂不做亚组对比。</p>`;
  return `<table class="compare-table"><thead><tr><th>指标（均值）</th><th>合并 FM · ${fm.nFM} 位</th><th>未合并 FM · ${fm.nOther} 位</th><th>差值</th></tr></thead><tbody>${fm.rows.map(r => {
    const d = r.fm - r.other, big = Math.abs(d) >= (r.d === 0 ? 5 : r.d === 2 ? 0.2 : 0.5);
    return `<tr><td>${r.label}</td><td>${r.fm.toFixed(r.d)}</td><td>${r.other.toFixed(r.d)}</td><td class="${big ? 'delta-up' : 'delta-flat'}">${d > 0 ? '+' : ''}${d.toFixed(r.d)}</td></tr>`;
  }).join('')}</tbody></table><p class="panel-note">差值为描述性统计，未做显著性检验。压痛相关指标差异明显而 CRP、SJC28 接近时，应警惕 DAS28 被 FM 抬高。</p>`;
}

function patientRows(list) {
  const at = filters.at;
  return list.slice(0, listShown).map(p => {
    const a = aiOf(p), das = dasAt(a, at), c = actOf(das), cs = comorbidCodes(p);
    const tone = { remission: 'success', low: 'success', moderate: 'warning', high: 'danger' }[c] || 'neutral';
    return `<a class="ai-row" href="patient-insight.html?id=${encodeURIComponent(p.id)}&from=ai-cohort"><span class="ai-row-name"><b>${escapeHTML(p.name)}</b><small>${p.sex} · ${a.age} 岁 · ${escapeHTML(p.code)}</small></span><span>${a.tx}<small>${escapeHTML(a.drug)} · ${a.line} 线</small></span><span>${a.months} 个月<small>当前方案时长</small></span><span class="num">${fmt1(a.das0)} → ${fmt1(das)}<small>DAS28 基线 → ${at === '6m' ? '6 个月' : '当前'}</small></span><span>${badge(actLabel(c), tone)}</span><span class="num">${fmt1(a.crpNow)}<small>CRP mg/L</small></span><span>${cs.length ? cs.join(' / ') : '无'}<small>其他病史</small></span></a>`;
  }).join('');
}

function update() {
  const q = filtersToQuery(filters);
  history.replaceState(null, '', q ? `?${q}` : location.pathname);
  syncSelects(); renderChips();
  const list = applyFilters(filters), s = cohortStats(list, filters.at), lib = cohortStats(patients, filters.at);
  $('#stats').innerHTML = statTiles(list, s);
  const empty = !list.length;
  $('#results').hidden = empty; $('#no-result').hidden = !empty;
  if (empty) return;
  $('#chart-activity').innerHTML = stackedActivity([
    { label: '基线', dist: s.distBase },
    { label: filters.at === '6m' ? '治疗 6 个月' : '最近访视', dist: s.distNow }
  ]);
  $('#chart-tx').innerHTML = barList(s.byTx.filter(g => g.n).map(g => ({ label: g.tx, value: g.rate, n: g.n })), { note: it => `${it.n} 人` })
    + `<p class="panel-note">研究库整体达标率 ${lib.target}% · 组间基线不同，差异不代表疗效差异</p>`;
  $('#chart-line').innerHTML = barList(s.lines.map(l => ({ label: `${l.line} 线治疗`, value: pct(l.n, s.n), n: l.n })), { note: it => `${it.n} 人` })
    + `<p class="panel-note">1 线：csDMARD；2 线：首个生物 / 靶向药；3 线：换用第二种生物 / 靶向药</p>`;
  $('#compare').innerHTML = compareTable(list);
  const ins = buildInsights(list, filters.at);
  $('#insights').innerHTML = ins.map(x => `<article class="insight-item ${x.kind}"><div><span class="tag">${x.tag}</span><strong>${escapeHTML(x.title)}</strong><p>${escapeHTML(x.text)}</p><small>依据：${escapeHTML(x.evidence)}${x.link ? `<a href="${x.link}">前往处理 →</a>` : ''}</small></div></article>`).join('');
  $('#list-count').textContent = `${list.length} 位患者 · 点击进入病程分析`;
  $('#patient-rows').innerHTML = patientRows(list);
  $('#more').hidden = list.length <= listShown;
  $('#more').textContent = `显示更多（还有 ${list.length - listShown} 位）`;
  $('#ask-chat').href = `ai-chat.html?scope=cohort${q ? '&' + q : ''}`;
}

$('#question-form').addEventListener('submit', e => {
  e.preventDefault();
  const r = parseQuestion($('#question').value);
  filters = { ...r.filters, ids: filters.ids };
  showParse(r.matched); listShown = 10; update();
});
$('#reset').onclick = () => { filters = { ...AI_FILTER_DEFAULT }; $('#question').value = ''; $('#parse-note').hidden = true; listShown = 10; update(); };
$('#more').onclick = () => { listShown += 20; update(); };
$('#export').onclick = () => {
  const list = applyFilters(filters);
  const head = ['ID号', '姓名', '性别', '年龄', '研究编号', '当前治疗', '药物', '治疗线数', '方案时长(月)', 'DAS28基线', 'DAS28 6个月', 'DAS28当前', 'CRP当前', '其他病史', '资料完整性'];
  const cell = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const rows = list.map(p => { const a = aiOf(p); return [p.id, p.name, p.sex, a.age, p.code, a.tx, a.drug, a.line, a.months, a.das0, a.das6, a.dasNow, a.crpNow, comorbidCodes(p).join('/') || '无', p.incomplete ? '待补全' : '完整'].map(cell).join(','); });
  const u = URL.createObjectURL(new Blob(['﻿' + head.join(',') + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = u; a.download = `队列-${list.length}人-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 500);
};
bindTooltips(document.getElementById('results'));
update();
