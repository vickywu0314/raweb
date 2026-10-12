/* 队列页面JSON入口；原签名cursor不拆解，不以演示账号提供认证。 */
"use strict";
window.RACohortAPI = (()=>{
  async function post(path, body, {signal} = {}) {
    let response;
    try { response = await fetch(API_BASE + '/api/ra/' + path, {
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
