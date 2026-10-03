/* AI 智能分析（共享模块）：ai-analysis / ai-cohort / ai-chat 共用。
   包含：分析用演示数据、队列筛选、问题解析、统计与发现生成、图表渲染。
   依赖 data.js → common.js；需在页面脚本之前加载。
   注意：当前未接入 AI 引擎——“问题解析”为关键词规则，“发现”为规则计算；接入模型后替换 parseQuestion / buildInsights。 */
"use strict";

/* ---------- 1. 分析用演示数据（按患者序号确定性生成，刷新不变） ---------- */
const AI_TX = {
  csDMARD: { label: 'csDMARD', drugs: ['甲氨蝶呤 15 mg/w', '甲氨蝶呤 + 羟氯喹', '来氟米特 20 mg/d'], resp: 1.6 },
  TNFi: { label: 'TNFi', drugs: ['阿达木单抗', '依那西普', '英夫利昔单抗'], resp: 1.9 },
  JAKi: { label: 'JAKi', drugs: ['托法替布', '巴瑞替尼', '乌帕替尼'], resp: 2.0 },
  'IL-6i': { label: 'IL-6i', drugs: ['托珠单抗'], resp: 1.8 },
  Abatacept: { label: 'Abatacept', drugs: ['阿巴西普'], resp: 1.7 }
};
const AI_TX_ORDER = ['csDMARD', 'TNFi', 'JAKi', 'IL-6i', 'Abatacept'];
const AI_ACT = [
  { key: 'remission', label: '缓解', max: 2.6 },
  { key: 'low', label: '低疾病活动', max: 3.2 },
  { key: 'moderate', label: '中疾病活动', max: 5.1 },
  { key: 'high', label: '高疾病活动', max: Infinity }
];
// DAS28-ESR 分层：缓解 < 2.6；低 2.6–3.2；中 3.2–5.1；高 > 5.1
const actOf = das => das == null ? null : das < 2.6 ? 'remission' : das <= 3.2 ? 'low' : das <= 5.1 ? 'moderate' : 'high';
const actLabel = k => (AI_ACT.find(a => a.key === k) || {}).label || '—';
const atTarget = das => das != null && das <= 3.2;

const _rnd = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
const r1 = v => Math.round(v * 10) / 10;
const AI_DATA = new Map();
patients.forEach((p, i) => {
  const cls = ['csDMARD', 'csDMARD', 'csDMARD', 'TNFi', 'TNFi', 'JAKi', 'JAKi', 'IL-6i', 'Abatacept'][Math.floor(_rnd(i, 1) * 9)];
  const fm = !!(p.comorbid && p.comorbid.FM);
  const months = 3 + Math.floor(_rnd(i, 2) * 30);
  const das0 = 3.9 + _rnd(i, 3) * 2.6;
  const drop = AI_TX[cls].resp * (0.4 + _rnd(i, 4) * 1.3);
  const fmAdd = fm ? 0.7 : 0;
  const das6 = months >= 6 ? Math.max(1.9, das0 - drop * 0.8 + fmAdd) : null;
  // 约 15% 治疗满 9 个月的患者在 6 个月后出现疾病活动回升（演示反弹场景）
  const rebound = months >= 9 && _rnd(i, 14) > 0.85;
  const dasNow = rebound ? das6 + 0.6 + _rnd(i, 15) * 0.8 : Math.max(1.8, das0 - drop + fmAdd);
  const crp0 = 6 + _rnd(i, 5) * 34;
  const crpNow = crp0 * (1 - Math.min(0.9, drop / 2.5)) * (rebound ? 1.8 : 1) + _rnd(i, 6) * 4;
  AI_DATA.set(p.id, {
    tx: cls, drug: AI_TX[cls].drugs[Math.floor(_rnd(i, 7) * AI_TX[cls].drugs.length)],
    line: cls === 'csDMARD' ? 1 : (_rnd(i, 8) > 0.6 ? 3 : 2),
    months, das0: r1(das0), das6: das6 == null ? null : r1(das6), dasNow: r1(dasNow),
    crp0: r1(crp0), crpNow: r1(crpNow),
    tjc: Math.round(Math.max(0, (dasNow - 2) * 2.2 + (fm ? 4 : 0) + _rnd(i, 9) * 2)),
    sjc: Math.round(Math.max(0, (dasNow - fmAdd - 2.2) * 1.6 + _rnd(i, 10) * 1.5)),
    vas: Math.min(100, Math.round(20 + dasNow * 9 + (fm ? 15 : 0) + _rnd(i, 11) * 8)),
    haq: r1(0.2 + dasNow * 0.22 + (fm ? 0.3 : 0)),
    sero: _rnd(i, 12) > 0.25,
    duration: 1 + Math.floor(_rnd(i, 13) * 15),
    age: 2026 - p.year
  });
});
const aiOf = p => AI_DATA.get(p.id);

