/* 修改记录（患者详情、访视详情共用；依赖 common.js）
   POST /api/ra/patient/auditLogs 取该患者的修改记录，最新的在前；默认收起，第一次展开时才查询。
   访视详情传 visitId，只显示这次随访的记录（新增 / 编辑随访等）。老数据没有记录时显示「暂无修改记录」。 */
"use strict";

const AUDIT_TONE = { '新建档案': 'new', '转入名下': 'new', '新增随访': 'new', '恢复随访': 'new', '编辑随访': 'edit', '修改档案': 'edit', '质控处理': 'qc', '质控发起': 'qc', '标记脱落': 'warn', '删除随访': 'warn' };
// 「字段：旧 → 新」高亮显示修改前后
const auditDetailHTML = d => escapeHTML(d || '').split('；').map(part => part.replace(/(.+?)：(.+?) → (.+)/, (m, k, a, b) => `${k}：<del>${a}</del> → <ins>${b}</ins>`)).map(x => `<span>${x}</span>`).join('');

// panel：<details class="audit-panel">，内含 .audit-count 和 .audit-list；返回 reload()，数据有变化（如标记脱落）后调用
function bindAuditPanel(panel, patientId, visitId) {
  const box = panel.querySelector('.audit-list'), count = panel.querySelector('.audit-count');
  let loaded = false, disposed = false, generation = 0;
  async function load() {
    if (disposed || loaded) return; loaded = true;
    const token=++generation, active=()=>!disposed&&panel.open&&generation===token;
    box.innerHTML = '<li class="audit-empty">正在查询修改记录…</li>';
    try {
      let list = await apiPost('/api/ra/patient/auditLogs', { doctorId: currentDoctorId(), patientId }) || [];
      if(!active())return;
      if (visitId != null) list = list.filter(a => String(a.visitId) === String(visitId));
      count.textContent = list.length ? `${list.length} 条` : '';
      box.innerHTML = list.length ? list.map(a => `<li><time>${escapeHTML(a.time)}</time><b class="audit-tag ${AUDIT_TONE[a.action] || 'edit'}">${escapeHTML(a.action)}</b><div class="audit-detail">${auditDetailHTML(a.detail)}</div><em>${escapeHTML(a.operator || '')}</em></li>`).join('')
        : `<li class="audit-empty">${visitId != null ? '这次随访暂无修改记录（新系统上线前的修改没有记录）' : '暂无修改记录'}</li>`;
    } catch (e) { if(!active())return;loaded = false; box.innerHTML = `<li class="audit-empty">修改记录加载失败：${escapeHTML(e.message)}（收起后再展开可重试）</li>`; }
  }
  const clear=()=>{generation++;loaded=false;box.innerHTML='';count.textContent='';};
  const toggle=()=>{if(disposed)return;if(panel.open)load();else clear();};
  panel.open=false;panel.addEventListener('toggle',toggle);
  const reload=()=>{if(disposed)return;clear();if(panel.open)load();};
  reload.dispose=()=>{if(disposed)return;disposed=true;clear();panel.open=false;panel.removeEventListener('toggle',toggle);};
  return reload;
}
