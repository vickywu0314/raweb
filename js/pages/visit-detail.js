/* visit-detail.html 页面脚本（依赖 boot.js → data.js → common.js）
   数据来自后端（同时请求）：
   - POST /api/ra/patient/patientDetail：顶部患者基本信息（显示与患者详情页共用 js/shared/patient-basic.js）
   - POST /api/ra/visit/visitDetail：本次随访的 7 个病历模块（随访表 bsbq / fzjc / bqpg / zyzd / zlfa / blsj / bblsj），
     后端按字段字典（raapi docs/随访字段字典.md）分好组、转好中文 */
"use strict";
// 7 个病历模块（按后端字段字典分组）：字段组、清单（西药等）、图片；普通文字或 {record, date} 显示记录内容；没内容显示「本次未记录」
function trustedImageUrl(value){
 if(typeof value!=='string'||!value.trim())return null;
 try{const url=new URL(value,location.href);if(!['http:','https:'].includes(url.protocol))return null;
  // Relative addresses must resolve on the current origin; explicit HTTP(S) is allowed.
  if(!/^https?:/i.test(value.trim())&&url.origin!==location.origin)return null;return url.href;
 }catch{return null;}
}
function moduleBody(m,trusted=false){
 if(!m.filled)return '<p class="module-empty">本次未记录</p>';
 let html='';
 if(m.record)html+=`<div class="visit-record">${escapeHTML(m.record)}</div>`;
 (m.groups||[]).forEach(g=>{
  html+=`<div class="subcard">${g.title?`<h3>${escapeHTML(g.title)}</h3>`:''}<div class="detail-fields">${g.items.map(i=>`<div class="detail-field${i.notChecked?' not-checked':''}"><span>${escapeHTML(i.label)}</span><strong>${escapeHTML(i.value)}${i.unit?`<small class="field-unit">${escapeHTML(i.unit)}</small>`:''}</strong></div>`).join('')}</div></div>`;
 });
 (m.tables||[]).forEach(t=>{
  html+=`<div class="subcard"><h3>${escapeHTML(t.title)} <small class="table-count">${t.rows.length} 项</small></h3><div class="visit-table-wrap"><table class="visit-table"><thead><tr>${t.columns.map(c=>`<th>${escapeHTML(c)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r=>`<tr>${r.map(c=>`<td>${escapeHTML(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
 });
 (m.images||[]).forEach(g=>{
  html+=`<div class="subcard"><h3>${escapeHTML(g.title)} <small class="table-count">${g.urls.length} 张</small></h3><div class="visit-images">${g.urls.map((u,i)=>{const safe=trusted?trustedImageUrl(u):u;return safe?`<a href="${escapeHTML(safe)}" target="_blank" rel="noopener" title="点击查看原图"><img src="${escapeHTML(safe)}" alt="${escapeHTML(g.title)} ${i+1}" loading="lazy"></a>`:'<span>图片地址不可用</span>'}).join('')}</div></div>`;
 });
 if(m.recordDate)html+=`<p class="record-date">记录日期：${escapeHTML(m.recordDate)}</p>`;
 return html;
}
function renderSections(v,trusted=false){
 $('#visit-sections').innerHTML=v.modules.map((m,i)=>`<section class="detail-section${m.filled?'':' is-empty'}" id="section-${i}"><div class="detail-section-head"><span class="section-check">${m.filled?'✓':'–'}</span><h2>${escapeHTML(m.title)}</h2></div>${moduleBody(m,trusted)}</section>`).join('');
 // 左侧导航：有内容 ✓，没内容 –
 [...document.querySelectorAll('.detail-anchor a')].forEach((a,i)=>{const m=v.modules[i];if(!m)return;a.classList.toggle('is-empty',!m.filled);const mark=a.querySelector('i');if(mark)mark.textContent=m.filled?'✓':'–'});
 return bindSectionNav();
}

// 左侧导航：点击滚动到模块；滚动时高亮当前模块
function bindSectionNav(){
 const anchors=[...document.querySelectorAll('.detail-anchor a')], sections=[...document.querySelectorAll('.detail-section')];
 const setActive=id=>anchors.forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+id));
 const clicks=anchors.map(a=>{const click=e=>{e.preventDefault();const target=document.querySelector(a.getAttribute('href'));if(!target)return;setActive(target.id);target.scrollIntoView({behavior:'smooth',block:'start'});};a.addEventListener('click',click);return {a,click};});
 const sync=()=>{if(!sections.length)return;if(window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-8){setActive(sections.at(-1).id);return;}const y=window.scrollY+130;let cur=sections[0];for(const s of sections){if(s.offsetTop<=y)cur=s;else break;}setActive(cur.id)};
 window.addEventListener('scroll',sync,{passive:true});window.addEventListener('resize',sync);sync();
 const hashTarget=flashHashTarget();if(hashTarget&&hashTarget.classList.contains('detail-section'))setActive(hashTarget.id);
 return ()=>{window.removeEventListener('scroll',sync);window.removeEventListener('resize',sync);for(const {a,click} of clicks)a.removeEventListener('click',click);};
}

const visitEntryParams=new URLSearchParams(location.search);
const aiVisitSource=visitEntryParams.getAll('from').some(value=>['ai-cohort','ai-analysis'].includes(value));
if(aiVisitSource){
 shell('ai');
 const aiFrom=visitEntryParams.getAll('from').find(value=>['ai-cohort','ai-analysis'].includes(value));
 const aiOrigin=aiFrom==='ai-analysis'?{href:'ai-analysis.html',label:'AI 智能分析'}:{href:'ai-cohort.html',label:'AI 队列分析'};
 const id=visitEntryParams.getAll('id').length===1?visitEntryParams.get('id'):'',visitId=visitEntryParams.getAll('visit').length===1?visitEntryParams.get('visit'):'';
 const canonical=value=>typeof value==='string'&&/^[1-9][0-9]*$/.test(value)&&(value.length<19||(value.length===19&&value<='9223372036854775807'));
 const valid=canonical(id)&&canonical(visitId)&&visitEntryParams.getAll('from').length===1&&[...visitEntryParams.keys()].every(key=>['id','visit','from'].includes(key));
 const visitsUrl=`patient-visits.html?id=${encodeURIComponent(id||'')}&from=${encodeURIComponent(aiFrom)}`;
 $('#crumb-origin').href=aiOrigin.href;$('#crumb-origin').textContent=aiOrigin.label;$('#crumb-visits').href=visitsUrl;$('#back-visits').href=visitsUrl;
 let safeHistory=false;
 try{const ref=new URL(document.referrer);safeHistory=ref.origin===location.origin&&ref.pathname===new URL('patient-visits.html',location.href).pathname&&ref.searchParams.getAll('id').length===1&&ref.searchParams.get('id')===id&&ref.searchParams.getAll('from').length===1&&ref.searchParams.get('from')===aiFrom&&[...ref.searchParams.keys()].every(k=>['id','from'].includes(k))&&history.length>1;}catch{}
 $('#back-visits').onclick=event=>{event.preventDefault();if(safeHistory)history.back();else location.assign(visitsUrl);};
 $('.app-footnote').textContent=`来源：${aiOrigin.label}。可信只读访视；编辑、删除、下载、病程尚未接入；问答入口默认本次访视。`;
 let currentFlight=null,disposeBasic=null,disposeNav=null;
 function clearVisit(state,message){
  if(disposeBasic){disposeBasic();disposeBasic=null;}if(disposeNav){disposeNav();disposeNav=null;}
  $('#visit-chat-link').removeAttribute('href');$('#visit-chat-link').setAttribute('aria-disabled','true');document.title='访视详情 · 患者数据研究平台';$('#visit-hero').setAttribute('data-state',state);
  $('#visit-hero').innerHTML=`<h1>访视详情${state==='loading'?'加载中':'未加载'}</h1><p>${escapeHTML(message)}</p>`;$('#visit-sections').innerHTML='';document.querySelector('.detail-anchor').classList.remove('is-loading');
 }
 function showVisit(p,v){
  $('#visit-chat-link').href='ai-chat.html'+RACohortChatEntry.encode({kind:'PATIENT',patientId:id,visitId});$('#visit-chat-link').removeAttribute('aria-disabled');
  document.title=`${p.name||'患者'} · ${v.visitType||'访视'} · 患者数据研究平台`;
  $('#visit-hero').setAttribute('data-state','success');
  $('#visit-hero').innerHTML=`<div class="patient-basic-head"><div class="patient-basic-title"><h1>${escapeHTML(p.name||'姓名未提供')}</h1>${patientTagsHTML(p)}</div></div><div class="reference-basic-grid visit-meta"><div><span>本次访视</span><b>${escapeHTML(v.visitType||'访视')} · ${escapeHTML(v.visitDate||'日期未填')}</b><small>访视 ID：${escapeHTML(v.visitId)}</small></div><div><span>记录医生</span><b>${escapeHTML(v.doctorName||v.doctorId||'未提供')}</b></div></div><details id="basic-collapse" class="basic-collapse"><summary>患者基础信息</summary>${patientBasicGridHTML(p)}${patientHistoryHTML(p,{trusted:true})}</details>`;
  disposeNav=renderSections(v,true);disposeBasic=bindPatientBasic($('#basic-collapse'),p,{trusted:true});
 }
 function finishVisit(flight,cause,data){
  if(currentFlight!==flight||flight.cause!==null)return;
  flight.cause=cause;currentFlight=null;clearTimeout(flight.timer);if(cause!=='success')flight.controller.abort();
  if(cause==='success')showVisit(data[0].data,data[1].data);else clearVisit(cause,cause==='timeout'?'访视详情查询超时':cause==='cancelled'?'访视详情请求已结束':data?.code==='UNAUTHENTICATED'?'请先登录后重新选择患者':data?.code==='RESOURCE_NOT_FOUND'?'患者资料不可用':'访视资料暂不可用');
 }
 function cancelVisit(){if(currentFlight)finishVisit(currentFlight,'cancelled');else clearVisit('cancelled','访视详情请求已结束');}
 function loadVisit(){
  cancelVisit();clearVisit('loading','正在查询患者及访视资料…');
  const flight={cause:null,controller:new AbortController(),timer:null};currentFlight=flight;
  flight.timer=setTimeout(()=>finishVisit(flight,'timeout'),30000);
  Promise.all([RACohortAPI.patientDetail(id,{signal:flight.controller.signal}),RACohortAPI.visitDetail(id,visitId,{signal:flight.controller.signal})]).then(data=>finishVisit(flight,'success',data),e=>finishVisit(flight,'error',e));
 }
 window.addEventListener('pagehide',cancelVisit);window.addEventListener('ra-auth-changed',cancelVisit);
 window.addEventListener('storage',event=>{if(event.key==='ra-auth'||event.key===null)cancelVisit();});window.addEventListener('pageshow',event=>{if(event.persisted&&valid)loadVisit();});
 if(valid)loadVisit();else clearVisit('invalid','入口参数无效，请返回患者档案重新选择。');
}else{
shell(pageOrigin().nav);
const patientId=queryParam('id'), visitId=queryParam('visit');
let p=null, v=null;

// 加载占位
$('#visit-hero').innerHTML=`<div class="skeleton skeleton-title"></div><div class="skeleton skeleton-tags"></div><div class="skeleton-grid">${Array.from({length:6},()=>'<div><i class="skeleton skeleton-label"></i><i class="skeleton skeleton-value"></i></div>').join('')}</div>`;
$('#visit-sections').innerHTML=Array.from({length:4},()=>`<section class="detail-section skeleton-section"><i class="skeleton skeleton-heading"></i><div class="skeleton-card-grid"><i class="skeleton skeleton-card"></i><i class="skeleton skeleton-card"></i></div></section>`).join('');
document.querySelector('.detail-anchor').classList.add('is-loading');

// 面包屑与返回：回到该患者的随访记录；从列表直接跳入时回到来源列表
{const o=pageOrigin(),visitsUrl=withFrom(`patient-visits.html?id=${encodeURIComponent(patientId||'')}`),direct=queryParam('entry')==='direct';
 const c=$('#crumb-origin');c.textContent=o.crumb;c.href=o.href;$('#crumb-visits').href=visitsUrl;
 const b=$('#back-visits');b.textContent=direct?`← 返回${o.label}`:'← 返回随访记录';bindBack(b,direct?o.href:visitsUrl);}

const val=x=>escapeHTML(x==null||x===''?'未提供':x);
const notReady=name=>toast(`「${name}」功能正在开发中`);

// 基础信息（与患者详情页一致，js/shared/patient-basic.js）默认收起，医生点开后记住选择（仅本机浏览器）
const BASIC_OPEN_KEY='ra:visit-basic-open';
function basicOpenPref(){try{return localStorage.getItem(BASIC_OPEN_KEY)==='1'}catch(e){return false}}

function renderHero(){
 document.title=`${p.name} · ${v.visitType} ${v.visitDate||''} · 患者数据研究平台`;
 const lost=p.followStatus==='withdrawn';
 // 按钮分组：查看分析 ｜ 录入编辑 ｜ 危险操作（与患者详情页同一顺序）
 const actions=actionGroupsHTML([
  ['<button class="button" id="ask-ai" type="button">问问AI</button>','<button class="button" id="download-one" type="button">下载本次病历</button>'],
  ['<button class="button ai-soft" id="ai-import" type="button">OCR识别录入</button>',`<a class="button primary" id="edit-visit" href="${withFrom(`visit-edit.html?id=${encodeURIComponent(p.patientId)}&visit=${encodeURIComponent(v.visitId)}`)}">编辑本次随访</a>`],
  ['<button class="button danger-outline" id="delete-visit" type="button">删除本次随访</button>']
 ]);
 $('#visit-hero').innerHTML=`<div class="patient-basic-head"><div class="patient-basic-title"><div class="patient-name-line"><h1>${escapeHTML(p.name)}</h1>${lost?`<span class="patient-dropout">已脱落</span>${p.withdrawReason?`<span class="patient-dropout-reason">脱落原因：${escapeHTML(p.withdrawReason)}</span>`:''}`:''}</div>${patientTagsHTML(p)}</div>${actions}</div>
 <div class="reference-basic-grid visit-meta"><div><span>本次访视</span><b>${escapeHTML(v.visitType)} · ${val(v.visitDate)}</b></div><div><span>记录医生</span><b>${val(v.doctorName||(v.doctorId?`医生 ID ${v.doctorId}`:null))}</b></div></div>
 <details class="basic-collapse" id="basic-collapse"${basicOpenPref()?' open':''}><summary><span class="basic-collapse-title">患者基础信息</span><span class="basic-collapse-hint">手机号、身份证号、确诊日期、DAS28-CRP、RF / 抗CCP、病史等</span></summary>${patientBasicGridHTML(p)}${patientHistoryHTML(p)}</details>`;
 $('#download-one').onclick=e=>downloadRecordPdf(p,e.currentTarget,v);
 $('#delete-visit').onclick=openDeleteDialog;
 const chatParams=new URLSearchParams(location.search);let chatHref=null;try{if(chatParams.getAll('id').length===1&&chatParams.getAll('visit').length===1)chatHref='ai-chat.html'+RACohortChatEntry.encode({kind:'PATIENT',patientId:chatParams.get('id'),visitId:chatParams.get('visit')});}catch{}$('#ask-ai').disabled=!chatHref;$('#ask-ai').onclick=()=>{if(chatHref)location.assign(chatHref);};
 $('#ai-import').onclick=()=>openOcrImport({mode:'visit',patientId:p.patientId});
 $('#basic-collapse').addEventListener('toggle',e=>{try{localStorage.setItem(BASIC_OPEN_KEY,e.target.open?'1':'0')}catch(err){}});
 bindPatientBasic($('#basic-collapse'),p);
}

// 删除本次随访：物理删除，不可恢复；必须填写原因（写入修改记录）。删除后回到该患者的随访记录
function openDeleteDialog(){
 let d=document.getElementById('delete-dialog');
 if(!d){
  d=document.createElement('dialog');d.id='delete-dialog';
  d.innerHTML=`<form method="dialog" class="dialog-form"><div class="dialog-header"><h2>删除本次随访</h2><button class="icon-button" value="cancel" formnovalidate aria-label="关闭">×</button></div><p class="dialog-note">将删除 ${escapeHTML(p.name)} 的「${escapeHTML(v.visitType)} ${escapeHTML(v.visitDate||'日期未填')}」。<b>删除后数据不可恢复</b>（老系统中也会一并删除），随访次数、最近随访日期会按剩下的随访重新计算；${v.baseline?'删除基线访视后，日期最早的下一次随访会成为基线访视；':''}删除原因会写入修改记录。</p><label class="form-field"><span>删除原因 <b class="required">*</b></span><textarea name="reason" rows="3" maxlength="500" required placeholder="如：重复录入；录错患者"></textarea></label><p class="delete-error" hidden></p><div class="dialog-footer"><button class="button" value="cancel" formnovalidate>取消</button><button class="button danger" value="ok" id="confirm-delete">确认删除</button></div></form>`;
  document.body.appendChild(d);
  d.querySelector('form').addEventListener('submit',async e=>{
   if(e.submitter&&e.submitter.value!=='ok')return;
   e.preventDefault();
   const reason=d.querySelector('[name=reason]').value.trim(),err=d.querySelector('.delete-error'),btn=d.querySelector('#confirm-delete');
   if(!reason){err.hidden=false;err.textContent='请填写删除原因';return}
   btn.disabled=true;btn.textContent='删除中…';err.hidden=true;
   try{
    await apiPost('/api/ra/visit/deleteVisit',{doctorId:currentDoctorId(),visitId:v.visitId,reason});
    location.replace(withFrom(`patient-visits.html?id=${encodeURIComponent(p.patientId)}`));
   }catch(ex){err.hidden=false;err.textContent=`删除失败：${ex.message}`;btn.disabled=false;btn.textContent='确认删除'}
  });
 }
 d.querySelector('[name=reason]').value='';d.querySelector('.delete-error').hidden=true;d.showModal();
}


function renderError(msg){
 $('#visit-hero').innerHTML=`<p class="pv-load-error">访视详情加载失败：${escapeHTML(msg)}。请确认后端服务已启动（${escapeHTML(API_BASE)}），或返回随访记录重新选择。</p>`;
 $('#visit-sections').innerHTML='';$('#audit').hidden=true;
}

async function load(){
 if(!patientId||!visitId){renderError('缺少患者 ID 或随访 ID');return}
 try{
  const params={doctorId:currentDoctorId()};
  [p,v]=await Promise.all([apiPost('/api/ra/patient/patientDetail',{...params,patientId}),apiPost('/api/ra/visit/visitDetail',{...params,visitId})]);
  if(String(v.patientId)!==String(p.patientId)){renderError('这条随访记录不属于该患者');return}
  renderHero();renderSections(v);
  // 从病程分析跳入：提供返回入口
  if(queryParam('from')==='insight'){const back=document.createElement('a');back.className='from-insight';back.href=`patient-insight.html?id=${encodeURIComponent(p.patientId)}`;back.textContent='← 返回病程分析';const main=document.getElementById('main');main.insertBefore(back,main.querySelector('.breadcrumb')?.nextSibling||main.firstChild);}
 }catch(e){console.error(e);renderError(e.message)}
 finally{document.querySelector('.detail-anchor').classList.remove('is-loading')}
}
bindAuditPanel($('#audit'),patientId,visitId);
load();

}
