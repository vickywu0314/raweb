/* 患者基础信息（patient-visits.html 患者详情、visit-detail.html 访视详情共用；依赖 common.js）
   数据为 POST /api/ra/patient/patientDetail 的返回 p。两页的标签、基础信息卡片、常见相关疾病显示一致。 */
"use strict";

const basicVal=x=>escapeHTML(x==null||x===''?'未提供':x);
const BASIC_EYE=`<svg class="eye-icon eye-open" aria-hidden="true" viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg><svg class="eye-icon eye-closed" aria-hidden="true" viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 6.2A10.6 10.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17.8 17.8 0 0 1-3.1 3.8M6.1 6.1C3.8 7.8 2.5 12 2.5 12s3.5 6 9.5 6a9.7 9.7 0 0 0 3.1-.5M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`;

// 姓名下的标签：性别 → 出生年份 · 年龄 → ID号 → 研究编号 → 疾病分型
function patientTagsHTML(p){
 const birth=p.birthYear==null?'出生年份未知':`${p.birthYear}年出生 · ${p.age} 岁`;
 return `<div class="basic-tags">${badge(p.sex||'性别未填','neutral')}${badge(birth,'neutral')}${badge(`ID号: ${p.patientId}`,'neutral')}${badge(`研究编号: ${p.studyNo||'—'}`,'neutral')}${p.subtype?badge(`疾病分型: ${p.subtype}`):badge('疾病分型: 待补充','neutral')}${p.suspectedLostToFollowUp?badge('疑似失访','warning'):''}</div>`;
}

// 右侧按钮分组：每组一个数组（按钮 HTML），组之间有分隔线；空组不显示
function actionGroupsHTML(groups){
 return `<div class="heading-actions grouped">${groups.map(g=>g.filter(Boolean)).filter(g=>g.length).map(g=>`<div class="action-group">${g.join('')}</div>`).join('')}</div>`;
}

function nextDueText(p){if(!p.nextDueDate)return '';const n=p.nextDueDays,st=n<0?'overdue':n<=14?'soon':'later';return `<small class="next-due ${st}">下次 ${escapeHTML(p.nextDueDate)}${n<0?` · 已逾期 ${-n} 天`:n<=14?` · ${n} 天后`:''}</small>`}
// RF / 抗CCP：原值 · 状态，下一行化验日期（取最近一次有结果的随访）
const antibodyText=a=>!a||a.value==null?'未检测':`${escapeHTML(a.value)} · ${escapeHTML(a.statusLabel)}${a.visitDate?`<small class="antibody-date">化验日期 ${escapeHTML(a.visitDate)}</small>`:''}`;
const das28Text=p=>`${basicVal(p.latestDas28)}${p.das28Activity?`<span class="das28-level ${escapeHTML(p.das28Activity)}">${escapeHTML(p.das28ActivityLabel)}</span>`:''}`;