/* ---------- 2. 筛选条件 ---------- */
const AI_FILTER_DEFAULT = { sex: '', age: '', sero: '', tx: '', at: 'now', act: '', cm: '', data: '', ids: '' };
const AI_FILTER_LABELS = {
  sex: v => v === '女' ? '女性' : '男性',
  age: v => { const [a, b] = v.split('-'); return b ? `${a}–${b} 岁` : `${a} 岁以上`; },
  sero: () => 'RF / ACPA 阳性',
  tx: v => v === 'bio' ? '生物 / 靶向治疗' : `当前治疗：${v}`,
  at: v => v === '6m' ? '评估时点：治疗 6 个月' : '',
  act: v => ({ remission: '缓解', low: '低疾病活动', moderate: '中疾病活动', high: '高疾病活动', 'mod-high': '中高疾病活动（未达标）', target: '已达标（缓解 / 低活动）' })[v],
  cm: v => v === 'none' ? '无合并 FM / AS' : `合并 ${v}`,
  data: v => v === 'missing' ? '资料待补全' : '资料完整',
  ids: v => `指定患者 ${v.split(',').length} 位`
};
function filtersFromParams(params) {
  const f = { ...AI_FILTER_DEFAULT };
  Object.keys(f).forEach(k => { const v = params.get(k); if (v != null) f[k] = v; });
  return f;
}
function filtersToQuery(f) {
  const q = new URLSearchParams();
  Object.keys(AI_FILTER_DEFAULT).forEach(k => { if (f[k] && f[k] !== AI_FILTER_DEFAULT[k]) q.set(k, f[k]); });
  return q.toString();
}
function filterChips(f) {
  return Object.keys(AI_FILTER_DEFAULT).filter(k => f[k] && f[k] !== AI_FILTER_DEFAULT[k]).map(k => ({ key: k, label: AI_FILTER_LABELS[k](f[k]) })).filter(c => c.label);
}
// 评估时点下的 DAS28：6 个月时点仅纳入治疗满 6 个月的患者
const dasAt = (a, at) => at === '6m' ? a.das6 : a.dasNow;
function applyFilters(f, list = patients) {
  const ids = f.ids ? new Set(f.ids.split(',')) : null;
  return list.filter(p => {
    const a = aiOf(p);
    if (ids && !ids.has(p.id)) return false;
    if (f.sex && p.sex !== f.sex) return false;
    if (f.age) { const [lo, hi] = f.age.split('-').map(Number); if (a.age < lo || (hi && a.age > hi)) return false; }
    if (f.sero && !a.sero) return false;
    if (f.tx) { if (f.tx === 'bio' ? a.tx === 'csDMARD' : a.tx !== f.tx) return false; }
    const das = dasAt(a, f.at);
    if (f.at === '6m' && das == null) return false;
    if (f.act) {
      const c = actOf(das);
      const ok = f.act === 'mod-high' ? (c === 'moderate' || c === 'high') : f.act === 'target' ? atTarget(das) : c === f.act;
      if (!ok) return false;
    }
    if (f.cm) { const cs = comorbidCodes(p); if (f.cm === 'none' ? cs.length : !cs.includes(f.cm)) return false; }
    if (f.data) { if (f.data === 'missing' ? !p.incomplete : p.incomplete) return false; }
    return true;
  });
}

