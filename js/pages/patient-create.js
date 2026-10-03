/* patient-create.html 页面脚本（依赖 boot.js → data.js → common.js → shared/crf-schema.js → shared/case-form.js）
   保存 = 接口 PT02：{ studyId, patient:{…基本信息、常见相关疾病}, baselineVisit:{…七个病例模块} } */
"use strict";
const METHOD_LABEL = Object.fromEntries(CRF_FIELDS.find(f => f.key === 'method').options.map(o => [o.value, o.label]));
const subtypeLabel = v => v ? crfOptionLabel(CRF_FIELDS.find(f => f.key === 'subtype'), v).replace(/（.*$/, '') : null;
document.addEventListener('DOMContentLoaded', () => {
  shell('patients');
  const form = document.querySelector('#create-form');
  form.querySelector('#basic .form-grid').insertAdjacentHTML('beforeend', comorbidEditorHTML());
  bindComorbidEditor(form);
  const defaults = serializeSections(form);
  initCaseForm({
    draftKey: 'patient-create',
    // 保存：新患者写入本机演示数据；录入了病例模块时，同时生成首次（基线）访视
    onSubmit(form) {
      const v = n => (form.querySelector(`#basic [name="${n}"]`)?.value || '').trim();
      const maxId = Math.max(...patients.map(p => +p.id || 0)), id = v('patientId') || String(maxId + 17);
      if (patients.some(p => p.id === id)) { caseToast(`ID号 ${id} 已存在，请更换`); return false; }
      const code = v('studyNo') || 'RA-2026-' + String(101 + patients.length * 3).padStart(4, '0');
      if (patients.some(p => p.code === code)) { caseToast(`研究编号 ${code} 已存在，请更换`); return false; }
      const data = serializeSections(form), hasCase = diffCount(data, defaults) > 0;
      const today = ymd(new Date()), visitDate = hasCase ? (data.visitDate || today) : null;
      const cm = readComorbid(form), u = currentUser();
      const p = { id, name: v('name'), center: '北京协和医院', phone: v('phone'), identityNo: v('idcard'), maritalStatus: v('marital'), ethnicity: v('ethnicity') || '',
        sex: form.querySelector('[name="sex"]:checked')?.value || '女', birth: v('birth') || null, year: v('birth') ? +v('birth').slice(0, 4) : 1970,
        height: v('height') ? +v('height') : null, weight: v('weight') ? +v('weight') : null,
        code, subtype: hasCase ? subtypeLabel(data.history?.subtype) : null, das28: hasCase ? (data.assessment?.das28Crp ?? null) : null,
        visits: hasCase ? 1 : 0, last: visitDate, due: false, incomplete: true, missing: '缺 DAS28 评分', abnormal: false, lost: false,
        followCycle: +v('followCycle') || 6, followStart: v('followStart') || visitDate || today, comorbid: cm.comorbid, comorbidNone: cm.none, created: today };
      { const m = caseMissing(p, hasCase ? data : null); p.incomplete = !!m; p.missing = m || ''; }
      store.added.push(p);
      if (hasCase) store.visits[id] = [{ id: 'n' + Date.now(), type: '基线访视', date: visitDate, method: METHOD_LABEL[data.method] || '门诊随访', doctor: u ? u.name : '陈医生', status: 'completed', summary: data.caseRecord?.note || '完成建档与基线资料采集。', dropout: false, dropoutReasons: [], form: data, entries: describeEntries(data) }];
      saveStore();
      audit(id, '新建档案', `${p.name} · ${p.code} · 随访周期：${cycleLabel(p.followCycle)}${hasCase ? ' · 同时录入基线访视（填写 ' + diffCount(defaults, data) + ' 项）' : ''}`);
      setTimeout(() => location.href = `patient-visits.html?id=${encodeURIComponent(id)}`, 1200);
      return `患者「${p.name}」已建档（保存在本机浏览器，演示用）`;
    }
  });
});
