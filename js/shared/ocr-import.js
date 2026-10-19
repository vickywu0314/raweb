/* OCR 识别病历录入（百度医疗 OCR，依赖 common.js）
   流程：弹窗选本地图片 → POST /api/ra/ocr/upload 存服务器（返回预览 url）→ POST /api/ra/ocr/recognize 识别
   → 医生核对：基本信息、检验项目 ↔ 系统字段（下拉可改，单位不一致有提示）→ 草稿存 sessionStorage，打开新建患者 / 新增随访页填表。
   识别结果只用于填表，不直接保存；医生在表单里核对后点保存才入库。
   医生手动改过的对应关系 POST /api/ra/ocr/saveAliases 记下来，下次同样的叫法自动对上。
   用法：openOcrImport({ mode: 'patient' })                 识别后新建患者（建档后接着填基线访视）
         openOcrImport({ mode: 'visit', patientId })        识别后填入该患者的新增随访
         onApply(draft)：传了就由当前页自己填表，不跳转 */
"use strict";
const OCR_DRAFT_KEY = 'ra-ocr-draft';
const OCR_BASIC_LABELS = { name: '姓名', gender: '性别', age: '年龄', cardNo: '身份证号', mobile: '手机号', nation: '民族', marry: '婚史', height: '身高 (cm)', weight: '体重 (kg)', happenDate: '发病时间', confirmDate: '确诊日期' };
const OCR_MARRY = { 0: '未婚', 1: '已婚', 2: '离异', 3: '丧偶' };