// 基础信息卡片
function patientBasicGridHTML(p,{readOnly=false}={}){
 const cells=[
  ['患者手机号',basicVal(p.mobile)],
  ['患者身份证号',`<span class="identity-number">${basicVal(p.cardNoMasked)}</span>${p.hasCardNo&&!readOnly?`<button type="button" class="identity-toggle" aria-label="显示完整身份证号" aria-pressed="false" title="显示完整身份证号">${BASIC_EYE}</button>`:''}`,'identity-value'],
  ['民族',basicVal(p.nation)],
  ['婚史',basicVal(p.marryLabel||(p.marry==null?null:`代码 ${p.marry}`))],
  ['建档日期',basicVal(p.createDate)],
  ['随访观察起始',basicVal(p.followStartDate)],
  ['确诊日期',basicVal(p.confirmDate)],
  ['<span title="首次出现相关症状日期">发病时间</span>',basicVal(p.happenDate)],
  ['<span title="类风湿关节炎分类标准：受累关节、血清学、滑膜炎持续时间、急性时相反应物 4 项相加，≥6 分可分类为 RA">ACR/EULAR 2010</span>',p.acrEularScore==null?'未评估':`${escapeHTML(p.acrEularScore)} 分<small class="antibody-date">${escapeHTML(p.acrEularLabel||'')}</small>`],
  ['诊断结果告知',p.diagnosisInformed==null?'未填写':p.diagnosisInformed===1?'已告知':'未告知'],
  ['患者知情同意书',p.consentSigned==null?'未填写':p.consentSigned===1?'已签订':'未签订'],
  ['随访（不含基线）',`${basicVal(p.followUpCount)} 次<small>累计 ${basicVal(p.visitCount)} 次访视（含基线）</small>`],
  ['随访周期',`${cycleLabel(p.followCycle)}${nextDueText(p)}`],
  ['DAS28-CRP',das28Text(p)],
  ['类风湿因子 RF',antibodyText(p.rf)],
  ['抗CCP抗体',antibodyText(p.ccp)],
  ['身高(cm)',basicVal(p.height)],
  ['体重(kg)',basicVal(p.weight)],
  ['BMI',basicVal(p.bmi)],
  ['腰围(cm)',basicVal(p.waistline)],
  ['心率(次/分)',basicVal(p.heartRate)],
  ['血压(mmHg)',p.systolic||p.diastolic?`${escapeHTML(p.systolic||'—')} / ${escapeHTML(p.diastolic||'—')}<small class="antibody-date">收缩压 / 舒张压</small>`:'未提供'],
  ['吸烟史',basicVal(p.smoking)],
  ['过敏史',basicVal(p.allergy)],
  ['家族史',basicVal(p.familyHistory)]
 ];
 return `<div class="reference-basic-grid compact">${cells.map(([k,v,cls])=>`<div><span>${k}</span><b${cls?` class="${cls}"`:''}>${v}</b></div>`).join('')}</div>`;
}

// 常见相关疾病（patient_comorbidity）+ 其他病史；弹窗沿用 openComorbidity(code, p)
function comorbidPatient(p){const comorbid={};(p.comorbidities||[]).forEach(c=>{if(c.sinceYear)comorbid[c.code]={since:c.sinceYear,status:c.status||'暂无记录',core:c.coreItems||[],treatment:c.treatment||'暂无记录'}});return {id:String(p.patientId),name:p.name,comorbid}}
function relatedDiseases(p,{trusted=false}={}){const cs=(p.comorbidities||[]).filter(c=>COMORBIDITY_INFO[c.code]);if(!cs.length)return '<p>无</p><small>暂未记录常见相关疾病（FM / AS 等）</small>';
 return `<div class="related-list">${cs.map(c=>`<article class="related-item"><div class="related-head"><button type="button" class="comorbid-chip" data-comorbid="${escapeHTML(c.code)}">${escapeHTML(c.code)} ${escapeHTML(c.name)}</button><span class="related-since">${c.sinceYear?(trusted?`${escapeHTML(c.sinceYear)} 年起`:`${c.sinceYear} 年起 · 病程约 ${TODAY.getFullYear()-c.sinceYear} 年`):'起病年份未填'}</span>${c.status?`<span class="related-status">${escapeHTML(c.status)}</span>`:''}</div><dl><div><dt>核心指标</dt><dd>${(c.coreItems||[]).map(escapeHTML).join('；')||'—'}</dd></div><div><dt>治疗</dt><dd>${escapeHTML(c.treatment||'—')}</dd></div></dl><button type="button" class="related-more" data-comorbid="${escapeHTML(c.code)}">查看病程简要 →</button></article>`).join('')}</div><small>已记录 ${cs.length} 项 · 点击病种查看病程简要，或进入对应研究库</small>`}
