/* 随访表单（编辑随访 visit-edit.html、新增随访 visit-create.html 共用；依赖 common.js）
   表单结构来自后端 visitEditForm / visitCreateForm：模块 → 分组 → 字段（type、options、showIf、optionsFrom）+ 清单（西药 / 中成药 / 中药饮片）。
   控件：radio 单选（再点一次取消）/ radioList 单选（存数组）/ list 有选项为多选、没选项为文本框（「、」分隔）/ haq 下拉 / date / number / text / textarea / computed 只读。
   联动：showIf「字段:值」满足才显示（隐藏的字段不提交）；主症 / 次症随证型、方剂随证型；多选里选「无」清空其他项。
   提交：没动过的字段原样传回原值（编辑时不改老数据格式），动过的按类型转换；后端只写有变化的字段。 */
"use strict";

const VF = { form: null, baseline: false, create: false, defs: {}, confirmationAbort: null };
function vfCancelConfirmations(){VF.confirmationAbort?.abort();VF.confirmationAbort=null;}
const HAQ_OPTIONS = ['无困难', '稍有困难', '很困难', '不能进行'];
const vfIsList = t => t === 'list' || t === 'radioList';
const vfListText = v => Array.isArray(v) ? v.join('、') : (v || '');
const vfSplit = s => String(s || '').split(/[、\n]/).map(x => x.trim()).filter(Boolean);
const vfPlainDate = v => !v || /^\d{4}-\d{2}-\d{2}$/.test(v);
// 选项「存库值|显示文字」
const vfOpt = o => { const i = String(o).indexOf('|'); return i < 0 ? { v: o, t: o } : { v: o.slice(0, i), t: o.slice(i + 1) }; };
const vfArr = v => Array.isArray(v) ? v : (v == null || v === '' ? [] : [String(v)]);

function vfOptions(col, f, scope) {
  if (!f.optionsFrom) return f.options || [];
  const parent = vfCurrent(scope, col, f.optionsFrom);
  const pv = Array.isArray(parent) ? parent[0] : parent;
  return ((VF.form.optionSets || {})[f.optionSet] || {})[pv] || [];
}
// 单选 / 多选的选项块；当前值里不在选项中的（老数据写法）也显示出来，保持选中
function vfChoicesHTML(col, f, value, options) {
  const multi = f.type === 'list', name = `vf-${col}-${f.key}-${Math.random().toString(36).slice(2, 7)}`;
  const vals = vfArr(value), opts = options.map(vfOpt);
  vals.filter(v => !opts.some(o => o.v === v)).forEach(v => opts.push({ v, t: v, old: true }));
  if (!opts.length) return `<div class="choice-row vf-choices"><small class="vf-hint">${f.optionsFrom ? '请先选择上面的证型' : '无选项'}</small></div>`;
  return `<div class="choice-row vf-choices">${opts.map(o => `<label${o.old ? ' class="vf-old" title="老数据写法"' : ''}><input type="${multi ? 'checkbox' : 'radio'}" name="${name}" value="${escapeHTML(o.v)}"${vals.includes(o.v) ? ' checked' : ''}>${escapeHTML(o.t)}</label>`).join('')}</div>`;
}

