/* data-quality.html 页面脚本（依赖 boot.js → common.js）
   数据来自后端：POST /api/ra/quality/issues（按当前数据实时检查当前医生名下 RA 患者），「标记已处理」POST /api/ra/quality/resolve。
   规则：缺失（与患者列表「待补全」一致）、逻辑冲突（日期矛盾、同日重复随访）；化验值偏高偏低反映的是病情，不算数据质量问题。
   数据改好后问题自动消失；「标记已处理」用于核实后确实无法补全或无需修改的问题，写入修改记录。 */
"use strict";
shell('quality');
const TYPE_TONE = { '缺失': 'warning', '逻辑冲突': 'danger' };
const STATE_TONE = { '待处理': 'warning', '已处理': 'success' };
let D = null, issues = [];
let state = loadListState('quality', { q: '', type: '', st: '', page: 1, perPage: 10 }), queryTimer = 0;
if (![10, 20, 50].includes(+state.perPage)) state.perPage = 10; // 旧版每页 8 / 16 / 32 条，浏览器里可能还记着
if (queryParam('type')) state.type = queryParam('type'); // 看板等页面带条件进入
if (state.type === '异常值') state.type = '';   // 已取消的类型（浏览器里可能还记着）
if (queryParam('st')) state.st = queryParam('st');

