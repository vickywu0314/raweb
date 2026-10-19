/* patient-create.html 页面脚本（依赖 boot.js → data.js → common.js）
   新增患者：基本信息与患者详情页一致；ACR/EULAR 2010 在弹窗里评估，结果回显到基本信息。
   - 填完身份证号：POST /api/ra/patient/checkCardNo 查重（已在名下 / 其他医生名下可转入 / 其他病种复用档案）
   - 保存：POST /api/ra/patient/createPatient（JSON），成功后打开患者详情
   - OCR识别录入（js/shared/ocr-import.js）：识别出的姓名、身份证号等预填表单（?ocr=1 打开时取草稿）；
     草稿里有检验结果时，建档成功后接着打开新增随访（基线访视）预填辅助检查
   编辑档案（patient-edit.html，body data-mode="edit"）共用本脚本和同一套表单：
   - 打开：POST /api/ra/patient/editForm 取当前值预填
   - 保存：POST /api/ra/patient/updatePatient（JSON），只提交改动过的字段名（changed），后端只更新这些字段；保存后返回来源页 */
"use strict";
shell('patients');
const form = $('#create-form');
const field = n => form.elements[n];
const NATIONS = ['汉族','壮族','回族','满族','维吾尔族','苗族','彝族','土家族','藏族','蒙古族','侗族','布依族','瑶族','白族','朝鲜族','哈尼族','黎族','哈萨克族','傣族','畲族','傈僳族','东乡族','仡佬族','拉祜族','佤族','水族','纳西族','羌族','土族','仫佬族','锡伯族','柯尔克孜族','景颇族','达斡尔族','撒拉族','布朗族','毛南族','塔吉克族','普米族','阿昌族','怒族','鄂温克族','京族','基诺族','德昂族','保安族','俄罗斯族','裕固族','乌孜别克族','门巴族','鄂伦春族','独龙族','赫哲族','高山族','珞巴族','塔塔尔族','其他'];
const COMORBID_CODES = ['FM','AS','SS','RA-ILD','RA-MS'];
// ACR/EULAR 2010：4 部分各选一项的得分（与老系统 H5 一致）
const ACR_PARTS = [
  { key: 'jointScore', title: '受累关节数量', options: [[0,'1 个中大关节'],[1,'2-10 个中大关节'],[2,'1-3 个小关节'],[3,'4-10 个小关节'],[5,'>10 个小关节']] },
  { key: 'serologyScore', title: '血清学抗体检测', options: [[0,'RF 或抗CCP抗体均阴性'],[2,'RF 或抗CCP抗体至少一项低滴度阳性'],[3,'RF 或抗CCP抗体至少一项高滴度阳性']] },
  { key: 'durationScore', title: '滑膜炎持续时间', options: [[0,'<6 周'],[1,'≥6 周']] },
  { key: 'acuteScore', title: '急性时相反应物', options: [[0,'CRP 或 ESR 均正常'],[1,'CRP 或 ESR 增高']] }
];
let acr = null;          // 已确定的评估 {jointScore,…}，未评估为 null
let existing = null;     // 身份证号查重结果
const EDIT_ID = document.body.dataset.mode === 'edit' ? queryParam('id') : null;
let editInit = null, acrInit = 'none', oldAcrScore = null;   // 编辑档案：打开时的表单值、ACR 状态

field('nation').innerHTML = '<option value="">请选择</option>' + NATIONS.map(n => `<option>${n}</option>`).join('');
$('#comorbid-pick').innerHTML = COMORBID_CODES.map(c => `<label class="comorbid-option"><input type="checkbox" value="${c}"><span>${c} ${escapeHTML((COMORBIDITY_INFO[c] || {}).name || '')}</span><input type="number" class="since-year" min="1900" max="${TODAY.getFullYear()}" placeholder="起病年份" aria-label="${c} 起病年份" disabled></label>`).join('');
$('#comorbid-pick').addEventListener('change', e => { if (e.target.type === 'checkbox') { const y = e.target.parentElement.querySelector('.since-year'); y.disabled = !e.target.checked; if (!e.target.checked) y.value = ''; } });
if ($('#ocr-import')) $('#ocr-import').onclick = () => openOcrImport({ mode: 'patient', onApply: applyOcr });

