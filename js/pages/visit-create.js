/* visit-create.html 页面脚本（依赖 boot.js → data.js → common.js → shared/patient-basic.js → shared/visit-form.js）
   新增随访（?id=患者ID）：
   - 基本信息：POST /api/ra/patient/patientDetail，显示与患者详情 / 访视详情一致（js/shared/patient-basic.js），默认收起、只读
   - 表单：POST /api/ra/visit/visitCreateForm（字段与编辑随访同一套字典；病史病情的发病 / 确诊时间取患者档案，随访时间 = 随访日期，首诊时间取最早一次随访）
   - 保存：POST /api/ra/visit/createVisit（JSON），成功后打开本次访视详情
   编辑已有随访用 visit-edit.html（带 ?visit= 进入本页时自动跳转）。 */
"use strict";
shell('patients');
const patientId = queryParam('id'), pid = encodeURIComponent(patientId || '');
if (queryParam('visit')) location.replace(`visit-edit.html?id=${pid}&visit=${encodeURIComponent(queryParam('visit'))}`);
const visitsUrl = withFrom(`patient-visits.html?id=${pid}`);
let form = null, dirty = false, saving = false;
document.querySelectorAll('.js-back-visits').forEach(a => bindBack(a, visitsUrl));
$('#back-visits').textContent = '← 返回';
$('#edit-profile').href = `patient-edit.html?id=${pid}`;
$('#ocr-import').onclick = () => toast('「OCR识别录入」功能正在开发中');
const showError = msg => { const e = $('#edit-error'); e.hidden = !msg; e.innerHTML = msg || ''; };

// 随访日期改了：病史病情的「随访时间」跟着改（医生没单独改过它时）
let lastDate = '';
$('#visit-date').addEventListener('change', e => {
  const f = vfFieldEl($('#edit-sections'), 'bsbq', 'followDate'), i = f && f.querySelector('.vf-input');
  if (i && (!i.value || i.value === lastDate)) i.value = e.target.value;
  lastDate = e.target.value; dirty = true;
});

$('#create-form').addEventListener('submit', async e => {
  e.preventDefault(); if (!form) return;
  const d = $('#visit-date').value;
  if (!d) { showError('请填写随访日期'); return; }
  if (d > ymd(TODAY)) { showError('随访日期不能晚于今天'); return; }
  const modules = vfCollect($('#edit-sections'));
  const btn = $('#save-create'); btn.disabled = true; btn.textContent = '保存中…'; showError(''); saving = true;
  try {
    const r = await apiPostJson('/api/ra/visit/createVisit', { doctorId: currentDoctorId(), patientId, visitDate: d, modules });
    dirty = false;
    toastNext(`已保存本次随访（填写了 ${r.filledCount} 个模块）`);
    location.replace(withFrom(`visit-detail.html?id=${pid}&visit=${encodeURIComponent(r.visitId)}`));
  } catch (ex) {
    saving = false; btn.disabled = false; btn.textContent = '保存本次随访';
    showError(`保存失败：${escapeHTML(ex.message)}`); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});
window.addEventListener('beforeunload', e => { if (dirty && !saving) { e.preventDefault(); e.returnValue = ''; } });

async function load() {
  if (!patientId) { showError('缺少患者 ID'); return; }
  $('#basic').open = false;
  const box = $('#basic-readonly');
  try {
    const params = { doctorId: currentDoctorId(), patientId };
    const [p, f] = await Promise.all([apiPost('/api/ra/patient/patientDetail', params), apiPost('/api/ra/visit/visitCreateForm', params)]);
    form = f;
    document.title = `${p.name} · 新增随访 · 患者数据研究平台`;
    $('#visit-title').textContent = `新增随访 · ${p.name}`;
    $('#visit-sub').textContent = `研究编号 ${p.studyNo || '—'} · 第 ${f.visitNo} 次随访${f.visitNo === 1 ? '（基线访视）' : ''} · 基本信息沿用患者档案，只录入本次随访内容`;
    box.innerHTML = patientTagsHTML(p) + patientBasicGridHTML(p) + patientHistoryHTML(p);
    bindPatientBasic(box, p);
    $('#visit-date').value = lastDate = f.visitDate; $('#visit-date').max = ymd(TODAY);
    $('#visit-type').textContent = `${f.visitType}（时间最早的一次随访为基线访视）`;
    vfRender($('#edit-sections'), f, { baseline: f.visitNo === 1, hint: '选填' });
    vfBind($('#edit-sections'), () => dirty = true);
    $('#save-create').disabled = false;
  } catch (e) {
    console.error(e);
    box.innerHTML = '';
    showError(`新增随访表单加载失败：${escapeHTML(e.message)}`);
  }
}
load();
