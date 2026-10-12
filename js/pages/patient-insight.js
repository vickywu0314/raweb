/* 本人 RA 单患者实测病程；每次请求拥有独立终态与发布权。 */
"use strict";
(()=>{
 const $=selector=>document.querySelector(selector),baseTitle='患者病程分析 · 患者数据研究平台';
 const id=value=>typeof value==='string'&&/^[1-9][0-9]*$/.test(value)&&(value.length<19||(value.length===19&&value<='9223372036854775807'));
 const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
 const params=new URLSearchParams(location.search),from=params.get('from')||'ai-analysis',patientId=params.get('id');
 const valid=[...params.keys()].every(k=>['id','from'].includes(k))&&params.getAll('id').length===1&&params.getAll('from').length<=1&&['ai-analysis','ai-cohort'].includes(from)&&(!params.has('from')||params.get('from')===from)&&id(patientId);
 let flight=null,generation=0,hidden=false;
 shell('ai');
 function clear(){
   document.title=baseTitle;$('#patient-name').textContent='患者病程分析';$('#patient-meta').textContent='';
   for(const selector of ['#journey','#unplaced-visits','#treatment','#clinical-source'])$(selector).innerHTML='';
   $('#insight-source').textContent='';
   for(const selector of ['#back-patient','#visit-record','#similar-detail','#insight-chat-link']){$(selector).removeAttribute('href');$(selector).setAttribute('aria-disabled','true');}
 }
 function state(kind,message){$('#insight-state').dataset.state=kind;$('#insight-state').textContent=message;$('#cancel-load').hidden=kind!=='loading';$('#retry-load').hidden=!['error','timeout','cancelled'].includes(kind);}
 function finish(owner,kind,publish,abort=false){
   if(flight!==owner||owner.generation!==generation||owner.terminal)return false;
   owner.terminal=kind;clearTimeout(owner.timer);flight=null;if(abort)owner.controller.abort();publish();return true;
 }
 function invalidate(kind='cancelled',message='患者病程已清空，请重新加载'){
   const owner=flight;
   if(owner)finish(owner,kind,()=>{},true);
   generation++;clear();state(kind,message);
 }
 const originHref=from==='ai-cohort'?'ai-cohort.html':'ai-analysis.html';
 $('#crumb-origin').href=originHref;$('#crumb-origin').textContent=from==='ai-cohort'?'研究队列':'AI 智能分析';
 $('#back-link').href=originHref;
 $('#back-link').addEventListener('click',event=>{
   if(history.length<=1||!document.referrer)return;
   try{const previous=new URL(document.referrer),current=new URL(location.href);if(previous.origin!==current.origin||previous.pathname!==new URL(originHref,current).pathname||previous.search||previous.hash)return;event.preventDefault();history.back();}catch{}
 });
 function render(data){
   const p=data.patient,meta=data.meta,visits=new Set(data.visits.map(v=>v.visitId));
   const visitHref=visitId=>'visit-detail.html?id='+encodeURIComponent(patientId)+'&visit='+encodeURIComponent(visitId)+'&from='+from;
   const link=visitId=>id(visitId)&&visits.has(visitId)?'<a href="'+visitHref(visitId)+'">来源访视 '+esc(visitId)+'</a>':'来源访视不可链接';
   document.title=(p.name||'未知姓名')+' · '+baseTitle;$('#patient-name').textContent=(p.name||'未知姓名')+' · 实测病程';
   const unknown=value=>value===null?'未知':String(value);
   $('#patient-meta').textContent='研究编号 '+unknown(p.studyNo)+' · 性别 '+({M:'男',F:'女'}[p.sex]||'未知')+' · 年龄 '+unknown(p.age)+' · 病程年数 '+unknown(p.diseaseDurationYears)+' · 血清学 '+p.sero+' · FM '+p.fm+' · AS '+p.as;
   const labels={das28Crp:'DAS28-CRP',tjc:'TJC28',sjc:'SJC28',gh:'GH',haq:'HAQ',crp:'CRP',pain:'疼痛（量表未核实）'};
   function record(v){return '<article><time>'+esc(v.observedAt||'日期未知')+'</time><div><strong>'+link(v.visitId)+'</strong><table><thead><tr><th>指标</th><th>实测值</th><th>来源与质量</th></tr></thead><tbody>'+Object.entries(v.metrics).map(([key,m])=>'<tr><td>'+labels[key]+'</td><td>'+esc(unknown(m.value))+(m.unit?' '+esc(m.unit):'')+'</td><td>'+esc(m.sourceField)+' · '+esc(m.observedAt||'日期未知')+' · '+esc(m.quality.join(', '))+(m.missingReason?' · '+esc(m.missingReason):'')+'</td></tr>').join('')+'</tbody></table></div></article>';}
   const observed=data.visits.filter(v=>v.temporalStatus==='OBSERVED'),excluded=data.visits.filter(v=>v.temporalStatus!=='OBSERVED');
   $('#journey').innerHTML=observed.length?observed.map(record).join(''):'<p>暂无有真实日期的当前观察记录</p>';
   $('#unplaced-visits').innerHTML=excluded.length?excluded.map(v=>'<p>'+esc(v.temporalStatus==='UNDATED'?'无有效日期，未纳入当前时序':'未来记录，未纳入当前时序')+'</p>'+record(v)).join(''):'<p>无未纳入时序的访视</p>';
   if(data.visits.length===0)$('#journey').innerHTML='<p>暂无访视记录</p>';
   const tx=data.treatment,names=new Map(tx.drugNames.map(drug=>[drug.id,drug.name]));
   function episode(e,current){return '<article><strong>'+esc(e.state)+' · '+esc(e.category||'未知方案')+'</strong><p>'+esc(e.genericDrugIds.map(generic=>names.get(generic)||'未知药物').join(' / ')||'未知药物')+' · 线数 '+esc(unknown(e.line))+' · 靶向药史 '+esc(e.targetedDrugHistoryN)+'</p><p>开始 '+esc(e.startDate||e.estimatedStartDate||'未知')+' · 起点 '+esc(e.startConfidence||'未知')+' · 结束 '+esc(e.endDate||'未记录')+(current?' · 当前方案月数 '+esc(unknown(e.schemeDurationMonths)):'')+'</p><p>'+link(e.provenance.visitId)+' · '+esc(e.provenance.field)+' · '+esc(e.provenance.quality.join(', '))+' · '+esc(e.provenance.missingReason||'')+'</p></article>';}
   $('#treatment').innerHTML='<h3>当前方案</h3>'+episode(tx.current,true)+'<h3>方案历史</h3>'+tx.history.map(e=>episode(e,false)).join('');
   $('#clinical-source').innerHTML=Object.entries(p.clinicalProvenance).map(([key,value])=>'<p>'+esc(key)+' · '+esc(value.source)+' · '+esc(value.sourceField)+' · '+esc(value.quality.join(', '))+' · '+esc(value.missingReason||'')+'</p>').join('');
   $('#insight-source').textContent='RA · 截至 '+meta.asOfDate+' · 读取 '+meta.readStartedAt+' — '+meta.readCompletedAt+' · 开发口径 / 来源版本 '+Object.entries(meta.policyVersions).map(([key,value])=>key+'='+value).join(' · ')+' · trace '+meta.traceId;
   for(const selector of ['#back-patient','#visit-record']){$(selector).href='patient-visits.html?id='+encodeURIComponent(patientId)+'&from='+from;$(selector).removeAttribute('aria-disabled');}
   $('#insight-chat-link').href='ai-chat.html'+window.RACohortChatEntry.encode({kind:'PATIENT',patientId,visitId:null});$('#insight-chat-link').removeAttribute('aria-disabled');
   $('#similar-detail').href='ai-cohort.html?preset=similar&id='+encodeURIComponent(patientId);$('#similar-detail').removeAttribute('aria-disabled');
 }
 async function load(){
   if(hidden)return;
   invalidate('loading','正在读取本人 RA 患者病程…');
   if(!valid){state('invalid','患者入口无效');return;}
   const owner={generation,controller:new AbortController(),timer:null,terminal:null};flight=owner;
   owner.timer=setTimeout(()=>finish(owner,'timeout',()=>{clear();state('timeout','REQUEST_TIMEOUT：患者病程读取超时');},true),30000);
   try{const result=await window.RACohortAPI.patientInsight(patientId,{signal:owner.controller.signal});finish(owner,'success',()=>{render(result.data);state('success','已显示实际记录；未知和缺失保留。');});}
   catch(error){finish(owner,'error',()=>{clear();state('error',(error.code||'SERVICE_UNAVAILABLE')+'：患者病程暂不可用'+(error.traceId?' · trace '+error.traceId:''));});}
 }
 $('#cancel-load').addEventListener('click',()=>invalidate());$('#retry-load').addEventListener('click',load);
 window.addEventListener('storage',event=>{if(!event.key||['ra-auth','ra-user','user','token','doctorId','ra-login'].includes(event.key))invalidate();});
 window.addEventListener('ra-auth-changed',()=>invalidate());window.addEventListener('pagehide',()=>{hidden=true;invalidate();});
 window.addEventListener('pageshow',event=>{if(event.persisted){hidden=false;load();}});
 window.loadPatientInsight=load;
 load();
})();