// ===== 身份证号：校验、带出性别 / 出生年份，查重 =====
function idInfo(no) {
  no = (no || '').trim().toUpperCase();
  let y, m, d, g;
  if (/^\d{17}[\dX]$/.test(no)) { y = +no.slice(6, 10); m = +no.slice(10, 12); d = +no.slice(12, 14); g = +no[16]; }
  else if (/^\d{15}$/.test(no)) { y = 1900 + +no.slice(6, 8); m = +no.slice(8, 10); d = +no.slice(10, 12); g = +no[14]; }
  else return null;
  const birth = new Date(y, m - 1, d);
  if (birth.getMonth() !== m - 1 || birth.getDate() !== d || birth > TODAY) return null;
  let age = TODAY.getFullYear() - y; if (TODAY.getMonth() < m - 1 || (TODAY.getMonth() === m - 1 && TODAY.getDate() < d)) age--;
  return { year: y, age, gender: g % 2 ? 1 : 2 };
}
async function checkCard() {
  const no = field('cardNo').value.trim(), hint = $('#card-hint');
  existing = null; showBanner(null);
  if (!no) { hint.textContent = ''; return; }
  const info = idInfo(no);
  if (!info) { hint.textContent = '身份证号格式不正确'; hint.className = 'field-hint warn'; return; }
  hint.textContent = `${info.year} 年出生 · ${info.age} 岁`; hint.className = 'field-hint';
  if (!form.querySelector('[name=gender]:checked')) form.querySelector(`[name=gender][value="${info.gender}"]`).checked = true;
  if (EDIT_ID) { if (form.querySelector(`[name=gender][value="${3 - info.gender}"]`).checked) { hint.textContent += ' · 与所选性别不一致，请核对'; hint.className = 'field-hint warn'; } return; }   // 编辑档案：重复由保存时后端检查
  try {
    const r = await apiPost('/api/ra/patient/checkCardNo', { doctorId: currentDoctorId(), cardNo: no });
    if (field('cardNo').value.trim() !== no) return;   // 查询期间又改了身份证号
    existing = r; handleExisting();
  } catch (e) { hint.textContent = `查重失败：${e.message}`; hint.className = 'field-hint warn'; }
}
function handleExisting() {
  const x = existing; if (!x || x.result === 'NEW') { showBanner(null); return; }
  const go = `patient-visits.html?id=${encodeURIComponent(x.patientId)}`;
  if (x.result === 'MINE') {
    showBanner(`该患者已在您名下（${escapeHTML(x.name)}，ID号 ${escapeHTML(x.patientId)}），无需重复建档。<a href="${go}">打开患者详情 →</a>`, 'warn');
  } else if (x.result === 'RA_OTHER_DOCTOR') {
    showBanner(`患者已存在：${escapeHTML(x.name)}（ID号 ${escapeHTML(x.patientId)}）在 ${escapeHTML(x.otherDoctorName)} 名下。<button type="button" class="banner-link" id="transfer-btn">转到我名下</button>`, 'warn');
    $('#transfer-btn').onclick = transfer;
    transfer();
  } else if (x.result === 'OTHER_DISEASE') {
    showBanner(`该患者已在「${escapeHTML((x.otherDiseases || []).join('、'))}」研究库建档（${escapeHTML(x.name)}，ID号 ${escapeHTML(x.patientId)}）。保存后会复用其档案并加入 RA 研究库，原病种自动记入其他病史；下面已预填原有信息，保存时只更新您修改或补充的内容。`, 'info');
    prefill(x.basic || {});
  }
}
async function transfer() {
  const x = existing;
  if (!await confirmDialog(`患者已存在：${x.name}（ID号 ${x.patientId}）在 ${x.otherDoctorName} 名下。\n确认要把该患者转到自己名下吗？转入后原医生将不再看到该患者。`, { title: '患者已存在', okText: '转到我名下' })) return;
  try {
    const r = await apiPostJson('/api/ra/patient/createPatient', { doctorId: currentDoctorId(), transfer: true, basic: { name: x.name, cardNo: field('cardNo').value.trim(), gender: 1 } });
    toastNext('已转到您名下');
    location.href = `patient-visits.html?id=${encodeURIComponent(r.patientId)}`;
  } catch (e) { toast(`转入失败：${e.message}`); }
}
function showBanner(html, tone) {
  const b = $('#exist-banner'); b.hidden = !html; b.className = `exist-banner ${tone || ''}`; b.innerHTML = html || '';
  $('#save').disabled = !!existing && (existing.result === 'MINE' || existing.result === 'RA_OTHER_DOCTOR');
}
function prefill(b) {
  const set = (n, v) => { if (v != null && v !== '' && field(n)) field(n).value = v; };
  ['name','mobile','confirmDate','happenDate','height','weight','waistline','heartRate','systolic','diastolic','smokeYears','smokeCountByDay','allergyHistory','familyHistory','pastHistory','followCycle'].forEach(n => set(n, b[n]));
  if (b.nation) { if (![...field('nation').options].some(o => o.value === b.nation)) field('nation').insertAdjacentHTML('beforeend', `<option>${escapeHTML(b.nation)}</option>`); field('nation').value = b.nation; }
  if (b.marry != null) field('marry').value = String(b.marry);
  [['gender', b.gender], ['smoke', b.smoke], ['smokeStop', b.smokeStop]].forEach(([n, v]) => { const r = v != null && form.querySelector(`[name=${n}][value="${v}"]`); if (r) r.checked = true; });
  refresh();
}
field('cardNo').addEventListener('change', checkCard);

