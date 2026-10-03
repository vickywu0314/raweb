/* patient-insight.html 页面脚本（依赖 boot.js → data.js → common.js → shared/ai-analytics.js）
   病程分析的所有数值都来自该患者的分析数据（与队列分析、研究数据对话同源），不再使用写死的示例。 */
"use strict";
document.addEventListener('DOMContentLoaded', () => {
  shell(pageOrigin().nav);
  const p = patientById(queryParam('id')), a = aiOf(p), pid = encodeURIComponent(p.id);
  document.title = `${p.name} · 病程分析 · 患者数据研究平台`;
  $('#patient-name').textContent = p.name + ' · 病程分析';
  $('#patient-meta').textContent = `研究编号 ${p.code} · ${p.sex} · ${a.age} 岁 · 病程 ${a.duration} 年 · ${a.sero ? 'RF / ACPA 阳性' : '血清学阴性'} · 纵向疾病分析`;
  if (p.created) { const n = document.createElement('p'); n.className = 'new-note'; n.textContent = '该患者为本机新建档案：病程分析需要至少两次含疾病活动度的访视，以下数值为演示生成，仅用于展示页面效果。'; document.querySelector('.target-strip').before(n); }
  const fs = followupStatus(p); $('#fu-state').className = `patient-followup-state ${fs.tone}`; $('#fu-state').textContent = fs.label;

  // ---- 导航与返回 ----
  const o = pageOrigin(), fromAi = o.nav === 'ai';
  ['back-patient', 'visit-record'].forEach(id => document.getElementById(id).href = withFrom(`patient-visits.html?id=${pid}`));
  const crumb = $('#crumb-origin'); crumb.textContent = o.crumb; crumb.href = o.href;
  const back = $('#back-link');
  if (fromAi) { back.textContent = `← 返回${o.label}`; bindBack(back, o.href); } else back.href = withFrom(`patient-visits.html?id=${pid}`);
  $('#similar-detail').onclick = () => location.href = `ai-cohort.html?preset=similar&id=${pid}`;
  const ask = () => openAIChat({ scope: 'patient', patient: p });
  $('#ask-ai').onclick = ask; $('#ask-ai-2').onclick = ask;

  // ---- 时间点：基线（开始当前方案）→ 6 个月 → 最近一次访视 ----
  const lastDate = p.last || ymd(TODAY);
  const baseDate = ymd(addMonths(lastDate, -a.months)), sixDate = ymd(addMonths(baseDate, 6));
  const ym = d => d.slice(0, 7).replace('-', '.');
  const sjc0 = Math.round(Math.max(0, (a.das0 - 2.2) * 1.6)), tjc0 = Math.round(Math.max(0, (a.das0 - 2) * 2.2)), haq0 = r1(0.2 + a.das0 * 0.22);
  const prevDas = a.das6 != null && a.months > 7 ? a.das6 : a.das0, prevDate = a.das6 != null && a.months > 7 ? sixDate : baseDate;
  const cat = actOf(a.dasNow), fm = comorbidCodes(p).includes('FM');

  // ---- 顶部状态条 + 参考结论 ----
  const statusTone = { remission: 'good', low: 'good', moderate: 'warn', high: 'bad' }[cat];
  $('#st-status').className = statusTone; $('#st-status').textContent = `${actLabel(cat)} · ${atTarget(a.dasNow) ? '已达标' : '未达标'}`;
  $('#st-since').textContent = `${a.months} 个月（${a.drug}）`;
  $('#das-label').textContent = `DAS28-ESR（较上次 ${ym(prevDate)}）`;
  const delta = a.dasNow - prevDas, tone = delta <= -0.6 ? 'improved' : delta >= 0.6 ? 'worsened' : 'stable', reached = atTarget(a.dasNow);
  const TONES = {
    improved: { label: '改善', arrow: '↓', text: reached ? '病情较前改善，已达到治疗目标。' : '病情较前改善，但当前仍未达到目标。' },
    stable: { label: '稳定', arrow: '→', text: reached ? '病情与上次基本持平，维持在治疗目标内。' : '病情与上次基本持平（DAS28 变化 < 0.6），当前仍未达到目标。' },
    worsened: { label: '恶化', arrow: '↑', text: '病情较前加重（DAS28 升高 ≥ 0.6），建议复核治疗依从性与近期事件。' }
  }, t = TONES[tone];
  $('#das-trend').innerHTML = `${fmt1(prevDas)} → ${fmt1(a.dasNow)} <em class="tone-${tone}">${t.arrow} ${Math.abs(delta).toFixed(1)}</em>`;
  $('#target-note').className = `target-note tone-${tone}`;
  $('#target-note').innerHTML = `<b class="tone-label">参考结论 · ${t.label}</b><span>${t.text}${fm ? '合并纤维肌痛，DAS28 可能被压痛相关指标抬高。' : ''}请结合完整病历进行临床判断。</span><span class="tone-legend" aria-hidden="true"><i class="tone-improved">改善</i><i class="tone-stable">稳定</i><i class="tone-worsened">恶化</i></span>`;

  // ---- 疾病历程 ----
  const events = [{ id: 'node-base', date: baseDate, kind: 'treat', cls: '', title: `开始当前方案 · ${actLabel(actOf(a.das0))}`, data: `DAS28-ESR ${fmt1(a.das0)} · SJC28 ${sjc0} · TJC28 ${tjc0} · CRP ${fmt1(a.crp0)}`, tag: ['event-treatment', `开始 ${a.drug}（${a.tx} · ${a.line} 线）`] }];
  if (a.das6 != null) {
    const d6 = a.das0 - a.das6, good = d6 >= 1.2;
    events.push({ id: 'node-6m', date: sixDate, kind: good ? 'good' : 'alert', cls: good ? 'good' : 'alert', title: good ? '治疗 6 个月 · 明显改善' : d6 > 0.6 ? '治疗 6 个月 · 部分改善' : '治疗 6 个月 · 改善不足', data: `DAS28-ESR ${fmt1(a.das6)}（较基线 ${d6 >= 0 ? '↓' : '↑'} ${Math.abs(d6).toFixed(1)}）`, tag: good ? ['event-response', '达到 EULAR 良好应答幅度'] : ['event-alert', d6 > 0.6 ? 'EULAR 中等应答' : 'EULAR 无应答，建议评估是否调整方案'] });
  }
  if (fm) events.push({ id: 'node-fm', date: `${p.comorbid.FM.since}-01-01`, kind: 'alert', cls: 'alert', title: '合并纤维肌痛（FM）', data: p.comorbid.FM.core.join(' · '), tag: ['event-alert', '压痛关节数与 PRO 解读需考虑 FM 影响'] });
  const rebound = a.das6 != null && a.dasNow - a.das6 >= 0.6;
  events.push({ id: 'node-now', date: lastDate, kind: rebound ? 'alert' : 'good', cls: 'current', title: `最近访视 · ${actLabel(cat)}`, data: `DAS28-ESR ${fmt1(a.dasNow)} · SJC28 ${a.sjc} · TJC28 ${a.tjc} · CRP ${fmt1(a.crpNow)} · HAQ ${fmt1(a.haq)}`, tag: rebound ? ['event-alert', `较 6 个月时回升 ${(a.dasNow - a.das6).toFixed(1)}`] : [atTarget(a.dasNow) ? 'event-response' : 'event-alert', atTarget(a.dasNow) ? '处于治疗目标内' : '尚未达到治疗目标'] });
  events.sort((x, y) => x.date.localeCompare(y.date));
  $('#journey').innerHTML = events.map(e => `<article class="${e.cls}" id="${e.id}" data-kind="${e.kind}"><time>${ym(e.date)}</time><i></i><div><strong>${escapeHTML(e.title)}</strong><p>${escapeHTML(e.data)}</p><span class="${e.tag[0]}">${escapeHTML(e.tag[1])}</span></div></article>`).join('');
  // 筛选事件
  $('#filter-toggle').onclick = () => { const f = $('#journey-filter'); f.hidden = !f.hidden; $('#filter-toggle').setAttribute('aria-expanded', String(!f.hidden)); };
  $('#journey-filter').addEventListener('click', e => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    $('#journey-filter').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    $('#journey').querySelectorAll('article').forEach(n => n.hidden = b.dataset.f !== 'all' && n.dataset.kind !== b.dataset.f);
  });

  // ---- 多维疾病画像 ----
  const crpLv = a.crpNow < 10 ? '正常' : a.crpNow < 30 ? '轻度升高' : '明显升高';
  const dims = [
    ['疾病活动', actLabel(cat).replace('疾病活动', ''), Math.min(100, a.dasNow / 7.5 * 100), `DAS28 ${fmt1(a.dasNow)}`],
    ['炎症', crpLv, Math.min(100, a.crpNow / 50 * 100), `CRP ${fmt1(a.crpNow)} mg/L`],
    ['关节体征', a.sjc <= sjc0 - 2 ? '改善' : a.sjc <= 2 ? '稳定' : '仍有肿胀', Math.min(100, a.sjc / 12 * 100), `SJC28 ${a.sjc} · TJC28 ${a.tjc}`],
    ['症状 / PRO', a.vas >= 60 ? '仍需关注' : '可接受', a.vas, `疼痛 VAS ${a.vas}`],
    ['功能', a.haq <= haq0 - 0.3 ? '改善' : a.haq < 1 ? '轻度受限' : '受限', Math.min(100, a.haq / 3 * 100), `HAQ ${fmt1(a.haq)}`],
    ['安全性', '稳定', 20, '暂无记录的不良事件']
  ];
  $('#dims').innerHTML = dims.map(([n, l, v, s]) => `<div><span>${n}</span><b>${l}</b><meter min="0" max="100" value="${Math.round(v)}"></meter><small>${s}</small></div>`).join('');

  // ---- 治疗响应 ----
  $('#resp').innerHTML = `<div><strong>${escapeHTML(a.drug)}</strong><span>${a.tx} · ${a.line} 线 · 已使用 ${a.months} 个月</span></div><dl><dt>DAS28</dt><dd>${fmt1(a.das0)} <b>→ ${fmt1(a.dasNow)}</b></dd><dt>CRP</dt><dd>${fmt1(a.crp0)} <b>→ ${fmt1(a.crpNow)}</b> mg/L</dd><dt>SJC28</dt><dd>${sjc0} <b>→ ${a.sjc}</b></dd><dt>HAQ</dt><dd>${fmt1(haq0)} <b>→ ${fmt1(a.haq)}</b></dd></dl>`;

  // ---- 相似患者（与队列分析的「相似患者」同一规则） ----
  const simF = { ...AI_FILTER_DEFAULT, sex: p.sex, age: `${a.age - 5}-${a.age + 5}`, sero: a.sero ? '1' : '' };
  const simList = applyFilters(simF).filter(x => x.id !== p.id), ss = cohortStats(simList);
  $('#sim-tags').innerHTML = [p.sex === '女' ? '女性' : '男性', `${a.age - 5}–${a.age + 5} 岁`, a.sero ? 'RF / ACPA 阳性' : '血清学阴性'].map(x => `<span>${x}</span>`).join('');
  const persist = pct(simList.filter(x => aiOf(x).months >= 12).length, simList.length);
  $('#sim-sum').innerHTML = [['当前匹配', `${ss.n} 名`, '同性别 · 年龄 ±5 岁'], ['当前达标率', `${ss.target}%`, 'DAS28 ≤ 3.2'], ['方案持续 ≥ 12 月', `${persist}%`, '研究库观察值'], ['数据完整度', `${ss.complete}%`, '资料完整患者占比']].map(([l, v, n]) => `<div><span>${l}</span><strong>${v}</strong><small>${n}</small></div>`).join('');
  const maxN = Math.max(1, ...ss.byTx.map(g => g.n));
  $('#sim-bars').innerHTML = ss.byTx.filter(g => g.n).map(g => `<div class="outcome-row"><span>${g.tx}</span><i style="--w:${Math.round(g.n / maxN * 100)}%"></i><b>${g.n}</b></div>`).join('');

  // ---- 智能洞察（规则计算） ----
  const latest = demoVisits(p)[0], baseV = demoVisits(p).find(v => v.type === '基线访视') || latest;
  const visitUrl = (v, sec) => v ? `visit-detail.html?id=${pid}&visit=${v.id}&from=insight#section-${sec}` : '#';
  const dS = sjc0 - a.sjc, dT = tjc0 - a.tjc, crpDrop = a.crp0 ? Math.round((1 - a.crpNow / a.crp0) * 100) : 0;
  const main = dS >= dT ? `肿胀关节数（${sjc0} → ${a.sjc}）` : `压痛关节数（${tjc0} → ${a.tjc}）`;
  const c1 = delta <= 0 || a.das0 > a.dasNow
    ? { t: `DAS28 较基线下降 ${(a.das0 - a.dasNow).toFixed(1)}，主要来自${main}`, p: `同期 CRP ${crpDrop >= 0 ? '下降' : '上升'} ${Math.abs(crpDrop)}%（${fmt1(a.crp0)} → ${fmt1(a.crpNow)} mg/L），疼痛 VAS 当前 ${a.vas}。` }
    : { t: `DAS28 较基线上升 ${(a.dasNow - a.das0).toFixed(1)}`, p: `压痛 ${tjc0} → ${a.tjc}，肿胀 ${sjc0} → ${a.sjc}，CRP ${fmt1(a.crp0)} → ${fmt1(a.crpNow)} mg/L。` };
  const c2 = fm ? { tag: '可能被抬高', t: '合并 FM：压痛与疼痛偏高，炎症指标相对较低', p: `TJC28 ${a.tjc} 明显高于 SJC28 ${a.sjc}，疼痛 VAS ${a.vas}，CRP ${fmt1(a.crpNow)} mg/L。建议结合 SJC28、CRP 或 CDAI 复核疾病活动。` }
    : crpDrop >= 30 && a.vas >= 60 ? { tag: '未同步改善', t: '炎症改善快于患者主观疼痛', p: `CRP 已下降 ${crpDrop}%，但疼痛 VAS 仍为 ${a.vas}，建议查看症状与功能相关记录。` }
    : { tag: '多维一致', t: '炎症、关节体征与患者报告结局变化方向一致', p: `CRP ${fmt1(a.crpNow)} mg/L · SJC28 ${a.sjc} · VAS ${a.vas} · HAQ ${fmt1(a.haq)}，未发现明显不同步。` };
  const keyNode = rebound ? 'node-now' : a.das6 != null ? 'node-6m' : 'node-base';
  const c3 = rebound ? { t: '6 个月后疾病活动回升', p: `DAS28 由 ${fmt1(a.das6)} 回升至 ${fmt1(a.dasNow)}。仅提示时间关联，建议核对同期用药与依从性记录。` }
    : a.das6 != null ? { t: `治疗 6 个月时 DAS28 ${fmt1(a.das6)}`, p: `较基线${a.das0 - a.das6 >= 0 ? '下降' : '上升'} ${Math.abs(a.das0 - a.das6).toFixed(1)}，${a.das0 - a.das6 >= 1.2 ? '达到良好应答幅度' : '未达到良好应答幅度'}。` }
    : { t: `当前方案仅使用 ${a.months} 个月`, p: '尚未到 6 个月评估时点，建议按 Treat-to-Target 在 3 个月时评估是否改善。' };
  $('#insights').innerHTML = [
    ['01 · 评分贡献', c1.t, c1.p, `<a class="text-button" href="${visitUrl(latest, 2)}">查看证据数据 →</a>`],
    [`02 · ${c2.tag}`, c2.t, c2.p, `<a class="text-button" href="${visitUrl(latest, 1)}">查看相关趋势 →</a>`],
    ['03 · 关键节点', c3.t, c3.p, `<a class="text-button" href="#${keyNode}" data-locate="${keyNode}">定位到病程节点 →</a>`]
  ].map(([s, st, pp, link]) => `<article><span>${s}</span><strong>${escapeHTML(st)}</strong><p>${escapeHTML(pp)}</p>${link}</article>`).join('');
  document.querySelectorAll('[data-locate]').forEach(el => el.addEventListener('click', e => {
    e.preventDefault();
    const node = document.getElementById(el.dataset.locate); if (!node) return;
    node.hidden = false; node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.remove('is-located'); void node.offsetWidth; node.classList.add('is-located');
  }));
});
