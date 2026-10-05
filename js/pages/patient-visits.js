/* patient-visits.html 页面脚本（依赖 boot.js → data.js → common.js）
   数据来自后端：POST /api/ra/patient/patientDetail（基本信息 + 随访时间线）
   「修改记录」展开时才请求 /api/ra/patient/auditLogs；身份证号明文点「眼睛」时请求 /api/ra/patient/patientSensitive。 */
"use strict";shell(pageOrigin().nav);
{const o=pageOrigin(),c=$('#crumb-origin'),b=$('#back-origin');c.textContent=o.crumb;bindBack(c,o.href);b.textContent=`← 返回${o.label}`;bindBack(b,o.href);}
const patientId=queryParam('id');
const STATUS_TONE={active:'success',soon:'warning',overdue:'danger',pending_first:'neutral',withdrawn:'danger'};
let p=null;

function visitsSkeleton(){
 $('#patient-basic').innerHTML=`<div class="patient-basic-head"><div><i class="skeleton skeleton-title"></i><i class="skeleton skeleton-tags"></i></div><div class="heading-actions"><i class="skeleton skeleton-button"></i><i class="skeleton skeleton-button wide"></i></div></div><div class="skeleton-grid visits-basic-skeleton">${Array.from({length:15},()=>'<div><i class="skeleton skeleton-label"></i><i class="skeleton skeleton-value"></i></div>').join('')}</div>`;
 $('#visit-list').innerHTML=Array.from({length:2},()=>`<article class="visit-row visit-skeleton-row"><span class="skeleton skeleton-record"></span><span class="visit-skeleton-copy"><i class="skeleton skeleton-visit-title"></i><i class="skeleton skeleton-visit-sub"></i></span><i class="skeleton skeleton-chevron"></i></article>`).join('');
 $('#visit-total').innerHTML='<span class="skeleton skeleton-visit-total"></span>';
}
const val=v=>escapeHTML(v==null||v===''?'未提供':v);
// 尚未接入后端的操作：先提示，避免只改了本机演示数据
const notReady=name=>alert(`「${name}」功能的后端接口正在开发中，暂不可用。`);

// 常见相关疾病（patient_comorbidity）；弹窗沿用 openComorbidity(code, p)
function comorbidPatient(){const comorbid={};(p.comorbidities||[]).forEach(c=>{if(c.sinceYear)comorbid[c.code]={since:c.sinceYear,status:c.status||'暂无记录',core:c.coreItems||[],treatment:c.treatment||'暂无记录'}});return {id:String(p.patientId),name:p.name,comorbid}}
function relatedDiseases(){const cs=(p.comorbidities||[]).filter(c=>COMORBIDITY_INFO[c.code]);if(!cs.length)return '<p>无</p><small>暂未记录常见相关疾病（FM / AS 等）</small>';
 return `<div class="related-list">${cs.map(c=>`<article class="related-item"><div class="related-head"><button type="button" class="comorbid-chip" data-comorbid="${escapeHTML(c.code)}">${escapeHTML(c.code)} ${escapeHTML(c.name)}</button><span class="related-since">${c.sinceYear?`${c.sinceYear} 年起 · 病程约 ${TODAY.getFullYear()-c.sinceYear} 年`:'起病年份未填'}</span>${c.status?`<span class="related-status">${escapeHTML(c.status)}</span>`:''}</div><dl><div><dt>核心指标</dt><dd>${(c.coreItems||[]).map(escapeHTML).join('；')||'—'}</dd></div><div><dt>治疗</dt><dd>${escapeHTML(c.treatment||'—')}</dd></div></dl><button type="button" class="related-more" data-comorbid="${escapeHTML(c.code)}">查看病程简要 →</button></article>`).join('')}</div><small>已记录 ${cs.length} 项 · 点击病种查看病程简要，或进入对应研究库</small>`}
function nextDueText(){if(!p.nextDueDate)return '';const n=p.nextDueDays,st=n<0?'overdue':n<=14?'soon':'later';return `<small class="next-due ${st}">下次 ${escapeHTML(p.nextDueDate)}${n<0?` · 已逾期 ${-n} 天`:n<=14?` · ${n} 天后`:''}</small>`}
const EYE=`<svg class="eye-icon eye-open" aria-hidden="true" viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg><svg class="eye-icon eye-closed" aria-hidden="true" viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 6.2A10.6 10.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17.8 17.8 0 0 1-3.1 3.8M6.1 6.1C3.8 7.8 2.5 12 2.5 12s3.5 6 9.5 6a9.7 9.7 0 0 0 3.1-.5M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`;