function vfFieldHTML(col, f) {
  VF.defs[col] = VF.defs[col] || {}; VF.defs[col][f.key] = f;
  const unit = f.unit ? `<small class="field-unit">${escapeHTML(f.unit)}</small>` : '';
  const wx = f.wx == null ? '' : `<label class="wx-check"><input type="checkbox" class="vf-wx" data-col="${col}" data-key="${escapeHTML(f.key)}" ${f.wx ? 'checked' : ''}> 未查</label>`;
  const v = f.value;
  const rule=f.validation,ruleHint=rule?.kind==='laboratory'?`<small class="vf-hint">${rule.referenceConfigured?`配置参考范围：${escapeHTML(rule.referenceMin??'无下限')}～${escapeHTML(rule.referenceMax??'无上限')}；超出或不能确定时需逐项核对确认`:'参考范围未配置，请核对原报告和单位；不能据此判断正常'}</small>`:'';
  let control, wide = false;
  if (f.type === 'computed' || f.type === 'readonly') control = `<input value="${escapeHTML(v ?? '')}" readonly class="computed-input" placeholder="${f.type === 'computed' ? '保存时自动计算' : '—'}">`;
  else if (f.type === 'haq') { const opts = v && !HAQ_OPTIONS.includes(v) ? [...HAQ_OPTIONS, v] : HAQ_OPTIONS; control = `<select class="vf-input"><option value="">未填写</option>${opts.map(o => `<option${o === v ? ' selected' : ''}>${escapeHTML(o)}</option>`).join('')}</select>`; }
  else if (f.options || f.optionsFrom) { control = vfChoicesHTML(col, f, v, f.optionsFrom ? [] : f.options); wide = (f.options || []).length > 4 || !!f.optionsFrom || (f.options || []).some(o => String(o).length > 8); }
  else if (f.type === 'date' && vfPlainDate(v)) control = `<input type="date" class="vf-input" value="${escapeHTML(v || '')}" max="${ymd(TODAY)}">`;
  else if (f.type === 'list') { control = `<input class="vf-input" value="${escapeHTML(vfListText(v))}" placeholder="多个用「、」分隔">`; wide = true; }
  else if (f.type === 'number') control = `<input class="vf-input" inputmode="decimal" value="${escapeHTML(v ?? '')}">`;
  else if (f.type === 'textarea' || String(v || '').includes('\n')) { control = `<textarea class="vf-input" rows="3">${escapeHTML(v || '')}</textarea>`; wide = true; }
  else control = `<input class="vf-input" value="${escapeHTML(v ?? '')}">`;
  const attrs = `data-col="${col}" data-key="${escapeHTML(f.key)}" data-type="${f.type}" data-orig="${escapeHTML(JSON.stringify(v ?? null))}"${f.showIf ? ` data-show-if="${escapeHTML(f.showIf)}"` : ''}${f.optionsFrom ? ` data-from="${escapeHTML(f.optionsFrom)}"` : ''}${f.notBaseline ? ' data-not-baseline="1"' : ''}`;
  return `<div class="form-field vf-field${wide ? ' span-3' : ''}${f.type === 'computed' ? ' is-computed' : ''}" ${attrs}><span>${escapeHTML(f.label)}${rule?.required?' <b class="required">*</b>':''}${unit}${f.type === 'computed' ? '<em class="auto-tag">自动计算</em>' : ''}</span>${control}${wx}${ruleHint}</div>`;
}

// 清单单元格：单选列用下拉（方剂随本行证型变化），多选列用文本框
function vfCellHTML(c, v, row) {
  const attrs = `class="table-input vf-cell" data-key="${escapeHTML(c.key)}" data-type="${c.type}" data-orig="${escapeHTML(JSON.stringify(v ?? null))}"${c.optionsFrom ? ` data-from="${escapeHTML(c.optionsFrom)}" data-set="${escapeHTML(c.optionSet)}"` : ''}`;
  if (c.options || c.optionsFrom) {
    const opts = (c.optionsFrom ? (((VF.form.optionSets || {})[c.optionSet] || {})[row?.[c.optionsFrom]] || []) : c.options).map(vfOpt);
    if (v && !opts.some(o => o.v === v)) opts.push({ v, t: v });
    return `<select ${attrs}><option value="">请选择</option>${opts.map(o => `<option value="${escapeHTML(o.v)}"${o.v === v ? ' selected' : ''}>${escapeHTML(o.t)}</option>`).join('')}</select>`;
  }
  if (c.type !== 'list' && String(v || '').includes('\n')) return `<textarea ${attrs} rows="3">${escapeHTML(v)}</textarea>`;
  return `<input ${attrs} ${c.type === 'date' && vfPlainDate(v) ? 'type="date"' : ''} value="${escapeHTML(c.type === 'list' ? vfListText(v) : (v ?? ''))}"${c.type === 'list' ? ' placeholder="多个用「、」分隔"' : ''}>`;
}
function vfRowHTML(t, r) {
  return `<tr data-row="${r && r._row != null ? r._row : ''}">${t.columns.map(c => `<td>${vfCellHTML(c, r?.[c.key], r)}</td>`).join('')}<td><button type="button" class="button compact row-del" title="删除这一行">删除</button></td></tr>`;
}

