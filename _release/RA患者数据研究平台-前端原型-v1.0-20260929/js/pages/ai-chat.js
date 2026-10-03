/* ai-chat.html 页面脚本（依赖 boot.js → data.js → common.js → shared/ai-analytics.js）
   演示版：按关键词识别问题类型并用规则计算回答；接入 AI 引擎后替换 answer()。 */
"use strict";
shell('ai');
const params = new URLSearchParams(location.search);
const cohortFilters = filtersFromParams(params);
const hasCohort = params.get('scope') === 'cohort' && filterChips(cohortFilters).length > 0;
let scope = hasCohort ? 'cohort' : 'all', current = params.get('id') ? patientById(params.get('id')) : null;
if (current) scope = 'patient';

$('#scope-all-note').textContent = `${patients.length} 位患者`;
if (hasCohort) {
  $('#scope-cohort-wrap').hidden = false;
  $('#scope-cohort-note').textContent = `${applyFilters(cohortFilters).length} 位 · ${filterChips(cohortFilters).map(c => c.label).join('、')}`;
}
document.querySelector(`input[name=scope][value="${scope}"]`).checked = true;
$('#patient-picker').hidden = scope !== 'patient';
if (current) $('#picker').value = current.name;

const SUGGEST = {
  all: ['当前研究库的达标率是多少？', '各治疗组的达标率对比', '合并纤维肌痛对 DAS28 有什么影响？', '哪些患者资料不完整？', '找出 TNFi 治疗 6 个月仍未达标的患者'],
  cohort: ['这个队列的达标率是多少？', '这个队列的疾病活动分布', '各治疗组的达标率对比', '队列中合并 FM 的患者有什么差异？'],
  patient: ['这位患者的 DAS28 变化如何？', '这位患者目前的治疗方案？', '这位患者有哪些其他病史？', '与相似患者相比如何？']
};
function drawSuggest() { $('#suggest').innerHTML = SUGGEST[scope].map(q => `<button type="button" data-q="${escapeHTML(q)}">${escapeHTML(q)}</button>`).join(''); }

document.querySelectorAll('input[name=scope]').forEach(r => r.addEventListener('change', e => {
  scope = e.target.value; $('#patient-picker').hidden = scope !== 'patient'; drawSuggest();
  if (scope === 'patient' && !current) $('#picker').focus();
  sys(scope === 'patient' ? (current ? `已切换到患者：${current.name}` : '请选择一位患者') : scope === 'cohort' ? '已切换到当前队列' : '已切换到整个研究库');
}));
bindPatientPicker($('#picker'), $('#picker-list'), p => { current = p; $('#picker').value = p.name; sys(`已切换到患者：${p.name}（${p.code}）`); });

