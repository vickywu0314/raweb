/* 病例录入表单（共享模块）：patient-create.html 与 visit-create.html 共用。
   表单按 js/shared/crf-schema.js 渲染；每个输入项都带字段编码（name = 字段 key，data-path = 接口 JSON 路径）。
   保存的数据结构 = 接口 JSON 中的 visit 部分：{ visitDate, method, history:{…}, exam:{…}, assessment:{…}, tcm:{…}, treatment:{…, medications:[…]}, adverse:{…, events:[…]}, caseRecord:{…} }
   依赖 common.js、crf-schema.js；需在页面脚本之前加载。 */
"use strict";

// ===== 渲染 =====
const crfEsc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function crfFieldHTML(f) {
  const req = f.required ? ' <b class="required">*</b>' : '';
  const unit = f.unit ? `<small class="field-unit">${crfEsc(f.unit)}</small>` : '';
  const when = f.when ? ` data-when='${JSON.stringify(f.when)}'` : '';
  const attrs = `name="${f.key}" data-path="${f.path}"${f.required ? ' data-required="1"' : ''}`;
  const cls = `form-field${f.span ? ' span-3' : ''}${f.type === 'multi' ? ' span-3 multi-field' : ''}`;
  let control = '';
  if (f.type === 'longtext') control = `<textarea ${attrs} placeholder="${crfEsc(f.placeholder || '')}"></textarea>`;
  else if (f.type === 'single') control = `<select ${attrs}>${f.default ? '' : '<option value="">请选择</option>'}${f.options.map(o => `<option value="${crfEsc(o.value)}"${o.value === f.default ? ' selected' : ''}>${crfEsc(o.label)}</option>`).join('')}</select>`;
  else if (f.type === 'multi') control = `<div class="${f.grid === 'joint' ? 'joint-grid' : 'choice-row multi'}">${f.options.map(o => `<label><input type="checkbox" ${attrs} value="${crfEsc(o.value)}"> ${crfEsc(o.label)}</label>`).join('')}</div>`;
  else if (f.type === 'number') control = `<input type="number" ${attrs}${f.min != null ? ` min="${f.min}"` : ''}${f.max != null ? ` max="${f.max}"` : ''} step="${f.step ?? 'any'}" placeholder="${f.ref ? (f.ref[1] == null ? `参考 ≥ ${f.ref[0]}` : `参考 ${f.ref[0]}–${f.ref[1]}`) : ''}">`;
  else if (f.type === 'computed') control = `<input ${attrs} data-computed="${f.formula}" readonly class="computed-input" placeholder="自动计算">`;
  else if (f.type === 'file') control = `<input type="file" ${attrs} accept="image/*,.pdf" multiple>`;
  else control = `<input type="${f.type === 'date' ? 'date' : 'text'}" ${attrs} placeholder="${crfEsc(f.placeholder || '')}">`;
  const label = f.hideLabel ? '' : `<span>${crfEsc(f.label)}${req}${unit}</span>`;
  const tag = f.type === 'multi' ? 'div' : 'label';
  return `<${tag} class="${cls}"${when}>${label}${control}${f.note && f.type === 'computed' ? `<small class="field-note">${crfEsc(f.note)}</small>` : ''}</${tag}>`;
}
const crfRowHTML = g => `<div class="repeat-row" data-row><div class="repeat-row-head"><b class="repeat-title">${crfEsc(g.repeat.item)}</b><button type="button" class="text-button repeat-remove">删除此${crfEsc(g.repeat.item)}</button></div><div class="form-grid">${g.fields.map(crfFieldHTML).join('')}</div></div>`;
function crfGroupHTML(s, g) {
  const when = g.when ? ` data-when='${JSON.stringify(g.when)}'` : '';
  const head = g.actions === 'cbc'
    ? `<div class="subgroup-head"><div><h3>${crfEsc(g.title)}</h3><p>${crfEsc(g.desc || '')}</p></div><div class="subgroup-actions"><input id="cbc-ai-files" type="file" accept="image/*" multiple hidden><button id="cbc-ai-import" class="button compact" type="button">拍照识别血象报告</button></div></div><div id="cbc-ai-panel" class="inline-ai-panel" hidden><span id="cbc-ai-file-names"></span><button id="cbc-recognize" class="text-button" type="button">开始识别</button></div>`
    : `${g.title ? `<h3>${crfEsc(g.title)}</h3>` : ''}${g.desc ? `<p class="section-note">${crfEsc(g.desc)}</p>` : ''}`;
  if (g.repeat) return `<div class="subgroup repeat-group" data-repeat="${g.repeat.key}" data-section="${s.key}"${when}>${head}<div class="repeat-list"></div><button type="button" class="button compact repeat-add">＋ ${crfEsc(g.repeat.add)}</button></div>`;
  return `<div class="subgroup"${when}>${head}<div class="form-grid">${g.fields.map(crfFieldHTML).join('')}</div></div>`;
}
const CASE_FORM_SECTIONS = CRF_SCHEMA.sections.map(s => `<details class="create-section" id="${s.id}" data-key="${s.key}"><summary class="create-section-head"><h2>${crfEsc(s.title)}</h2><span>${crfEsc(s.desc)}</span><span class="section-toggle" aria-hidden="true"></span></summary><div class="create-section-body">${s.note ? `<p class="section-note">${crfEsc(s.note)}</p>` : ''}${s.groups.map(g => crfGroupHTML(s, g)).join('')}</div></details>`).join('');