// ===== OCR 识别结果预填：只填识别出来的项，填上的蓝框标出，医生核对后保存 =====
const ocrManualBasics = new Set();
for (const event of ['input','change']) form.addEventListener(event, e => { if (e.target?.name) ocrManualBasics.add(e.target.name); });
let ocrDraftUsed = null, patientCreateSaved = null, patientCreateUnknown = false, patientCreating = false;
function applyOcr(d) {
  if (patientCreateSaved || patientCreateUnknown || patientCreating || d.patientId) return;
  const merged = ocrMergeDraft(ocrDraftUsed, d); if (ocrSourceFiles(merged).length > 20) { toast('每次最多保留20张原图，请先保存患者'); return; }
  const b = d.basic || {}, filled = []; let preserved = 0;
  const mark = n => { const el = field(n); (el instanceof RadioNodeList ? form.querySelector(`[name=${n}]`).closest('.choice-row') : el).classList.add('ocr-filled'); filled.push(n); };
  const empty = n => { const has = ocrManualBasics.has(n) || (field(n) && String(field(n).value || '').trim()); if (has) preserved++; return !has; };
  ['name','mobile','height','weight','confirmDate','happenDate'].forEach(n => { if (b[n] && field(n) && empty(n)) { field(n).value = b[n]; mark(n); } });
  if (b.nation && [...field('nation').options].some(o => o.value === b.nation) && empty('nation')) { field('nation').value = b.nation; mark('nation'); }
  if (b.marry != null && b.marry !== '' && empty('marry')) { field('marry').value = String(b.marry); mark('marry'); }
  if (b.gender) { const selected = form.querySelector('[name=gender]:checked'), r = form.querySelector(`[name=gender][value="${b.gender}"]`); if (selected || ocrManualBasics.has('gender')) preserved++; else if (r) { r.checked = true; mark('gender'); } }
  if (b.cardNo && empty('cardNo')) { field('cardNo').value = b.cardNo; mark('cardNo'); checkCard(); }
  ocrDraftUsed = merged; ocrSaveDraft(ocrDraftUsed);
  $('.ocr-banner')?.remove();
  const lab = Object.keys(ocrDraftUsed.fzjc || {}).length;
  ocrBanner(form, `本次填入 ${filled.length} 项空白基本信息，保留 ${preserved} 项已有值。已保留 ${ocrSourceFiles(ocrDraftUsed).length} 张原图，<b>请核对后保存</b>。${ocrHasVisit(ocrDraftUsed) ? `建档后接着录入基线访视（${lab} 项检验结果）。` : ''}${ocrSourceLinks(ocrDraftUsed)}`);
  refresh();
}
function finishPatientSave(r, draft) {
  toastNext(r.action === 'linked' ? `已加入 RA 研究库，研究编号 ${r.studyNo || '—'}` : `建档成功，研究编号 ${r.studyNo || '—'}`);
  if (draft && ocrHasVisit(draft)) {
    ocrSaveDraft({ ...draft, patientId: String(r.patientId), saved: null, createPending: false });
    location.href = `visit-create.html?id=${encodeURIComponent(r.patientId)}&ocr=1`; return;
  }
  ocrClearDraft(); location.href = `patient-visits.html?id=${encodeURIComponent(r.patientId)}`;
}
function showSavedPatient(r, draft) {
  patientCreateSaved = r; patientCreating = false;
  $('#save').disabled = true; $('#save').textContent = '患者已保存';
  const link = ocrLinkState(r.ocrLink, ocrSourceFiles(draft));
  if (link.status === 'PENDING') {
    formError('患者已保存，原图尚未全部关联，请重试关联，勿重复建档。');
    ocrRecoverSaved(form, { ...r, ocrLink: link }, draft, () => finishPatientSave(r, draft));
  } else finishPatientSave(r, draft);
}
if (!EDIT_ID) {
  const d = ocrDraft();
  if (d?.saved && !d.saved.visitId) showSavedPatient(d.saved, d);
  else if (d?.mode === 'patient' && d.createPending) { patientCreateUnknown = true; $('#save').disabled = true; formError('保存结果未知，请到患者列表核对，勿重复提交。'); }
  else if (d?.mode === 'patient' && d.patientId) { patientCreateSaved = { patientId: d.patientId }; $('#save').disabled = true; ocrBanner(form, `已为这份草稿建档，请继续 <a href="visit-create.html?id=${encodeURIComponent(d.patientId)}&ocr=1">录入基线访视</a>，勿重复建档。`); }
  else if (queryParam('ocr') && d?.mode === 'patient') applyOcr(d);
}