const ocrDoctor = () => { const id = typeof currentUser === 'function' ? currentUser()?.doctorId : null; return id == null ? '' : String(id); };
let ocrEpoch = 0, ocrSessionDoctor = ocrDoctor();
function ocrToken() { return { doctorId: ocrDoctor(), epoch: ocrEpoch }; }
function ocrTokenCurrent(t) { return !!t?.doctorId && t.doctorId === ocrDoctor() && t.epoch === ocrEpoch; }
function ocrDraft() {
  try { const d = JSON.parse(sessionStorage.getItem(OCR_DRAFT_KEY)); if (d && ocrDoctor() && d.doctorId === ocrDoctor()) return d; } catch (e) {}
  ocrClearDraft(); return null;
}
function ocrSaveDraft(d) { if (!ocrDoctor()) return; try { sessionStorage.setItem(OCR_DRAFT_KEY, JSON.stringify({ ...d, doctorId: ocrDoctor() })); } catch (e) {} }
function ocrClearDraft() { try { sessionStorage.removeItem(OCR_DRAFT_KEY); } catch (e) {} }
// 消费已交付事件中的切换证据；冻结期间事件可能排队到当前身份已恢复后才送达。
function ocrStorageIdentityChanged(e) {
  if (e?.key !== 'ra-auth') return false;
  const doctor = value => { try { const id = JSON.parse(value)?.doctorId; return id == null ? '' : String(id); } catch (err) { return ''; } };
  return doctor(e.oldValue) !== doctor(e.newValue);
}
function ocrAuthChanged(force = false) {
  const next = ocrDoctor(); if (!force && next === ocrSessionDoctor) return;
  ocrSessionDoctor = next; ocrEpoch++; ocrClearDraft(); document.querySelector('#ocr-dialog')?.remove();
}
window.addEventListener('ra-auth-changed', () => ocrAuthChanged());
window.addEventListener('storage', e => { if (e.key === 'ra-auth' || e.key === null) ocrAuthChanged(ocrStorageIdentityChanged(e)); });
window.addEventListener('pagehide', () => { ocrEpoch++; document.querySelector('#ocr-dialog')?.remove(); });
function ocrSourceFiles(d) { return [...new Set([...(d?.fileIds || []), ...(d?.sources || []).map(x => x.fileId), d?.fileId].filter(Boolean))]; }
function ocrMergeDraft(old, next) {
  const sources = new Map();
  for (const d of [old, next]) if (d) { for (const fileId of ocrSourceFiles(d)) sources.set(fileId, { fileId, url: `/api/ra/files/ocr/${fileId}` }); }
  return { ...old, ...next, basic: { ...(next?.basic || {}), ...(old?.basic || {}) }, fzjc: { ...(next?.fzjc || {}), ...(old?.fzjc || {}) }, sources: [...sources.values()], fileIds: [...sources.keys()] };
}
function ocrSourceLinks(d) { return (d?.sources?.length ? d.sources : d?.fileId ? [{ fileId: d.fileId, url: d.url }] : []).map((x, i) => `<a href="${escapeHTML(API_BASE + x.url)}" target="_blank" rel="noopener">原图 ${i + 1}</a>`).join(' · '); }
function ocrKnownRejection(e) { return ['400','401','403','409'].includes(String(e?.code || e?.status)); }
function ocrLinkState(link, files) {
  if (!files.length) return { status: 'NOT_REQUESTED', linkedFileIds: [], pendingFileIds: [], retryableFileIds: [], retryable: false };
  const linked = link?.linkedFileIds, pending = link?.pendingFileIds;
  if (!Array.isArray(linked) || !Array.isArray(pending) || linked.length + pending.length !== files.length || new Set([...linked, ...pending]).size !== files.length || [...linked, ...pending].some(x => !files.includes(x))) {
    return { status: 'PENDING', linkedFileIds: [], pendingFileIds: [...files], retryableFileIds: [...files], retryable: true, message: '病历已保存，原图关联状态尚未确认，请重试关联，勿重复创建病历' };
  }
  // 新协议按文件选择；旧响应仅有boolean时维持原兼容含义。
  const proposed = link?.retryableFileIds;
  const retryable = Array.isArray(proposed) ? (new Set(proposed).size === proposed.length && proposed.every(x => pending.includes(x)) ? [...proposed] : []) : link?.retryable === false ? [] : [...pending];
  return { ...link, status: pending.length ? 'PENDING' : 'LINKED', retryableFileIds: retryable, retryable: retryable.length > 0 };
}
function ocrMergeLinkState(old, next, requested, files) {
  const selected = new Set(requested), linked = new Set([...old.linkedFileIds, ...next.linkedFileIds]);
  const pending = new Set([...old.pendingFileIds.filter(x => !selected.has(x)), ...next.pendingFileIds]);
  const retryable = new Set([...old.retryableFileIds.filter(x => !selected.has(x)), ...next.retryableFileIds]);
  return ocrLinkState({ linkedFileIds: files.filter(x => linked.has(x)), pendingFileIds: files.filter(x => pending.has(x)), retryableFileIds: files.filter(x => retryable.has(x)) }, files);
}
function ocrRecoverySummary(state) {
  const ready = state.retryableFileIds.length, blocked = state.pendingFileIds.length - ready;
  return `${ready ? `${ready} 张原图可重试关联。` : ''}${blocked ? `${blocked} 张原图需人工核对权限或已有归属，不能自动改绑。` : ''}请勿重复创建病历。`;
}
// 只对已获得可信病历ID的结果补关联；此函数从不调用create。
function ocrRecoverSaved(anchor, saved, draft, onComplete) {
  const token = ocrToken(), files = ocrSourceFiles(draft), initial = ocrLinkState(saved.ocrLink, files);
  if (initial.status !== 'PENDING') { onComplete(); return; }
  let state = initial, busy = false;
  const retain = () => ocrSaveDraft({ ...draft, patientId: saved.patientId, saved: { patientId: saved.patientId, visitId: saved.visitId || null, ocrLink: state } });
  retain();
  const banner = ocrBanner(anchor, '<b>病历已保存，原图尚未全部关联。请勿重复创建病历。</b><p class="ocr-recovery-message"></p><ul class="ocr-recovery-sources"></ul><button type="button" class="button" id="ocr-retry-link">重试可恢复原图</button>');
  const message = banner.querySelector('.ocr-recovery-message'), list = banner.querySelector('.ocr-recovery-sources'), retry = banner.querySelector('#ocr-retry-link');
  const render = () => {
    message.textContent = `${state.message || ''}${ocrRecoverySummary(state)}`; retry.disabled = busy || !state.retryableFileIds.length;
    list.innerHTML = files.map((file, i) => `<li><a href="${escapeHTML(API_BASE + '/api/ra/files/ocr/' + file)}" target="_blank" rel="noopener">原图 ${i + 1}</a>：${state.linkedFileIds.includes(file) ? '已关联' : state.retryableFileIds.includes(file) ? '可重试' : '需人工核对'}</li>`).join('');
  };
  render();
  retry.onclick = async () => {
    if (busy || !state.retryableFileIds.length || !ocrTokenCurrent(token)) return;
    busy = true; render(); const requested = [...state.retryableFileIds];
    try {
      const response = await apiPostJson('/api/ra/ocr/linkImages', { patientId: saved.patientId, visitId: saved.visitId || null, ocrFileIds: requested });
      if (!ocrTokenCurrent(token)) return;
      const next = ocrLinkState(response, requested);
      state = ocrMergeLinkState(state, next, requested, files);
      retain(); if (!state.pendingFileIds.length) { banner.remove(); onComplete(); return; }
    } catch (e) {
      if (!ocrTokenCurrent(token)) return;
      if (ocrKnownRejection(e)) state = ocrLinkState({ ...state, retryableFileIds: state.retryableFileIds.filter(x => !requested.includes(x)) }, files);
      state = { ...state, message: `病历已保存，关联尚未完成：${apiErrorMessage(e)}。` }; retain();
    } finally { if (ocrTokenCurrent(token)) { busy = false; render(); } }
  };
}
const ocrHasVisit = d => !!d && (!!d.visitDate || Object.keys(d.fzjc || {}).length > 0);

