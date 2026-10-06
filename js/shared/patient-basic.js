/* 患者基础信息（patient-visits.html 患者详情、visit-detail.html 访视详情共用；依赖 common.js）
   数据为 POST /api/ra/patient/patientDetail 的返回 p。两页的标签、基础信息卡片、常见相关疾病显示一致。 */
"use strict";

const basicVal=x=>escapeHTML(x==null||x===''?'未提供':x);
const BASIC_EYE=`<svg class="eye-icon eye-open" aria-hidden="true" viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg><svg class="eye-icon eye-closed" aria-hidden="true" viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 6.2A10.6 10.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17.8 17.8 0 0 1-3.1 3.8M6.1 6.1C3.8 7.8 2.5 12 2.5 12s3.5 6 9.5 6a9.7 9.7 0 0 0 3.1-.5M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`;

// 姓名下的标签：性别 → 出生年份 · 年龄 → ID号 → 研究编号 → 疾病分型
function patientTagsHTML(p){
 const birth=p.birthYear==null?'出生年份未知':`${p.birthYear}年出生 · ${p.age} 岁`;
 return `<div class="basic-tags">${badge(p.sex||'性别未填','neutral')}${badge(birth,'neutral')}${badge(`ID号: ${p.patientId}`,'neutral')}${badge(`研究编号: ${p.studyNo||'—'}`,'neutral')}${p.subtype?badge(`疾病分型: ${p.subtype}`):badge('疾病分型: 待补充','neutral')}</div>`;
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
function patientBasicGridHTML(p){
 const cells=[
  ['患者手机号',basicVal(p.mobile)],
  ['患者身份证号',`<span class="identity-number">${basicVal(p.cardNoMasked)}</span>${p.hasCardNo?`<button type="button" class="identity-toggle" aria-label="显示完整身份证号" aria-pressed="false" title="显示完整身份证号">${BASIC_EYE}</button>`:''}`,'identity-value'],
  ['民族',basicVal(p.nation)],
  ['婚史',basicVal(p.marryLabel||(p.marry==null?null:`代码 ${p.marry}`))],
  ['建档日期',basicVal(p.createDate)],
  ['随访观察起始',basicVal(p.followStartDate)],
  ['确诊日期',basicVal(p.confirmDate)],
  ['<span title="首次出现相关症状日期">发病时间</span>',basicVal(p.happenDate)],
  ['<span title="类风湿关节炎分类标准：受累关节、血清学、滑膜炎持续时间、急性时相反应物 4 项相加，≥6 分可分类为 RA">ACR/EULAR 2010</span>',p.acrEularScore==null?'未评估':`${escapeHTML(p.acrEularScore)} 分<small class="antibody-date">${escapeHTML(p.acrEularLabel||'')}</small>`],
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
function relatedDiseases(p){const cs=(p.comorbidities||[]).filter(c=>COMORBIDITY_INFO[c.code]);if(!cs.length)return '<p>无</p><small>暂未记录常见相关疾病（FM / AS 等）</small>';
 return `<div class="related-list">${cs.map(c=>`<article class="related-item"><div class="related-head"><button type="button" class="comorbid-chip" data-comorbid="${escapeHTML(c.code)}">${escapeHTML(c.code)} ${escapeHTML(c.name)}</button><span class="related-since">${c.sinceYear?`${c.sinceYear} 年起 · 病程约 ${TODAY.getFullYear()-c.sinceYear} 年`:'起病年份未填'}</span>${c.status?`<span class="related-status">${escapeHTML(c.status)}</span>`:''}</div><dl><div><dt>核心指标</dt><dd>${(c.coreItems||[]).map(escapeHTML).join('；')||'—'}</dd></div><div><dt>治疗</dt><dd>${escapeHTML(c.treatment||'—')}</dd></div></dl><button type="button" class="related-more" data-comorbid="${escapeHTML(c.code)}">查看病程简要 →</button></article>`).join('')}</div><small>已记录 ${cs.length} 项 · 点击病种查看病程简要，或进入对应研究库</small>`}
function patientHistoryHTML(p){
 const other=[p.pastHistory?escapeHTML(p.pastHistory):'',p.incomplete?`资料待补全：${escapeHTML((p.missingItems||[]).join('、'))}`:''].filter(Boolean);
 return `<div class="reference-history"><div><h3>常见相关疾病</h3>${relatedDiseases(p)}</div><div><h3>其他病史</h3>${other.length?other.map(t=>`<p>${t}</p>`).join(''):'<p>当前未提供其他病史</p>'}</div></div>`;
}

// 绑定身份证号「眼睛」（点一次向后端取明文，再点隐藏）和常见相关疾病弹窗；box 为包含基础信息的容器
function bindPatientBasic(box,p){
 const t=box.querySelector('.identity-toggle');
 if(t){let full=null;
  t.addEventListener('click',async()=>{
   const num=box.querySelector('.identity-number'),shown=t.getAttribute('aria-pressed')==='true';
   if(shown){num.textContent=p.cardNoMasked;}
   else{
    if(full==null){t.disabled=true;try{full=await apiPost('/api/ra/patient/patientSensitive',{doctorId:currentDoctorId(),patientId:p.patientId})||''}catch(e){alert(`获取身份证号失败：${e.message}`);return}finally{t.disabled=false}}
    num.textContent=full||p.cardNoMasked;
   }
   t.setAttribute('aria-pressed',String(!shown));t.setAttribute('aria-label',shown?'显示完整身份证号':'隐藏身份证号');t.title=shown?'显示完整身份证号':'隐藏身份证号';
  });
 }
 box.addEventListener('click',e=>{const b=e.target.closest('[data-comorbid]');if(b)openComorbidity(b.dataset.comorbid,comorbidPatient(p))});
}