(function mountCaseSections() {
  const slot = document.getElementById('case-sections');
  if (!slot) return;
  slot.outerHTML = CASE_FORM_SECTIONS;
  document.querySelectorAll('.repeat-group').forEach(grp => addRepeatRow(grp));
})();

function repeatDef(grp) { const s = CRF_SCHEMA.sections.find(x => x.key === grp.dataset.section); return s.groups.find(g => g.repeat && g.repeat.key === grp.dataset.repeat); }
function renumberRows(grp) { const g = repeatDef(grp); grp.querySelectorAll('[data-row]').forEach((r, i) => r.querySelector('.repeat-title').textContent = `${g.repeat.item} ${i + 1}`); }
function addRepeatRow(grp) { const g = repeatDef(grp); grp.querySelector('.repeat-list').insertAdjacentHTML('beforeend', crfRowHTML(g)); renumberRows(grp); return grp.querySelector('.repeat-list').lastElementChild; }

// ===== 数据读写 =====
const setPath = (o, path, v) => { const ks = path.split('.'); let t = o; ks.slice(0, -1).forEach(k => t = t[k] = t[k] || {}); t[ks.at(-1)] = v; };
const getPath = (o, path) => path.split('.').reduce((t, k) => t == null ? undefined : t[k], o);
const isEmpty = v => v == null || v === '' || (Array.isArray(v) && !v.length);
function readField(scope, f) {
  if (f.type === 'multi') return [...scope.querySelectorAll(`input[type=checkbox][name="${f.key}"]:checked`)].map(x => x.value);
  const el = scope.querySelector(`[name="${f.key}"]`); if (!el || el.type === 'file') return undefined;
  if (f.type === 'number' || f.type === 'computed') return el.value === '' ? undefined : +el.value;
  return el.value.trim();
}
function writeField(scope, f, v) {
  if (f.type === 'multi') { scope.querySelectorAll(`input[type=checkbox][name="${f.key}"]`).forEach(x => x.checked = Array.isArray(v) && v.includes(x.value)); return; }
  const el = scope.querySelector(`[name="${f.key}"]`); if (!el || el.type === 'file') return;
  el.value = v ?? (f.type === 'single' && f.default ? f.default : '');
}
const visibleIn = el => !el.closest('[hidden]');
// 表单 → JSON（只输出有值且当前可见的字段）
function serializeSections(form) {
  const out = {};
  CRF_SCHEMA.sections.forEach(s => {
    const sec = form.querySelector(`.create-section#${s.id}`); if (!sec) return;
    s.groups.forEach(g => {
      if (g.repeat) {
        const grp = sec.querySelector(`[data-repeat="${g.repeat.key}"]`); if (!grp || !visibleIn(grp)) return;
        const rows = [...grp.querySelectorAll('[data-row]')].map(r => { const o = {}; g.fields.forEach(f => { const box = r.querySelector(`[name="${f.key}"]`)?.closest('.form-field'); if (box && !visibleIn(box)) return; const v = readField(r, f); if (!isEmpty(v)) o[f.key] = v; }); return o; })
          .filter(o => Object.keys(o).some(k => !g.fields.find(f => f.key === k)?.default || o[k] !== g.fields.find(f => f.key === k).default));
        if (rows.length) setPath(out, `${s.key}.${g.repeat.key}`, rows);
        return;
      }
      g.fields.forEach(f => { const box = sec.querySelector(`[name="${f.key}"]`)?.closest('.form-field'); if (box && !visibleIn(box)) return; const v = readField(sec, f); if (!isEmpty(v)) setPath(out, f.path, v); });
    });
  });
  return out;
}
// 旧版本（按「模块:序号」保存）的本机数据转换为新结构，避免旧草稿 / 旧随访打不开
function normalizeCaseData(d) {
  if (!d || typeof d !== 'object' || !Object.keys(d).some(k => k.includes(':'))) return d;
  const m = { 'history:visitDate': 'visitDate', 'history:firstVisit': 'history.firstVisitDate', 'history:onset': 'history.onsetDate', 'history:diagnosis': 'history.diagnosisDate', 'history:course': 'history.course', 'history:past': 'history.pastHistory', 'history:family': 'history.familyHistory', 'history:comorbidity': 'history.comorbidity', 'history:allergy': 'history.allergy', 'case:0': 'caseRecord.note' };
  const out = {}; Object.entries(m).forEach(([k, p]) => { if (!isEmpty(d[k]) && typeof d[k] === 'string') setPath(out, p, d[k]); }); return out;
}
// JSON → 表单
function restoreSections(form, raw) {
  const data = normalizeCaseData(raw); if (!data) return;
  CRF_SCHEMA.sections.forEach(s => {
    const sec = form.querySelector(`.create-section#${s.id}`); if (!sec) return;
    s.groups.forEach(g => {
      if (g.repeat) {
        const grp = sec.querySelector(`[data-repeat="${g.repeat.key}"]`); if (!grp) return;
        const rows = getPath(data, `${s.key}.${g.repeat.key}`) || [];
        grp.querySelector('.repeat-list').innerHTML = '';
        (rows.length ? rows : [{}]).forEach(r => { const el = addRepeatRow(grp); g.fields.forEach(f => writeField(el, f, r[f.key])); });
        return;
      }
      g.fields.forEach(f => writeField(sec, f, getPath(data, f.path)));
    });
  });
  refreshCaseForm(form);
}
// 两份数据有几项不同（按字段路径展开比较）
function flattenCase(o, pre = '', out = {}) { Object.entries(o || {}).forEach(([k, v]) => { const p = pre ? `${pre}.${k}` : k; if (v && typeof v === 'object' && !Array.isArray(v)) flattenCase(v, p, out); else if (Array.isArray(v) && v.length && typeof v[0] === 'object') v.forEach((r, i) => flattenCase(r, `${p}[${i}]`, out)); else out[p] = JSON.stringify(v); }); return out; }
const diffCount = (a, b) => { const x = flattenCase(a), y = flattenCase(b); return Object.keys({ ...x, ...y }).filter(k => x[k] !== y[k]).length; };
// 「本次录入内容」清单（访视详情页展示）
function describeEntries(data) {
  const out = [], fmt = (f, v) => Array.isArray(v) ? v.map(x => crfOptionLabel(f, x)).join('、') : f.type === 'single' ? crfOptionLabel(f, v) : `${v}${f.unit && !/^\d/.test(f.unit) ? ' ' + f.unit : ''}`;
  CRF_SCHEMA.sections.forEach(s => s.groups.forEach(g => {
    if (g.repeat) { (getPath(data, `${s.key}.${g.repeat.key}`) || []).forEach((r, i) => g.fields.forEach(f => { if (!isEmpty(r[f.key])) out.push({ sec: s.title, label: `${g.repeat.item} ${i + 1} · ${f.label}`, value: fmt(f, r[f.key]) }); })); return; }
    g.fields.forEach(f => { const v = getPath(data, f.path); if (!isEmpty(v)) out.push({ sec: s.title, label: f.label, value: fmt(f, v) }); });
  }));
  return out;
}