// 只自动接受完整可用值；原始结果仍展示，绝不静默截去尾随文字或猜测单位。
function ocrValue(opt, raw) {
  const s = String(raw ?? '').trim(); if (!opt || !s) return '';
  if (opt.type === 'radioList') return /^(?:阳性|\+{1,4})$/.test(s) ? '阳性' : /^(?:阴性|[-—])$/.test(s) ? '阴性' : s==='未做'?'未做':'';
  const numeric=['lfsyz','kccpkt'].includes(opt.field)?s.replace(/(?:IU\/mL|U\/mL)$/,'').trim():s;
  const m = numeric.match(/^(?:<=|>=|<|>|≤|≥|＜|＞|=)?\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/);
  return m && Number.isFinite(Number(numeric.replace(/^(?:<=|>=|<|>|≤|≥|＜|＞|=)\s*/,''))) ? (numeric===s?s.replace(/\s/g,''):s) : '';
}

async function ocrUpload(file) {
  const body = new FormData(); body.append('file', file);
  let res;
  try { res = await fetch(API_BASE + '/api/ra/ocr/upload', { method: 'POST', body }); }
  catch (e) { throw apiFailure(0, 'NETWORK_ERROR'); }
  let r;
  try { r = await res.json(); } catch (e) { throw apiFailure(res.status, res.ok ? 'INVALID_RESPONSE' : ''); }
  if (!r || typeof r !== 'object') throw apiFailure(res.status, 'INVALID_RESPONSE');
  if (!res.ok || !r.success) throw apiFailure(res.status, r.code, r.message);
  return r.data;
}