const patientFormOwner = !EDIT_ID ? ocrToken() : null;
let patientFormRevoked = false;
function revokePatientOcrForm(force = false) {
  if (EDIT_ID || (!force && patientFormOwner.doctorId === ocrDoctor())) return;
  patientFormRevoked = true; ocrDraftUsed = null; patientCreating = false; patientCreateUnknown = true;
  form.reset(); document.querySelectorAll('.ocr-banner').forEach(n => n.remove());
  $('#save').disabled = true; formError('登录身份已变化，请刷新页面后重新录入。');
}
window.addEventListener('ra-auth-changed', () => revokePatientOcrForm());
window.addEventListener('storage', e => { if (!EDIT_ID && (e.key === 'ra-auth' || e.key === null)) revokePatientOcrForm(ocrStorageIdentityChanged(e)); });
window.addEventListener('pageshow', e => {
  if (EDIT_ID || !e.persisted) return;
  revokePatientOcrForm();
  if (patientFormRevoked || patientFormOwner.doctorId !== ocrDoctor()) return;
  const d = ocrDraft();
  if (d?.mode === 'patient' && d.saved && !d.saved.visitId) {
    document.querySelectorAll('.ocr-banner').forEach(n => n.remove());
    showSavedPatient({ ...patientCreateSaved, ...d.saved }, d);
  } else if ((patientCreating && !patientCreateSaved) || d?.createPending) {
    patientCreating = false; patientCreateUnknown = true; $('#save').disabled = true;
    formError('保存结果未知，请到患者列表核对，勿重复提交。');
  }
});

