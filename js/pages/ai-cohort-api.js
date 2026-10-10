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
  return Object.freeze({
    cohort(filters, options) {
      const input={...filters};if(input.ids===null)delete input.ids;
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