function openOcrImport(opts = {}) {
  const owner = ocrToken(); if (!ocrTokenCurrent(owner)) return;
  const mode = opts.mode === 'visit' ? 'visit' : 'patient';
  document.querySelector('#ocr-dialog')?.remove();
  const dlg = document.createElement('dialog'); dlg.id = 'ocr-dialog'; dlg.className = 'ocr-dialog';
  dlg.innerHTML = `<div class="dialog-header"><h2>OCR识别病历录入</h2><button class="icon-button" type="button" data-close aria-label="关闭">×</button></div>
<p class="dialog-note">上传病历 / 检验报告图片（jpg、png、bmp，≤15MB），识别后${mode === 'patient' ? '预填「新增患者」和基线访视' : '预填本次随访'}，<b>核对后由您保存</b>，不会自动入库。</p>
<label class="ocr-drop" id="ocr-drop"><input type="file" accept="image/jpeg,image/png,image/bmp" hidden><b>点击选择图片</b><span>或把图片拖到这里</span></label>
<p class="ocr-status" id="ocr-status" hidden></p>
<div class="ocr-result" id="ocr-result" hidden></div>
<div class="dialog-footer"><button class="button" type="button" data-close>取消</button><button class="button primary" type="button" id="ocr-apply" disabled>${mode === 'patient' ? '用识别结果新建患者' : '填入本次随访'}</button></div>`;
  document.body.appendChild(dlg);
  const $d = s => dlg.querySelector(s), input = $d('input[type=file]');
  let result = null, busy = false;
  const status = (msg, warn) => { const s = $d('#ocr-status'); s.hidden = !msg; s.className = `ocr-status${warn ? ' warn' : ''}`; s.innerHTML = msg || ''; };
  dlg.addEventListener('click', e => { if (e.target.closest('[data-close]') && !busy) dlg.close(); });
  dlg.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
  dlg.addEventListener('close', () => dlg.remove());

  async function run(file) {
    if (!file || busy) return;
    if (!/\.(jpe?g|png|bmp)$/i.test(file.name)) { status('只支持 jpg、png、bmp 图片', true); return; }
    if (file.size > 15 * 1024 * 1024) { status('图片不能超过 15MB', true); return; }
    busy = true; result = null; $d('#ocr-result').hidden = true; $d('#ocr-apply').disabled = true; $d('#ocr-drop').classList.add('busy');
    try {
      status('正在上传图片…');
      const up = await ocrUpload(file);
      if (!ocrTokenCurrent(owner)) return;
      status('正在识别，约需 5～15 秒…');
      const recognized = await apiPost('/api/ra/ocr/recognize', { fileId: up.fileId });
      if (!ocrTokenCurrent(owner)) return; result = recognized;
      status(''); render();
    } catch (e) { if (ocrTokenCurrent(owner)) status(`${escapeHTML(apiErrorMessage(e))}`, true); }
    finally { busy = false; $d('#ocr-drop').classList.remove('busy'); input.value = ''; }
  }
  input.addEventListener('change', () => run(input.files[0]));
  const drop = $d('#ocr-drop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); run(e.dataTransfer.files[0]); });

  function render() {
    const r = result, opts = r.fieldOptions || [], b = r.basic || {};
    const basicRows = Object.keys(OCR_BASIC_LABELS).filter(k => b[k]).map(k => `<dt>${OCR_BASIC_LABELS[k]}</dt><dd>${escapeHTML(k === 'gender' ? (b[k] === '1' ? '男' : '女') : k === 'marry' ? OCR_MARRY[b[k]] || b[k] : b[k])}</dd>`).join('');
    const optHTML = sel => `<option value="">不填入</option>${opts.map(o => `<option value="${escapeHTML(o.field)}"${o.field === sel ? ' selected' : ''}>${escapeHTML(o.label)}${o.unit ? `（${escapeHTML(o.unit)}）` : ''}</option>`).join('')}`;
    const rows = (r.items || []).map((it, i) => `<tr data-i="${i}"><td>${escapeHTML(it.name || '')}${it.abbr && it.abbr !== it.name ? `<small>${escapeHTML(it.abbr)}</small>` : ''}</td><td>${escapeHTML(it.result || '')}${it.unit ? ` <small>${escapeHTML(it.unit)}</small>` : ''}</td><td><select class="table-input ocr-field" aria-label="对应系统字段">${optHTML(it.field)}</select><small class="ocr-match"></small></td><td><input class="table-input ocr-val" value="${escapeHTML(it.field ? (it.value || '') : '')}" aria-label="填入值"></td></tr>`).join('');
    $d('#ocr-result').innerHTML = `<div class="ocr-grid"><a class="ocr-preview" href="${API_BASE + r.url}" target="_blank" rel="noopener" title="查看原图"><img src="${API_BASE + r.url}" alt="病历图片"></a><div>
<h3>基本信息</h3>${basicRows ? `<dl class="ocr-basic">${basicRows}</dl>` : '<p class="muted">没有识别出基本信息</p>'}
<h3>${mode === 'patient' ? '基线访视日期' : '随访日期'}</h3><p>${r.visitDate ? escapeHTML(r.visitDate) : '<span class="muted">没有识别出报告日期，按今天</span>'}</p></div></div>
${(r.warnings || []).length ? `<ul class="ocr-warnings">${r.warnings.map(w => `<li>${escapeHTML(w)}</li>`).join('')}</ul>` : ''}
<h3>检验项目 <small>报告上的项目名称各家医院叫法不同：请核对每一项对应的系统字段，对不上的在下拉里选；改过的对应会记住，下次自动对上</small></h3>
${rows ? `<div class="table-scroll"><table class="ocr-items"><thead><tr><th>报告项目</th><th>结果</th><th>对应系统字段</th><th>填入值</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">没有识别出检验项目</p>'}
<details class="ocr-lines"><summary>识别出的原文（${(r.lines || []).length} 行）</summary><pre>${escapeHTML((r.lines || []).join('\n'))}</pre></details>`;
    $d('#ocr-result').hidden = false;
    $d('#ocr-result').querySelectorAll('tbody tr').forEach(refreshRow);
    refreshDup();
    $d('#ocr-apply').disabled = !basicRows && !rows && !r.visitDate;
  }
  // 每一行：对应方式、单位提示
  function refreshRow(tr) {
    const it = result.items[+tr.dataset.i], f = tr.querySelector('.ocr-field').value, o = (result.fieldOptions || []).find(x => x.field === f);
    const tip = tr.querySelector('.ocr-match');
    let t = '', warn = false;
    if (!f) { t = it.mappingWarning || (it.field ? '' : '系统表单里没有这一项，不填入；如果其实是某一项，请在下拉里选'); warn = !!it.needsConfirmation; }
    else if (f !== (it.field || '')) t = '手动对应（保存后记住）';
    else t = it.matchedBy === 'learned' ? '按之前的对应' : '自动对应';
    if (f && o && String(it.result||'').trim() && !ocrValue(o,it.result)) { t += ' · 原结果格式需核对，请对照原图手动填写；未截取数字前缀'; warn = true; }
    if (f && o && o.unit && it.unit && f === it.field && it.unitWarning) { t += ` · ${it.unitWarning}`; warn = true; }
    else if (f && o && o.unit && it.unit && f !== it.field && ocrUnitKey(o.unit) !== ocrUnitKey(it.unit)) { t += ` · 报告单位 ${it.unit}，系统单位 ${o.unit}，请核对是否需要换算`; warn = true; }
    tip.textContent = t; tip.className = `ocr-match${warn ? ' warn' : ''}`;
    tr.classList.toggle('off', !f);
  }
  function refreshDup() {
    const seen = {};
    $d('#ocr-result').querySelectorAll('tbody tr').forEach(tr => {
      const f = tr.querySelector('.ocr-field').value, tip = tr.querySelector('.ocr-match');
      if (!f) return;
      if (seen[f]) { tip.textContent = '与上面一项对应了同一个字段，只填入上面那一项'; tip.className = 'ocr-match warn'; tr.classList.add('off'); }
      seen[f] = true;
    });
  }
  $d('#ocr-result').addEventListener('change', e => {
    const tr = e.target.closest('tr'); if (!tr) return;
    if (e.target.classList.contains('ocr-field')) {
      const it = result.items[+tr.dataset.i], o = (result.fieldOptions || []).find(x => x.field === e.target.value);
      tr.querySelector('.ocr-val').value = o ? ocrValue(o, it.result) : '';
    }
    $d('#ocr-result').querySelectorAll('tbody tr').forEach(refreshRow); refreshDup();
  });

  $d('#ocr-apply').onclick = async () => {
    if (!result || !ocrTokenCurrent(owner)) return;
    const fzjc = {}, mappings = [];
    $d('#ocr-result').querySelectorAll('tbody tr').forEach(tr => {
      const it = result.items[+tr.dataset.i], f = tr.querySelector('.ocr-field').value, v = tr.querySelector('.ocr-val').value.trim();
      if (f && f !== (it.field || '') && it.alias) mappings.push({ alias: it.alias, field: f, name: it.name });
      if (f && v && !(f in fzjc)) fzjc[f] = v;
    });
    const btn = $d('#ocr-apply'); btn.disabled = true;
    if (mappings.length) {
      try { await apiPostJson('/api/ra/ocr/saveAliases', { mappings }); }
      catch (e) { toastNext(`对应关系没有记住：${apiErrorMessage(e)}`); }
    }
    if (!ocrTokenCurrent(owner)) return;
    const draft = { mode, patientId: opts.patientId || null, basic: result.basic || {}, visitDate: result.visitDate || null, fzjc, fileId: result.fileId, url: result.url, at: Date.now() };
    if (!opts.onApply) ocrSaveDraft(draft);
    dlg.close();
    if (opts.onApply) opts.onApply(draft);
    else if (mode === 'patient') location.href = 'patient-create.html?ocr=1';
    else location.href = withFrom(`visit-create.html?id=${encodeURIComponent(opts.patientId)}&ocr=1`);
  };
  dlg.showModal();
}
const ocrUnitKey = u => String(u || '').replace(/[\s^*]/g, '').replace(/×/g, 'x').replace(/[μµ]/g, 'u').replace('⁹', '9').replace('¹²', '12').toLowerCase().replace(/x/g, '');

// 页面顶部的提示条：识别结果已预填，请核对
function ocrBanner(anchor, html) {
  const b = document.createElement('div'); b.className = 'ocr-banner'; b.innerHTML = html;
  anchor.insertAdjacentElement('beforebegin', b); return b;
}
