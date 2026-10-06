/* visit-create.html 页面脚本（依赖 boot.js → data.js → common.js → shared/crf-schema.js → shared/case-form.js → shared/patient-basic.js）
   新增随访（?id=患者ID）：
   - 基本信息：POST /api/ra/patient/patientDetail，显示与患者详情 / 访视详情一致（js/shared/patient-basic.js），默认收起、只读
   - 随访信息表单：仍为前端演示表单，可暂存草稿（本机浏览器）；「保存本次随访」的后端接口未完成，暂不写库
   编辑已有随访已改为 visit-edit.html（带 ?visit= 进入本页时自动跳转）。 */
"use strict";
document.addEventListener('DOMContentLoaded', () => {
  shell('patients');
  const patientId = queryParam('id'), pid = encodeURIComponent(patientId || '');
  if (queryParam('visit')) { location.replace(`visit-edit.html?id=${pid}&visit=${encodeURIComponent(queryParam('visit'))}`); return; }
  const back = `patient-visits.html?id=${pid}`;
  document.querySelectorAll('.js-back-visits').forEach(a => a.href = back);

  // 基本信息（只读）：默认收起，医生自己决定是否展开
  const basic = document.getElementById('basic'), box = document.getElementById('basic-readonly');
  basic.open = false;
  apiPost('/api/ra/patient/patientDetail', { doctorId: currentDoctorId(), patientId }).then(p => {
    const nth = (p.visits || []).length + 1;
    document.title = `${p.name} · 新增随访 · 患者数据研究平台`;
    document.getElementById('visit-title').textContent = `新增随访 · ${p.name}`;
    document.getElementById('visit-sub').textContent = `研究编号 ${p.studyNo || '—'} · 第 ${nth} 次随访${nth === 1 ? '（基线访视）' : ''} · 基本信息沿用患者档案，只录入本次随访内容；未完成内容可暂存草稿。`;
    box.innerHTML = patientTagsHTML(p) + patientBasicGridHTML(p) + patientHistoryHTML(p);
    bindPatientBasic(box, p);
  }).catch(e => {
    box.innerHTML = `<p class="locked-loading">患者基础信息加载失败：${escapeHTML(e.message)}。请确认后端服务已启动（${escapeHTML(API_BASE)}）。</p>`;
  });

  document.getElementById('ocr-import').onclick = () => alert('「OCR识别录入」功能正在开发中，暂不可用。');

  // 随访信息表单（演示）：可暂存草稿；保存接口完成前不写库
  const form = document.querySelector('#create-form');
  const vd = form.querySelector('[name="visitDate"]');
  if (vd && !vd.value) vd.value = ymd(new Date());
  refreshCaseForm(form);
  const first = document.getElementById('history'); if (first) first.open = true;

  initCaseForm({
    draftKey: `visit-new:${patientId}`,
    onSubmit() {
      alert('「保存本次随访」的后端接口正在开发中，暂不能写入数据库。\n已填写的内容可以先点「暂存草稿」保存在本机浏览器。');
      return false;
    }
  });
});
