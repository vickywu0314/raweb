/* Ordinary detail reads: one page owner for the complete, URL-bound read group. */
"use strict";
window.RAPatientDetail=(()=>{
 const canonical=value=>typeof value==='string'&&/^[1-9][0-9]{0,18}$/.test(value)&&(value.length<19||value<='9223372036854775807');
 const error=(code,message)=>Object.assign(new Error(message),{code});
 async function read(path,params,signal){
  let response;try{response=await fetch(API_BASE+path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams(params).toString(),signal});}catch(e){throw error('NETWORK','网络连接失败');}
  if(response.status===401)throw error('UNAUTHENTICATED','请先登录');
  if(!response.headers?.get('Content-Type')?.toLowerCase().includes('application/json'))throw error('DECODE','响应不是 JSON');
  let r;try{r=await response.json();}catch(e){throw error('DECODE','响应无法解析');}
  if(!response.ok||r?.success!==true||r.code!=='200'){
   const code=['401','UNAUTHENTICATED'].includes(r?.code)?'UNAUTHENTICATED':typeof r?.code==='string'?r.code:'HTTP_ERROR';
   throw error(code,code==='UNAUTHENTICATED'||code==='401'?'请先登录':code==='RESOURCE_NOT_FOUND'?'患者资料不可用':`详情请求失败（${response.status} / ${code}）`);
  }
  if(!r.data||typeof r.data!=='object'||Array.isArray(r.data))throw error('INVALID_RESPONSE','详情响应无效');
  return r.data;
 }
 function patient(p,id){
  if(!canonical(p.patientId)||p.patientId!==id||!Array.isArray(p.visits))throw error('INVALID_RESPONSE','患者 ID 或时间线不匹配');
  for(const v of p.visits)if(!v||!canonical(v.visitId)||(v.doctorId!==null&&!canonical(v.doctorId)))throw error('INVALID_RESPONSE','访视 ID 表示无效');
  return p;
 }
 function owner({clear,publish}){
  let current=null,displayDispose=null,state='idle';
  const dispose=()=>{if(displayDispose){displayDispose();displayDispose=null;}};
  function finish(flight,cause,value){
   if(current!==flight||flight.cause!==null)return;
   flight.cause=cause;current=null;clearTimeout(flight.timer);
   if(cause!=='success')flight.controller.abort();
   dispose();state=cause;
   if(cause==='success'){
    try{displayDispose=publish(value)||null;}catch(e){flight.cause='error';state='error';dispose();clear('error','详情响应无法显示','INVALID_RESPONSE');}
   }else{clear(cause,value?.message|| (cause==='timeout'?'详情查询超时':cause==='cancelled'?'详情请求已结束':'详情暂不可用'),value?.code);if(value?.code==='UNAUTHENTICATED')clearAuth();}
  }
  function cancel(){if(current)finish(current,'cancelled');else{dispose();state='cancelled';clear('cancelled','详情请求已结束');}}
  function load(id,adjacent=null){
   cancel();state='loading';clear('loading','正在查询患者资料…');
   const flight={cause:null,controller:new AbortController(),timer:null};current=flight;
   flight.timer=setTimeout(()=>finish(flight,'timeout'),30000);
   const active=()=>current===flight&&flight.cause===null;
   Promise.resolve().then(async()=>{
    const q=new URLSearchParams(location.search);
    if(q.getAll('id').length!==1||q.get('id')!==id||!canonical(id)||(adjacent&&adjacent.route!=='visitCreateForm'&&(!canonical(adjacent.visitId)||q.getAll('visit').length!==1||q.get('visit')!==adjacent.visitId)))throw error('INVALID_REQUEST','入口患者 ID 或随访 ID 无效');
    if(!active())return;
    const p=patient(await read('/api/ra/patient/patientDetail',{patientId:id},flight.controller.signal),id);
    if(!active())return;
    let related=null;
    if(adjacent){
     related=await read('/api/ra/visit/'+adjacent.route,{doctorId:currentDoctorId(),...(adjacent.visitId?{visitId:adjacent.visitId}:{patientId:id})},flight.controller.signal);
     if(!active())return;
     if(!canonical(related.patientId)||related.patientId!==id||(adjacent.visitId?(!canonical(related.visitId)||related.visitId!==adjacent.visitId):related.visitId!==null)||(adjacent.route==='visitDetail'&&related.doctorId!==null&&!canonical(related.doctorId)))throw error('INVALID_RESPONSE','随访不属于入口患者或随访 ID 不匹配');
    }
    finish(flight,'success',{patient:p,related});
   }).catch(e=>finish(flight,'error',e));
  }
  window.addEventListener('pagehide',cancel);window.addEventListener('ra-auth-changed',()=>{if(state!=='error'||current)cancel();});
  window.addEventListener('storage',e=>{if(e.key==='ra-auth'||e.key===null)cancel();});
  return {load,cancel,get state(){return state}};
 }
 return {canonical,read,owner};
})();
