/* patient-visits.html 页面脚本（依赖 boot.js → data.js → common.js）
   数据来自后端：POST /api/ra/patient/patientDetail（基本信息 + 随访时间线）；基础信息的显示在 js/shared/patient-basic.js（与访视详情共用）
   「修改记录」展开时才请求 /api/ra/patient/auditLogs；身份证号明文点「眼睛」时请求 /api/ra/patient/patientSensitive。 */
"use strict";
const patientEntryParams=new URLSearchParams(location.search);
const aiPatientSource=patientEntryParams.getAll('from').includes('ai-cohort');
if(aiPatientSource){
 // 来源先分流：可信详情协议尚未接入，不能建立任何旧doctorId读取权。
 shell('ai');
 const ids=patientEntryParams.getAll('id'),from=patientEntryParams.getAll('from');
 const id=ids.length===1?ids[0]:'';
 const validId=/^[1-9][0-9]*$/.test(id)&&(id.length<19||(id.length===19&&id<='9223372036854775807'));
 const valid=validId&&from.length===1&&[...patientEntryParams.keys()].every(key=>key==='id'||key==='from');
 document.title='患者档案未加载 · 患者数据研究平台';
 $('#patient-basic').innerHTML=`<h1>患者档案未加载</h1><p>来源：AI 队列分析</p>${valid?`<p>患者 ID：${escapeHTML(id)}</p>`:'<p>入口参数无效，请返回 AI 队列重新选择。</p>'}<p>患者档案暂未接入可信身份，当前未加载患者数据</p>`;
 $('#visit-list').innerHTML='';$('#visit-total').textContent='';
 $('.visits-section-head').hidden=true;$('#audit').hidden=true;$('#audit').open=false;
 $('.app-footnote').textContent='AI 队列来源患者档案暂未接入可信身份；未请求或加载患者数据，不提供演示病程及编辑操作。';
 let safeHistory=false;
 try{const ref=new URL(document.referrer);safeHistory=ref.origin===location.origin&&ref.pathname===new URL('ai-cohort.html',location.href).pathname&&history.length>1;}catch(e){/* 无来源时使用固定安全目标。 */}
 for(const selector of ['#crumb-origin','#back-origin']){
  const link=$(selector);link.href='ai-cohort.html';link.textContent=selector==='#back-origin'?'← 返回 AI 队列分析':'AI 队列分析';
  link.onclick=event=>{event.preventDefault();if(safeHistory)history.back();else location.assign('ai-cohort.html');};
 }
}else{
shell(pageOrigin().nav);
{const o=pageOrigin(),c=$('#crumb-origin'),b=$('#back-origin');c.textContent=o.crumb;bindBack(c,o.href);b.textContent=`← 返回${o.label}`;bindBack(b,o.href);}
const patientId=queryParam('id');
const STATUS_TONE={active:'success',soon:'warning',overdue:'danger',pending_first:'neutral',withdrawn:'danger'};
let p=null;

function visitsSkeleton(){
 $('#patient-basic').innerHTML=`<div class="patient-basic-head"><div><i class="skeleton skeleton-title"></i><i class="skeleton skeleton-tags"></i></div><div class="heading-actions"><i class="skeleton skeleton-button"></i><i class="skeleton skeleton-button wide"></i></div></div><div class="skeleton-grid visits-basic-skeleton">${Array.from({length:15},()=>'<div><i class="skeleton skeleton-label"></i><i class="skeleton skeleton-value"></i></div>').join('')}</div>`;
 $('#visit-list').innerHTML=Array.from({length:2},()=>`<article class="visit-row visit-skeleton-row"><span class="skeleton skeleton-record"></span><span class="visit-skeleton-copy"><i class="skeleton skeleton-visit-title"></i><i class="skeleton skeleton-visit-sub"></i></span><i class="skeleton skeleton-chevron"></i></article>`).join('');
 $('#visit-total').innerHTML='<span class="skeleton skeleton-visit-total"></span>';
}
// 尚未接入后端的操作：先提示，避免只改了本机演示数据
const notReady=name=>toast(`「${name}」功能正在开发中`);

function renderVisitPage(){
 document.title=`${p.name} · 随访记录 · 患者数据研究平台`;
 const pid=encodeURIComponent(p.patientId), lost=p.followStatus==='withdrawn';
 // 按钮分组：查看分析 ｜ 录入编辑 ｜ 危险操作；姓名下的标签、基础信息卡片与访视详情页共用（js/shared/patient-basic.js）
 const actions=actionGroupsHTML([
  [`<a class="button" href="patient-insight.html?id=${pid}">病程分析</a>`,'<button class="button" id="ask-ai" type="button">问问AI</button>','<button class="button" id="download-all" type="button">下载病历</button>'],
  [`<a class="button" href="patient-edit.html?id=${pid}">编辑档案</a>`,'<button class="button ai-soft" id="paper-import" type="button">OCR识别录入</button>',`<a class="button primary" href="visit-create.html?id=${pid}">＋ 新增随访</a>`],
  [lost?'<button class="button" id="reactivate-btn" type="button" title="脱落的患者又回来继续随访">恢复随访</button>':'<button class="button danger-outline" id="withdraw-btn" type="button">标记脱落</button>']
 ]);
 $('#patient-basic').innerHTML=`<div class="patient-basic-head"><div class="patient-basic-title"><div class="patient-name-line"><h1>${escapeHTML(p.name)}</h1><span class="patient-followup-state ${STATUS_TONE[p.followStatus]||''}">${escapeHTML(p.followStatusLabel)}</span>${lost&&p.withdrawReason?`<span class="patient-dropout-reason">脱落原因：${escapeHTML(p.withdrawReason)}</span>`:''}</div>${patientTagsHTML(p)}</div>${actions}</div>
 ${patientBasicGridHTML(p)}${patientHistoryHTML(p)}`;

 // 随访时间线：最近的在前；时间最早的一次为基线访视
 const visits=p.visits||[];
 $('#visit-list').innerHTML=visits.length?visits.map(v=>{const href=withFrom(`visit-detail.html?id=${pid}&visit=${encodeURIComponent(v.visitId)}`);return `<article class="visit-row"><a class="visit-row-main" href="${href}"><span class="record-icon">${icon('record')}</span><span><strong>${escapeHTML(v.visitType)}</strong><time>${escapeHTML(v.visitDate||'日期未填')}</time><small>${v.doctorName?`记录医生 ${escapeHTML(v.doctorName)}`:v.doctorId?`记录医生 ID ${escapeHTML(v.doctorId)}`:''}</small></span></a><div class="visit-row-status"><a class="visit-chevron-link" aria-label="查看本次随访详情" href="${href}">${icon('chevron','chevron')}</a></div></article>`}).join(''):'<p class="audit-empty">暂无随访记录，点击右上角「＋ 新增随访」录入基线访视。</p>';
 $('#visit-total').textContent=`${visits.length} 次访视`;

 $('#download-all').onclick=()=>notReady('下载病历');
 $('#ask-ai').onclick=()=>notReady('问问AI');
 $('#paper-import').onclick=()=>notReady('OCR识别录入');
 const wb=$('#withdraw-btn');if(wb)wb.onclick=withdrawDialog;
 const rb=$('#reactivate-btn');if(rb)rb.onclick=reactivateDialog;
 bindPatientBasic($('#patient-basic'),p);
}

// 标记脱落：选原因（选「其他」时说明必填）→ POST /api/ra/patient/withdraw；成功后重新加载，按钮变「恢复随访」
const WITHDRAW_OPTIONS=['失访','撤回知情同意','不良事件','死亡','其他'];
function formDialog(title,body,okText,danger,onOk){
 const d=document.createElement('dialog');d.className='ra-confirm ra-form-dialog';
 d.innerHTML=`<form method="dialog"><h2>${escapeHTML(title)}</h2>${body}<p class="ra-form-error" hidden></p><div class="ra-confirm-actions"><button class="button" value="cancel" formnovalidate>取消</button><button class="button ${danger?'danger':'primary'}" value="ok">${escapeHTML(okText)}</button></div></form>`;
 document.body.appendChild(d);d.addEventListener('close',()=>d.remove());
 const form=d.querySelector('form'),err=d.querySelector('.ra-form-error'),ok=d.querySelector('[value=ok]');
 form.addEventListener('submit',async e=>{
  if(e.submitter&&e.submitter.value!=='ok')return;
  e.preventDefault();err.hidden=true;ok.disabled=true;
  try{await onOk(form);d.close()}catch(x){err.textContent=x.message;err.hidden=false}finally{ok.disabled=false}
 });
 d.showModal();return d;
}
function withdrawDialog(){
 const d=formDialog('标记脱落',`<p>患者：${escapeHTML(p.name)}（ID号 ${escapeHTML(p.patientId)}）。标记后不再推算下次随访，之后患者回来可点「恢复随访」。</p>
  <fieldset class="ra-form-field"><legend>脱落原因 <em>*</em></legend><div class="ra-radio-row">${WITHDRAW_OPTIONS.map(o=>`<label><input type="radio" name="reason" value="${o}" required> ${o}</label>`).join('')}</div></fieldset>
  <label class="ra-form-field"><span>补充说明 <small>选「其他」时必填</small></span><textarea name="remark" rows="3" maxlength="200" placeholder="如：连续 2 次电话随访未联系上"></textarea></label>`,'确认脱落',true,async form=>{
  const reason=(form.querySelector('[name=reason]:checked')||{}).value,remark=form.remark.value.trim();
  if(!reason)throw new Error('请选择脱落原因');
  if(reason==='其他'&&!remark)throw new Error('选「其他」时请填写说明');
  await apiPost('/api/ra/patient/withdraw',{doctorId:currentDoctorId(),patientId:p.patientId,reason,remark});
  toast('已标记脱落');reloadPatient();
 });
 d.querySelectorAll('[name=reason]').forEach(r=>r.addEventListener('change',()=>{d.querySelector('[name=remark]').required=r.value==='其他'&&r.checked}));
}
// 恢复随访：脱落的患者又回来继续随访 → POST /api/ra/patient/reactivate（原脱落原因保留在修改记录里）
function reactivateDialog(){
 formDialog('恢复随访',`<p>患者「${escapeHTML(p.name)}」${p.withdrawReason?`（脱落原因：${escapeHTML(p.withdrawReason)}）`:''}重新回来继续随访？恢复后状态按随访记录重新计算。</p>
  <label class="ra-form-field"><span>说明 <small>选填</small></span><textarea name="remark" rows="2" maxlength="200" placeholder="如：患者 2026-10 复诊，继续入组随访"></textarea></label>`,'恢复随访',false,async form=>{
  await apiPost('/api/ra/patient/reactivate',{doctorId:currentDoctorId(),patientId:p.patientId,remark:form.remark.value.trim()});
  toast('已恢复随访');reloadPatient();
 });
}
async function reloadPatient(){
 try{p=await apiPost('/api/ra/patient/patientDetail',{doctorId:currentDoctorId(),patientId});renderVisitPage()}catch(e){toast(`刷新失败：${e.message}`)}
 auditLoaded=false;$('#audit-count').textContent='';if($('#audit').open)loadAudit();
}

// 修改记录：默认收起，第一次展开时才查询；老数据没有记录，显示「暂无修改记录」
const AUDIT_TONE={'新建档案':'new','新增随访':'new','编辑随访':'edit','修改档案':'edit','质控处理':'qc','质控发起':'qc','标记脱落':'warn','恢复随访':'new','删除随访':'warn'};
let auditLoaded=false;
async function loadAudit(){
 if(auditLoaded||!p)return;auditLoaded=true;
 const box=$('#audit-list');box.innerHTML='<li class="audit-empty">正在查询修改记录…</li>';
 try{
  const list=await apiPost('/api/ra/patient/auditLogs',{doctorId:currentDoctorId(),patientId:p.patientId})||[];
  $('#audit-count').textContent=list.length?`${list.length} 条`:'';
  // 「字段：旧 → 新」高亮显示修改前后
  const detail=d=>escapeHTML(d||'').split('；').map(part=>part.replace(/(.+?)：(.+?) → (.+)/,(m,k,a,b)=>`${k}：<del>${a}</del> → <ins>${b}</ins>`)).map(x=>`<span>${x}</span>`).join('');
  box.innerHTML=list.length?list.map(a=>`<li><time>${escapeHTML(a.time)}</time><b class="audit-tag ${AUDIT_TONE[a.action]||'edit'}">${escapeHTML(a.action)}</b><div class="audit-detail">${detail(a.detail)}</div><em>${escapeHTML(a.operator||'')}</em></li>`).join(''):'<li class="audit-empty">暂无修改记录</li>';
 }catch(e){auditLoaded=false;box.innerHTML=`<li class="audit-empty">修改记录加载失败：${escapeHTML(e.message)}（收起后再展开可重试）</li>`}
}
$('#audit').open=false;
$('#audit').addEventListener('toggle',()=>{if($('#audit').open)loadAudit()});

async function load(){
 visitsSkeleton();
 if(!patientId){renderLoadError('缺少患者 ID');return}
 try{
  p=await apiPost('/api/ra/patient/patientDetail',{doctorId:currentDoctorId(),patientId});
  renderVisitPage();flashHashTarget();
  if($('#audit').open)loadAudit();
 }catch(e){console.error(e);renderLoadError(e.message)}
}
function renderLoadError(msg){
 $('#patient-basic').innerHTML=`<p class="pv-load-error">患者详情加载失败：${escapeHTML(msg)}。请确认后端服务已启动（${escapeHTML(API_BASE)}），或返回患者列表重新选择。</p>`;
 $('#visit-list').innerHTML='';$('#visit-total').textContent='';
}
load();

}