// ===== 联动：BMI、血压提示、吸烟明细 =====
function refresh() {
  const h = +field('height').value / 100, w = +field('weight').value;
  $('#bmi').textContent = h > 0 && w > 0 ? (w / h / h).toFixed(1) : '—';
  const s = +field('systolic').value, d = +field('diastolic').value;
  $('#bp-hint').textContent = s && d && s <= d ? '收缩压应高于舒张压，请检查是否填反' : '';
  const smoking = form.querySelector('[name=smoke]:checked')?.value === '1';
  form.querySelectorAll('.smoke-detail').forEach(el => el.hidden = !smoking);
  if (EDIT_ID && editInit) { const n = changedKeys().length; $('#save').disabled = !n; formError(n ? `已修改 ${n} 项` : '未修改'); }
}
form.addEventListener('input', refresh);
form.addEventListener('change', refresh);

// ===== ACR/EULAR 2010 弹窗 =====
const acrDialog = $('#acr-dialog');
$('#acr-parts').innerHTML = ACR_PARTS.map((p, i) => `<fieldset class="acr-part"><legend>${i + 1}. ${p.title}</legend>${p.options.map(([v, t]) => `<label><input type="radio" name="${p.key}" value="${v}"><span>${t}</span><b>${v} 分</b></label>`).join('')}</fieldset>`).join('');
const acrLabel = total => `${total} 分 · ${total >= 6 ? '符合 RA 分类' : '暂不符合 RA 分类'}`;
function acrDraft() { const a = {}; ACR_PARTS.forEach(p => { const r = acrDialog.querySelector(`[name=${p.key}]:checked`); a[p.key] = r ? +r.value : null; }); return a; }
function updateAcrTotal() {
  const a = acrDraft(), done = ACR_PARTS.filter(p => a[p.key] != null).length;
  const total = ACR_PARTS.reduce((t, p) => t + (a[p.key] || 0), 0);
  $('#acr-total').innerHTML = done < 4 ? `已选 ${done} / 4 项，当前 ${total} 分` : `总计 <b>${total}</b> 分：${total >= 6 ? '可分类为类风湿关节炎（≥6 分）' : '暂不能分类为类风湿关节炎（<6 分）'}`;
  $('#acr-ok').disabled = done < 4;
}
acrDialog.addEventListener('change', updateAcrTotal);
$('#acr-open').onclick = () => {
  ACR_PARTS.forEach(p => acrDialog.querySelectorAll(`[name=${p.key}]`).forEach(r => r.checked = !!acr && +r.value === acr[p.key]));
  updateAcrTotal(); acrDialog.showModal();
};
acrDialog.addEventListener('close', () => {
  if (acrDialog.returnValue !== 'ok') return;
  acr = acrDraft(); const total = ACR_PARTS.reduce((t, p) => t + acr[p.key], 0);
  $('#acr-result').textContent = acrLabel(total); $('#acr-result').className = `acr-result ${total >= 6 ? 'yes' : 'no'}`;
  $('#acr-open').textContent = '修改评估'; $('#acr-clear').hidden = false;
  refresh();
});
function showAcr(total, note) { $('#acr-result').textContent = acrLabel(total) + (note || ''); $('#acr-result').className = `acr-result ${total >= 6 ? 'yes' : 'no'}`; $('#acr-open').textContent = '修改评估'; $('#acr-clear').hidden = false; }
$('#acr-clear').onclick = () => { acr = null; oldAcrScore = null; $('#acr-result').textContent = '未评估'; $('#acr-result').className = 'acr-result'; $('#acr-open').textContent = '填写评估'; $('#acr-clear').hidden = true; refresh(); };
// ACR 当前状态（编辑档案比较是否改过）：各部分 / 老数据只有总分 / 未评估
const acrState = () => acr ? JSON.stringify(ACR_PARTS.map(p => acr[p.key])) : oldAcrScore != null ? `score:${oldAcrScore}` : 'none';