// ---- 对话 ----
const log = $('#chat-log');
function push(html, who) { const d = document.createElement('div'); d.className = `msg ${who}`; d.innerHTML = html; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; }
function sys(text) { push(`<p>${escapeHTML(text)}</p>`, 'sys'); }
const table = (head, rows) => `<table class="msg-table"><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
const cohortLink = f => { const q = filtersToQuery(f); return `<a class="msg-link" href="ai-cohort.html${q ? '?' + q : ''}">在队列分析中打开 →</a>`; };

function baseFilters(qFilters) {
  // 范围条件 + 问题中识别到的条件（问题条件优先）
  const base = scope === 'cohort' ? { ...cohortFilters } : { ...AI_FILTER_DEFAULT };
  Object.keys(AI_FILTER_DEFAULT).forEach(k => { if (qFilters[k] && qFilters[k] !== AI_FILTER_DEFAULT[k]) base[k] = qFilters[k]; });
  return base;
}

function answer(q) {
  const t = q.replace(/\s+/g, '');
  if (scope === 'patient') return answerPatient(t);
  const { filters: qf, matched } = parseQuestion(q);
  const f = baseFilters(qf);
  const list = applyFilters(f), s = cohortStats(list, f.at);
  const shown = matched.filter(m => !(/缺失|不完整|待补全|资料/.test(t) && m === '资料待补全'));
  const scopeText = `${scope === 'cohort' ? '当前队列' : '研究库'}${shown.length ? '中「' + shown.join('、') + '」' : ''}`;
  const ev = `依据：${list.length} 位患者 · 演示数据`;
  if (!list.length) return { html: `<p>${scopeText}没有符合条件的患者。可以放宽条件后再问。</p>` };
  if (/缺失|不完整|待补全|资料/.test(t)) {
    const all = applyFilters({ ...f, data: '' }), miss = all.filter(p => p.incomplete), by = {};
    miss.forEach(p => by[p.missing] = (by[p.missing] || 0) + 1);
    return { html: `<p>${scopeText}共 <b>${miss.length}</b> 位患者资料待补全（占 ${pct(miss.length, all.length)}%）。按缺失项：</p>${table(['缺失项', '人数'], Object.entries(by).sort((a, b) => b[1] - a[1]))}<p class="msg-ev">${ev}</p><a class="msg-link" href="data-quality.html">前往数据质控定位补录 →</a>`, };
  }
  if (/纤维肌痛|FM/i.test(t) && /影响|差异|对比|区别|怎样|如何|情况/.test(t)) {
    const fm = subgroupFM(applyFilters({ ...f, cm: '' }));
    if (fm.nFM < 3) return { html: `<p>${scopeText}合并 FM 的患者不足 3 位，无法做亚组对比。</p>` };
    const r = fm.rows;
    return { html: `<p>合并 FM（${fm.nFM} 位）与未合并（${fm.nOther} 位）相比，<b>当前 DAS28 平均高 ${(r[0].fm - r[0].other).toFixed(1)}</b>，主要来自压痛关节数和疼痛 VAS；CRP 与肿胀关节数差异小。这提示 DAS28 可能被 FM 相关压痛抬高，评估 RA 炎症活动时建议结合 SJC28、CRP 或 CDAI。</p>${table(['指标（均值）', '合并 FM', '未合并', '差值'], r.map(x => [x.label, x.fm.toFixed(x.d), x.other.toFixed(x.d), (x.fm - x.other > 0 ? '+' : '') + (x.fm - x.other).toFixed(x.d)]))}<p class="msg-ev">依据：描述性统计，未做显著性检验 · 演示数据</p>${cohortLink({ ...f, cm: '' })}` };
  }
  if (/治疗组|各组|对比|分组|哪种|哪个药|比较/.test(t) && /达标|缓解|效果|疗效/.test(t)) {
    const g = s.byTx.filter(x => x.n);
    return { html: `<p>${scopeText}按当前治疗分组的达标率（DAS28 ≤ 3.2，${f.at === '6m' ? '治疗 6 个月时' : '最近一次访视'}）：</p>${table(['治疗', '人数', '达标率', 'DAS28 均值'], g.map(x => [x.tx, x.n, x.rate + '%', fmt1(x.dasMean)]))}<p>组间基线疾病活动、病程和治疗线数不同，以上为观察性描述，不代表药物疗效差异。</p><p class="msg-ev">${ev}</p>${cohortLink(f)}` };
  }
  if (/分布|分层|活动度|疾病活动/.test(t) && !/找出|哪些/.test(t)) {
    return { html: `<p>${scopeText}基线与${f.at === '6m' ? '治疗 6 个月' : '最近一次访视'}的疾病活动分布：</p>${table(['分层', '基线', f.at === '6m' ? '6 个月' : '当前'], AI_ACT.map((a, i) => [a.label, s.distBase[i].n, s.distNow[i].n]))}<p>当前达标率 <b>${s.target}%</b>。</p><p class="msg-ev">${ev}</p>${cohortLink(f)}` };
  }
  if (/达标|缓解率/.test(t) && !/找出|哪些|名单/.test(t)) {
    return { html: `<p>${scopeText}共 ${s.evaluable} 位可评估患者，<b>达标率 ${s.target}%</b>（DAS28 ≤ 3.2），其中缓解 ${s.distNow[0].n} 位、低疾病活动 ${s.distNow[1].n} 位；${s.nonResp} 位较基线下降 &lt; 0.6（EULAR 无应答）。</p><p class="msg-ev">${ev}</p>${cohortLink(f)}` };
  }
  if (/找出|哪些|名单|多少|几位|患者/.test(t)) {
    const top = list.slice(0, 5);
    return { html: `<p>${scopeText}共 <b>${list.length}</b> 位患者。前 ${top.length} 位：</p>${table(['患者', '治疗', 'DAS28 基线 → ' + (f.at === '6m' ? '6 个月' : '当前'), ''], top.map(p => { const a = aiOf(p); return [escapeHTML(p.name), a.tx, `${fmt1(a.das0)} → ${fmt1(dasAt(a, f.at))}`, `<a href="patient-insight.html?id=${encodeURIComponent(p.id)}&from=ai">病程分析</a>`]; }))}<p class="msg-ev">${ev}</p>${cohortLink(f)}` };
  }
  return { html: `<p>演示版还不能理解这个问题。可以试试：</p><ul>${SUGGEST[scope].slice(0, 4).map(x => `<li><a href="#" data-q="${escapeHTML(x)}">${escapeHTML(x)}</a></li>`).join('')}</ul><p class="msg-ev">接入 AI 引擎后将支持开放式提问</p>` };
}

function answerPatient(t) {
  if (!current) return { html: '<p>请先在左侧选择一位患者。</p>' };
  const p = current, a = aiOf(p), cs = comorbidCodes(p), link = `<a class="msg-link" href="patient-insight.html?id=${encodeURIComponent(p.id)}&from=ai">打开 ${escapeHTML(p.name)} 的病程分析 →</a>`;
  if (/治疗|用药|方案|药/.test(t)) return { html: `<p>${escapeHTML(p.name)} 当前为 <b>${a.tx}</b>（${escapeHTML(a.drug)}），处于 ${a.line} 线治疗，已使用 ${a.months} 个月。</p><p class="msg-ev">依据：治疗暴露记录 · 演示数据</p>${link}` };
  if (/DAS|变化|病情|活动/i.test(t)) return patientCourse(p, a, link);
  if (/病史|合并|纤维肌痛|强直|\bFM\b|\bAS\b/i.test(t)) return { html: cs.length ? `<p>${escapeHTML(p.name)} 记录的其他病史：${cs.map(c => `<b>${c} ${COMORBIDITY_INFO[c].name}</b>（${p.comorbid[c].since} 年起，${escapeHTML(p.comorbid[c].status)}）`).join('；')}。${cs.includes('FM') ? '合并 FM 时 DAS28 中的压痛关节数与总体评估可能偏高，解读时请结合 SJC28 与 CRP。' : ''}</p>${link}` : `<p>${escapeHTML(p.name)} 未记录 FM / AS 等常见相关疾病。</p>${link}` };
  if (/相似|类似|比较|对比/.test(t)) {
    const f = { ...AI_FILTER_DEFAULT, sex: p.sex, age: `${a.age - 5}-${a.age + 5}`, sero: a.sero ? '1' : '' }, s = cohortStats(applyFilters(f));
    return { html: `<p>与 ${escapeHTML(p.name)} 同性别、年龄 ±5 岁${a.sero ? '、血清学阳性' : ''}的患者共 ${s.n} 位，达标率 ${s.target}%。${escapeHTML(p.name)} 当前 DAS28 ${fmt1(a.dasNow)}，${atTarget(a.dasNow) ? '已达标，处于相似人群中较好的一侧' : '尚未达标'}。</p><p class="msg-ev">依据：相似人群为规则匹配 · 演示数据</p><a class="msg-link" href="ai-cohort.html?preset=similar&id=${encodeURIComponent(p.id)}">查看相似患者队列 →</a>` };
  }
  return patientCourse(p, a, link);
}
function patientCourse(p, a, link) {
  const drop = a.das0 - a.dasNow, tone = drop >= 1.2 ? '良好应答' : drop > 0.6 ? '中等应答' : '无应答';
  return { html: `<p>${escapeHTML(p.name)} 的 DAS28 从基线 <b>${fmt1(a.das0)}</b>${a.das6 != null ? ` → 6 个月 ${fmt1(a.das6)}` : ''} → 当前 <b>${fmt1(a.dasNow)}</b>（${actLabel(actOf(a.dasNow))}），下降 ${drop.toFixed(1)}，按 EULAR 标准属于<b>${tone}</b>。同期 CRP ${fmt1(a.crp0)} → ${fmt1(a.crpNow)} mg/L，TJC28 ${a.tjc} · SJC28 ${a.sjc}。</p><p class="msg-ev">依据：疾病活动与检验记录 · 演示数据</p>${link}` };
}

function ask(q) {
  if (!q.trim()) return;
  push(`<p>${escapeHTML(q)}</p>`, 'me');
  const typing = push('<p class="typing">正在分析数据…</p>', 'ai');
  setTimeout(() => { typing.innerHTML = answer(q).html; log.scrollTop = log.scrollHeight; }, 450);
}
$('#chat-form').addEventListener('submit', e => { e.preventDefault(); ask($('#chat-input').value); $('#chat-input').value = ''; });
$('#suggest').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) ask(b.dataset.q); });
log.addEventListener('click', e => { const a = e.target.closest('a[data-q]'); if (a) { e.preventDefault(); ask(a.dataset.q); } });

drawSuggest();
push(`<p>你好，我可以围绕${scope === 'patient' && current ? `患者 <b>${escapeHTML(current.name)}</b>` : scope === 'cohort' ? '<b>当前队列</b>' : '<b>整个研究库</b>'}回答数据问题。每个回答都会附上依据，可一键转为队列分析。</p><p class="msg-ev">演示版：关键词识别 + 规则计算，数据为演示数据</p>`, 'ai');
if (params.get('q')) ask(params.get('q'));