function vfModuleHTML(m, i, opts) {
  let body = '';
  if (!m.editable) {
    body = `<p class="module-readonly-note">该模块存的是非结构化文字，暂不支持在此修改：</p><div class="visit-record">${escapeHTML(m.record || '')}</div>`;
  } else {
    body += m.groups.filter(g => g.fields.length).map(g => `<div class="subgroup">${g.title ? `<h3>${escapeHTML(g.title)}</h3>` : ''}<div class="form-grid">${g.fields.map(f => vfFieldHTML(m.column, f)).join('')}</div></div>`).join('');
    body += m.tables.map(t => `<div class="subgroup edit-table-group" data-col="${m.column}" data-table="${escapeHTML(t.key)}"><h3>${escapeHTML(t.title)}</h3><div class="visit-table-wrap"><table class="visit-table edit-table"><thead><tr>${t.columns.map(c => `<th>${escapeHTML(c.label)}</th>`).join('')}<th></th></tr></thead><tbody>${t.rows.map(r => vfRowHTML(t, r)).join('')}</tbody></table></div><button type="button" class="button compact row-add">＋ 添加一行</button></div>`).join('');
    body += (m.images || []).map(g => `<div class="subgroup"><h3>${escapeHTML(g.title)} <small class="table-count">${g.urls.length} 张 · 只读</small></h3><div class="visit-images">${g.urls.map(u => `<a href="${escapeHTML(u)}" target="_blank" rel="noopener"><img src="${escapeHTML(u)}" alt="" loading="lazy"></a>`).join('')}</div></div>`).join('');
    if (m.others && m.others.length) body += `<div class="subgroup"><h3>其他字段 <small class="table-count">只读 · 保存时原样保留</small></h3><div class="detail-fields">${m.others.map(o => `<div class="detail-field"><span>${escapeHTML(o.label)}</span><strong>${escapeHTML(o.value)}</strong></div>`).join('')}</div></div>`;
    if (!body) body = '<p class="module-empty">本模块暂无可编辑字段</p>';
  }
  if (m.legacyAdverse) body += vfLegacyAdverseHTML(m.legacyAdverse);
  return `<details class="create-section" id="mod-${m.key}"${i === 0 ? ' open' : ''}><summary class="create-section-head"><h2>${escapeHTML(m.title)}</h2><span>${m.editable ? (opts.hint || '可修改') : '只读'}</span><span class="section-toggle" aria-hidden="true"></span></summary><div class="create-section-body">${body}</div></details>`;
}

// 旧 bblsj 只作原只读信息展示，不生成任何可收集字段，也不复制到 blsj。
function vfLegacyAdverseHTML(m) {
  const items=[...(m.others||[]),...(m.groups||[]).flatMap(g=>g.fields||[])];
  if (!m.record && !items.length) return '';
  return `<div class="subgroup legacy-adverse-record"><h3>历史附加记录 <small>只读 · 原样保留</small></h3>${m.record?`<div class="visit-record">${escapeHTML(m.record)}</div>`:''}<div class="detail-fields">${items.map(f=>`<div class="detail-field"><span>${escapeHTML(f.label||f.key)}</span><strong>${escapeHTML(vfIsList(f.type)?vfListText(f.value):f.value??'')}</strong></div>`).join('')}</div></div>`;
}