/* ---------- 3. 问题解析（关键词规则，演示） ---------- */
function parseQuestion(text) {
  const t = (text || '').replace(/\s+/g, '');
  const f = { ...AI_FILTER_DEFAULT };
  const hit = [];
  const on = (k, v, word) => { f[k] = v; hit.push(word); };
  if (/TNF|肿瘤坏死|阿达木|依那西普|英夫利昔/i.test(t)) on('tx', 'TNFi', 'TNFi');
  else if (/JAK|托法替布|巴瑞替尼|乌帕替尼/i.test(t)) on('tx', 'JAKi', 'JAKi');
  else if (/IL-?6|托珠/i.test(t)) on('tx', 'IL-6i', 'IL-6i');
  else if (/阿巴西普|Abatacept/i.test(t)) on('tx', 'Abatacept', 'Abatacept');
  else if (/生物制剂|靶向|b\/tsDMARD/i.test(t)) on('tx', 'bio', '生物/靶向');
  else if (/甲氨蝶呤|MTX|csDMARD|传统/i.test(t)) on('tx', 'csDMARD', 'csDMARD');
  if (/6个月|六个月|半年/.test(t)) on('at', '6m', '6 个月');
  if (/中高|未达标|仍.*活动/.test(t)) on('act', 'mod-high', '中高活动/未达标');
  else if (/高疾病活动|高活动/.test(t)) on('act', 'high', '高活动');
  else if (/缓解/.test(t) && !/达标/.test(t)) on('act', 'remission', '缓解');
  else if (/已达标|达到目标|低疾病活动/.test(t)) on('act', 'target', '已达标');
  if (/女性|女患者|女/.test(t) && !/男/.test(t)) on('sex', '女', '女性');
  else if (/男性|男患者/.test(t)) on('sex', '男', '男性');
  const age = t.match(/(\d{2})[-~–至到](\d{2})岁/) || t.match(/(\d{2})岁以上/);
  if (age) on('age', age[2] ? `${age[1]}-${age[2]}` : `${age[1]}-`, age[0]);
  if (/纤维肌痛|FM/i.test(t)) on('cm', 'FM', 'FM');
  else if (/强直|AS\b/i.test(t)) on('cm', 'AS', 'AS');
  if (/血清阳性|RF|ACPA|抗CCP/i.test(t)) on('sero', '1', '血清阳性');
  if (/缺失|待补全|不完整/.test(t)) on('data', 'missing', '资料待补全');
  return { filters: f, matched: hit };
}

/* ---------- 4. 统计 ---------- */
const median = xs => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const pct = (n, d) => d ? Math.round(n / d * 100) : 0;
function cohortStats(list, at = 'now') {
  const A = list.map(aiOf);
  const dist = key => AI_ACT.map(c => ({ key: c.key, label: c.label, n: A.filter(a => actOf(a[key]) === c.key).length }));
  const cur = A.map(a => dasAt(a, at)).filter(v => v != null);
  const byTx = AI_TX_ORDER.map(tx => {
    const g = A.filter(a => a.tx === tx && dasAt(a, at) != null);
    return { tx, n: g.length, rate: pct(g.filter(a => atTarget(dasAt(a, at))).length, g.length), dasMean: mean(g.map(a => dasAt(a, at))) };
  });
  return {
    n: list.length,
    ageMedian: median(A.map(a => a.age)),
    female: pct(list.filter(p => p.sex === '女').length, list.length),
    durationMedian: median(A.map(a => a.duration)),
    sero: pct(A.filter(a => a.sero).length, list.length),
    complete: pct(list.filter(p => !p.incomplete).length, list.length),
    target: pct(cur.filter(atTarget).length, cur.length),
    evaluable: cur.length,
    distBase: dist('das0'),
    distNow: dist(at === '6m' ? 'das6' : 'dasNow'),
    byTx,
    lines: [1, 2, 3].map(l => ({ line: l, n: A.filter(a => a.line === l).length })),
    nonResp: A.filter(a => dasAt(a, at) != null && a.das0 - dasAt(a, at) < 0.6).length
  };
}
function subgroupFM(list) {
  const g = list.filter(p => comorbidCodes(p).includes('FM')).map(aiOf), o = list.filter(p => !comorbidCodes(p).includes('FM')).map(aiOf);
  const m = (arr, k) => mean(arr.map(a => a[k]));
  return { nFM: g.length, nOther: o.length, rows: [['当前 DAS28', 'dasNow', 1], ['压痛关节数 TJC28', 'tjc', 1], ['肿胀关节数 SJC28', 'sjc', 1], ['CRP (mg/L)', 'crpNow', 1], ['疼痛 VAS', 'vas', 0], ['HAQ', 'haq', 2]].map(([label, k, d]) => ({ label, fm: m(g, k), other: m(o, k), d })) };
}

