/* visit-create.html 页面脚本（依赖 boot.js → data.js → common.js → shared/patient-basic.js → shared/visit-form.js）
   新增随访（?id=患者ID）：
   - 基本信息：POST /api/ra/patient/patientDetail，显示与患者详情 / 访视详情一致（js/shared/patient-basic.js），默认收起、只读
   - 表单：POST /api/ra/visit/visitCreateForm（字段与编辑随访同一套字典；病史病情的发病 / 确诊时间取患者档案，随访时间 = 随访日期，首诊时间取最早一次随访）
   - 保存：POST /api/ra/visit/createVisit（JSON），成功后打开本次访视详情
   - OCR识别录入（js/shared/ocr-import.js）：识别结果填入随访日期和辅助检查；带 ?ocr=1 打开时（患者管理里识别后新建患者、详情页识别）自动填入草稿
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
$('#ocr-import').onclick = () => { const openedForm=form;if(openedForm)openOcrImport({mode:'visit',patientId,onApply:d=>{if(form===openedForm)applyOcr(d);}}); };
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
    if (!r || !RAPatientDetail.canonical(r.visitId) || !RAPatientDetail.canonical(r.patientId) || r.patientId !== patientId) throw new Error('保存响应的患者或随访 ID 无效，请刷新确认结果');
    dirty = false;
    if (ocrUsed) ocrClearDraft();
    toastNext(`已保存本次随访（填写了 ${r.filledCount} 个模块）`);
    location.replace(withFrom(`visit-detail.html?id=${pid}&visit=${encodeURIComponent(r.visitId)}`));
  } catch (ex) {
    saving = false; btn.disabled = false; btn.textContent = '保存本次随访';
    showError(`保存失败：${escapeHTML(ex.message)}`); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});
// OCR 识别结果填表：随访日期、辅助检查各项；填上的字段高亮，医生核对后保存
let ocrUsed = false;
function applyOcr(d) {
  if(!form)return;
  const box = $('#edit-sections'), labels = [];
  if (d.visitDate && d.visitDate <= ymd(TODAY)) { const i = $('#visit-date'); i.value = d.visitDate; i.dispatchEvent(new Event('change')); i.classList.add('ocr-filled'); }
  Object.entries(d.fzjc || {}).forEach(([k, v]) => { if (vfSetValue(box, 'fzjc', k, v)) labels.push(k); });
  ocrUsed = true; dirty = true;
  $('.ocr-banner')?.remove();
  ocrBanner($('#create-form'), `已用 OCR 识别结果预填${d.visitDate ? `随访日期 ${escapeHTML(d.visitDate)}、` : ''}辅助检查 ${labels.length} 项（蓝框标出），<b>请对照原图核对后保存</b>。<a href="${API_BASE + d.url}" target="_blank" rel="noopener">查看原图</a>`);
  const first = box.querySelector('.ocr-filled'); if (first) { first.closest('details')?.setAttribute('open', ''); }
}
window.addEventListener('beforeunload', e => { if (dirty && !saving) { e.preventDefault(); e.returnValue = ''; } });

let disposeBasic=null;
const detailOwner=RAPatientDetail.owner({
 clear(state,message){
  const ocr=document.getElementById('ocr-dialog');if(ocr){ocr.close();ocr.remove();}document.querySelectorAll('.ocr-banner').forEach(n=>n.remove());
  if(disposeBasic){disposeBasic();disposeBasic=null;}
  form=null;VF.form=null;VF.defs={};ocrUsed=false;dirty=false;document.title='新增随访 · 患者数据研究平台';
  $('#basic-readonly').innerHTML='';$('#edit-sections').innerHTML='';$('#visit-date').value='';
  $('#save-create').disabled=true;$('#visit-title').textContent='新增随访';$('#visit-title').setAttribute('data-state',state);$('#visit-sub').textContent='';
  $('#edit-profile').removeAttribute('href');$('#ocr-import').disabled=true;showError(message);
 },
 publish(data){
  const p=data.patient,f=data.related;form=f;showError('');$('#visit-title').setAttribute('data-state','success');$('#ocr-import').disabled=false;
  document.title=`${p.name} · 新增随访 · 患者数据研究平台`;
  $('#visit-title').textContent=`新增随访 · ${p.name}`;
  $('#visit-sub').textContent=`研究编号 ${p.studyNo||'—'} · ${f.visitNo===1?'基线访视':`第 ${f.visitNo-1} 次随访`} · 基本信息沿用患者档案，只录入本次随访内容`;
  $('#edit-profile').href=`patient-edit.html?id=${pid}`;
  $('#basic').open=false;const box=$('#basic-readonly');box.innerHTML=patientTagsHTML(p)+patientBasicGridHTML(p)+patientHistoryHTML(p);
  disposeBasic=bindPatientBasic(box,p);
  $('#visit-date').value=lastDate=f.visitDate;$('#visit-date').max=ymd(TODAY);
  $('#visit-type').textContent=`${f.visitType}（时间最早的一次随访为基线访视）`;
  vfRender($('#edit-sections'),f,{baseline:f.visitNo===1,hint:'选填'});vfBind($('#edit-sections'),()=>dirty=true);
  $('#save-create').disabled=false;
  const d=queryParam('ocr')&&ocrDraft();if(d&&(!d.patientId||d.patientId===patientId)&&ocrHasVisit(d))applyOcr(d);
  return disposeBasic;
 }
});
function load(){detailOwner.load(patientId,{route:'visitCreateForm'});}
window.addEventListener('pageshow',event=>{if(event.persisted)load();});
load();
