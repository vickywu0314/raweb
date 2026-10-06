/* patients.html 页面脚本（依赖 boot.js → data.js → common.js）
   数据来自后端接口 POST /api/ra/patient/patientsList（raapi，口径见 raapi/docs/API.md）。
   检索、筛选、分页都由后端完成；只显示当前医生名下的患者。 */
"use strict";shell('patients');
let state=loadListState('patients',{q:'',status:'',data:'',page:1,perPage:8});
const selected=new Set();
let pageRows=[], loadSeq=0;

// 页面下拉值 → 接口 followStatus 枚举
const STATUS_PARAM={ongoing:'active',due:'soon',overdue:'overdue',none:'pending_first',lost:'withdrawn'};
// 接口 followStatus → 标签颜色
const STATUS_TONE={active:'success',soon:'warning',overdue:'danger',pending_first:'neutral',withdrawn:'danger'};

function patientListSkeleton(){
  $('#patient-summary').innerHTML='<span class="skeleton skeleton-inline-summary"></span>';
  $('#patients').innerHTML=Array.from({length:6},()=>`<div class="patient-card selectable patient-skeleton-row"><span class="check-col"><i class="skeleton skeleton-check"></i></span><div class="patient-card-link">${Array.from({length:5},(_,i)=>`<span class="patient-skeleton-cell"><i class="skeleton ${i===0?'skeleton-patient-name':'skeleton-cell-line'}"></i><i class="skeleton skeleton-cell-sub"></i></span>`).join('')}<i class="skeleton skeleton-chevron"></i></div></div>`).join('');
  $('#result-count').innerHTML='<span class="skeleton skeleton-result-count"></span>';
  $('#pagination').innerHTML='';
  $('#empty').hidden=true;
}

// 其他病史弹窗沿用 openComorbidity(code, p)，把接口数据转成它需要的结构
function comorbidPatient(p){
  const comorbid={};
  (p.comorbidities||[]).forEach(c=>{if(c.sinceYear)comorbid[c.code]={since:c.sinceYear,status:c.status||'暂无记录',core:c.coreItems||[],treatment:c.treatment||'暂无记录'}});
  return {id:String(p.patientId),name:p.name,comorbid};
}
function comorbidCell(p){const cs=(p.comorbidities||[]).filter(c=>COMORBIDITY_INFO[c.code]);return cs.length?`<span class="comorbid-chips">${cs.map(c=>`<span class="comorbid-chip" role="button" tabindex="0" data-comorbid="${escapeHTML(c.code)}" data-pid="${escapeHTML(p.patientId)}" title="查看${escapeHTML(c.name)}病程简要">${escapeHTML(c.code)} ${escapeHTML(c.name)}</span>`).join('')}</span>`:'<span class="comorbid-none">无</span>'}
// 出生年份取自身份证号（无有效身份证号时按建档年龄推算），后面接 · 年龄
function birthText(p){return p.birthYear==null?'出生年份未知':`${p.birthYear} 年 · ${p.age} 岁`}
function card(p){const id=String(p.patientId);return `<div class="patient-card selectable" data-id="${escapeHTML(id)}"><span class="check-col"><input class="patient-check" type="checkbox" value="${escapeHTML(id)}" aria-label="选择患者 ${escapeHTML(p.name)}" ${selected.has(id)?'checked':''}></span><a class="patient-card-link" href="patient-visits.html?id=${encodeURIComponent(id)}"><span class="patient-identity"><span class="record-icon">${icon('record')}</span><span class="patient-info"><span class="patient-name">${escapeHTML(p.name)}${p.incomplete?`<span title="${escapeHTML((p.missingItems||[]).join('、'))}">${badge('待补全','warning')}</span>`:''}</span><span class="patient-meta">${escapeHTML(p.sex||'性别未填')} · ${birthText(p)}</span><span class="patient-meta">ID号: ${escapeHTML(id)}</span></span></span><span class="patient-cell research-cell"><span class="cell-label">研究信息</span><span class="study-code">${escapeHTML(p.studyNo||'—')}</span><span class="cell-note">已随访 ${p.visitCount} 次 · ${cycleLabel(p.followCycle)}</span></span><span class="patient-cell disease-cell"><span class="cell-label">疾病资料</span><span>${p.subtype?badge(p.subtype):'<span class="missing-value">分型未提供</span>'}</span><span class="cell-note">${p.latestDas28==null?'DAS28-CRP 未提供':`DAS28-CRP ${p.latestDas28}`}</span></span><span class="patient-cell history-cell"><span class="cell-label">其他病史</span>${comorbidCell(p)}</span><span class="patient-cell visit-cell"><span class="cell-label">最近随访</span><span class="last-visit">${icon('calendar')}${escapeHTML(p.lastVisitDate||'暂无访视')}</span><span class="cell-note">${p.visitCount?`累计 ${p.visitCount} 次访视`:'待完成基线访视'}</span></span><span class="patient-cell status-cell"><span class="cell-label">随访状态</span>${badge(p.followStatusLabel,STATUS_TONE[p.followStatus]||'')}</span>${icon('chevron','chevron')}</a></div>`}
function updateSelectionUI(){const n=selected.size;const b=$('#ai-analysis');b.disabled=!n;b.textContent=n?`AI智能分析（已选 ${n} 人）`:'AI智能分析';const all=$('#select-all');if(all){const checked=pageRows.filter(p=>selected.has(String(p.patientId))).length;all.checked=pageRows.length>0&&checked===pageRows.length;all.indeterminate=checked>0&&checked<pageRows.length}}