/* ---------- 5. 发现（规则生成；只描述差异，不做因果判断） ---------- */
function buildInsights(list, at = 'now') {
  const s = cohortStats(list, at), lib = cohortStats(patients, at), out = [];
  if (!list.length) return out;
  out.push({
    kind: s.target >= lib.target ? 'good' : 'warn', tag: '达标情况',
    title: `队列达标率 ${s.target}%，研究库整体 ${lib.target}%`,
    text: `${s.evaluable} 位可评估患者中 ${Math.round(s.evaluable * s.target / 100)} 位 DAS28 ≤ 3.2（低疾病活动或缓解）。`,
    evidence: `评估时点：${at === '6m' ? '治疗 6 个月' : '最近一次访视'} · 阈值 DAS28-ESR ≤ 3.2`
  });
  const groups = s.byTx.filter(g => g.n >= 5).sort((a, b) => b.rate - a.rate);
  if (groups.length >= 2) {
    const hi = groups[0], lo = groups[groups.length - 1];
    if (hi.rate - lo.rate >= 10) out.push({
      kind: 'info', tag: '治疗分组',
      title: `${hi.tx} 组达标率最高（${hi.rate}%），${lo.tx} 组最低（${lo.rate}%）`,
      text: `各组样本量：${groups.map(g => `${g.tx} ${g.n}`).join(' · ')}。组间基线疾病活动、病程和治疗线数不同，差异不等同于疗效差异。`,
      evidence: '观察性数据的组间描述，未做倾向评分或多因素校正'
    });
  }
  const fm = subgroupFM(list);
  if (fm.nFM >= 3 && fm.nOther >= 3) {
    const r = Object.fromEntries(fm.rows.map(x => [x.label, x]));
    const dDas = r['当前 DAS28'].fm - r['当前 DAS28'].other, dCrp = r['CRP (mg/L)'].fm - r['CRP (mg/L)'].other;
    if (dDas >= 0.3) out.push({
      kind: 'warn', tag: '亚组差异',
      title: `合并 FM 患者 DAS28 平均高 ${dDas.toFixed(1)}，但 CRP 仅相差 ${Math.abs(dCrp).toFixed(1)} mg/L`,
      text: `差异主要来自压痛关节数（${r['压痛关节数 TJC28'].fm.toFixed(1)} vs ${r['压痛关节数 TJC28'].other.toFixed(1)}）与疼痛 VAS，肿胀关节数接近，提示 DAS28 可能被 FM 相关压痛抬高。`,
      evidence: `FM ${fm.nFM} 位 vs 非 FM ${fm.nOther} 位 · 建议结合 SJC28、CRP 或 CDAI 复核疾病活动`
    });
  }
  if (s.nonResp) out.push({
    kind: 'warn', tag: '需复核',
    title: `${s.nonResp} 位患者 DAS28 较基线下降 < 0.6`,
    text: '按 EULAR 应答标准属于无应答范围，建议复核治疗依从性、剂量调整与近期事件。',
    evidence: '无应答定义：DAS28 下降 ≤ 0.6'
  });
  const miss = list.filter(p => p.incomplete).length;
  if (miss) out.push({
    kind: 'info', tag: '数据质量',
    title: `${miss} 位患者（${pct(miss, list.length)}%）资料待补全`,
    text: '缺失项可能影响上述比例的可靠性；可在数据质控中定位并补录。',
    evidence: '缺失项来源：数据质控规则', link: 'data-quality.html'
  });
  return out;
}