// ===== 联动：条件显示、自动计算 =====
function refreshCaseForm(form) {
  const data = serializeSectionsRaw(form);
  form.querySelectorAll('[data-when]').forEach(el => {
    const w = JSON.parse(el.dataset.when), row = el.closest('[data-row]');
    let v;
    if (row) { const g = repeatDef(row.closest('.repeat-group')); const f = g.fields.find(x => x.key === w.key); v = f ? readField(row, f) : undefined; }
    else { const f = CRF_FIELDS.find(x => x.key === w.key && !x.group.repeat && el.closest('.create-section')?.id === x.section.id); v = f ? readField(el.closest('.create-section'), f) : undefined; }
    const show = w.eq !== undefined ? v === w.eq : w.has ? (v || []).includes(w.has) : w.hasAny ? (v || []).some(x => w.hasAny.includes(x)) : !isEmpty(v);
    el.hidden = !show;
  });
  form.querySelectorAll('[data-computed]').forEach(el => { const r = CRF_FORMULAS[el.dataset.computed]?.(data); el.value = r == null ? '' : r.toFixed(2); });
}
// 计算用：不管显示状态，读全部字段
function serializeSectionsRaw(form) {
  const out = {};
  CRF_FIELDS.filter(f => !f.group.repeat && f.type !== 'computed').forEach(f => { const sec = form.querySelector(`.create-section#${f.section.id}`); if (!sec) return; const v = readField(sec, f); if (!isEmpty(v)) setPath(out, f.path, v); });
  return out;
}