function renderVisitPage(){
 document.title=`${p.name} · 随访记录 · 患者数据研究平台`;
 const pid=encodeURIComponent(p.patientId), lost=p.followStatus==='withdrawn';
 const birth=p.birthYear==null?'出生年份未知':`${p.birthYear}年出生（${p.age} 岁）`;
 const otherHistory=[p.pastHistory?escapeHTML(p.pastHistory):'',p.incomplete?`资料待补全：${escapeHTML((p.missingItems||[]).join('、'))}`:''].filter(Boolean);
 $('#patient-basic').innerHTML=`<div class="patient-basic-head"><div class="patient-basic-title"><div class="patient-name-line"><h1>${escapeHTML(p.name)}</h1><span class="patient-followup-state ${STATUS_TONE[p.followStatus]||''}">${escapeHTML(p.followStatusLabel)}</span>${lost&&p.withdrawReason?`<span class="patient-dropout-reason">脱落原因：${escapeHTML(p.withdrawReason)}</span>`:''}</div><div class="basic-tags">${badge(`研究编号: ${p.studyNo||'—'}`,'neutral')}${badge(`ID号: ${p.patientId}`,'neutral')}${p.subtype?badge(`疾病分型: ${p.subtype}`):badge('疾病分型: 待补充','neutral')}${p.sex?badge(p.sex,'neutral'):''}${badge(birth,'neutral')}</div></div><div class="heading-actions"><a class="button primary" href="patient-insight.html?id=${pid}">病程分析</a><button class="button" id="ask-ai" type="button">问问AI</button><button class="button" id="download-all" type="button">下载病历</button>${lost?'':'<button class="button danger-outline" id="withdraw-btn" type="button">标记脱落</button>'}<a class="button" href="patient-edit.html?id=${pid}">编辑档案</a><button class="button ai-soft" id="paper-import" type="button">AI纸质病历拍照导入</button><a class="button primary" href="visit-create.html?id=${pid}">＋ 新增随访</a></div></div>
 <div class="reference-basic-grid compact"><div><span>患者手机号</span><b>${val(p.mobile)}</b></div><div><span>患者身份证号</span><b class="identity-value"><span id="identity-number">${val(p.cardNoMasked)}</span>${p.hasCardNo?`<button type="button" class="identity-toggle" id="identity-toggle" aria-label="显示完整身份证号" aria-pressed="false" title="显示完整身份证号">${EYE}</button>`:''}</b></div><div><span>民族</span><b>${val(p.nation)}</b></div><div><span>婚史</span><b>${val(p.marryLabel||(p.marry==null?null:`代码 ${p.marry}`))}</b></div><div><span>建档日期</span><b>${val(p.createDate)}</b></div><div><span>随访观察起始</span><b>${val(p.followStartDate)}</b></div><div><span>确诊日期</span><b>${val(p.confirmDate)}</b></div><div><span title="首次出现相关症状日期">发病时间</span><b>${val(p.happenDate)}</b></div><div><span>随访周期</span><b>${cycleLabel(p.followCycle)}${nextDueText()}</b></div><div><span>DAS28-CRP</span><b>${val(p.latestDas28)}</b></div><div><span>身高(cm)</span><b>${val(p.height)}</b></div><div><span>体重(kg)</span><b>${val(p.weight)}</b></div><div><span>BMI</span><b>${val(p.bmi)}</b></div><div><span>吸烟史</span><b>${val(p.smoking)}</b></div><div><span>过敏史</span><b>${val(p.allergy)}</b></div><div><span>家族史</span><b>${val(p.familyHistory)}</b></div></div>
 <div class="reference-history" id="related-history"><div><h3>常见相关疾病</h3>${relatedDiseases()}</div><div><h3>其他病史</h3>${otherHistory.length?otherHistory.map(t=>`<p>${t}</p>`).join(''):'<p>当前未提供其他病史</p>'}</div></div>`;

 // 随访时间线：最近的在前；时间最早的一次为基线访视
 const visits=p.visits||[];
 $('#visit-list').innerHTML=visits.length?visits.map(v=>{const href=withFrom(`visit-detail.html?id=${pid}&visit=${encodeURIComponent(v.visitId)}`);return `<article class="visit-row"><a class="visit-row-main" href="${href}"><span class="record-icon">${icon('record')}</span><span><strong>${escapeHTML(v.visitType)}</strong><time>${escapeHTML(v.visitDate||'日期未填')}</time><small>${v.doctorId?`记录医生 ID ${escapeHTML(v.doctorId)}`:''}</small></span></a><div class="visit-row-status"><a class="visit-chevron-link" aria-label="查看本次随访详情" href="${href}">${icon('chevron','chevron')}</a></div></article>`}).join(''):'<p class="audit-empty">暂无随访记录，点击右上角「＋ 新增随访」录入基线访视。</p>';
 $('#visit-total').textContent=`${visits.length} 次访视`;

 $('#download-all').onclick=()=>notReady('下载病历');
 $('#ask-ai').onclick=()=>notReady('问问AI');
 $('#paper-import').onclick=()=>notReady('AI纸质病历拍照导入');
 const wb=$('#withdraw-btn');if(wb)wb.onclick=()=>notReady('标记脱落');
 $('#patient-basic').addEventListener('click',e=>{const b=e.target.closest('[data-comorbid]');if(b)openComorbidity(b.dataset.comorbid,comorbidPatient())});
 bindIdentityToggle();
}

// 身份证号：默认打码；点「眼睛」向后端取一次明文，再点隐藏
function bindIdentityToggle(){
 const t=$('#identity-toggle');if(!t)return;let full=null;
 t.addEventListener('click',async()=>{
  const box=$('#identity-number'),shown=t.getAttribute('aria-pressed')==='true';
  if(shown){box.textContent=p.cardNoMasked;}
  else{
   if(full==null){t.disabled=true;try{full=await apiPost('/api/ra/patient/patientSensitive',{doctorId:currentDoctorId(),patientId:p.patientId})||''}catch(e){alert(`获取身份证号失败：${e.message}`);return}finally{t.disabled=false}}
   box.textContent=full||p.cardNoMasked;
  }
  t.setAttribute('aria-pressed',String(!shown));t.setAttribute('aria-label',shown?'显示完整身份证号':'隐藏身份证号');t.title=shown?'显示完整身份证号':'隐藏身份证号';
 });
}

// 修改记录：默认收起，第一次展开时才查询；老数据没有记录，显示「暂无修改记录」
const AUDIT_TONE={'新建档案':'new','新增随访':'new','编辑随访':'edit','修改档案':'edit','质控处理':'qc','质控发起':'qc','标记脱落':'warn','删除随访':'warn'};
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