/* ---------- 6. 图表（纯 HTML/CSS，离线可用） ---------- */
// 疾病活动为有序分类：同一蓝色色阶由浅到深表示 缓解 → 高活动
const ACT_COLORS = { remission: '#86b6ef', low: '#5598e7', moderate: '#256abf', high: '#104281' };
function stackedActivity(rows) { // rows: [{label, dist:[{key,label,n}]}]
  const legend = `<div class="viz-legend">${AI_ACT.map(a => `<span><i style="background:${ACT_COLORS[a.key]}"></i>${a.label}</span>`).join('')}</div>`;
  const bars = rows.map(r => {
    const total = r.dist.reduce((s, d) => s + d.n, 0) || 1;
    return `<div class="viz-stack-row"><span class="viz-row-label">${r.label}<small>${total} 人</small></span><div class="viz-stack">${r.dist.filter(d => d.n).map(d => {
      const w = d.n / total * 100, fit = w >= 9;
      return `<span class="viz-seg" style="width:${w}%;background:${ACT_COLORS[d.key]}" data-tip="${r.label} · ${d.label}：${d.n} 人（${Math.round(w)}%）">${fit ? `<b class="${d.key === 'remission' ? 'on-light' : ''}">${Math.round(w)}%</b>` : ''}</span>`;
    }).join('')}</div></div>`;
  }).join('');
  const table = `<details class="viz-table"><summary>查看数据表</summary><table><tr><th></th>${AI_ACT.map(a => `<th>${a.label}</th>`).join('')}</tr>${rows.map(r => `<tr><th>${r.label}</th>${r.dist.map(d => `<td>${d.n}</td>`).join('')}</tr>`).join('')}</table></details>`;
  return legend + `<div class="viz-stack-wrap">${bars}</div>` + table;
}
function barList(items, { max = 100, unit = '%', note = x => '' } = {}) { // items: [{label, value, n}]
  return `<div class="viz-bars">${items.map(it => `<div class="viz-bar-row" data-tip="${it.label}：${it.value}${unit}${note(it) ? ' · ' + note(it) : ''}"><span class="viz-row-label">${it.label}<small>${note(it)}</small></span><div class="viz-track"><i style="width:${Math.max(0, it.value) / max * 100}%"></i></div><b>${it.value}${unit}</b></div>`).join('')}</div>`;
}
function bindTooltips(root = document) {
  let tip = document.getElementById('viz-tip');
  if (!tip) { tip = document.createElement('div'); tip.id = 'viz-tip'; tip.className = 'viz-tip'; tip.hidden = true; document.body.appendChild(tip); }
  root.addEventListener('mousemove', e => {
    const t = e.target.closest('[data-tip]');
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.dataset.tip; tip.hidden = false;
    tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + 'px';
    tip.style.top = (e.clientY + 16) + 'px';
  });
  root.addEventListener('mouseleave', () => { tip.hidden = true; });
}
const fmt1 = v => v == null ? '—' : (Math.round(v * 10) / 10).toFixed(1);

/* ---------- 7. 患者选择器（AI 首页、对话页共用） ---------- */
function bindPatientPicker(input, listEl, onPick) {
  let items = [], idx = -1;
  const close = () => { listEl.hidden = true; input.setAttribute('aria-expanded', 'false'); idx = -1; };
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    items = (q ? patients.filter(p => [p.name, p.id, p.code].some(v => v.toLowerCase().includes(q))) : patients).slice(0, 8);
    listEl.innerHTML = items.length ? items.map((p, i) => { const a = aiOf(p); return `<button type="button" role="option" data-i="${i}" class="${i === idx ? 'active' : ''}"><b>${escapeHTML(p.name)}</b><span>${p.sex} · ${a.age} 岁 · ${escapeHTML(p.code)}</span><em>${a.tx} · DAS28 ${fmt1(a.dasNow)}</em></button>`; }).join('') : '<p class="picker-empty">没有匹配的患者</p>';
    listEl.hidden = false; input.setAttribute('aria-expanded', 'true');
  };
  input.addEventListener('focus', draw);
  input.addEventListener('input', () => { idx = -1; draw(); });
  input.addEventListener('keydown', e => {
    if (listEl.hidden) return;
    if (e.key === 'ArrowDown') { idx = Math.min(items.length - 1, idx + 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); draw(); e.preventDefault(); }
    else if (e.key === 'Enter' && items[Math.max(0, idx)]) { onPick(items[Math.max(0, idx)]); close(); e.preventDefault(); }
    else if (e.key === 'Escape') close();
  });
  listEl.addEventListener('mousedown', e => { const b = e.target.closest('[data-i]'); if (b) { e.preventDefault(); onPick(items[+b.dataset.i]); close(); } });
  input.addEventListener('blur', () => setTimeout(close, 120));
}
const AI_EXAMPLES = [
  'TNFi 治疗 6 个月后仍处于中高疾病活动的患者',
  '合并纤维肌痛的患者疾病活动情况',
  '60 岁以上女性患者的达标率',
  'JAK 抑制剂治疗的患者'
];
