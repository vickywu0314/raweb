/* visit-edit.html 页面脚本（依赖 boot.js → data.js → common.js）
   编辑已有随访：基本信息只读；随访日期和 7 个病历模块可改。
   数据：POST /api/ra/patient/patientDetail（基本信息）、POST /api/ra/visit/visitEditForm（表单）、POST /api/ra/visit/updateVisit（保存，JSON）。
   表单的渲染、联动、收集与新增随访共用 js/shared/visit-form.js。
   后端只写有变化的字段并保持老系统数据结构；关节数、DAS28、HAQ 得分保存时由后端按老系统算法自动计算。 */
"use strict";
shell('patients');
const patientId=queryParam('id'), visitId=queryParam('visit');
const detailUrl=withFrom(`visit-detail.html?id=${encodeURIComponent(patientId||'')}&visit=${encodeURIComponent(visitId||'')}`);
const visitsUrl=withFrom(`patient-visits.html?id=${encodeURIComponent(patientId||'')}`);
let form=null, p=null, dirty=false, saving=false, preparing=false;
$('#crumb-visits').href=visitsUrl;$('#crumb-detail').href=detailUrl;$('#cancel-edit').href=detailUrl;bindBack($('#back-detail'),detailUrl);

const val=x=>escapeHTML(x==null||x===''?'未提供':x);
const showError=msg=>{const e=$('#edit-error');e.hidden=!msg;e.innerHTML=msg||''};

function render(){
 document.title=`${p.name} · 编辑随访 · 中国中医风湿病注册研究信息平台`;
 $('#visit-title').textContent=`编辑随访 · ${p.name}`;
 $('#visit-sub').textContent=`研究编号 ${p.studyNo||'—'} · ${form.visitType} ${form.visitDate||''} · 保存后会写入该患者的修改记录`;
 $('#edit-profile').href=`patient-edit.html?id=${encodeURIComponent(p.patientId)}&back=visit`;
 const birth=p.birthYear==null?'未知':`${p.birthYear} 年（${p.age} 岁）`;
 $('#basic-readonly').innerHTML=[['患者姓名',p.name],['性别',p.sex],['出生年份',birth],['民族',p.nation],['婚史',p.marryLabel],['患者手机号',p.mobile],['患者身份证号',p.cardNoMasked],['研究编号',p.studyNo],['ID号',p.patientId],['随访周期',cycleLabel(p.followCycle)],['随访观察起始',p.followStartDate]].map(([k,v])=>`<div><span>${k}</span><b>${val(v)}</b></div>`).join('');
 $('#visit-date').value=form.visitDate||'';$('#visit-date').max=ymd(TODAY);
 $('#visit-type').textContent=`${form.visitType}（时间最早的一次随访为基线访视）`;
 vfRender($('#edit-sections'),form,{baseline:form.visitType==='基线访视'});
 $('#save-edit').disabled=false;
}

// 收集表单（js/shared/visit-form.js）：只有可编辑模块；后端会和数据库比对，只写有变化的字段
function collect(){
 return {doctorId:currentDoctorId(),visitId:form.visitId,version:form.version,visitDate:$('#visit-date').value,modules:vfCollect($('#edit-sections'))};
}
vfBind($('#edit-sections'),()=>dirty=true);
$('#edit-form').addEventListener('input',()=>dirty=true);
$('#edit-form').addEventListener('change',()=>dirty=true);
window.addEventListener('beforeunload',e=>{if(dirty&&!saving){e.preventDefault();e.returnValue=''}});

$('#edit-form').addEventListener('submit',async e=>{
 e.preventDefault();if(!form||saving||preparing)return;
 const d=$('#visit-date').value;
 if(!d){showError('请填写随访日期');return}
 if(d>ymd(TODAY)){showError('随访日期不能晚于今天');return}
 const openedForm=form,payload=collect();preparing=true;
 try{await vfPrepareSubmission($('#edit-sections'),payload.modules);}
 catch(error){if(form===openedForm){showError(escapeHTML(error.message));vfFocusInvalid(error);}return;}
 finally{if(form===openedForm)preparing=false;}
 if(form!==openedForm)return;
 if($('#visit-date').value!==d){showError('随访日期已变化，请重新核对后保存');return;}
 const btn=$('#save-edit');btn.disabled=true;btn.textContent='保存中…';showError('');saving=true;
 try{
  const r=await apiPostJson('/api/ra/visit/updateVisit',payload);
  dirty=false;
  if(!r.changedCount){toast('没有修改内容');btn.disabled=false;btn.textContent='保存修改';saving=false;return}
  toastNext(`已保存 ${r.changedCount} 项修改`);
  location.replace(detailUrl);
 }catch(ex){
  saving=false;btn.disabled=false;btn.textContent='保存修改';
  showError(/已被修改/.test(ex.message)?`${escapeHTML(ex.message)} <button type="button" class="button compact" onclick="location.reload()">刷新</button>`:`保存失败：${escapeHTML(ex.message)}`);
  window.scrollTo({top:0,behavior:'smooth'});
 }
});

const detailOwner=RAPatientDetail.owner({
 clear(state,message){
  vfCancelConfirmations();
  form=null;p=null;VF.form=null;VF.defs={};dirty=false;preparing=false;document.title='编辑随访 · 中国中医风湿病注册研究信息平台';
  $('#basic-readonly').innerHTML='';$('#edit-sections').innerHTML='';$('#visit-date').value='';
  $('#save-edit').disabled=true;$('#visit-title').textContent='编辑随访';$('#visit-title').setAttribute('data-state',state);$('#visit-sub').textContent='';
  $('#edit-profile').removeAttribute('href');showError(message);
 },
 publish(data){p=data.patient;form=data.related;$('#visit-title').setAttribute('data-state','success');showError('');render();}
});
function load(){detailOwner.load(patientId,{route:'visitEditForm',visitId});}
window.addEventListener('pageshow',event=>{if(event.persisted)load();});
load();