function caseToast(msg) { const old = document.querySelector('.save-toast'); if (old) old.remove(); const t = document.createElement('div'); t.className = 'save-toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

// ===== 草稿：一期全部存本机浏览器 =====
const draftGet = k => { try { return JSON.parse(localStorage.getItem('draft:' + k)); } catch (e) { return null; } };
const draftSet = (k, v) => { try { localStorage.setItem('draft:' + k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const draftDel = k => { try { localStorage.removeItem('draft:' + k); } catch (e) { } };
function basicValues(form) { const b = form.querySelector('#basic:not(.is-locked)'); if (!b) return null; return [...b.querySelectorAll('input[name],select[name],textarea[name]')].map(el => (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value); }
function restoreBasic(form, vals) { const b = form.querySelector('#basic:not(.is-locked)'); if (!b || !Array.isArray(vals)) return; [...b.querySelectorAll('input[name],select[name],textarea[name]')].forEach((el, i) => { if (i >= vals.length) return; if (el.type === 'checkbox' || el.type === 'radio') el.checked = !!vals[i]; else el.value = vals[i]; }); b.dispatchEvent(new Event('change', { bubbles: true })); }

// ===== 通用交互：卡片序号、拍照识别、填写进度、手风琴、草稿、提交 =====
function initCaseForm(opts = {}) {
  const form = document.querySelector('#create-form');
  const sections = [...document.querySelectorAll('.create-section')];
  sections.forEach((s, i) => { const h = s.querySelector('.create-section-head'); if (h && !h.querySelector('.section-no')) { const n = document.createElement('i'); n.className = 'section-no'; n.textContent = i + 1; h.prepend(n); } });
  const fileInput = document.querySelector('#ai-files'), panel = document.querySelector('#ai-panel'), filesBox = document.querySelector('#import-files');
  const aiImport = document.querySelector('#ai-import');
  if (aiImport && fileInput) aiImport.addEventListener('click', () => fileInput.click());
  if (fileInput) fileInput.addEventListener('change', () => { filesBox.innerHTML = ''; [...fileInput.files].forEach(f => { const x = document.createElement('span'); x.className = 'import-file'; x.textContent = f.name; filesBox.appendChild(x); }); panel.hidden = !fileInput.files.length; });
  const recognize = document.querySelector('#recognize');
  if (recognize) recognize.addEventListener('click', () => { recognize.disabled = true; recognize.textContent = 'AI 识别中…'; setTimeout(() => { recognize.disabled = false; recognize.textContent = '识别完成 · 请核对'; caseToast('已完成演示识别，接入接口后将自动回填对应模块'); }, 900); });

  // 血象报告 = 血常规：就地拍照识别（接口：百度医疗 OCR）
  const cbcInput = document.querySelector('#cbc-ai-files'), cbcButton = document.querySelector('#cbc-ai-import'), cbcPanel = document.querySelector('#cbc-ai-panel'), cbcNames = document.querySelector('#cbc-ai-file-names'), cbcRecognize = document.querySelector('#cbc-recognize');
  if (cbcButton && cbcInput) cbcButton.addEventListener('click', () => cbcInput.click());
  if (cbcInput) cbcInput.addEventListener('change', () => { const names = [...cbcInput.files].map(f => f.name); cbcNames.textContent = names.length ? `已选择 ${names.length} 张：${names.join('、')}` : ''; cbcPanel.hidden = !names.length; });
  if (cbcRecognize) cbcRecognize.addEventListener('click', () => { cbcRecognize.disabled = true; cbcRecognize.textContent = '识别中…'; setTimeout(() => { cbcRecognize.disabled = false; cbcRecognize.textContent = '识别完成 · 请核对'; caseToast('血象报告识别完成（前端演示），接口会按字段回填 WBC / HGB / PLT 等'); }, 800); });

  // 重复组：添加 / 删除行
  form.addEventListener('click', e => {
    const add = e.target.closest('.repeat-add'); if (add) { const grp = add.closest('.repeat-group'); addRepeatRow(grp).querySelector('input,select')?.focus(); refreshCaseForm(form); updateProgress(); return; }
    const rm = e.target.closest('.repeat-remove'); if (rm) { const grp = rm.closest('.repeat-group'); rm.closest('[data-row]').remove(); if (!grp.querySelector('[data-row]')) addRepeatRow(grp); renumberRows(grp); refreshCaseForm(form); updateProgress(); }
  });

  function updateProgress() {
    sections.forEach(s => {
      const head = s.querySelector('.create-section-head');
      let badge = head.querySelector('.section-progress');
      if (!badge) { badge = document.createElement('b'); badge.className = 'section-progress'; head.insertBefore(badge, head.querySelector('.section-toggle')); }
      badge.className = 'section-progress';
      if (s.classList.contains('is-locked')) { badge.textContent = s.dataset.lockedLabel || '只读'; badge.classList.add('locked'); return; }
      const boxes = [...s.querySelectorAll('.form-field')].filter(b => visibleIn(b) && !b.querySelector('[data-computed],input[type=file]'));
      const filled = boxes.filter(b => [...b.querySelectorAll('input,select,textarea')].some(x => (x.type === 'checkbox' || x.type === 'radio') ? x.checked : String(x.value || '').trim() && !(x.tagName === 'SELECT' && x.options[0]?.value !== '' && x.selectedIndex === 0 && s.id !== 'basic'))).length;
      if (!filled) badge.textContent = '未填写';
      else if (filled >= Math.max(1, Math.ceil(boxes.length * .45))) { badge.textContent = '已填写'; badge.classList.add('done'); }
      else { badge.textContent = '部分填写'; badge.classList.add('partial'); }
    });
  }
  const onChange = () => { refreshCaseForm(form); updateProgress(); };
  form.addEventListener('input', onChange); form.addEventListener('change', onChange);
  // 打开一个业务卡片时，自动收起其他卡片
  sections.forEach(s => s.addEventListener('toggle', () => { if (!s.open) return; sections.forEach(o => { if (o !== s) o.open = false; }); requestAnimationFrame(() => s.scrollIntoView({ behavior: 'smooth', block: 'start' })); }));

  // 草稿（本机浏览器）
  const draftBtn = document.querySelector('#draft');
  if (opts.draftKey) {
    const d = draftGet(opts.draftKey);
    if (d) {
      const bar = document.createElement('div'); bar.className = 'draft-banner';
      const t = new Date(d.t); bar.innerHTML = `<span>本机有 ${ymd(t)} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')} 暂存的草稿</span><button type="button" class="button compact primary" data-draft="restore">恢复草稿</button><button type="button" class="button compact" data-draft="drop">丢弃</button>`;
      form.prepend(bar);
      bar.addEventListener('click', e => { const b = e.target.closest('[data-draft]'); if (!b) return; if (b.dataset.draft === 'restore') { restoreBasic(form, d.basic); restoreSections(form, d.data); caseToast('已恢复草稿'); } else { draftDel(opts.draftKey); caseToast('草稿已丢弃'); } bar.remove(); updateProgress(); });
    }
  }
  if (draftBtn) draftBtn.addEventListener('click', () => { if (!opts.draftKey) { caseToast('草稿已暂存'); return; } const ok = draftSet(opts.draftKey, { t: new Date().toISOString(), data: serializeSections(form), basic: basicValues(form) }); caseToast(ok ? '草稿已暂存在本机浏览器' : '暂存失败：浏览器不允许本机存储'); });
  form.addEventListener('submit', e => {
    e.preventDefault(); if (!form.reportValidity()) return;
    const missing = [...form.querySelectorAll('[data-required]')].filter(el => visibleIn(el) && el.closest('[data-row]') && !String(el.value).trim() && [...el.closest('[data-row]').querySelectorAll('input,select,textarea')].some(x => x !== el && (x.type === 'checkbox' ? x.checked : x.tagName !== 'SELECT' && String(x.value).trim())));
    if (missing.length) { const sec = missing[0].closest('.create-section'); sec.open = true; missing[0].focus(); caseToast(`请填写${missing[0].closest('.form-field').querySelector('span')?.textContent.replace('*', '').trim() || '必填项'}`); return; }
    const msg = opts.onSubmit ? opts.onSubmit(form) : null; if (msg === false) return;
    if (opts.draftKey) draftDel(opts.draftKey);
    caseToast(msg || opts.submitMsg || '已保存'); if (opts.afterSubmit) setTimeout(opts.afterSubmit, 1200);
  });
  refreshCaseForm(form); updateProgress();
  // 从使用指南等页面带 #模块id 进入时，展开并定位到该模块
  const hashSec = location.hash && document.querySelector(`.create-section${location.hash}`);
  if (hashSec) { hashSec.open = true; requestAnimationFrame(() => hashSec.scrollIntoView({ block: 'start' })); }
}
