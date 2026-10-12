/* 队列页面JSON入口；原签名cursor不拆解，不以演示账号提供认证。 */
"use strict";
window.RACohortAPI = (()=>{
  async function post(path, body, {signal} = {},sameOrigin=false) {
    let response;
    try { response = await fetch((sameOrigin?'':API_BASE) + '/api/ra/' + path, {
      method: 'POST', credentials: 'same-origin', signal,
      headers: {'Content-Type': 'application/json;charset=UTF-8'},
      body: JSON.stringify(body)
    }); } catch (cause) {
      throw Object.assign(new Error(signal?.aborted ? '请求已结束' : '网络连接失败，请重新分析'), {status: 0, success: false, code: signal?.aborted ? 'REQUEST_CANCELLED' : 'NETWORK_ERROR', data: null, traceId: null, cause});
    }
    let envelope;
    try {
      if (!response.headers.get('Content-Type')?.toLowerCase().includes('application/json')) throw new Error('non-json');
      envelope = await response.json();
      if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) throw new Error('invalid-envelope');
    } catch {
      throw Object.assign(new Error('接口返回无效JSON'), {status: response.status, success: false, code: 'INVALID_RESPONSE', data: null, traceId: response.headers.get('X-Trace-Id')});
    }
    const result = {status: response.status, success: envelope.success, code: envelope.code, message: envelope.message, data: envelope.data, traceId: response.headers.get('X-Trace-Id')};
    if (!response.ok || envelope.success !== true) {
      const error = new Error(envelope.message || `接口请求失败（HTTP ${response.status}）`);
      Object.assign(error, result);
      throw error;
    }
    return result;
  }
  const XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  function fileError(message,status,code,traceId,cause){return Object.assign(new Error(message),{status,success:false,code,data:null,traceId,cause});}
  function fileName(disposition,command){
    let candidate=null;
    if(typeof disposition==='string'){
      const encoded=disposition.match(/(?:^|;)\s*filename\*=UTF-8''([^;]+)/i),ordinary=disposition.match(/(?:^|;)\s*filename=(?:"([^"\r\n]*)"|([^;\s]+))/i);
      try{candidate=encoded?decodeURIComponent(encoded[1]):ordinary?(ordinary[1]??ordinary[2]):null;}catch{}
    }
    return typeof candidate==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,150}\.xlsx$/i.test(candidate)?candidate:`${command.source==='COMPARE'?'comparison':'cohort'}-${command.source==='COMPARE'?command.compareResultId:command.analysisId}.xlsx`;
  }
  async function exportXlsx(command,{signal}={}){
    let response;
    try{response=await fetch(API_BASE+'/api/ra/export/xlsx',{method:'POST',credentials:'same-origin',signal,headers:{'Content-Type':'application/json;charset=UTF-8'},body:JSON.stringify(command)});}
    catch(cause){throw fileError(signal?.aborted?'请求已结束':'文件请求网络连接失败',0,signal?.aborted?'REQUEST_CANCELLED':'NETWORK_ERROR',null,cause);}
    const traceId=response.headers.get('X-Trace-Id'),mime=response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
    if(response.ok&&mime===XLSX){
      let blob;try{blob=await response.blob();}catch(cause){throw fileError('文件内容读取失败',response.status,'BODY_READ_FAILED',traceId,cause);}
      return {status:response.status,kind:'xlsx',blob,filename:fileName(response.headers.get('Content-Disposition'),command),traceId};
    }
    if(mime==='application/json'){
      let envelope;try{envelope=await response.json();if(!envelope||typeof envelope!=='object'||Array.isArray(envelope))throw new Error('invalid-envelope');}
      catch(cause){throw fileError('接口返回无效JSON',response.status,'INVALID_RESPONSE',traceId,cause);}
      throw Object.assign(new Error(envelope.message||(response.ok&&envelope.success===true?'接口返回JSON，未返回文件':`文件请求失败（HTTP ${response.status}）`)),{status:response.status,success:envelope.success,code:envelope.code,message:envelope.message||'文件响应不是XLSX',data:envelope.data,traceId,kind:'json'});
    }
    throw fileError('接口未返回有效XLSX或JSON',response.status,'INVALID_RESPONSE',traceId);
  }
  const canonicalId=value=>typeof value==='string'&&/^[1-9][0-9]*$/.test(value)&&(value.length<19||(value.length===19&&value<='9223372036854775807'));
  const invalidDetail=result=>Object.assign(new Error('详情响应无效'),{status:result.status,code:'INVALID_RESPONSE',data:null,traceId:result.traceId});
  return Object.freeze({
    async chat(command,options){
      const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
      const exact=(x,keys)=>object(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
      const count=x=>Number.isSafeInteger(x)&&x>=0,number=x=>typeof x==='number'&&Number.isFinite(x),nullableNumber=x=>x===null||number(x);
      const text=x=>typeof x==='string'&&x.isWellFormed(),strings=x=>Array.isArray(x)&&x.every(text),nullableText=x=>x===null||text(x);
      const invalidRequest=()=>Object.assign(new Error('问答输入无效'),{code:'INVALID_REQUEST',data:null});
      const filterKeys=['studyCode','sex','age','sero','tx','at','act','cm','data','ids'];
      const enums={studyCode:['RA'],sex:[null,'','F','M'],sero:[null,'','1'],tx:[null,'','csDMARD','bio','TNFi','JAKi','IL-6i','Abatacept'],at:['now','6m'],act:[null,'','target','mod-high','remission','low','moderate','high'],cm:[null,'','FM','AS','none'],data:[null,'','complete','missing']};
      function filters(f){
        if(!exact(f,filterKeys)||Object.entries(enums).some(([k,v])=>!v.includes(f[k]))||!(f.age===null||f.age===''||typeof f.age==='string'&&/^[0-9]{1,3}-[0-9]{0,3}$/.test(f.age)&&Number(f.age.split('-')[0])<=Number(f.age.split('-')[1]||120)&&Number(f.age.split('-')[1]||120)<=120)||!(f.ids===null||Array.isArray(f.ids)&&f.ids.length<=5000&&f.ids.every(canonicalId)))return null;
        const normalized=Object.fromEntries(filterKeys.map(k=>[k,k==='ids'?f.ids===null?null:[...new Set(f.ids)].sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0):f[k]===''?null:f[k]]));return normalized;
      }
      const defaultFilters={studyCode:'RA',sex:null,age:null,sero:null,tx:null,at:'now',act:null,cm:null,data:null,ids:null};
      const question=q=>text(q)&&[...q.trim()].length>=1&&[...q.trim()].length<=500;
      const scope=command?.scope;
      if(!exact(command,Object.hasOwn(command||{},'previousQuestions')?['scope','question','previousQuestions']:['scope','question'])||!question(command.question)||!(command.previousQuestions===undefined||Array.isArray(command.previousQuestions)&&command.previousQuestions.length<=3&&command.previousQuestions.every(question))||!scope||!(scope.kind==='PATIENT'&&exact(scope,Object.hasOwn(scope,'visitId')?['kind','patientId','visitId']:['kind','patientId'])&&canonicalId(scope.patientId)&&(scope.visitId==null||canonicalId(scope.visitId))||scope.kind==='ALL'&&exact(scope,['kind'])||scope.kind==='COHORT'&&exact(scope,['kind','filters'])&&filters(scope.filters)))throw invalidRequest();
      const patient=scope.kind==='PATIENT',expected=patient?{at:'now'}:scope.kind==='ALL'?defaultFilters:filters(scope.filters);
      const result=await post('ai/chat',{...command,previousQuestions:command.previousQuestions||[]},options,true),d=result.data,m=d?.meta,n=d?.scope?.n;
      const invalid=()=>Object.assign(new Error('问答响应无效'),{status:result.status,success:false,code:'INVALID_RESPONSE',data:null,traceId:result.traceId});
      const sameFilters=(a,b)=>a&&b&&filterKeys.every(k=>JSON.stringify(a[k])===JSON.stringify(b[k]));
      const date=x=>text(x)&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
      const instant=x=>text(x)&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(x)&&Number.isFinite(Date.parse(x));
      const versions={descriptive:'dev-descriptive-v04',qc:'dev-missing-v04',crp:'dev-crp-v04',now:'dev-now-v04',clinical:'dev-clinical-v04',serology:'dev-ever-serology-v04',treatment:'dev-timeline-v04',visitMatcher:'dev-visit-match-v04',statistics:'dev-stats-v04'};
      if(patient)versions.insight='dev-insight-v01';
      const ratio=(x,total,target=false)=>exact(x,['value','meta'])&&number(x.value)&&x.value>=0&&x.value<=1&&exact(x.meta,['numerator','denominator','unknownN','status','displayText'])&&['numerator','denominator','unknownN'].every(k=>count(x.meta[k]))&&x.meta.numerator<=x.meta.denominator&&x.meta.unknownN<=total&&(target?x.meta.denominator+x.meta.unknownN===total:x.meta.denominator===total)&&x.meta.status===(x.meta.denominator===0?'NO_DATA':'OK')&&text(x.meta.displayText)&&Math.abs(x.value-(x.meta.denominator?x.meta.numerator/x.meta.denominator:0))<1e-12;
      const median=x=>exact(x,['value','meta'])&&nullableNumber(x.value)&&exact(x.meta,['validN','unknownN','status','displayText'])&&count(x.meta.validN)&&count(x.meta.unknownN)&&x.meta.validN+x.meta.unknownN===n&&x.meta.status===(x.meta.validN===0?'NO_DATA':'OK')&&(x.value===null)===(x.meta.validN===0)&&text(x.meta.displayText);
      const bucket=(x,k,label,den)=>exact(x,[k,'count','value','status','displayText'])&&x[k]===label&&count(x.count)&&x.count<=den&&number(x.value)&&Math.abs(x.value-(den?x.count/den:0))<1e-12&&x.status===(den===0?'NO_DATA':'OK')&&text(x.displayText);
      const stat=x=>exact(x,['method','status','pValue','displayP','significant','nA','nB','reason','warnings','policyVersion','testDenominator',...(Object.hasOwn(x||{},'includedGroups')?['expectedBelow5Cells','expectedCellCount','includedGroups','excludedGroups','groupNs']:[])])&&[x.nA,x.nB].every(v=>v===null||count(v))&&Object.hasOwn(x,'pValue')&&nullableNumber(x.pValue)&&(x.pValue===null||x.pValue>=0&&x.pValue<=1)&&text(x.status)&&nullableText(x.method)&&nullableText(x.reason)&&text(x.displayP)&&x.policyVersion==='dev-stats-v04'&&text(x.testDenominator)&&(x.significant===null||typeof x.significant==='boolean')&&strings(x.warnings);
      const factKeys=patient?(scope.visitId!=null?['VISIT_MEASUREMENTS','VISIT_MEDICATION']:['PATIENT_COURSE','PATIENT_CLINICAL','PATIENT_TREATMENT']):['COHORT_SIZE','TARGET_RATE','ACTIVITY_DISTRIBUTION','BY_TREATMENT','FM_COMPARISON','DATA_COMPLETENESS','CLINICAL_SUMMARY','TREATMENT_LINES','PAIRED_DAS28_CHANGE'];
      const nullableDate=x=>x===null||date(x),integer=count;
      const idsInSource=x=>{
        if(Array.isArray(x))return x.every(idsInSource);
        if(!object(x))return true;
        return Object.entries(x).every(([k,v])=>['sourceVisitId','visitId','sourceRowId'].includes(k)?v===null||canonicalId(v):idsInSource(v));
      };
      const provenance=x=>{
        const keys=['source','sourceField','quality','missingReason'];if(Object.hasOwn(x||{},'observations'))keys.push('observations');
        if(!exact(x,keys)||!text(x.source)||!text(x.sourceField)||!strings(x.quality)||!nullableText(x.missingReason)||!idsInSource(x))return false;
        if(!Object.hasOwn(x,'observations'))return x.source==='LEGACY_RECORDED';
        if(!Array.isArray(x.observations))return false;
        return x.observations.every(o=>x.source==='CONFIGURED_FM_EVIDENCE'?exact(o,['evidenceId','observedAt','fmState'])&&text(o.evidenceId)&&date(o.observedAt)&&['TRUE','FALSE','UNKNOWN'].includes(o.fmState):x.source==='LEGACY_POSITIVE_ASSOCIATION'?exact(o,['sourceRowId','sinceYear'])&&canonicalId(o.sourceRowId)&&(o.sinceYear===null||Number.isSafeInteger(o.sinceYear)):exact(o,['sourceVisitId','sourceField','observedAt','status'])&&canonicalId(o.sourceVisitId)&&text(o.sourceField)&&date(o.observedAt)&&text(o.status));
      };

      const metricKeys=['value','unit','sourceVisitId','sourceField','observedAt','quality','missingReason'];
      const metric=(x,v)=>exact(x,metricKeys)&&nullableNumber(x.value)&&nullableText(x.unit)&&x.sourceVisitId===v.visitId&&text(x.sourceField)&&x.observedAt===v.observedAt&&strings(x.quality)&&nullableText(x.missingReason);
      const episodeKeys=['episodeKey','state','category','line','targetedDrugHistoryN','startDate','estimatedStartDate','endDate','startConfidence','genericDrugIds','provenance'];
      const episode=(x,current)=>exact(x,current?[...episodeKeys,'schemeDurationMonths']:episodeKeys)&&nullableText(x.episodeKey)&&['ACTIVE','NONE','UNKNOWN','CONFLICT'].includes(x.state)&&nullableText(x.category)&&(x.line===null||integer(x.line))&&integer(x.targetedDrugHistoryN)&&['startDate','estimatedStartDate','endDate'].every(k=>nullableDate(x[k]))&&nullableText(x.startConfidence)&&strings(x.genericDrugIds)&&exact(x.provenance,['visitId','field','observedAt','quality','missingReason','dictionaryVersion',...(Object.hasOwn(x.provenance||{},'drugFacts')?['drugFacts']:[])])&&nullableText(x.provenance.visitId)&&(x.provenance.visitId===null||canonicalId(x.provenance.visitId))&&text(x.provenance.field)&&nullableDate(x.provenance.observedAt)&&strings(x.provenance.quality)&&nullableText(x.provenance.missingReason)&&text(x.provenance.dictionaryVersion)&&(!Object.hasOwn(x.provenance,'drugFacts')||(Array.isArray(x.provenance.drugFacts)&&x.provenance.drugFacts.every(f=>exact(f,['genericDrugId','startTime','endTime','visitId','field','observedAt'])&&text(f.genericDrugId)&&nullableText(f.startTime)&&nullableText(f.endTime)&&canonicalId(f.visitId)&&text(f.field)&&date(f.observedAt))))&&idsInSource(x.provenance)&&(!current||x.schemeDurationMonths===null||integer(x.schemeDurationMonths));

      const visit=x=>exact(x,['visitId','observedAt','temporalStatus','metrics'])&&canonicalId(x.visitId)&&nullableDate(x.observedAt)&&x.temporalStatus===(x.observedAt===null?'UNDATED':x.observedAt>m.asOfDate?'FUTURE':'OBSERVED')&&exact(x.metrics,['das28Crp','tjc','sjc','gh','haq','crp','pain'])&&Object.values(x.metrics).every(v=>metric(v,x))&&x.metrics.das28Crp.unit===null&&x.metrics.das28Crp.sourceField==='bqpg.result.crpScore'&&x.metrics.pain.value===null&&x.metrics.pain.missingReason==='UNVERIFIED_SCALE'&&x.metrics.pain.quality.includes('SCALE_UNVERIFIED');
      function visits(xs){if(!Array.isArray(xs))return false;let previous=null;const seen=new Set();for(const v of xs){if(!visit(v)||seen.has(v.visitId)||previous&&(previous.observedAt===null&&v.observedAt!==null||previous.observedAt!==null&&v.observedAt!==null&&previous.observedAt>v.observedAt||previous.observedAt===v.observedAt&&BigInt(previous.visitId)>=BigInt(v.visitId)))return false;seen.add(v.visitId);previous=v;}return true;}
      function sources(f){const e=f.evidence;if(!exact(e,patient?['scopeRef','sourceFields','policyKeys','sourceVisits']:['scopeRef','sourceFields','policyKeys']))return false;if(!patient)return true;if(!Array.isArray(e.sourceVisits)||new Set(e.sourceVisits.map(v=>v?.visitId)).size!==e.sourceVisits.length||!e.sourceVisits.every(v=>exact(v,['patientId','visitId'])&&v.patientId===scope.patientId&&canonicalId(v.visitId)&&(scope.visitId==null||v.visitId===scope.visitId)))return false;
        const refs=new Set(e.sourceVisits.map(v=>v.visitId));if(f.key==='PATIENT_COURSE')return f.data.visits.length===refs.size&&f.data.visits.every(v=>refs.has(v.visitId));if(f.key.startsWith('VISIT_'))return refs.size===1&&refs.has(scope.visitId);
        function hasRefs(x){if(Array.isArray(x))return x.every(hasRefs);if(!object(x))return true;return Object.entries(x).every(([k,v])=>['visitId','sourceVisitId'].includes(k)?v===null||refs.has(v):hasRefs(v));}return hasRefs(f.data);
      }
      function data(key,x){
        if(key==='VISIT_MEASUREMENTS')return visit(x)&&x.visitId===scope.visitId;
        if(key==='VISIT_MEDICATION')return exact(x,['visitId','observedAt','status','drugs','unknownN'])&&x.visitId===scope.visitId&&nullableDate(x.observedAt)&&['RECORDED','NOT_RECORDED','INVALID'].includes(x.status)&&count(x.unknownN)&&Array.isArray(x.drugs)&&(x.status==='RECORDED'||x.drugs.length===0&&x.unknownN===0)&&x.drugs.every(v=>exact(v,['name','category','startDate','endDate','sourceField','missingReasons'])&&text(v.name)&&v.name.length>0&&['csDMARD','TNFi','JAKi','IL-6i','Abatacept'].includes(v.category)&&nullableDate(v.startDate)&&nullableDate(v.endDate)&&['zlfa.xyList','zlfa.zcyList'].includes(v.sourceField)&&strings(v.missingReasons)&&new Set(v.missingReasons).size===v.missingReasons.length&&v.missingReasons.every(k=>['MISSING_START','INVALID_START','MISSING_END','INVALID_END'].includes(k))&&['START','END'].every((k,i)=>v[['startDate','endDate'][i]]===null?v.missingReasons.filter(r=>r.endsWith(k)).length===1:v.missingReasons.every(r=>!r.endsWith(k))));
        if(key==='PATIENT_COURSE')return exact(x,['visits'])&&visits(x.visits);
        if(key==='PATIENT_CLINICAL')return exact(x,['sex','age','diseaseDurationYears','sero','fm','as','clinicalProvenance'])&&[null,'M','F'].includes(x.sex)&&[x.age,x.diseaseDurationYears].every(v=>v===null||count(v))&&['sero','fm','as'].every(k=>['TRUE','FALSE','UNKNOWN'].includes(x[k]))&&exact(x.clinicalProvenance,['sex','age','diseaseDurationYears','sero','fm','as'])&&Object.values(x.clinicalProvenance).every(provenance);
        if(key==='PATIENT_TREATMENT')return exact(x,['current','history','drugNames'])&&episode(x.current,true)&&Array.isArray(x.history)&&x.history.every(v=>episode(v,false))&&Array.isArray(x.drugNames)&&new Set(x.drugNames.map(v=>v.id)).size===x.drugNames.length&&x.drugNames.every(v=>exact(v,['id','name','category'])&&[v.id,v.name,v.category].every(text));
        if(key==='COHORT_SIZE')return exact(x,['n'])&&x.n===n;
        if(key==='TARGET_RATE')return ratio(x,n,true);
        if(key==='DATA_COMPLETENESS')return exact(x,['ratio','incompleteCount','qcUnknownN'])&&ratio(x.ratio,n)&&count(x.incompleteCount)&&count(x.qcUnknownN)&&x.ratio.meta.numerator+x.incompleteCount+x.qcUnknownN===n;
        if(key==='CLINICAL_SUMMARY')return exact(x,['female','serology','age','diseaseDuration'])&&ratio(x.female,n)&&ratio(x.serology,n)&&median(x.age)&&median(x.diseaseDuration);
        if(key==='ACTIVITY_DISTRIBUTION')return exact(x,['base','current','baseN','baseUnknownN','evalN','unknownN'])&&['baseN','baseUnknownN','evalN','unknownN'].every(k=>count(x[k]))&&x.baseN+x.baseUnknownN===n&&x.evalN+x.unknownN===n&&['base','current'].every(k=>Array.isArray(x[k])&&x[k].length===4&&x[k].every((r,i)=>bucket(r,'level',['remission','low','moderate','high'][i],k==='base'?x.baseN:x.evalN))&&x[k].reduce((a,r)=>a+r.count,0)===(k==='base'?x.baseN:x.evalN));
        if(key==='TREATMENT_LINES')return exact(x,['groups','unknownLineN'])&&count(x.unknownLineN)&&Array.isArray(x.groups)&&x.groups.length===3&&x.groups.every((r,i)=>bucket(r,'line',i+1,n))&&x.groups.reduce((a,r)=>a+r.count,0)+x.unknownLineN===n;
        if(key==='BY_TREATMENT')return exact(x,['groups','unknownTxN','noCurrentTxN','test','comparisonNotice'])&&count(x.unknownTxN)&&count(x.noCurrentTxN)&&stat(x.test)&&text(x.comparisonNotice)&&Array.isArray(x.groups)&&new Set(x.groups.map(g=>g.tx)).size===x.groups.length&&x.groups.every(g=>exact(g,['tx','n','evalN','targetN','rate','status','displayText'])&&['csDMARD','TNFi','JAKi','IL-6i','Abatacept'].includes(g.tx)&&[g.n,g.evalN,g.targetN].every(count)&&g.targetN<=g.evalN&&g.evalN<=g.n&&number(g.rate)&&Math.abs(g.rate-(g.evalN?g.targetN/g.evalN:0))<1e-12&&g.status===(g.evalN?'OK':'NO_DATA')&&text(g.displayText))&&x.groups.reduce((a,g)=>a+g.n,0)+x.unknownTxN+x.noCurrentTxN===n;
        if(key==='FM_COMPARISON')return exact(x,['nFM','nOther','unknownN','status','reason','rows'])&&[x.nFM,x.nOther,x.unknownN].every(count)&&x.nFM+x.nOther+x.unknownN===n&&Array.isArray(x.rows)&&(x.nFM>=3&&x.nOther>=3?x.status==='OK'&&x.reason===null&&x.rows.length===6&&x.rows.every((r,i)=>exact(r,['metric','meanFM','meanOther','nFMValid','nOtherValid','difference','highlight','status','reason','displayFM','displayOther','displayDifference','test'])&&r.metric===['das28','tjc','sjc','crp','pain','haq'][i]&&[r.meanFM,r.meanOther,r.difference].every(nullableNumber)&&[r.nFMValid,r.nOtherValid].every(count)&&r.nFMValid<=x.nFM&&r.nOtherValid<=x.nOther&&(r.highlight===null||typeof r.highlight==='boolean')&&['OK','NO_DATA'].includes(r.status)&&nullableText(r.reason)&&[r.displayFM,r.displayOther,r.displayDifference].every(text)&&stat(r.test)):x.status==='INSUFFICIENT_SAMPLE'&&x.reason==='GROUP_SIZE_LT_3'&&x.rows.length===0);
        if(key==='PAIRED_DAS28_CHANGE')return exact(x,['pairedN','unknownN','meanDelta','status','missingReasons'])&&[x.pairedN,x.unknownN].every(count)&&x.pairedN+x.unknownN===n&&nullableNumber(x.meanDelta)&&(x.meanDelta===null)===(x.pairedN===0)&&x.status===(x.pairedN?'OK':'NO_DATA')&&object(x.missingReasons)&&Object.entries(x.missingReasons).every(([k,v])=>['NO_RELIABLE_START','MISSING_BASELINE','MISSING_EVALUATION','PATIENT_MISMATCH','EPISODE_MISMATCH','UNDATED_PAIR','BASELINE_AFTER_EVALUATION','EVAL_BEFORE_SCHEME','EVAL_AFTER_SCHEME'].includes(k)&&count(v))&&Object.values(x.missingReasons).reduce((a,v)=>a+v,0)===x.unknownN;
        return false;
      }
      const allowedFields=['patient_relation_doctor.doctor_id/research_type/patient_id','bqpg.result.crpScore','follow_up_date/followUpDate','zlfa.xyList/zcyList.startTime/endTime','zlfa.xyList/zcyList.drugName/startTime/endTime','patient_basic_info.jws','patient_follow_up_history.bqpg/fzjc','patient_basic_info.gender','patient_basic_info.card_no','patient_basic_info.confirm_date/confirmDate','fzjc.lfsyz/kccpkt','patient_comorbidity.disease_code/since_year','ra.ai.fm-evidence.json.state/observedAt','bqpg.result.crpScore/ytgjs/zzgjs','bqpg.hqaScore','fzjc.cfydb','bqpg.result.ytgjs','bqpg.result.zzgjs','bqpg.ztScoreByPatient','bqpg.tjScore'];
      if(!exact(d,['status','engine','reason','scope','facts','meta','auditRef'])||d.engine!=='AI'||!['ANSWER','UNSUPPORTED'].includes(d.status)||!(patient?exact(d.scope,['kind','patientId','visitId','n'])&&d.scope.patientId===scope.patientId&&canonicalId(d.scope.patientId)&&d.scope.visitId===(scope.visitId??null)&&n===1:exact(d.scope,['kind','filters','n']))||d.scope.kind!==scope.kind||!count(n)||!patient&&!sameFilters(filters(d.scope.filters),expected)||!exact(m,['traceId','asOfDate','readStartedAt','readCompletedAt','at','policyVersions','modelVersion','promptVersion'])||m.traceId!==result.traceId||!text(m.traceId)||!m.traceId||!date(m.asOfDate)||!instant(m.readStartedAt)||!instant(m.readCompletedAt)||Date.parse(m.readCompletedAt)<Date.parse(m.readStartedAt)||m.at!==expected.at||!exact(m.policyVersions,[...Object.keys(versions),'drugDictionary',...(Object.hasOwn(m.policyVersions||{},'fmSource')?['fmSource']:[])])||Object.entries(versions).some(([k,v])=>m.policyVersions[k]!==v)||!Object.values(m.policyVersions).every(v=>text(v)&&v.length>0)||!text(m.modelVersion)||!m.modelVersion||m.promptVersion!=='dev-chat-facts-v02'||!text(d.auditRef)||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(d.auditRef)||!Array.isArray(d.facts)||new Set(d.facts.map(f=>f?.key)).size!==d.facts.length||(d.status==='ANSWER'?d.reason!==null||d.facts.length<1||d.facts.length>4:!['SCOPE_CHANGE_REQUIRED','MEDICAL_ADVICE','UNSUPPORTED_QUESTION'].includes(d.reason)||d.facts.length!==0)||d.facts.some(f=>!exact(f,['key','title','data','explanation','evidence'])||!factKeys.includes(f.key)||!text(f.title)||!text(f.explanation)||!data(f.key,f.data)||!sources(f)||f.evidence.scopeRef!=='CURRENT_SCOPE'||!strings(f.evidence.sourceFields)||!f.evidence.sourceFields.length||f.evidence.sourceFields.some(v=>!allowedFields.includes(v))||!strings(f.evidence.policyKeys)||!f.evidence.policyKeys.length||f.evidence.policyKeys.some(v=>!Object.hasOwn(m.policyVersions,v))))throw invalid();
      return result;
    },

    async patientInsight(patientId,options){
      if(!canonicalId(patientId))throw Object.assign(new Error('患者入口无效'),{code:'INVALID_REQUEST',data:null});
      const result=await post('ai/patientInsight',{patientId},options),d=result.data;
      const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
      const exact=(x,keys)=>object(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
      const text=x=>typeof x==='string',nullableText=x=>x===null||text(x),number=x=>x===null||(typeof x==='number'&&Number.isFinite(x));
      const integer=x=>Number.isSafeInteger(x)&&x>=0,strings=x=>Array.isArray(x)&&x.every(text);
      const date=x=>text(x)&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
      const nullableDate=x=>x===null||date(x),instant=x=>text(x)&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(x)&&Number.isFinite(Date.parse(x));
      const idsInSource=x=>{
        if(Array.isArray(x))return x.every(idsInSource);
        if(!object(x))return true;
        return Object.entries(x).every(([k,v])=>['sourceVisitId','visitId','sourceRowId'].includes(k)?v===null||canonicalId(v):idsInSource(v));
      };
      const provenance=x=>{
        const keys=['source','sourceField','quality','missingReason'];if(Object.hasOwn(x||{},'observations'))keys.push('observations');
        if(!exact(x,keys)||!text(x.source)||!text(x.sourceField)||!strings(x.quality)||!nullableText(x.missingReason)||!idsInSource(x))return false;
        if(!Object.hasOwn(x,'observations'))return x.source==='LEGACY_RECORDED';
        if(!Array.isArray(x.observations))return false;
        return x.observations.every(o=>x.source==='CONFIGURED_FM_EVIDENCE'?exact(o,['evidenceId','observedAt','fmState'])&&text(o.evidenceId)&&date(o.observedAt)&&['TRUE','FALSE','UNKNOWN'].includes(o.fmState):x.source==='LEGACY_POSITIVE_ASSOCIATION'?exact(o,['sourceRowId','sinceYear'])&&canonicalId(o.sourceRowId)&&(o.sinceYear===null||Number.isSafeInteger(o.sinceYear)):exact(o,['sourceVisitId','sourceField','observedAt','status'])&&canonicalId(o.sourceVisitId)&&text(o.sourceField)&&date(o.observedAt)&&text(o.status));
      };

      const metricKeys=['value','unit','sourceVisitId','sourceField','observedAt','quality','missingReason'];
      const metric=(x,v)=>exact(x,metricKeys)&&number(x.value)&&nullableText(x.unit)&&x.sourceVisitId===v.visitId&&text(x.sourceField)&&x.observedAt===v.observedAt&&strings(x.quality)&&nullableText(x.missingReason);
      const episodeKeys=['episodeKey','state','category','line','targetedDrugHistoryN','startDate','estimatedStartDate','endDate','startConfidence','genericDrugIds','provenance'];
      const episode=(x,current)=>exact(x,current?[...episodeKeys,'schemeDurationMonths']:episodeKeys)&&nullableText(x.episodeKey)&&['ACTIVE','NONE','UNKNOWN','CONFLICT'].includes(x.state)&&nullableText(x.category)&&(x.line===null||integer(x.line))&&integer(x.targetedDrugHistoryN)&&['startDate','estimatedStartDate','endDate'].every(k=>nullableDate(x[k]))&&nullableText(x.startConfidence)&&strings(x.genericDrugIds)&&exact(x.provenance,['visitId','field','observedAt','quality','missingReason','dictionaryVersion',...(Object.hasOwn(x.provenance||{},'drugFacts')?['drugFacts']:[])])&&nullableText(x.provenance.visitId)&&(x.provenance.visitId===null||canonicalId(x.provenance.visitId))&&text(x.provenance.field)&&nullableDate(x.provenance.observedAt)&&strings(x.provenance.quality)&&nullableText(x.provenance.missingReason)&&text(x.provenance.dictionaryVersion)&&(!Object.hasOwn(x.provenance,'drugFacts')||(Array.isArray(x.provenance.drugFacts)&&x.provenance.drugFacts.every(f=>exact(f,['genericDrugId','startTime','endTime','visitId','field','observedAt'])&&text(f.genericDrugId)&&nullableText(f.startTime)&&nullableText(f.endTime)&&canonicalId(f.visitId)&&text(f.field)&&date(f.observedAt))))&&idsInSource(x.provenance)&&(!current||x.schemeDurationMonths===null||integer(x.schemeDurationMonths));
      const p=d?.patient,m=d?.meta,t=d?.treatment,versions=m?.policyVersions;
      let valid=exact(d,['patient','visits','treatment','meta'])&&exact(p,['patientId','name','studyNo','sex','age','diseaseDurationYears','sero','fm','as','clinicalProvenance'])&&p.patientId===patientId&&canonicalId(p.patientId)&&nullableText(p.name)&&nullableText(p.studyNo)&&[null,'M','F'].includes(p.sex)&&[p.age,p.diseaseDurationYears].every(x=>x===null||integer(x))&&['sero','fm','as'].every(k=>['TRUE','FALSE','UNKNOWN'].includes(p[k]))&&exact(p.clinicalProvenance,['sex','age','diseaseDurationYears','sero','fm','as'])&&Object.values(p.clinicalProvenance).every(provenance)&&exact(m,['studyCode','asOfDate','readStartedAt','readCompletedAt','traceId','policyVersions'])&&m.studyCode==='RA'&&date(m.asOfDate)&&instant(m.readStartedAt)&&instant(m.readCompletedAt)&&Date.parse(m.readCompletedAt)>=Date.parse(m.readStartedAt)&&text(m.traceId)&&m.traceId.length>0&&m.traceId===result.traceId&&object(versions)&&exact(versions,['insight','crp','clinical','serology','treatment','visitMatcher','drugDictionary',...(Object.hasOwn(versions,'fmSource')?['fmSource']:[])])&&versions.insight==='dev-insight-v01'&&versions.crp==='dev-crp-v04'&&versions.clinical==='dev-clinical-v04'&&versions.serology==='dev-ever-serology-v04'&&versions.treatment==='dev-timeline-v04'&&versions.visitMatcher==='dev-visit-match-v04'&&Object.values(versions).every(x=>text(x)&&x.length>0)&&Array.isArray(d.visits)&&exact(t,['current','history','drugNames'])&&episode(t.current,true)&&Array.isArray(t.history)&&t.history.every(x=>episode(x,false))&&Array.isArray(t.drugNames)&&t.drugNames.every(x=>exact(x,['id','name','category'])&&[x.id,x.name,x.category].every(text))&&new Set(t.drugNames.map(x=>x.id)).size===t.drugNames.length;
      if(valid){
        let previous=null;const seen=new Set();
        for(const v of d.visits){
          if(!exact(v,['visitId','observedAt','temporalStatus','metrics'])||!canonicalId(v.visitId)||seen.has(v.visitId)||!nullableDate(v.observedAt)||v.temporalStatus!==(v.observedAt===null?'UNDATED':v.observedAt>m.asOfDate?'FUTURE':'OBSERVED')||!exact(v.metrics,['das28Crp','tjc','sjc','gh','haq','crp','pain'])||!Object.values(v.metrics).every(x=>metric(x,v))||v.metrics.pain.value!==null||v.metrics.pain.missingReason!=='UNVERIFIED_SCALE'||!v.metrics.pain.quality.includes('SCALE_UNVERIFIED')||v.metrics.das28Crp.unit!==null||v.metrics.das28Crp.sourceField!=='bqpg.result.crpScore'){valid=false;break;}
          if(previous&&((previous.observedAt===null&&v.observedAt!==null)||(previous.observedAt!==null&&v.observedAt!==null&&previous.observedAt>v.observedAt)||(previous.observedAt===v.observedAt&&BigInt(previous.visitId)>=BigInt(v.visitId)))){valid=false;break;}
          seen.add(v.visitId);previous=v;
        }
      }
      if(!valid)throw invalidDetail(result);return result;
    },
    async patientSearch(command,options){
      const integer=n=>Number.isInteger(n)&&n>=1&&n<=2147483647;
      if(!command||typeof command!=='object'||Array.isArray(command)||Object.keys(command).length!==3||
          !['keyword','page','size'].every(k=>Object.hasOwn(command,k))||typeof command.keyword!=='string'||
          !command.keyword.isWellFormed()||[...command.keyword].length>200||!integer(command.page)||!integer(command.size)||command.size>200)
        throw Object.assign(new Error('患者搜索输入无效'),{code:'INVALID_REQUEST',data:null});
      const result=await post('ai/patientSearch',command,options),d=result.data;
      if(!d||typeof d!=='object'||Array.isArray(d)||Object.keys(d).length!==4||
          !['items','total','page','size'].every(k=>Object.hasOwn(d,k))||d.page!==command.page||d.size!==command.size||
          !Number.isInteger(d.total)||d.total<0||d.total>2147483647||!Array.isArray(d.items)||d.items.length>command.size||d.items.length>d.total||
          d.items.some(item=>!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).length!==3||
            !['patientId','name','studyNo'].every(k=>Object.hasOwn(item,k))||!canonicalId(item.patientId)||
            !(item.name===null||typeof item.name==='string')||!(item.studyNo===null||typeof item.studyNo==='string'))||
          new Set(d.items.map(item=>item.patientId)).size!==d.items.length)
        throw Object.assign(new Error('患者搜索响应无效'),{status:result.status,success:false,code:'INVALID_RESPONSE',data:null,traceId:result.traceId});
      return result;
    },
    async overview(options) {
      const result=await post('ai/overview',{},options),d=result.data,m=d?.targetRate?.meta;
      const count=n=>Number.isSafeInteger(n)&&n>=0;
      if(!d||!['studyTotal','modHighN','fmN','missingN'].every(k=>count(d[k]))||
          !m||!['numerator','denominator','unknownN'].every(k=>count(m[k]))||
          !['OK','NO_DATA'].includes(m.status)||typeof m.displayText!=='string'||
          typeof d.targetRate.value!=='number'||!Number.isFinite(d.targetRate.value)||d.targetRate.value<0||d.targetRate.value>1||
          m.numerator>m.denominator||m.denominator+m.unknownN!==d.studyTotal||
          (m.status==='NO_DATA')!==(m.denominator===0)||['modHighN','fmN','missingN'].some(k=>d[k]>d.studyTotal)||
          !d.meta||d.meta.studyCode!=='RA'||d.meta.at!=='now'||typeof d.meta.asOfDate!=='string'||
          typeof d.meta.readStartedAt!=='string'||typeof d.meta.readCompletedAt!=='string'||!d.meta.policyVersions||typeof d.meta.traceId!=='string')
        throw Object.assign(new Error('研究库概览响应无效'),{status:result.status,success:false,code:'INVALID_RESPONSE',data:null,traceId:result.traceId});
      return result;
    },
    async patientAuditLogs(patientId,options){
      if(!canonicalId(patientId))throw Object.assign(new Error('患者入口无效'),{code:'INVALID_REQUEST',data:null});
      const result=await post('ai/patientAuditLogs',{patientId},options),d=result.data;
      if(!d||d.patientId!==patientId||!Array.isArray(d.logs)||d.logs.some(log=>!log||!canonicalId(log.id)||(log.visitId!=null&&!canonicalId(log.visitId))))throw invalidDetail(result);return result;
    },
    async patientSensitive(patientId,options){
      if(!canonicalId(patientId))throw Object.assign(new Error('患者入口无效'),{code:'INVALID_REQUEST',data:null});
      const result=await post('ai/patientSensitive',{patientId},options),d=result.data;
      if(!d||d.patientId!==patientId||!(d.cardNo===null||typeof d.cardNo==='string'))throw invalidDetail(result);return result;
    },
    async visitDetail(patientId,visitId,options){
      if(!canonicalId(patientId)||!canonicalId(visitId))throw Object.assign(new Error('访视入口无效'),{code:'INVALID_REQUEST',data:null});
      const result=await post('ai/visitDetail',{patientId,visitId},options),d=result.data;
      if(!d||d.patientId!==patientId||d.visitId!==visitId||!canonicalId(d.patientId)||!canonicalId(d.visitId)||(d.doctorId!=null&&!canonicalId(d.doctorId))||!Array.isArray(d.modules)||d.modules.length!==7)throw invalidDetail(result);
      return result;
    },
    exportXlsx,
    async patientDetail(patientId,options){
      const id=value=>typeof value==='string'&&/^[1-9][0-9]*$/.test(value)&&(value.length<19||(value.length===19&&value<='9223372036854775807'));
      if(!id(patientId))throw Object.assign(new Error('患者入口无效'),{code:'INVALID_REQUEST',data:null});
      const result=await post('ai/patientDetail',{patientId},options),data=result.data;
      if(!data||typeof data!=='object'||data.patientId!==patientId||!id(data.patientId)||!Array.isArray(data.visits)||data.visits.some(v=>!v||!id(v.visitId)||(v.doctorId!=null&&!id(v.doctorId))))throw Object.assign(new Error('患者详情响应无效'),{status:result.status,code:'INVALID_RESPONSE',data:null,traceId:result.traceId});
      return result;
    },
    applyAnalysis(command,options) {return post('export/applyAnalysis',command,options);},
    retryNotification(command,options) {return post('export/retryNotification',command,options);},
    resolveEntry(indexPatientId,options) {return post('ai/resolveEntry',{source:'SIMILAR',indexPatientId},options);},
    parse(question,options) {return post('ai/parse',{question},options);},
    applyParse(command,options) {return post('ai/applyParse',command,options);},
    cohort(filters, options) {
      const input={...filters};if(input.ids===null&&!options?.completeFilters)delete input.ids;
      return post('ai/cohort',{filters:input},options);
    },
    cohortPatients(analysisId,cursor,options) {return post('ai/cohortPatients',{analysisId,cursor},options);},
    save(command,options) {return post('cohort/save',command,options);},
    list(input,options) {return post('cohort/list',input,options);},
    open(input,options) {return post('cohort/open',input,options);},
    rename(command,options) {return post('cohort/rename',command,options);},
    delete(command,options) {return post('cohort/delete',command,options);},
    compare(body,options) {return post('ai/compare',body,options);},
    compareResult(id,options) {return post('ai/compareResult',{compareResultId:id},options);}
  });
})();