function patientHistoryHTML(p,options){
 const other=[p.pastHistory?escapeHTML(p.pastHistory):'',p.incomplete?`资料待补全：${escapeHTML((p.missingItems||[]).join('、'))}`:''].filter(Boolean);
 return `<div class="reference-history"><div><h3>常见相关疾病</h3>${relatedDiseases(p,options)}</div><div><h3>其他病史</h3>${other.length?other.map(t=>`<p>${t}</p>`).join(''):'<p>当前未提供其他病史</p>'}</div></div>`;
}

// 绑定身份证号「眼睛」（点一次向后端取明文，再点隐藏）和常见相关疾病弹窗；box 为包含基础信息的容器
// Trusted explicit reads have one owner, bounded locally even if the peer ignores abort.
function trustedDetailReader(read,publish){
 let current=null;
 function finish(owner,cause,value){
  if(current!==owner||owner.cause!==null)return;
  owner.cause=cause;current=null;clearTimeout(owner.timer);
  if(cause!=='success')owner.controller.abort();
  publish(cause,value);
 }
 return {
  start(){this.cancel();const owner={cause:null,controller:new AbortController(),timer:null};current=owner;owner.timer=setTimeout(()=>finish(owner,'timeout'),30000);
   Promise.resolve().then(()=>{if(current!==owner||owner.cause!==null)return null;return read({signal:owner.controller.signal});}).then(result=>{if(result)finish(owner,'success',result.data);},error=>finish(owner,'error',error));},
  cancel(){if(current)finish(current,'cancelled');}
 };
}
function bindTrustedPatientAudit(panel,p){
 const box=panel.querySelector('#audit-list'),count=panel.querySelector('#audit-count');let disposed=false;
 const clear=()=>{box.innerHTML='';count.textContent='';};
 const reader=trustedDetailReader(options=>RACohortAPI.patientAuditLogs(p.patientId,options),(cause,data)=>{
  if(disposed||!panel.open){clear();return;}
  if(cause==='success'){
   count.textContent=data.logs.length?`${data.logs.length} 条`:'';
   box.innerHTML=data.logs.length?data.logs.map(log=>`<li data-audit-id="${escapeHTML(log.id)}"><time>${escapeHTML(log.time||'')}</time><b class="audit-tag edit">${escapeHTML(log.action||'')}</b><div class="audit-detail">${escapeHTML(log.detail||'')}</div><em>${escapeHTML(log.operator||'')}</em></li>`).join(''):'<li class="audit-empty">暂无修改记录</li>';
  }else if(cause==='cancelled')clear();else{count.textContent='';box.innerHTML=`<li class="audit-empty">${cause==='timeout'?'修改记录查询超时':'修改记录暂不可用'}，请收起后重新展开。</li>`;}
 });
 const toggle=()=>{if(disposed)return;if(panel.open){clear();box.innerHTML='<li class="audit-empty">正在查询修改记录…</li>';reader.start();}else{reader.cancel();clear();}};
 panel.open=false;clear();panel.addEventListener('toggle',toggle);
 return ()=>{disposed=true;reader.cancel();clear();panel.open=false;panel.removeEventListener('toggle',toggle);};
}
function bindTrustedPatientBasic(box,p){
 const toggle=box.querySelector('.identity-toggle'),num=box.querySelector('.identity-number');let disposed=false,expanded=false;
 const mask=()=>{expanded=false;if(num)num.textContent=p.cardNoMasked||'未提供';if(toggle){toggle.setAttribute('aria-pressed','false');toggle.setAttribute('aria-label','显示完整身份证号');toggle.title='显示完整身份证号';}};
 const reader=trustedDetailReader(options=>RACohortAPI.patientSensitive(p.patientId,options),(cause,data)=>{
  if(cause==='success'&&!disposed&&expanded){num.textContent=data.cardNo==null?'未提供':data.cardNo;}
  else{mask();if(cause==='error'||cause==='timeout')alert(cause==='timeout'?'身份证号查询超时':'身份证号暂不可用，请重新展开。');}
 });
 const click=()=>{if(disposed)return;if(expanded){expanded=false;reader.cancel();mask();}else{expanded=true;toggle.setAttribute('aria-pressed','true');toggle.setAttribute('aria-label','隐藏身份证号');toggle.title='隐藏身份证号';reader.start();}};
 const closeRelated=()=>{const dialog=document.getElementById('trusted-comorbidity-dialog');if(dialog){dialog.close();dialog.innerHTML='';dialog.remove();}};
 const related=event=>{
  if(disposed)return;const button=event.target.closest('[data-comorbid]');if(!button)return;
  const c=(p.comorbidities||[]).find(item=>item.code===button.dataset.comorbid);if(!c)return;closeRelated();
  const dialog=document.createElement('dialog');dialog.id='trusted-comorbidity-dialog';
  dialog.innerHTML=`<form method="dialog" class="dialog-form"><div class="dialog-header"><h2>${escapeHTML(c.name||c.code)}</h2><button value="close" aria-label="关闭">×</button></div><p>${c.sinceYear?`${escapeHTML(c.sinceYear)} 年起`:'起病年份未填'}</p><p>${escapeHTML(c.status||'状态未提供')}</p><p>核心指标：${(c.coreItems||[]).map(escapeHTML).join('；')||'未提供'}</p><p>治疗：${escapeHTML(c.treatment||'未提供')}</p></form>`;
  document.body.appendChild(dialog);dialog.showModal();
 };
 const collapse=()=>{if(!box.open){expanded=false;reader.cancel();mask();closeRelated();}};
 if(toggle)toggle.addEventListener('click',click);box.addEventListener('click',related);if(box.id==='basic-collapse')box.addEventListener('toggle',collapse);
 return ()=>{disposed=true;expanded=false;reader.cancel();mask();closeRelated();if(toggle)toggle.removeEventListener('click',click);box.removeEventListener('click',related);box.removeEventListener('toggle',collapse);};
}
function bindPatientBasic(box,p,{trusted=false}={}){
 if(trusted)return bindTrustedPatientBasic(box,p);
 const t=box.querySelector('.identity-toggle'),num=box.querySelector('.identity-number');
 let disposed=false,expanded=false,full=null;
 const mask=()=>{expanded=false;full=null;if(num)num.textContent=p.cardNoMasked||'未提供';if(t){t.disabled=false;t.setAttribute('aria-pressed','false');t.setAttribute('aria-label','显示完整身份证号');t.title='显示完整身份证号';}};
 const reader=trustedDetailReader(()=>apiPost('/api/ra/patient/patientSensitive',{doctorId:currentDoctorId(),patientId:p.patientId}).then(data=>({data})),(cause,data)=>{
  if(cause==='success'&&!disposed&&expanded){full=data||'';num.textContent=full||p.cardNoMasked;t.disabled=false;}
  else{mask();if(!disposed&&(cause==='error'||cause==='timeout'))toast(cause==='timeout'?'身份证号查询超时':'获取身份证号失败');}
 });
 const click=()=>{if(disposed)return;if(expanded){reader.cancel();mask();}else{expanded=true;t.disabled=true;t.setAttribute('aria-pressed','true');t.setAttribute('aria-label','隐藏身份证号');t.title='隐藏身份证号';reader.start();}};
 const related=e=>{if(disposed)return;const b=e.target.closest('[data-comorbid]');if(b)openComorbidity(b.dataset.comorbid,comorbidPatient(p));};
 const collapse=()=>{if(!box.open){reader.cancel();mask();}};
 if(t)t.addEventListener('click',click);box.addEventListener('click',related);if(box.id==='basic-collapse')box.addEventListener('toggle',collapse);
 return ()=>{disposed=true;reader.cancel();mask();const dialog=document.getElementById('comorbid-dialog');if(dialog){dialog.close();dialog.innerHTML='';dialog.remove();}if(t)t.removeEventListener('click',click);box.removeEventListener('click',related);box.removeEventListener('toggle',collapse);};
}
