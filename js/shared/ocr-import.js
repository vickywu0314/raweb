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

function ocrDraft() { try { return JSON.parse(sessionStorage.getItem(OCR_DRAFT_KEY)); } catch (e) { return null; } }
function ocrSaveDraft(d) { try { sessionStorage.setItem(OCR_DRAFT_KEY, JSON.stringify(d)); } catch (e) {} }
function ocrClearDraft() { try { sessionStorage.removeItem(OCR_DRAFT_KEY); } catch (e) {} }
const ocrHasVisit = d => !!d && (!!d.visitDate || Object.keys(d.fzjc || {}).length > 0);

// 系统字段的取值：定性字段（ANA 等）取阳性 / 阴性，其余取开头的数字（含 <、>）
function ocrValue(opt, raw) {
  const s = String(raw ?? '').trim(); if (!opt || !s) return '';
  if (opt.type === 'radioList') return /阳|^\+/.test(s) ? '阳性' : /阴|^-/.test(s) ? '阴性' : '';
  const m = s.match(/^[<>≤≥＜＞]?=?\s*-?\d+(\.\d+)?/); return m ? m[0].replace(/\s/g, '') : '';
}

async function ocrUpload(file) {
  const body = new FormData(); body.append('file', file);
  const res = await fetch(API_BASE + '/api/ra/ocr/upload', { method: 'POST', body });
  if (!res.ok) throw new Error(`上传失败（HTTP ${res.status}）`);
  const r = await res.json(); if (!r.success) throw new Error(r.message || '上传失败');
  return r.data;
}

function openOcrImport(opts = {}) {
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
      status('正在识别，约需 5～15 秒…');
      result = await apiPost('/api/ra/ocr/recognize', { fileId: up.fileId });
      status(''); render();
    } catch (e) { status(`${escapeHTML(e.message)}`, true); }
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
    if (!f) t = it.field ? '' : '没对上，需要的话请选择';
    else if (f !== (it.field || '')) t = '手动对应（保存后记住）';
    else t = it.matchedBy === 'learned' ? '按之前的对应' : '自动对应';
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
    if (!result) return;
    const fzjc = {}, mappings = [];
    $d('#ocr-result').querySelectorAll('tbody tr').forEach(tr => {
      const it = result.items[+tr.dataset.i], f = tr.querySelector('.ocr-field').value, v = tr.querySelector('.ocr-val').value.trim();
      if (f && f !== (it.field || '') && it.alias) mappings.push({ alias: it.alias, field: f, name: it.name });
      if (f && v && !(f in fzjc)) fzjc[f] = v;
    });
    const btn = $d('#ocr-apply'); btn.disabled = true;
    if (mappings.length) {
      try { await apiPostJson('/api/ra/ocr/saveAliases', { doctorId: currentDoctorId(), mappings }); }
      catch (e) { toastNext(`对应关系没有记住：${e.message}`); }
    }
    const draft = { mode, patientId: opts.patientId || null, basic: result.basic || {}, visitDate: result.visitDate || null, fzjc, fileId: result.fileId, url: result.url, at: Date.now() };
    ocrSaveDraft(draft);
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