// ===== 保存 =====
function formData() {
  const v = n => (field(n).value || '').trim() || null;
  const radio = n => { const r = form.querySelector(`[name=${n}]:checked`); return r ? +r.value : null; };
  const int = n => v(n) == null ? null : +v(n);
  const smoke = radio('smoke');
  return {
    name: v('name'), cardNo: v('cardNo'), gender: radio('gender'), mobile: v('mobile'), nation: v('nation'),
    marry: v('marry') == null ? null : +v('marry'), confirmDate: v('confirmDate'), happenDate: v('happenDate'),
    height: v('height'), weight: v('weight'), waistline: v('waistline'), heartRate: v('heartRate'), systolic: v('systolic'), diastolic: v('diastolic'),
    smoke, smokeYears: smoke === 1 ? int('smokeYears') : null, smokeCountByDay: smoke === 1 ? int('smokeCountByDay') : null, smokeStop: smoke === 1 ? radio('smokeStop') : null,
    allergyHistory: v('allergyHistory'), familyHistory: v('familyHistory'), pastHistory: v('pastHistory'),
    diagnosisInformed: radio('diagnosisInformed'), consentSigned: radio('consentSigned'),
    followCycle: +field('followCycle').value, acrEular: acr,
    comorbidities: [...$('#comorbid-pick').querySelectorAll('input[type=checkbox]:checked')].map(c => { const y = c.parentElement.querySelector('.since-year').value; return { code: c.value, sinceYear: y ? +y : null }; })
  };
}
function formError(msg, el) { $('#form-error').textContent = msg || ''; if (el) el.focus(); }
form.addEventListener('submit', async e => {
  e.preventDefault(); if (!EDIT_ID && (patientCreating || patientCreateSaved || patientCreateUnknown)) return; formError('');
  const b = formData();
  if (!b.name) return formError('请填写患者姓名', field('name'));
  if (b.cardNo && !idInfo(b.cardNo)) return formError('身份证号格式不正确', field('cardNo'));
  if (!b.gender) return formError('请选择性别', form.querySelector('[name=gender]'));
  if (b.mobile && !/^1\d{10}$/.test(b.mobile)) return formError('手机号应为 11 位数字', field('mobile'));
  const bad = [...form.querySelectorAll('input[type=number]')].find(i => !i.closest('[hidden]') && !i.checkValidity());
  if (bad) return formError(`「${bad.closest('.form-field, .comorbid-option').querySelector('span').textContent.trim()}」超出合理范围`, bad);
  if (EDIT_ID) return saveEdit(b);
  const btn = $('#save'), token = ocrToken(); if (!ocrTokenCurrent(token)) return;
  const keptDraft = { ...(ocrDraftUsed || {}), mode: 'patient', fileIds: ocrSourceFiles(ocrDraftUsed) };
  ocrSaveDraft({ ...keptDraft, createPending: true }); patientCreating = true; btn.disabled = true; btn.textContent = '保存中…';
  try {
    const r = await apiPostJson('/api/ra/patient/createPatient', { transfer: false, basic: b, ocrFileIds: ocrSourceFiles(ocrDraftUsed) });
    if (!ocrTokenCurrent(token)) return;
    if (!r || typeof r.patientId !== 'string' || !/^[1-9]\d*$/.test(r.patientId)) throw new Error('保存响应的患者编号无效');
    showSavedPatient(r, keptDraft);
  } catch (ex) {
    if (!ocrTokenCurrent(token)) return;
    patientCreating = false;
    if (ocrKnownRejection(ex)) {
      ocrSaveDraft(keptDraft); formError(`保存失败：${apiErrorMessage(ex)}`); btn.disabled = false; btn.textContent = '保存建档';
      if (b.cardNo && /名下/.test(ex.message)) checkCard();
    } else {
      patientCreateUnknown = true; btn.disabled = true; btn.textContent = '请先核对保存结果';
      formError('保存结果未知，请到患者列表核对，勿重复提交。原图草稿已保留；确认已有患者后再处理原图关联。');
    }
  }
});

