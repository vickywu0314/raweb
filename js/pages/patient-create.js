/* patient-create.html 页面脚本（依赖 boot.js → data.js → common.js）
   新增患者：基本信息与患者详情页一致；ACR/EULAR 2010 在弹窗里评估，结果回显到基本信息。
   - 填完身份证号：POST /api/ra/patient/checkCardNo 查重（已在名下 / 其他医生名下可转入 / 其他病种复用档案）
   - 保存：POST /api/ra/patient/createPatient（JSON），成功后打开患者详情 */
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

field('nation').innerHTML = '<option value="">请选择</option>' + NATIONS.map(n => `<option>${n}</option>`).join('');
$('#comorbid-pick').innerHTML = COMORBID_CODES.map(c => `<label class="comorbid-option"><input type="checkbox" value="${c}"><span>${c} ${escapeHTML((COMORBIDITY_INFO[c] || {}).name || '')}</span><input type="number" class="since-year" min="1900" max="${TODAY.getFullYear()}" placeholder="起病年份" aria-label="${c} 起病年份" disabled></label>`).join('');
$('#comorbid-pick').addEventListener('change', e => { if (e.target.type === 'checkbox') { const y = e.target.parentElement.querySelector('.since-year'); y.disabled = !e.target.checked; if (!e.target.checked) y.value = ''; } });
$('#ocr-import').onclick = () => alert('「OCR识别录入」功能正在开发中，暂不可用。');

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
  if (!confirm(`患者已存在：${x.name}（ID号 ${x.patientId}）在 ${x.otherDoctorName} 名下。\n\n确认要把该患者转到自己名下吗？转入后原医生将不再看到该患者。`)) return;
  try {
    const r = await apiPostJson('/api/ra/patient/createPatient', { doctorId: currentDoctorId(), transfer: true, basic: { name: x.name, cardNo: field('cardNo').value.trim(), gender: 1 } });
    alert('已转到您名下，即将打开患者详情');
    location.href = `patient-visits.html?id=${encodeURIComponent(r.patientId)}`;
  } catch (e) { alert(`转入失败：${e.message}`); }
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

// ===== 联动：BMI、血压提示、吸烟明细 =====
function refresh() {
  const h = +field('height').value / 100, w = +field('weight').value;
  $('#bmi').textContent = h > 0 && w > 0 ? (w / h / h).toFixed(1) : '—';
  const s = +field('systolic').value, d = +field('diastolic').value;
  $('#bp-hint').textContent = s && d && s <= d ? '收缩压应高于舒张压，请检查是否填反' : '';
  const smoking = form.querySelector('[name=smoke]:checked')?.value === '1';
  form.querySelectorAll('.smoke-detail').forEach(el => el.hidden = !smoking);
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
});
$('#acr-clear').onclick = () => { acr = null; $('#acr-result').textContent = '未评估'; $('#acr-result').className = 'acr-result'; $('#acr-open').textContent = '填写评估'; $('#acr-clear').hidden = true; };

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
    followCycle: +field('followCycle').value, acrEular: acr,
    comorbidities: [...$('#comorbid-pick').querySelectorAll('input[type=checkbox]:checked')].map(c => { const y = c.parentElement.querySelector('.since-year').value; return { code: c.value, sinceYear: y ? +y : null }; })
  };
}
function formError(msg, el) { $('#form-error').textContent = msg || ''; if (el) el.focus(); }
form.addEventListener('submit', async e => {
  e.preventDefault(); formError('');
  const b = formData();
  if (!b.name) return formError('请填写患者姓名', field('name'));
  if (b.cardNo && !idInfo(b.cardNo)) return formError('身份证号格式不正确', field('cardNo'));
  if (!b.gender) return formError('请选择性别', form.querySelector('[name=gender]'));
  if (b.mobile && !/^1\d{10}$/.test(b.mobile)) return formError('手机号应为 11 位数字', field('mobile'));
  const bad = [...form.querySelectorAll('input[type=number]')].find(i => !i.closest('[hidden]') && !i.checkValidity());
  if (bad) return formError(`「${bad.closest('.form-field, .comorbid-option').querySelector('span').textContent.trim()}」超出合理范围`, bad);
  const btn = $('#save'); btn.disabled = true; btn.textContent = '保存中…';
  try {
    const r = await apiPostJson('/api/ra/patient/createPatient', { doctorId: currentDoctorId(), transfer: false, basic: b });
    alert(r.action === 'linked' ? `已加入 RA 研究库（研究编号 ${r.studyNo || '—'}），即将打开患者详情` : `建档成功，研究编号 ${r.studyNo}，即将打开患者详情`);
    location.href = `patient-visits.html?id=${encodeURIComponent(r.patientId)}`;
  } catch (ex) {
    formError(`保存失败：${ex.message}`);
    btn.disabled = false; btn.textContent = '保存建档';
    if (b.cardNo && /名下/.test(ex.message)) checkCard();   // 期间被别人建档或转入：重新查重
  }
});
refresh();
