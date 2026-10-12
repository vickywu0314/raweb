/* 完整队列仅放fragment；不恢复结果资源、问题或身份。 */
"use strict";
window.RACohortChatEntry=(()=>{
  const invalid=()=>Object.assign(new Error('问答范围入口无效，请返回条件页重新选择'),{code:'INVALID_ENTRY'});
  const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
  const id=v=>typeof v==='string'&&/^[1-9][0-9]*$/.test(v)&&(v.length<19||v.length===19&&v<='9223372036854775807');
  function patient(scope){if(!scope||scope.kind!=='PATIENT'||!exact(scope,Object.hasOwn(scope,'visitId')?['kind','patientId','visitId']:['kind','patientId'])||!id(scope.patientId)||scope.visitId!=null&&!id(scope.visitId))throw invalid();return {kind:'PATIENT',patientId:scope.patientId,visitId:scope.visitId??null};}
  function normalize(filters){return window.RACohortConditions.decode(window.RACohortConditions.encode(filters));}
  function encode(scope){
    if(exact(scope,['kind'])&&scope.kind==='ALL')return '#kind=ALL';
    if(scope?.kind==='PATIENT'){const target=patient(scope),params=new URLSearchParams({kind:'PATIENT',patientId:target.patientId});if(target.visitId!==null)params.set('visitId',target.visitId);return '#'+params.toString();}
    if(!exact(scope,['kind','filters'])||scope.kind!=='COHORT')throw invalid();
    const filters=normalize(scope.filters),params=new URLSearchParams({kind:'COHORT',filters:window.RACohortConditions.encode(filters)});return '#'+params.toString();
  }
  function decode(search,hash){
    if(search!=='')throw invalid();if(hash==='')return {kind:'ALL'};
    if(typeof hash!=='string'||!hash.startsWith('#'))throw invalid();
    const params=new URLSearchParams(hash.slice(1)),seen=new Set();for(const [key] of params){if(!['kind','filters','patientId','visitId'].includes(key)||seen.has(key))throw invalid();seen.add(key);}
    if(params.size===1&&params.get('kind')==='ALL')return {kind:'ALL'};
    if(params.get('kind')==='PATIENT')return patient(Object.fromEntries(params));
    if(params.size!==2||params.get('kind')!=='COHORT'||!params.has('filters'))throw invalid();
    try{const raw=params.get('filters');if(/%(?![0-9A-Fa-f]{2})/.test(raw))throw invalid();return {kind:'COHORT',filters:normalize(window.RACohortConditions.decode(raw))};}catch{throw invalid();}
  }
  return Object.freeze({normalize,encode,decode});
})();