// ===== 编辑档案 =====
function changedKeys() {
  const now = formData(); delete now.acrEular;
  const keys = Object.keys(now).filter(k => JSON.stringify(now[k]) !== JSON.stringify(editInit[k]));
  if (acrState() !== acrInit) keys.push('acrEular');
  return keys;
}
function editBack() { return `patient-visits.html?id=${encodeURIComponent(EDIT_ID)}`; }
async function saveEdit(b) {
  const changed = changedKeys(); if (!changed.length) { formError('没有修改'); return; }
  const btn = $('#save'); btn.disabled = true; btn.textContent = '保存中…';
  try {
    const n = await apiPostJson('/api/ra/patient/updatePatient', { doctorId: currentDoctorId(), patientId: EDIT_ID, changed, basic: b });
    toastNext(n ? `已保存 ${n} 项修改` : '没有修改');
    if (canGoBack()) history.back(); else location.href = editBack();
  } catch (ex) { formError(`保存失败：${ex.message}`); btn.disabled = false; btn.textContent = '保存修改'; }
}
async function loadEdit() {
  form.querySelectorAll('input,select,button').forEach(el => el.disabled = true);
  for (const a of [$('#edit-back'), $('#edit-cancel'), $('#crumb-patient')]) bindBack(a, editBack());
  try {
    const r = await apiPost('/api/ra/patient/editForm', { doctorId: currentDoctorId(), patientId: EDIT_ID });
    const b = r.basic || {};
    form.querySelectorAll('input,select,button').forEach(el => el.disabled = false);
    $('#comorbid-pick').querySelectorAll('.since-year').forEach(y => y.disabled = true);
    document.title = `${b.name} · 编辑档案 · 中国中医风湿病注册研究信息平台`;
    $('#edit-title').textContent = `编辑患者档案 · ${b.name}`;
    $('#edit-sub').textContent = `ID号 ${r.patientId} · 研究编号 ${r.studyNo || '—'} · 只保存改动过的内容`;
    if (b.cardNo) field('cardNo').value = b.cardNo;
    prefill(b);
    if (b.marry == null) field('marry').value = '';
    [['diagnosisInformed', b.diagnosisInformed], ['consentSigned', b.consentSigned]].forEach(([n, v]) => { const x = v != null && form.querySelector(`[name=${n}][value="${v}"]`); if (x) x.checked = true; });
    (b.comorbidities || []).forEach(c => {
      const cb = $('#comorbid-pick').querySelector(`input[type=checkbox][value="${c.code}"]`); if (!cb) return;
      cb.checked = true; const y = cb.parentElement.querySelector('.since-year'); y.disabled = false; if (c.sinceYear) y.value = c.sinceYear;
      if (c.source === 'auto') { cb.disabled = true; cb.parentElement.title = '患者在该病种研究库建档，自动记入，不能取消'; }
    });
    if (b.acrEular) { acr = { ...b.acrEular }; delete acr.totalScore; showAcr(b.acrEular.totalScore); }
    else if (r.acrEularScore != null) { oldAcrScore = r.acrEularScore; showAcr(r.acrEularScore, '（老数据只有总分，没有各部分明细）'); }
    acrInit = acrState();
    if (b.cardNo) { const info = idInfo(b.cardNo); if (info) $('#card-hint').textContent = `${info.year} 年出生 · ${info.age} 岁`; }
    editInit = formData(); delete editInit.acrEular;
    refresh();
  } catch (e) { $('#edit-sub').textContent = ''; formError(`档案加载失败：${e.message}`); }
}
if (EDIT_ID) loadEdit();
refresh();