// 点问题 → 定位到要改的地方（从这里出去，「返回」回到数据质控）
function href(x) {
  const t = x.target, pid = encodeURIComponent(x.patientId);
  if (t.page === 'visit') return `visit-detail.html?id=${pid}&visit=${encodeURIComponent(t.visitId)}&from=quality${t.section != null ? `#section-${t.section}` : ''}`;
  if (t.page === 'edit') return `patient-edit.html?id=${pid}`;
  if (t.page === 'create') return `visit-create.html?id=${pid}&from=quality`;
  return `patient-visits.html?id=${pid}&from=quality`;
}
// 问题类型说明：规则与后端 QualityServiceImpl 一致（见 raapi docs/API.md 第十节），条数按本次返回的 issues[] 统计。
// issue.key：missing:M_DAS28 等（未知缺失项为 missing:原文字）；conflict:visit-future:随访ID / conflict:visit-before-onset:随访ID / conflict:confirm-before-onset / conflict:same-day:日期
const QC_TYPES = [
  { type: '缺失', tone: 'warn', title: '该填的没有填', desc: '与患者列表「待补全」同一规则。数据本身没有错，但不完整，相关指标算不出来；补全后问题自动消失。',
    rules: [['M_DAS28', '缺 DAS28 评分', '所有随访都没有可用的 CRP，DAS28-CRP 算不出来'], ['M_BASELINE_LAB', '缺基线检验', '基线访视（第一条随访记录）的辅助检查为空'], ['M_MEDICATION', '缺用药史', '所有随访的治疗方案都为空'], ['M_COMORBIDITY', '缺合并疾病记录', '既往史 / 常见相关疾病未填写']] },
  { type: '逻辑冲突', tone: 'bad', title: '填了，但前后矛盾', desc: '每个字段单看都填了，但放在一起不可能同时成立，通常是录入笔误，请核对原始病历后更正。',
    rules: [['visit-future', '随访日期晚于今天', ''], ['visit-before-onset', '随访日期早于发病时间', ''], ['confirm-before-onset', '确诊日期早于发病时间', ''], ['same-day', '同一天多条随访', '疑似重复录入']] }
];
// 从 key 取规则编码：missing:XXX → XXX；conflict:rule:… → rule；解析不了返回空串（计入「其他」）
function ruleOf(x) { const parts = String(x && x.key || '').split(':'); return (parts[0] === 'missing' || parts[0] === 'conflict') && parts[1] ? parts[1] : ''; }
function legend() {
  const box = $('#qc-legend'); if (!box) return;
  box.innerHTML = QC_TYPES.map(t => {
    const all = issues.filter(x => x.type === t.type), open = all.filter(x => x.state !== '已处理').length;
    const known = new Set(t.rules.map(r => r[0])), others = all.filter(x => !known.has(ruleOf(x))).length;
    const ruleList = t.rules.map(([code, name, tip]) => `<span${tip ? ` title="${escapeHTML(tip)}"` : ''}>${escapeHTML(name)}<small>${fmtN(all.filter(x => ruleOf(x) === code).length)}</small></span>`).join('') + (others ? `<span>其他<small>${fmtN(others)}</small></span>` : '');
    return `<button type="button" class="qc-type-card ${t.tone}${state.type === t.type ? ' active' : ''}" data-type="${escapeHTML(t.type)}" aria-pressed="${state.type === t.type}" title="${state.type === t.type ? '再次点击取消筛选' : `只看「${t.type}」问题`}"><span class="qc-type-head">${badge(t.type, TYPE_TONE[t.type])}<b>${escapeHTML(t.title)}</b><em>${fmtN(open)} 个待处理 · 共 ${fmtN(all.length)} 个</em></span><span class="qc-type-desc">${escapeHTML(t.desc)}</span><span class="qc-rule-list">${ruleList}</span></button>`;
  }).join('');
}
const info = tip => `<i class="kpi-info" tabindex="0" role="note" aria-label="${escapeHTML(tip)}" data-tip="${escapeHTML(tip)}">i</i>`;
function kpi() {
  const cards = [
    [D.cleanRate == null ? '—' : D.cleanRate + '%', '无待处理问题的患者占比', `（名下患者 − 有待处理问题的患者）÷ 名下患者，保留 1 位小数。名下患者共 ${D.totalPatients} 位（含已脱落）。`],
    [D.openCount, '待处理问题', '状态为「待处理」的质控问题条数。同一位患者可能有多条；数据改好后问题自动消失，核实无法补全的可「标记已处理」。'],
    [D.affectedPatients, '涉及患者', '至少有一条待处理问题的患者人数。'],
    [D.researchReady, '满足研究级质量要求', '有随访记录、未脱落、且没有任何待处理质控问题的患者人数。与数据看板「有效研究样本数」同一口径。']
  ];
  $('#dq-kpi').innerHTML = cards.map(([v, l, tip]) => { const t = escapeHTML(typeof v === 'number' ? fmtN(v) : v); return `<article><strong${t === '—' ? '' : ` data-count="${t}"`}>${t}</strong><span>${l}${info(tip)}</span></article>`; }).join('');
  countUp($('#dq-kpi'));
  $('#dq-summary').textContent = `共发现 ${D.issueCount} 个质控问题 · ${D.openCount} 个待处理，涉及 ${D.affectedPatients} 位患者 · 检查时间 ${D.asOf}`;
}
function row(x) {
  const done = x.state === '已处理', birth = x.birthYear ? `${x.birthYear} 年` : '出生年份未知';
  const note = done ? `${escapeHTML(x.handledBy || '')} ${escapeHTML(x.handledAt || '')} 标记已处理${x.note ? `：${escapeHTML(x.note)}` : ''}` : `定位到：${escapeHTML(x.target.where)}`;
  return `<div class="patient-card selectable"><a class="patient-card-link" href="${href(x)}" title="定位到：${escapeHTML(x.target.where)}"><span class="patient-identity"><span class="record-icon">${icon('record')}</span><span class="patient-info"><span class="patient-name">${x.name ? highlight(x.name, state.q) : '未填姓名'}</span><span class="patient-meta">${escapeHTML(x.sex || '性别未填')} · ${birth}</span><span class="patient-meta">ID号: ${highlight(x.patientId, state.q)}</span></span></span><span class="patient-cell research-cell"><span class="cell-label">研究信息</span><span class="study-code">${x.studyNo ? highlight(x.studyNo, state.q) : '—'}</span><span class="cell-note">${x.visitCount ? `随访记录 ${x.visitCount} 条` : '尚无随访记录'}</span></span><span class="patient-cell issue-cell"><span class="cell-label">质控问题</span><span class="issue-text">${escapeHTML(x.text)}</span><span class="cell-note">${note}</span></span><span class="patient-cell type-cell"><span class="cell-label">问题类型</span>${badge(x.type, TYPE_TONE[x.type])}</span><span class="patient-cell status-cell"><span class="cell-label">处理状态</span>${badge(x.state, STATE_TONE[x.state])}${done ? '' : `<span class="mark-done" role="button" tabindex="0" data-pid="${escapeHTML(x.patientId)}" data-key="${escapeHTML(x.key)}">标记已处理</span>`}</span>${icon('chevron', 'chevron')}</a></div>`;
}
// 待处理的排在前面，其余保持后端返回的顺序
function rows() { const q = state.q; return issues.filter(x => (!q || [x.name, String(x.patientId), x.studyNo].some(v => v && String(v).toLowerCase().includes(q))) && (!state.type || x.type === state.type) && (!state.st || x.state === state.st)).map((x, i) => [x, i]).sort((a, b) => (a[0].state === '已处理') - (b[0].state === '已处理') || a[1] - b[1]).map(a => a[0]); }
function render() {
  saveListState('quality', state); legend();
  const list = rows(), pages = Math.max(1, Math.ceil(list.length / state.perPage)); state.page = Math.min(state.page, pages); const start = (state.page - 1) * state.perPage;
  $('#rows').innerHTML = list.slice(start, start + state.perPage).map(row).join(''); flashResult($('#rows')); $('#empty').hidden = !!list.length;
  $('#result-count').textContent = list.length ? `显示第 ${start + 1}–${Math.min(start + state.perPage, list.length)} 条，共 ${list.length} 条` : '共 0 条匹配记录';
  $('#pagination').innerHTML = pagerHTML(state.page, pages);
}