// 渲染到 box；opts.baseline：本次是否基线访视（「与上次相比是否调整」不显示）；opts.hint：模块标题右侧提示
function vfRender(box, form, opts = {}) {
  vfCancelConfirmations();VF.confirmationAbort=new AbortController();
  VF.form = form; VF.baseline = !!opts.baseline; VF.create = form.visitId == null; VF.defs = {};
  const legacy = form.modules.find(m=>m.column==='bblsj'||m.key==='adverseEvent');
  box.innerHTML = form.modules.filter(m=>m!==legacy).map((m, i) => vfModuleHTML(m.column==='blsj'||m.key==='adverse'?{...m,legacyAdverse:legacy}:m, i, opts)).join('');
  // 依赖上级字段的选项（主症 / 次症）按当前证型画出来
  box.querySelectorAll('.vf-field[data-from]').forEach(el => vfRefreshOptions(box, el));
  vfRefreshVisibility(box);
}

function vfFieldEl(scope, col, key) { return scope.querySelector(`.vf-field[data-col="${col}"][data-key="${CSS.escape(key)}"]`); }
// 字段当前值：单选为文字（radioList 为数组）、多选为数组
function vfValue(el) {
  const t = el.dataset.type, box = el.querySelector('.vf-choices');
  if (box) { const vals = [...box.querySelectorAll('input:checked')].map(i => i.value); return t === 'list' || t === 'radioList' ? vals : (vals[0] || ''); }
  const i = el.querySelector('.vf-input'); if (!i) return undefined;
  return t === 'list' ? vfSplit(i.value) : i.value.trim();
}
function vfCurrent(scope, col, key) { const el = vfFieldEl(scope, col, key); return el ? vfValue(el) : null; }
// 程序填值（如 OCR 识别结果）：单选 / 多选勾上对应选项，其他填文本框；填了值的去掉「未查」。返回是否填上
function vfSetValue(scope, col, key, value) {
  const el = vfFieldEl(scope, col, key); if (!el || value == null || value === '') return false;
  const box = el.querySelector('.vf-choices'), vals = vfArr(value).map(String);
  if (box) {
    const inputs = [...box.querySelectorAll('input')]; if (!inputs.some(i => vals.includes(i.value))) return false;
    inputs.forEach(i => i.checked = vals.includes(i.value));
  } else {
    const i = el.querySelector('.vf-input'); if (!i) return false;
    i.value = Array.isArray(value) ? value.join('、') : value;
  }
  const wx = el.querySelector('.vf-wx'); if (wx) wx.checked = false;
  el.classList.add('ocr-filled');
  (box ? box.querySelector('input') : el.querySelector('.vf-input')).dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function vfRefreshOptions(scope, el) {
  const col = el.dataset.col, f = VF.defs[col][el.dataset.key];
  const keep = vfValue(el), options = vfOptions(col, f, scope);
  // 证型换了：原来勾的不在新选项里的去掉（老数据写法除外，不在当前证型下的也一并去掉）
  const vals = vfArr(keep).filter(v => options.map(o => vfOpt(o).v).includes(v));
  el.querySelector('.vf-choices').outerHTML = vfChoicesHTML(col, f, f.type === 'list' ? vals : vals[0], options);
}
function vfRefreshVisibility(scope) {
  scope.querySelectorAll('.vf-field[data-show-if], .vf-field[data-not-baseline]').forEach(el => {
    let show = !(el.dataset.notBaseline && VF.baseline);
    if (show && el.dataset.showIf) {
      const i = el.dataset.showIf.indexOf(':'), key = el.dataset.showIf.slice(0, i), want = el.dataset.showIf.slice(i + 1);
      const parent = vfFieldEl(scope, el.dataset.col, key);
      const cur = parent && !parent.hidden ? vfValue(parent) : null;
      show = Array.isArray(cur) ? cur.includes(want) : cur === want;
    }
    el.hidden = !show;
  });
}

function vfBind(scope, onDirty) {
  // 单选再点一次取消
  scope.addEventListener('pointerdown', e => { const r = e.target.closest('label')?.querySelector('input[type=radio]'); if (r && scope.contains(r)) r.dataset.was = r.checked ? '1' : ''; });
  scope.addEventListener('click', e => {
    const r = e.target.matches('input[type=radio]') ? e.target : null;
    if (r && r.closest('.vf-choices') && r.dataset.was === '1') { r.checked = false; r.dataset.was = ''; r.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  scope.addEventListener('change', e => {
    const t = e.target, field = t.closest('.vf-field');
    // 多选：选「无」清空其他项；选了其他项去掉「无」
    if (field && t.type === 'checkbox' && t.closest('.vf-choices')) {
      const box = t.closest('.vf-choices');
      if (t.checked && t.value === '无') box.querySelectorAll('input:checked').forEach(i => { if (i !== t) i.checked = false; });
      else if (t.checked) { const none = box.querySelector('input[value="无"]'); if (none) none.checked = false; }
    }
    if (field) scope.querySelectorAll(`.vf-field[data-col="${field.dataset.col}"][data-from="${CSS.escape(field.dataset.key)}"]`).forEach(el => vfRefreshOptions(scope, el));
    // 清单：本行证型变了，方剂选项跟着变
    if (t.classList.contains('vf-cell')) {
      t.closest('tr').querySelectorAll(`.vf-cell[data-from="${CSS.escape(t.dataset.key)}"]`).forEach(sel => {
        const opts = (((VF.form.optionSets || {})[sel.dataset.set] || {})[t.value] || []).map(vfOpt), cur = sel.value;
        sel.innerHTML = `<option value="">请选择</option>${opts.map(o => `<option value="${escapeHTML(o.v)}"${o.v === cur ? ' selected' : ''}>${escapeHTML(o.t)}</option>`).join('')}`;
      });
    }
    vfRefreshVisibility(scope);
    if (onDirty) onDirty();
  });
  scope.addEventListener('input', () => { if (onDirty) onDirty(); });
  scope.addEventListener('click', e => {
    const add = e.target.closest('.row-add'), del = e.target.closest('.row-del');
    if (add) {
      const g = add.closest('.edit-table-group'), m = VF.form.modules.find(x => x.column === g.dataset.col), t = m.tables.find(x => x.key === g.dataset.table);
      g.querySelector('tbody').insertAdjacentHTML('beforeend', vfRowHTML(t, null));
      g.querySelector('tbody tr:last-child .vf-cell')?.focus(); if (onDirty) onDirty();
    }
    if (del) {
      const tr = del.closest('tr'), name = [...tr.querySelectorAll('.vf-cell')].map(i => i.value).find(Boolean) || '这一行';
      confirmDialog(`删除「${name}」？保存后生效。`, { title: '删除这一行', okText: '删除', danger: true }).then(ok => { if (ok) { tr.remove(); if (onDirty) onDirty(); } });
    }
  });
}

// 提交值：没动过的原样传回原值，动过的按类型转换
// 多选只比较选了哪些、不比较顺序（选项按固定顺序显示，老数据的顺序可能不同）
const vfNorm = (t, v) => vfIsList(t) ? [...vfArr(v)].sort().join('\u0001') : (v == null ? '' : String(v));
function vfOut(type, orig, now) {
  if (vfNorm(type, now) === vfNorm(type, orig)) return orig ?? (vfIsList(type) ? [] : '');
  return now;
}
function vfParse(s) { try { return JSON.parse(s || 'null'); } catch (e) { return null; } }
function vfCollect(scope) {
  const modules = {};
  const mod = col => modules[col] = modules[col] || { fields: {}, wx: {}, tables: {} };
  scope.querySelectorAll('.vf-field').forEach(el => {
    if (el.hidden || ['computed', 'readonly'].includes(el.dataset.type)) return;   // 隐藏的字段不提交（编辑时即原样保留）
    const now = vfValue(el); if (now === undefined) return;
    mod(el.dataset.col).fields[el.dataset.key] = vfOut(el.dataset.type, vfParse(el.dataset.orig), now);
  });
  scope.querySelectorAll('.vf-wx').forEach(el => { if (!el.closest('.vf-field').hidden) mod(el.dataset.col).wx[el.dataset.key] = el.checked; });
  scope.querySelectorAll('.edit-table-group').forEach(g => {
    mod(g.dataset.col).tables[g.dataset.table] = [...g.querySelectorAll('tbody tr')].map(tr => {
      const r = {}; if (tr.dataset.row !== '') r._row = +tr.dataset.row;
      tr.querySelectorAll('.vf-cell').forEach(i => { const t = i.dataset.type, now = t === 'list' ? vfSplit(i.value) : i.value.trim(); r[i.dataset.key] = vfOut(t, vfParse(i.dataset.orig), now); });
      return r;
    });
  });
  return modules;
}

const VF_DECIMAL=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const VF_LAB=/^(<=|>=|<|>|≤|≥|＜|＞|=)?\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)$/;
// 十进制按符号、位数和有效数字比较，不以浮点舍入改变参考边界。
function vfDecimalParts(value){
 const match=String(value).match(/^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
 const digits=(match[2]+(match[3]||'')).replace(/^0+/,'');
 return {sign:digits?(match[1]==='-'?-1:1):0,digits:digits||'0',magnitude:digits.length+Number(match[4]||0)-(match[3]||'').length};
}
function vfDecimalCompare(left,right){
 const a=vfDecimalParts(left),b=vfDecimalParts(right);
 if(a.sign!==b.sign)return Math.sign(a.sign-b.sign);if(!a.sign)return 0;
 if(a.magnitude!==b.magnitude)return Math.sign(a.magnitude-b.magnitude)*a.sign;
 const length=Math.max(a.digits.length,b.digits.length),x=a.digits.padEnd(length,'0'),y=b.digits.padEnd(length,'0');
 return (x===y?0:x>y?1:-1)*a.sign;
}
function vfNeedsReview(rule,value){
 const match=String(value).match(VF_LAB);if(!match)return true;
 const [,operator,number]=match,min=rule.referenceMin,max=rule.referenceMax;
 if(['<','<=','≤','＜'].includes(operator))return min!=null||(max!=null&&vfDecimalCompare(number,max)>0);
 if(['>','>=','≥','＞'].includes(operator))return max!=null||(min!=null&&vfDecimalCompare(number,min)<0);
 return (min!=null&&vfDecimalCompare(number,min)<0)||(max!=null&&vfDecimalCompare(number,max)>0);
}
function vfInvalid(el,message){const error=new Error(message);error.field=el;throw error;}
function vfFocusInvalid(error){const section=error.field?.closest?.('details');if(section)section.open=true;error.field?.querySelector?.('.vf-input')?.focus?.();}
// 与服务端相同的有效规则；所有确认仅活在当前提交快照，不默认勾选或跨值/目标复用。
async function vfPrepareSubmission(scope,modules){
 const snapshot=JSON.stringify(modules),reviews=[],preparedForm=VF.form,signal=VF.confirmationAbort?.signal;
 for(const el of scope.querySelectorAll('.vf-field')){
  if(el.hidden||['computed','readonly'].includes(el.dataset.type))continue;
  const col=el.dataset.col,key=el.dataset.key,f=VF.defs[col]?.[key];if(!f)continue;
  const update=modules[col],value=update?.fields?.[key];
  if(!update||!Object.hasOwn(update.fields||{},key))continue;
  const rule=f.validation||{kind:f.type},original=vfParse(el.dataset.orig);
  const changed=vfNorm(f.type,value)!==vfNorm(f.type,original);
  const scalar=value==null||typeof value==='string'||typeof value==='number';
  const text=value==null?'':String(value).trim(),empty=!text||['null','{}','[]'].includes(text)||(Array.isArray(value)&&!value.length);
  const marker=rule.kind==='laboratory'&&text==='未查';
  const wx=Object.hasOwn(update.wx||{},key)?update.wx[key]===true:f.wx===true,unchecked=wx||marker;
  if(rule.kind==='laboratory'&&rule.required&&!(unchecked&&rule.allowUnchecked)&&(VF.create||changed||wx!==(f.wx===true))&&(empty||unchecked))vfInvalid(el,`${f.label}：请填写此必填项${rule.allowUnchecked?'，未检查时可选择未查':'（当前规则未允许以未查豁免）'}`);
  if(!changed||empty)continue;
  if(['laboratory','number','date'].includes(rule.kind)&&!scalar)vfInvalid(el,`${f.label}：应填写单个数值或日期`);
  if(rule.kind==='laboratory'&&marker)continue;
  if(rule.kind==='date'){
   const date=new Date(text+'T00:00:00Z');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==text)vfInvalid(el,`${f.label}：请填写真实的日期`);
  }
  if(rule.kind==='number'){
   if(!VF_DECIMAL.test(text)||!Number.isFinite(Number(text)))vfInvalid(el,`${f.label}：应为有限数值`);
   if((rule.min!=null&&vfDecimalCompare(text,rule.min)<0)||(rule.max!=null&&vfDecimalCompare(text,rule.max)>0))vfInvalid(el,`${f.label}：应在 ${rule.min}～${rule.max} 之间`);
  }
  if(rule.kind==='laboratory'){
   const suffix=rule.unitSuffixAllowed?text.match(/(IU\/mL|U\/mL)$/)?.[1]:null;
   const numeric=suffix?text.slice(0,-suffix.length).trim():text,unitMismatch=!!suffix&&suffix!==(f.unit||'');
   const match=numeric.match(VF_LAB),qualitative=rule.qualitativeAllowed&&/^(?:阴性|阳性|[-—]|\+{1,4})$/.test(text);
   if(!qualitative&&(!match||!Number.isFinite(Number(match[2]))))vfInvalid(el,`${f.label}：应为完整有限数值，可保留报告中的比较符`);
   if(wx)vfInvalid(el,`${f.label}：新填写的结果与未查不能同时提交`);
   if(unitMismatch||(rule.referenceConfigured&&vfNeedsReview(rule,numeric))){
    if(!rule.ruleVersion||!rule.target)vfInvalid(el,'校验规则不完整，请重新加载表单');
    reviews.push({el,col,key,value:text,unit:f.unit||'',rule,unitMismatch});
   }
  }
 }
 for(const item of reviews){
  const reason=item.unitMismatch?`单位不一致，请核对：填写结果中的单位与字段单位 ${item.unit} 不同，系统不会自动换算。`:`配置参考范围 ${item.rule.referenceMin??'无下限'}～${item.rule.referenceMax??'无上限'}。该结果超出或尚不能证明在范围内，请核对原报告及单位。`;
  const accepted=await confirmDialog(`${VF.defs[item.col][item.key].label}：${item.value}。${reason}`,{title:'逐项核对检验结果',okText:'已核对，确认此值',signal});
  if(signal?.aborted||VF.form!==preparedForm)throw new Error('本次表单核对已结束，请重新加载');
  if(!accepted)vfInvalid(item.el,'已取消保存，请核对检验结果后再保存');
 }
 if(JSON.stringify(vfCollect(scope))!==snapshot)throw new Error('表单已变化，请重新核对后保存');
 for(const item of reviews){modules[item.col].confirmations??={};modules[item.col].confirmations[item.key]={value:item.value,unit:item.unit,ruleVersion:item.rule.ruleVersion,target:item.rule.target};}
 return modules;
}
