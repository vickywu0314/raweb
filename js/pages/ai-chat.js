/* 当前范围→实际同源chat；每个flight独占timer、问题卡与发布权。 */
"use strict";
(()=>{
  const display=window.RAUserDisplay;
  const $=s=>document.querySelector(s),escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let scope=null,cohortScope=null,patientScope=null,originalVisit=null,selectingPatient=false,searchFlight=null,searchRows=[],searchTerm='',searchPage=1,searchTotal=0,flight=null,generation=0,disposed=false,questions=[],cards=[],forceScroll=false;
  const SPARK='<svg viewBox="0 0 24 24"><path d="M12 4.5 13.6 9l4.4 1.6-4.4 1.6L12 16.7l-1.6-4.5L6 10.6 10.4 9 12 4.5Z"/></svg>',ICON_COPY='<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',ICON_RETRY='<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/></svg>';
  const clock=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?String(v??''):d.toTimeString().slice(0,8);},nearBottom=el=>!(el.scrollHeight>0)||el.scrollHeight-el.scrollTop-el.clientHeight<80;
  const user=()=>typeof currentUser==='function'?currentUser():null,identityKey=()=>JSON.stringify(user());let identity=identityKey();
  const state=(kind,message)=>{$('#chat-state').dataset.state=kind;$('#chat-state').textContent=message;busy();};
  // 发送按钮：请求进行中变成「停止」（走取消同一路径）；空输入时不可发送
  function busy(){const send=$('#chat-send'),on=!!flight,label=on?'停止本轮请求':'发送';send.classList?.toggle('stop',on);send.setAttribute?.('aria-label',label);send.title=label;send.disabled=!on&&(!scope||disposed||!String($('#chat-input').value??'').trim());}
  function grow(){const input=$('#chat-input');if(input.style&&input.scrollHeight!==undefined){input.style.height='auto';input.style.height=Math.min(180,input.scrollHeight)+'px';}busy();}
  const validQuestion=v=>{const q=String(v).trim();return q.isWellFormed()&&[...q].length>=1&&[...q].length<=500;};
  const missing={NO_RELIABLE_START:'无可靠起点',MISSING_BASELINE:'缺基线',MISSING_EVALUATION:'缺评估',PATIENT_MISMATCH:'患者不匹配',EPISODE_MISMATCH:'方案不匹配',UNDATED_PAIR:'无日期',BASELINE_AFTER_EVALUATION:'基线晚于评估',EVAL_BEFORE_SCHEME:'评估早于方案',EVAL_AFTER_SCHEME:'评估晚于方案'};
  function suggestions(){
    const questions=scope?.kind==='PATIENT'
      ?scope.visitId?['本次访视有哪些实测指标？','本次访视记录了哪些用药？']:['患者全程有哪些实测记录？','患者有哪些治疗记录？','患者的临床资料有哪些？']
      :scope?['当前范围的达标率是多少？','当前范围的疾病活动分布如何？','当前范围的成对DAS28-CRP变化如何？']:[];
    const tag=q=>/用药|治疗/.test(q)?'治疗':/临床/.test(q)?'临床':/达标/.test(q)?'达标':/活动分布/.test(q)?'活动度':/变化/.test(q)?'变化':'实测';
    $('#suggest').innerHTML=questions.map(q=>'<button type="button" data-q="'+escape(q)+'"><small>'+tag(q)+'</small>'+escape(q)+'</button>').join('');
  }
  const sample=(m,noun='符合')=>Object.hasOwn(m,'validN')?`有效 ${m.validN} · 未知 ${m.unknownN}`:`${noun} ${m.numerator} 人 · 有效/分母 ${m.denominator} · 未知 ${m.unknownN}`;
  const value=(v,d=2)=>v===null?'无数据':Number(v).toFixed(d).replace(/\.0+$|(?<=\.[0-9]*?)0+$/g,'');
  const metric=(m,noun)=>`${m.meta.status==='NO_DATA'?'无数据':m.meta.displayText} · ${sample(m.meta,noun)}`;
  function table(head,rows){return '<table class="msg-table"><thead><tr>'+head.map(v=>'<th>'+escape(v)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+escape(v).replace(/\b\d{4}-\d{2}-\d{2}\b/g,'<time class="record-date">$&</time>')+'</td>').join('')+'</tr>').join('')+'</tbody></table>';}
  function factHtml(f){const x=f.data;let html='';
    const unknown=v=>v===null?'未知':String(v),labels={das28Crp:'DAS28-CRP',tjc:'TJC28',sjc:'SJC28',gh:'GH',haq:'HAQ',crp:'CRP',pain:'疼痛'};
    const record=v=>'<h4>访视 '+escape(v.visitId)+' · '+'<time class="record-date">'+escape(v.observedAt||'日期未知')+'</time> · '+escape(display.code(v.temporalStatus))+'</h4>'+table(['指标','记录值','单位 / 量表范围','来源日期 / 项目 / 质量'],Object.entries(v.metrics).map(([k,m])=>[labels[k],unknown(m.value),display.measurementUnit(m.unit),(m.observedAt||'日期未知')+' / '+display.label(m.sourceField)+' / '+display.measurementQuality(m)]));
    if(f.key==='VISIT_MEASUREMENTS')html=record(x);
    else if(f.key==='PATIENT_COURSE')html=x.visits.length?x.visits.map(record).join(''):'<p>暂无访视记录</p>';
    else if(f.key==='VISIT_MEDICATION')html='<p>访视 '+escape(x.visitId)+' · '+escape(x.observedAt||'日期未知')+' · '+escape(display.code(x.status))+' · 未识别药物 '+x.unknownN+'</p>'+table(['记录药物','类别','开始 / 结束','来源 / 日期缺失'],x.drugs.map(v=>[v.name,display.code(v.category),(v.startDate||'未知')+' / '+(v.endDate||'未记录'),display.label(v.sourceField)+' / '+display.list(v.missingReasons)]));
    else if(f.key==='PATIENT_CLINICAL')html=table(['临床项','当前派生 / 来源'],['sex','age','diseaseDurationYears','sero','fm','as'].map(k=>[({sex:'性别',age:'年龄',diseaseDurationYears:'病程年数',sero:'血清学',fm:'纤维肌痛',as:'强直性脊柱炎'})[k],(k==='fm'?display.patientFm(x.fm,x.clinicalProvenance.fm):['sex','sero','as'].includes(k)?display.code(x[k],'未知'):unknown(x[k]))+' / '+display.code(x.clinicalProvenance[k].source)+' / '+display.label(x.clinicalProvenance[k].sourceField)+' / '+(x.clinicalProvenance[k].missingReason?display.code(x.clinicalProvenance[k].missingReason):'')+' / '+display.list(x.clinicalProvenance[k].quality)]));
    else if(f.key==='PATIENT_TREATMENT'){const names=new Map(x.drugNames.map(v=>[v.id,v.name])),episode=(e,current)=>[current?'当前方案':'历史方案',display.code(e.state)+' / '+display.code(e.category,'未知'),e.genericDrugIds.map(id=>names.get(id)||'未知药物').join(' / ')||'未知药物',(e.startDate||e.estimatedStartDate||'未知')+' / '+(e.endDate||'未记录'),display.code(e.startConfidence,'未知')+' / 线数 '+unknown(e.line)+(current?' / 月数 '+unknown(e.schemeDurationMonths):''),display.list(e.provenance.quality)+' / '+(e.provenance.missingReason?display.code(e.provenance.missingReason):'')];html=table(['范围','状态 / 类别','规范药物','开始 / 结束','起点 / 线数 / 时长','质量 / 缺失'],[episode(x.current,true),...x.history.map(e=>episode(e,false))]);}
    else if(f.key==='COHORT_SIZE')html='<p>本轮人数 '+x.n+'</p>';
    else if(f.key==='TARGET_RATE')html='<p>达标率 <b>'+escape(metric(x,'达标'))+'</b></p>';
    else if(f.key==='CLINICAL_SUMMARY')html=table(['指标','本轮结果'],[['女性比例',metric(x.female)],['血清学阳性比例',metric(x.serology)],['年龄中位数',metric(x.age)],['病程年数中位数',metric(x.diseaseDuration)]]);
    else if(f.key==='DATA_COMPLETENESS')html='<p>资料完整 '+escape(metric(x.ratio))+' · 缺失 '+x.incompleteCount+' · 质控未知 '+x.qcUnknownN+'</p>';
    else if(f.key==='ACTIVITY_DISTRIBUTION')html='<p>基线有效 '+x.baseN+' · 未知 '+x.baseUnknownN+'；评估有效 '+x.evalN+' · 未知 '+x.unknownN+'</p>'+table(['分层','基线人数/比例','评估人数/比例'],x.base.map((r,i)=>[[ '缓解','低活动','中活动','高活动'][i],r.count+' / '+(r.status==='NO_DATA'?'无数据':r.displayText),x.current[i].count+' / '+(x.current[i].status==='NO_DATA'?'无数据':x.current[i].displayText)]));
    else if(f.key==='BY_TREATMENT')html=table(['治疗类别','人数','有效人数','达标人数','达标率'],x.groups.map(g=>[display.code(g.tx),g.n,g.evalN,g.targetN,g.status==='NO_DATA'?'无数据':g.displayText]))+'<p>未知治疗 '+x.unknownTxN+' · 当前未治疗 '+x.noCurrentTxN+'；检验 '+escape(display.code(x.test.method,'不可检验'))+' · p '+escape(x.test.pValue===null?'不可检验（'+display.code(x.test.reason||x.test.status)+'）':x.test.displayP)+'</p><p>'+escape(x.comparisonNotice)+'</p>';
    else if(f.key==='FM_COMPARISON')html='<p>FM '+x.nFM+' · 明确非FM '+x.nOther+' · 未知 '+x.unknownN+'</p>'+(x.rows.length?table(['指标','FM均值/有效n','非FM均值/有效n','差值','p'],x.rows.map(r=>[({das28:'DAS28-CRP',tjc:'压痛关节',sjc:'肿胀关节',crp:'CRP',pain:'疼痛',haq:'HAQ'})[r.metric],value(r.meanFM)+' / '+r.nFMValid,value(r.meanOther)+' / '+r.nOtherValid,value(r.difference),r.test.pValue===null?'不可检验（'+display.code(r.test.reason)+'）':r.test.displayP])):'<p>每组至少3人才展示比较；当前样本不足。</p>');
    else if(f.key==='TREATMENT_LINES')html=table(['治疗线数','人数','比例'],x.groups.map(g=>[g.line,g.count,g.status==='NO_DATA'?'无数据':g.displayText]))+'<p>未知线数 '+x.unknownLineN+'</p>';
    else if(f.key==='PAIRED_DAS28_CHANGE')html='<p>有效配对 '+x.pairedN+' · 未知/不可配对 '+x.unknownN+' · 平均基线减评估 '+escape(value(x.meanDelta))+'</p>'+table(['缺失原因','人数'],Object.entries(x.missingReasons).map(([k,n])=>[missing[k],n]));
    return '<section class="chat-fact"><h3>'+escape(({VISIT_MEASUREMENTS:'本次访视实测指标',PATIENT_COURSE:'患者全程实测病程',VISIT_MEDICATION:'本次访视记录用药',PATIENT_CLINICAL:'患者临床摘要',PATIENT_TREATMENT:'患者治疗记录',COHORT_SIZE:'本轮患者人数',TARGET_RATE:'DAS28-CRP 达标率',CLINICAL_SUMMARY:'临床资料摘要',DATA_COMPLETENESS:'资料完整性',ACTIVITY_DISTRIBUTION:'疾病活动度分布',BY_TREATMENT:'治疗分组达标率',FM_COMPARISON:'纤维肌痛分组比较',TREATMENT_LINES:'治疗线数分布',PAIRED_DAS28_CHANGE:'配对 DAS28-CRP 变化'})[f.key]||'研究结果')+'</h3>'+html+'<p>'+escape(f.explanation)+'</p><p class="msg-ev">来源项目：'+f.evidence.sourceFields.map(v=>escape(display.label(v))).join('、')+'；统计口径：'+f.evidence.policyKeys.map(v=>escape(display.label(v))).join('、')+(f.evidence.sourceVisits?'；来源访视：'+f.evidence.sourceVisits.map(v=>escape(v.visitId)).join('、'):'')+'</p></section>';
  }
  function resultHtml(d){const m=d.meta,meta='<p class="msg-ev">本轮 '+d.scope.n+' 人 · '+escape(display.time(m.at))+' · 截至 '+escape(m.asOfDate)+'<br>读取 '+escape(m.readStartedAt)+' → '+escape(m.readCompletedAt)+'<br>统计口径仍待医学核验'+'</p>';
    if(d.status==='UNSUPPORTED')return '<p>'+escape({SCOPE_CHANGE_REQUIRED:'此问题需要改变范围，请返回原条件页修改范围后再问。',MEDICAL_ADVICE:'当前研究问答不提供诊疗建议。',UNSUPPORTED_QUESTION:'当前问题不在数据查询、既有统计、实测变化与结果解释范围内。'}[d.reason])+'</p>'+meta;
    return d.facts.map(factHtml).join('')+meta;
  }
  function render(){const current=cards.at(-1),log=$('#chat-log'),stick=forceScroll||nearBottom(log);forceScroll=false;
    log.innerHTML=cards.map((c,i)=>{const pending=flight?.card===c;return '<article class="chat-turn'+(c.fresh?' fresh':'')+'" data-card="'+i+'"><div class="msg-user"><p class="question">'+escape(c.question)+'</p></div><div class="msg-ai"><span class="avatar-ai" aria-hidden="true">'+SPARK+'</span><div class="ai-body"><p class="msg-ev turn-tag'+(c===current?'':' old')+'">'+(c===current?'本轮问题':'旧轮记录（不代表当前结果）')+' · '+escape(clock(c.at))+'</p>'
      +(pending?'<div class="ai-pending" aria-hidden="true"><i></i><i></i><i></i></div><p class="msg-ev">'+escape(c.message)+'</p>'
        :'<div class="ai-answer">'+(c.data?resultHtml(c.data):'<p class="ai-stopped">'+escape(c.message)+'</p>')+'</div><div class="ai-actions"><button type="button" data-act="copy" title="复制" aria-label="复制回答">'+ICON_COPY+'</button><button type="button" data-act="retry" title="重新生成" aria-label="重新生成">'+ICON_RETRY+'</button><span class="ai-meta">'+escape(c.done||'')+'</span></div>')
      +'</div></div></article>';}).join('');
    cards.forEach(c=>{c.fresh=false;});if(stick&&log.scrollHeight!==undefined)log.scrollTop=log.scrollHeight;}
  // 已结束的一轮：记录真实完成时间，回答淡入一次
  function finish(card,text){const now=new Date();card.done=text+' · '+String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');card.fresh=true;}
  function retire(op,cause){if(!op||op.terminal)return;op.terminal=cause;if(flight===op)flight=null;clearTimeout(op.timer);op.timer=null;op.controller.abort();}
  function clear(cause){generation++;retireSearch(searchFlight);searchRows=[];$('#patient-results').innerHTML='';$('#patient-page').textContent='';$('#patient-prev').disabled=true;$('#patient-next').disabled=true;$('#patient-keyword').value='';$('#patient-search-state').textContent='输入姓名、患者编号或研究号后点「搜索」';$('#scope-patient-note').textContent='搜索并选择本人名下的患者';const old=flight;retire(old,cause);questions=[];cards=[];$('#chat-log').innerHTML='';$('#chat-input').value='';grow();}
  function validOwner(op){return !disposed&&!op.terminal&&flight===op&&op.generation===generation&&op.identity===identity&&op.identity===identityKey();}
  function restore(){clear('SCOPE_CHANGED');scope=null;cohortScope=null;patientScope=null;originalVisit=null;selectingPatient=false;identity=identityKey();$('#chat-return').onclick=null;$('#chat-return').href='ai-analysis.html';$('#chat-return').textContent='返回智能分析';$('#scope-cohort-wrap').hidden=true;patientDisplay();
    if(!user()){state('invalid','请先登录后重新进入问答');return;}
    try{scope=window.RACohortChatEntry.decode(location.search,location.hash);if(scope.kind==='COHORT'){cohortScope=scope;$('#scope-cohort-wrap').hidden=false;$('#scope-cohort-note').textContent='完整当前条件；人数在每轮提交后计算';}
      if(scope.kind==='PATIENT'){patientScope=scope;originalVisit=scope.visitId;selectingPatient=true;}
      patientDisplay();
      $('#scope-all').checked=scope.kind==='ALL';$('#scope-cohort').checked=scope.kind==='COHORT';
      if(scope.kind==='COHORT'&&history.length>1&&document.referrer){const ref=new URL(document.referrer,location.href);if(ref.origin===location.origin&&ref.pathname.endsWith('/ai-cohort.html')){$('#chat-return').href=ref.pathname;$('#chat-return').textContent='返回原条件页';$('#chat-return').onclick=e=>{e.preventDefault();history.back();};}}
      state('idle','范围已确定，请输入问题');
    }catch{scope=null;state('invalid','问答范围入口无效，请返回条件页重新选择');}
  }
  function patientDisplay(){suggestions();const patient=scope?.kind==='PATIENT';const description=!scope?'请选择范围后提交问题。':'每次根据'+(patient?(scope.visitId?'当前患者本次访视':'当前患者全程'):scope.kind==='COHORT'?'完整当前队列':'当前本人 RA 研究库')+'的实际记录，回答数据查询、统计与变化问题。';$('#scope-subtitle').textContent=description;$('#patient-picker').hidden=!(patient||selectingPatient);if(!patient){$('#chat-return').href='ai-analysis.html';$('#chat-return').textContent='返回智能分析';$('#chat-return').onclick=null;}$('#scope-patient').checked=patient;$('#patient-focus').hidden=!patient;$('#scope-patient-note').textContent=patient?'患者 '+scope.patientId+' · '+(scope.visitId?'本次访视 '+scope.visitId:'全程'):'搜索并选择本人名下的患者';$('#patient-course').hidden=!patient||scope.visitId===null;$('#patient-visit').hidden=!patient||!originalVisit||scope.visitId!==null;
    if(patient){$('#chat-return').href=scope.visitId?'visit-detail.html?id='+encodeURIComponent(scope.patientId)+'&visit='+encodeURIComponent(scope.visitId)+'&from=ai-analysis':'patient-visits.html?id='+encodeURIComponent(scope.patientId)+'&from=ai-analysis';$('#chat-return').textContent=scope.visitId?'返回本次访视':'返回患者档案';$('#chat-return').onclick=null;
      try{const ref=new URL(document.referrer,location.href),params=ref.searchParams,path=ref.pathname.split('/').at(-1),allowed=path==='visit-detail.html'?['id','visit','from']:['id','from'];if(ref.origin===location.origin&&ref.pathname===new URL(path,location.href).pathname&&!ref.hash&&['patient-visits.html','patient-insight.html','visit-detail.html'].includes(path)&&params.getAll('id').length===1&&params.get('id')===scope.patientId&&[...params.keys()].every(k=>allowed.includes(k)&&params.getAll(k).length===1)&&(!params.has('from')||['ai-analysis','ai-cohort','patients','projects'].includes(params.get('from')))&&(path!=='visit-detail.html'||scope.visitId!==null&&params.get('visit')===scope.visitId)&&history.length>1){$('#chat-return').href=ref.pathname+ref.search;$('#chat-return').onclick=e=>{e.preventDefault();history.back();};}}catch{}
    }
  }
  function changeScope(kind){if(disposed||!user())return;clear('SCOPE_CHANGED');selectingPatient=kind==='PATIENT';scope=kind==='COHORT'?cohortScope:kind==='PATIENT'?patientScope:{kind:'ALL'};patientDisplay();state(scope?'idle':'invalid',scope?'已切换分析范围，请输入问题或选择下方推荐问题。':'请先搜索并选择一位患者');}
  function changeFocus(visitId){if(scope?.kind!=='PATIENT'||disposed||!user())return;clear('SCOPE_CHANGED');scope={kind:'PATIENT',patientId:scope.patientId,visitId};patientScope=scope;patientDisplay();state('idle','已切换患者，请输入问题后点「发送」');}
  function retireSearch(op){if(!op||op.terminal)return;op.terminal=true;if(searchFlight===op)searchFlight=null;clearTimeout(op.timer);op.timer=null;op.controller.abort();$('#patient-search-cancel').hidden=true;}
  const ownsSearch=op=>!disposed&&!op.terminal&&searchFlight===op&&op.generation===generation&&op.identity===identity&&op.identity===identityKey();
  async function searchPatients(keyword,page=1){if(disposed||!user()||identityKey()!==identity)return;retireSearch(searchFlight);searchRows=[];$('#patient-results').innerHTML='';$('#patient-page').textContent='';$('#patient-prev').disabled=true;$('#patient-next').disabled=true;$('#patient-search-state').textContent='正在搜索…';const op={controller:new AbortController(),timer:null,terminal:false,generation,identity};searchFlight=op;$('#patient-search-cancel').hidden=false;
    op.timer=setTimeout(()=>{
  const display=window.RAUserDisplay;if(identityKey()!==identity){auth();return;}if(!ownsSearch(op))return;retireSearch(op);$('#patient-search-state').textContent='患者搜索已结束';},30000);
    try{const r=await window.RACohortAPI.patientSearch({keyword,page,size:20},{signal:op.controller.signal},true);if(identityKey()!==identity){auth();return;}if(!ownsSearch(op))return;retireSearch(op);searchRows=r.data.items;searchTerm=keyword;searchPage=r.data.page;searchTotal=r.data.total;$('#patient-results').innerHTML=searchRows.map(p=>'<button type="button" data-patient-id="'+escape(p.patientId)+'">'+escape(p.name||'姓名未提供')+' · '+escape(p.studyNo||'研究号未提供')+' · '+escape(p.patientId)+'</button>').join('');$('#patient-search-state').textContent=searchRows.length?'请选择本轮搜索结果':'当前搜索无匹配患者';$('#patient-page').textContent='第 '+searchPage+' 页 · 共 '+searchTotal+' 人';$('#patient-prev').disabled=searchPage<=1;$('#patient-next').disabled=searchPage*20>=searchTotal;}
    catch(e){if(identityKey()!==identity){auth();return;}if(!ownsSearch(op))return;retireSearch(op);$('#patient-search-state').textContent=display.error(e,'患者搜索失败');if(e.status===401)auth();}
  }
  $('#patient-search').addEventListener('submit',e=>{e.preventDefault();searchPatients($('#patient-keyword').value,1);});
  $('#patient-prev').addEventListener('click',()=>{if(searchPage>1)searchPatients(searchTerm,searchPage-1);});$('#patient-next').addEventListener('click',()=>{if(searchPage*20<searchTotal)searchPatients(searchTerm,searchPage+1);});
  $('#patient-search-cancel').addEventListener('click',()=>{retireSearch(searchFlight);$('#patient-search-state').textContent='搜索已取消';});
  $('#patient-results').addEventListener('click',e=>{const button=e.target.closest('[data-patient-id]'),selected=searchRows.find(p=>p.patientId===button?.dataset.patientId);if(!selected||disposed||identityKey()!==identity)return;clear('PATIENT_CHANGED');scope={kind:'PATIENT',patientId:selected.patientId,visitId:null};patientScope=scope;originalVisit=null;selectingPatient=true;patientDisplay();$('#scope-patient-note').textContent=(selected.name||'姓名未提供')+' · 患者 '+selected.patientId+' · 全程';state('idle','已选择该患者全程记录，请输入问题后点「发送」');});
  async function ask(question){if(disposed||!scope||!user())return;if(identityKey()!==identity){restore();return;}const q=String(question).trim();if(!validQuestion(q)){state('error','问题须为1至500个字符');return;}
    const superseded=flight;retire(superseded,'SUPERSEDED');if(superseded){superseded.card.message='已发送新问题，本轮未完成';finish(superseded.card,'已中断');}forceScroll=true;const previousQuestions=questions.slice(-3);questions.push(q);questions=questions.slice(-3);const card={question:q,at:new Date().toISOString(),data:null,message:'正在读取本轮数据…'};cards.push(card);const op={controller:new AbortController(),timer:null,terminal:null,generation,identity,card,scope:structuredClone(scope)};flight=op;render();state('loading','正在读取本轮数据并选择事实…');
    op.timer=setTimeout(()=>{
  const display=window.RAUserDisplay;if(identityKey()!==identity){auth();return;}if(!validOwner(op))return;retire(op,'TIMEOUT');card.message='等待超时，请重新发送问题';finish(card,'已超时');render();state('timeout',card.message);},30000);
    try{const response=await window.RACohortAPI.chat({scope:op.scope,question:q,previousQuestions},{signal:op.controller.signal});if(identityKey()!==identity){auth();return;}if(!validOwner(op))return;retire(op,'SUCCESS');card.data=response.data;finish(card,response.data.status==='ANSWER'?'回答完成':'不在支持范围');render();state(response.data.status==='ANSWER'?'success':'unsupported',response.data.status==='ANSWER'?'本轮回答已更新':'本轮问题不受支持，范围保持不变');}
    catch(error){if(identityKey()!==identity){auth();return;}if(!validOwner(op))return;retire(op,'ERROR');card.message=display.error(error,'请求失败');finish(card,'请求失败');if(error.status===401){clear('UNAUTHENTICATED');scope=null;}else render();state('error',card.message);}
  }
  // 输入框：自动增高（最高180px）；Enter 发送、Shift+Enter 换行；输入法组字中不发送；超出500字时保留原文并提示
  $('#chat-form').addEventListener('submit',e=>{e.preventDefault();if(flight)return;const q=$('#chat-input').value;if(validQuestion(q)){$('#chat-input').value='';grow();}ask(q);});
  $('#chat-input').addEventListener('input',grow);
  $('#chat-input').addEventListener('keydown',e=>{if(e.key!=='Enter'||e.shiftKey||e.isComposing||e.keyCode===229)return;e.preventDefault();if(flight||$('#chat-send').disabled)return;const form=$('#chat-form');if(form.requestSubmit)form.requestSubmit();else form.dispatchEvent(new Event('submit',{cancelable:true}));});
  // 推荐问题：点击即按当前范围提问（与手动发送同一路径）
  $('#suggest').addEventListener('click',e=>{const button=e.target.closest('[data-q]');if(button&&!flight){$('#chat-input').value='';grow();ask(button.dataset.q);}});
  // 回答操作：复制本轮真实回答（含依据与读取时间）、按同一问题重新请求一次
  function notify(message){if(typeof document.createElement!=='function')return;document.querySelectorAll?.('.ra-toast').forEach(t=>t.remove());const t=document.createElement('div');t.className='ra-toast';t.setAttribute('role','status');t.textContent=message;document.body.appendChild(t);requestAnimationFrame(()=>t.classList.add('show'));setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),250);},1800);}
  function copyText(text){const fallback=()=>{const area=document.createElement('textarea');area.value=text;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();let ok=false;try{ok=document.execCommand('copy');}catch{}area.remove();notify(ok?'已复制到剪贴板':'复制失败，请手动选择文字复制');};
    if(window.isSecureContext&&navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(()=>notify('已复制到剪贴板'),fallback);else fallback();}
  $('#chat-log').addEventListener('click',e=>{const button=e.target.closest?.('[data-act]'),turn=button?.closest('[data-card]'),card=cards[Number(turn?.dataset.card)];if(!card)return;
    if(button.dataset.act==='copy')copyText((turn.querySelector('.ai-answer')?.innerText||'').trim());
    else if(button.dataset.act==='retry'&&!flight)ask(card.question);});
  // 开启新对话：停止进行中的请求，清空本页对话回到欢迎状态；范围与患者选择保持不变
  $('#new-chat')?.addEventListener('click',()=>{if(disposed)return;retire(flight,'NEW_CHAT');questions=[];cards=[];$('#chat-log').innerHTML='';$('#chat-input').value='';grow();if(scope)state('idle','已开启新对话，请输入问题或选择推荐问题');else busy();$('#chat-input').focus();});
  $('#scope-all').addEventListener('change',()=>changeScope('ALL'));$('#scope-cohort').addEventListener('change',()=>changeScope('COHORT'));$('#scope-patient').addEventListener('change',()=>changeScope('PATIENT'));
  $('#patient-course').addEventListener('click',()=>changeFocus(null));$('#patient-visit').addEventListener('click',()=>changeFocus(originalVisit));
  // 停止：请求进行中点发送按钮（已变为停止按钮）即取消本轮
  $('#chat-send').addEventListener('click',e=>{const op=flight;if(!op)return;e?.preventDefault?.();retire(op,'CANCELLED');op.card.message='本轮请求已停止';finish(op.card,'已停止');render();state('cancelled',op.card.message);});
  window.addEventListener('hashchange',()=>{if(!disposed)restore();});
  const auth=()=>{clear('IDENTITY_CHANGED');scope=null;cohortScope=null;patientScope=null;originalVisit=null;selectingPatient=false;patientDisplay();identity=identityKey();state('invalid','登录身份已变化，请刷新页面后重新提问');};
  window.addEventListener('ra-auth-changed',auth);window.addEventListener('storage',e=>{if(e.key==='ra-auth'||e.key===null)auth();});
  window.addEventListener('pagehide',()=>{disposed=true;clear('PAGEHIDE');scope=null;patientScope=null;originalVisit=null;selectingPatient=false;patientDisplay();state('disposed','页面已离开');});
  window.addEventListener('pageshow',e=>{if(e.persisted){disposed=false;restore();}});
  $('#chat-account').textContent=typeof user()?.name==='string'?user().name:'当前登录用户';
  // 页头头像、侧栏研究库卡片、欢迎语里的范围名（与原型一致；不影响问答逻辑）
  if($('#chat-avatar'))$('#chat-avatar').textContent=($('#chat-account').textContent||'医').slice(0,1);
  $('#project-switch')?.addEventListener('click',()=>{location.href='projects.html';});
  const welcomeScope=()=>{const node=$('#chat-welcome-scope'),checked=document.querySelector('#scope-list input:checked');if(node&&checked)node.textContent={ALL:'整个研究库',COHORT:'当前队列',PATIENT:'所选患者'}[checked.value]||'当前选择的范围';};
  $('#scope-list')?.addEventListener('change',welcomeScope);welcomeScope();
  window.RAChatPage=Object.freeze({ask});restore();
})();