// 标记已处理：可填说明，写入该患者的修改记录
function markDone(e) {
  const b = e.target.closest('.mark-done'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const x = issues.find(i => String(i.patientId) === b.dataset.pid && i.key === b.dataset.key); if (!x) return;
  const d = document.createElement('dialog'); d.className = 'ra-confirm ra-form-dialog';
  d.innerHTML = `<form method="dialog"><h2>标记已处理</h2><p>${escapeHTML(x.name)}：${escapeHTML(x.text)}</p><p>数据改好后问题会自动消失，不需要标记；核实后确实无法补全或不需要修改的，再标记已处理。</p><label class="ra-form-field"><span>处理说明 <small>选填</small></span><textarea name="note" rows="2" maxlength="200" placeholder="如：患者外院化验，原始报告缺失"></textarea></label><p class="ra-form-error" hidden></p><div class="ra-confirm-actions"><button class="button" value="cancel" formnovalidate>取消</button><button class="button primary" value="ok">标记已处理</button></div></form>`;
  document.body.appendChild(d); d.addEventListener('close', () => d.remove());
  d.querySelector('form').addEventListener('submit', async ev => {
    if (ev.submitter && ev.submitter.value !== 'ok') return; ev.preventDefault();
    const err = d.querySelector('.ra-form-error'), ok = d.querySelector('[value=ok]'); ok.disabled = true; err.hidden = true;
    try { await apiPost('/api/ra/quality/resolve', { doctorId: currentDoctorId(), patientId: x.patientId, issueKey: x.key, note: d.querySelector('[name=note]').value.trim() }); d.close(); toast('已标记处理'); load(); }
    catch (ex) { err.textContent = apiErrorMessage(ex); err.hidden = false; ok.disabled = false; }
  });
  d.showModal();
}
$('#rows').addEventListener('click', markDone);
$('#rows').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.mark-done')) markDone(e); });
$('#run-check').onclick = () => load(true);
$('#search-form').addEventListener('submit', e => { e.preventDefault(); clearTimeout(queryTimer); state.q = $('#query').value.trim().toLowerCase(); state.type = $('#dq-type').value; state.st = $('#dq-state').value; state.page = 1; render(); });
$('#dq-type').addEventListener('change', e => { state.type = e.target.value; state.page = 1; render(); });
$('#dq-state').addEventListener('change', e => { state.st = e.target.value; state.page = 1; render(); });
// 点类型说明卡片 = 按该类型筛选（再点一次取消），与「问题类型」下拉同步
$('#qc-legend').addEventListener('click', e => { const c = e.target.closest('[data-type]'); if (!c) return; state.type = state.type === c.dataset.type ? '' : c.dataset.type; $('#dq-type').value = state.type; state.page = 1; render(); });
// 输入关键字停顿 320ms 后自动筛选（在本次检查结果里筛，不请求后端）
$('#query').addEventListener('input', e => { clearTimeout(queryTimer); queryTimer = setTimeout(() => { const v = e.target.value.trim().toLowerCase(); if (v === state.q) return; state.q = v; state.page = 1; render(); }, 320); });
bindPager($('#pagination'), n => { state.page = n; render(); });
$('#page-size').addEventListener('change', e => { state.perPage = +e.target.value; state.page = 1; render(); });
$('#reset').onclick = () => { clearTimeout(queryTimer); state = { q: '', type: '', st: '', page: 1, perPage: state.perPage }; $('#query').value = ''; $('#dq-type').value = ''; $('#dq-state').value = ''; render(); };
$('#query').value = state.q; $('#dq-type').value = state.type; $('#dq-state').value = state.st; $('#page-size').value = state.perPage;

async function load(manual) {
  const btn = $('#run-check'); btn.disabled = true; btn.textContent = '质控检查中…';
  if (!D) $('#rows').innerHTML = '<p class="metric-note">正在检查…</p>';
  try {
    D = await apiPost('/api/ra/quality/issues', { doctorId: currentDoctorId() }); issues = D.issues || [];
    kpi(); render();
    if (manual) toast(`质控检查完成：${D.openCount} 个待处理问题`);
    if (!D.resolutionReady) toast('暂时无法标记已处理，请稍后重试；若持续出现，请联系项目数据管理员。');
  } catch (e) { console.error(e); $('#rows').innerHTML = `<p class="pv-load-error">质控检查失败：${escapeHTML(apiErrorMessage(e))}</p>`; $('#result-count').textContent = ''; }
  finally { btn.disabled = false; btn.textContent = '运行质控检查'; }
}
load();