function render(d){
  pageRows=d.items||[];lastTotal=d.total;
  $('#patient-summary').innerHTML=`共 ${d.totalPatients} 位患者已建档 · <button type="button" class="summary-link" id="show-incomplete" title="筛选资料待补全的患者">${d.incompleteCount}</button> 位资料待补全`;
  $('#patients').innerHTML=pageRows.map(card).join('');
  $('#empty').hidden=!!d.total;$('#empty').querySelector('h2').textContent='未找到匹配患者';
  const start=(d.page-1)*d.size;
  $('#result-count').textContent=d.total?`显示第 ${start+1}–${start+pageRows.length} 条，共 ${d.total} 条`:'共 0 条匹配记录';
  const pages=Math.max(1,Math.ceil(d.total/d.size));
  $('#pagination').innerHTML=Array.from({length:pages},(_,i)=>`<button data-page="${i+1}" class="${i+1===d.page?'active':''}">${i+1}</button>`).slice(Math.max(0,d.page-3),Math.max(5,d.page+2)).join('');
  updateSelectionUI();
}
function renderError(msg){
  pageRows=[];
  $('#patient-summary').textContent='';$('#patients').innerHTML='';$('#result-count').textContent='';$('#pagination').innerHTML='';
  $('#empty').hidden=false;$('#empty').querySelector('h2').textContent=`患者列表加载失败：${msg}。请确认后端服务已启动（${API_BASE}）。`;
  updateSelectionUI();
}

// 按当前 state 请求接口；只渲染最后一次请求的结果
async function load(){
  saveListState('patients',state);
  const seq=++loadSeq;patientListSkeleton();
  const params={doctorId:currentDoctorId(),page:state.page,size:state.perPage};
  if(state.q)params.keyword=state.q;
  if(state.status)params.followStatus=STATUS_PARAM[state.status];
  if(state.data)params.completeness=state.data;
  try{
    const d=await apiPost('/api/ra/patient/patientsList',params);
    if(seq!==loadSeq)return;
    // 筛选后当前页超出总页数（如删除数据后返回列表）：回到最后一页
    const pages=Math.max(1,Math.ceil(d.total/d.size));
    if(d.page>pages){state.page=pages;return load();}
    render(d);
  }catch(e){if(seq===loadSeq){console.error(e);renderError(e.message)}}
}

const chipOpen=e=>{const c=e.target.closest('.comorbid-chip');if(!c)return false;e.preventDefault();e.stopPropagation();const p=pageRows.find(x=>String(x.patientId)===c.dataset.pid);openComorbidity(c.dataset.comorbid,p?comorbidPatient(p):null);return true};
$('#patients').addEventListener('click',chipOpen);
$('#patients').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.comorbid-chip'))chipOpen(e)});
$('#patients').addEventListener('change',e=>{if(!e.target.matches('.patient-check'))return;e.target.checked?selected.add(e.target.value):selected.delete(e.target.value);updateSelectionUI()});
$('#select-all').addEventListener('change',e=>{pageRows.forEach(p=>e.target.checked?selected.add(String(p.patientId)):selected.delete(String(p.patientId)));$('#patients').querySelectorAll('.patient-check').forEach(c=>c.checked=e.target.checked);updateSelectionUI()});
// ===== 数据导出：弹窗选随访日期范围；近半年内直接下载，更早的需填写申请（发到指定邮箱，邮件功能后续实现） =====
let exportRange=null, lastTotal=0;
function exportParams(extra){
 const p={doctorId:currentDoctorId(),...extra};
 if(selected.size)p.patientIds=[...selected].join(',');
 else{if(state.q)p.keyword=state.q;if(state.status)p.followStatus=STATUS_PARAM[state.status];if(state.data)p.completeness=state.data}
 return p;
}
async function openExportDialog(){
 try{exportRange=exportRange||await apiPost('/api/ra/export/range',{})}catch(e){alert(`数据导出暂不可用：${e.message}`);return}
 let d=document.getElementById('export-dialog');
 if(!d){d=document.createElement('dialog');d.id='export-dialog';d.className='export-dialog';document.body.appendChild(d)}
 const r=exportRange, scope=selected.size?`已勾选的 ${selected.size} 位患者`:`当前查询结果（共 ${lastTotal} 位患者）`;
 d.innerHTML=`<form method="dialog" class="dialog-form" id="export-form"><div class="dialog-header"><h2>数据导出</h2><button class="icon-button" value="cancel" formnovalidate aria-label="关闭">×</button></div>
  <p class="dialog-note">导出范围：<b>${escapeHTML(scope)}</b><br>导出内容：所选时间段内的随访记录，每次随访一行（姓名已脱敏，不含身份证号、手机号）。</p>
  <div class="export-dates"><label class="form-field"><span>随访日期从 <b class="required">*</b></span><input type="date" name="start" required value="${r.freeStartDate}" max="${r.today}"></label><label class="form-field"><span>到 <b class="required">*</b></span><input type="date" name="end" required value="${r.today}" max="${r.today}"></label></div>
  <p class="export-hint" id="export-hint"></p>
  <label class="form-field" id="apply-reason" hidden><span>申请原因 / 用途 <b class="required">*</b></span><textarea name="reason" rows="3" maxlength="1000" placeholder="如：课题结题统计，需要 2024 年以来的全部随访数据"></textarea></label>
  <p class="export-error" id="export-error" hidden></p>
  <div class="dialog-footer"><button class="button" value="cancel" formnovalidate>取消</button><button class="button primary" value="ok" id="export-submit">下载</button></div></form>`;
 const f=d.querySelector('form'),hint=d.querySelector('#export-hint'),reason=d.querySelector('#apply-reason'),btn=d.querySelector('#export-submit'),err=d.querySelector('#export-error');
 const needApply=()=>f.start.value&&f.start.value<r.freeStartDate;
 const sync=()=>{const apply=needApply();hint.classList.toggle('need-apply',apply);
  hint.textContent=apply?`开始日期早于 ${r.freeStartDate}：超过半年的数据需要提交申请，填写原因后发送到指定邮箱，审批通过后再下载。`:`近半年（${r.freeStartDate} 至今）的数据可直接下载。`;
  reason.hidden=!apply;btn.textContent=apply?'提交申请':'下载';err.hidden=true};
 f.start.addEventListener('change',sync);f.end.addEventListener('change',sync);sync();
 f.addEventListener('submit',async e=>{
  if(e.submitter&&e.submitter.value!=='ok')return;
  e.preventDefault();err.hidden=true;
  const start=f.start.value,end=f.end.value;
  if(!start||!end){err.hidden=false;err.textContent='请选择开始和结束日期';return}
  if(start>end){err.hidden=false;err.textContent='开始日期不能晚于结束日期';return}
  btn.disabled=true;const label=btn.textContent;btn.textContent=needApply()?'提交中…':'导出中…';
  try{
   if(needApply()){
    const text=f.reason.value.trim();if(!text){throw new Error('请填写申请原因 / 用途')}
    const id=await apiPost('/api/ra/export/apply',exportParams({startDate:start,endDate:end,reason:text}));
    f.querySelector('.dialog-footer').innerHTML='<button class="button primary" value="cancel" formnovalidate>知道了</button>';
    [hint,reason,f.querySelector('.export-dates')].forEach(x=>x.hidden=true);
    f.querySelector('.dialog-note').outerHTML=`<p class="export-done">申请已提交（编号 ${escapeHTML(id)}）：${escapeHTML(start)} 至 ${escapeHTML(end)}。审批通过后会发送到指定邮箱。${r.mailConfigured?'':'（邮件发送功能开发中，请同时联系项目管理员。）'}</p>`;
    return;
   }
   await downloadVisitsCsv(start,end);d.close();
  }catch(ex){err.hidden=false;err.textContent=ex.message;if(/需要提交申请/.test(ex.message))sync()}
  finally{btn.disabled=false;if(btn.isConnected&&/中…$/.test(btn.textContent))btn.textContent=label}
 });
 d.showModal();
}
async function downloadVisitsCsv(start,end){
 const res=await fetch(API_BASE+'/api/ra/export/visitsCsv',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams(exportParams({startDate:start,endDate:end}))});
 if(!res.ok)throw new Error(`导出失败（HTTP ${res.status}）`);
 if(!(res.headers.get('Content-Type')||'').includes('text/csv')){const r=await res.json();throw new Error(r.message||'导出失败')}
 const u=URL.createObjectURL(await res.blob()),a=document.createElement('a');a.href=u;a.download=`RA随访数据-${start}至${end}.csv`;document.body.appendChild(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(u)},1000);
}
$('#ai-analysis').onclick=()=>{if(selected.size)location.href=`ai-cohort.html?ids=${[...selected].map(encodeURIComponent).join(',')}`};
$('#search-form').addEventListener('submit',e=>{e.preventDefault();state.q=$('#query').value.trim();state.status=$('#visit-status').value;state.data=$('#data-status').value;state.page=1;load()});
// 检索条件（关键字、随访状态、数据完整性）选好后，点「查询」才查询；选下拉不会触发查询
$('#patient-summary').addEventListener('click',e=>{if(!e.target.closest('#show-incomplete'))return;state={...state,q:'',status:'',data:'missing',page:1};$('#query').value='';$('#visit-status').value='';$('#data-status').value='missing';load()});
$('#export-data').onclick=openExportDialog;
$('#ocr-entry').onclick=()=>alert('「OCR识别录入」功能正在开发中，暂不可用。');
$('#pagination').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b){state.page=+b.dataset.page;load()}});
$('#page-size').addEventListener('change',e=>{state.perPage=+e.target.value;state.page=1;load()});
$('#reset').onclick=()=>{state={q:'',status:'',data:'',page:1,perPage:state.perPage};$('#query').value='';$('#visit-status').value='';$('#data-status').value='';load()};
$('#query').value=state.q;$('#visit-status').value=state.status;$('#data-status').value=state.data;$('#page-size').value=state.perPage;load();
