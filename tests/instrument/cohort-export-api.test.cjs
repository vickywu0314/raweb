const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readFileSync}=require('node:fs'),{resolve}=require('node:path');
const {needApply}=require('../fixtures/cohort-export.json');
function client(response){const requests=[],context=vm.createContext({API_BASE:'',window:{},fetch:async(url,options)=>{requests.push({url,options});return typeof response==='function'?response(options):response;}});vm.runInContext(readFileSync(resolve(__dirname,'../../js/pages/ai-cohort-api.js'),'utf8'),context);return {api:context.window.RACohortAPI,requests};}
test('cohort:export-api-contract',async()=>{
 const response=new Response(JSON.stringify({success:false,code:'NEED_APPLY',message:'所选导出内容需要申请',data:needApply}),{status:409,headers:{'Content-Type':'application/json;charset=UTF-8','X-Trace-Id':'trace-export'}}),c=client(response),signal=new AbortController().signal,command={source:'COHORT',analysisId:needApply.referenceId};
 await assert.rejects(()=>c.api.exportXlsx(command,{signal}),e=>e.status===409&&e.code==='NEED_APPLY'&&e.message==='所选导出内容需要申请'&&e.traceId==='trace-export'&&JSON.stringify(e.data)===JSON.stringify(needApply));
 assert.equal(c.requests.length,1);assert.equal(c.requests[0].url,'/api/ra/export/xlsx');assert.equal(c.requests[0].options.signal,signal);assert.equal(c.requests[0].options.credentials,'same-origin');assert.deepEqual(Object.keys(c.requests[0].options.headers),['Content-Type']);assert.deepEqual(JSON.parse(c.requests[0].options.body),command);
 const bytes=readFileSync(resolve(__dirname,'../fixtures/cohort-export.xlsx')),mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
 for(const [disposition,filename] of [['attachment; filename="ordinary.xlsx"','ordinary.xlsx'],["attachment; filename*=UTF-8''ordinary.xlsx",'ordinary.xlsx'],['attachment; filename="../private.xlsx"',`cohort-${command.analysisId}.xlsx`],['attachment; filename="bad.csv"',`cohort-${command.analysisId}.xlsx`],[null,`cohort-${command.analysisId}.xlsx`]]){
  const headers={'Content-Type':mime.toUpperCase()+'; charset=binary','X-Trace-Id':'trace-file'};if(disposition)headers['Content-Disposition']=disposition;
  const wire=client(new Response(bytes,{status:200,headers})),explicit={...command,fields:['das28Current','crpCurrent']},reply=await wire.api.exportXlsx(explicit,{signal});
  assert.equal(reply.kind,'xlsx');assert.equal(reply.status,200);assert.equal(reply.traceId,'trace-file');assert.equal(reply.filename,filename);assert.deepEqual(Buffer.from(await reply.blob.arrayBuffer()),bytes);assert.deepEqual(JSON.parse(wire.requests[0].options.body),explicit);assert.equal(wire.requests.length,1);
 }
 const comparisonId='00000000-0000-0000-0000-000000000401';
 for(const comparison of [{source:'COMPARE',compareResultId:comparisonId},{source:'COMPARE',compareResultId:comparisonId,metrics:['n','das28At','crpAt','haqAt','target','activity']}]){
  for(const disposition of [null,'attachment; filename="../unsafe.xlsx"','attachment; filename="comparison.xlsx"']){
   const headers={'Content-Type':mime};if(disposition)headers['Content-Disposition']=disposition;
   const wire=client(new Response(bytes,{status:200,headers})),reply=await wire.api.exportXlsx(comparison,{signal});
   assert.equal(reply.filename,disposition?.includes('comparison.xlsx')?'comparison.xlsx':`comparison-${comparisonId}.xlsx`);
   assert.deepEqual(JSON.parse(wire.requests[0].options.body),comparison);assert.equal(wire.requests[0].options.signal,signal);assert.deepEqual(Buffer.from(await reply.blob.arrayBuffer()),bytes);
  }
 }
 for(const [status,code] of [[400,'INVALID_REQUEST'],[401,'UNAUTHENTICATED'],[404,'RESOURCE_NOT_FOUND'],[410,'ANALYSIS_EXPIRED'],[413,'RESULT_TOO_LARGE'],[503,'SERVICE_UNAVAILABLE']]){
  const wire=client(new Response(JSON.stringify({success:false,code,message:'安全文件错误',data:null}),{status,headers:{'Content-Type':'application/json','X-Trace-Id':'trace-error'}}));await assert.rejects(()=>wire.api.exportXlsx(command),e=>e.status===status&&e.code===code&&e.message==='安全文件错误'&&e.data===null&&e.traceId==='trace-error');assert.equal(wire.requests.length,1);
 }
 const jsonSuccess=client(new Response(JSON.stringify({success:true,code:'200',message:'JSON成功不是文件',data:{observed:true}}),{status:200,headers:{'Content-Type':'application/json','X-Trace-Id':'trace-json'}}));await assert.rejects(()=>jsonSuccess.api.exportXlsx(command),e=>e.kind==='json'&&e.success===true&&e.code==='200'&&e.traceId==='trace-json'&&e.data.observed===true);
 for(const [status,type] of [[200,'application/octet-stream'],[200,mime+'evil'],[503,mime]]){let reads=0;const response=new Response(bytes,{status,headers:{'Content-Type':type}});response.blob=async()=>{reads++;throw new Error('must not read non-file');};await assert.rejects(()=>client(response).api.exportXlsx(command),e=>e.status===status&&e.code==='INVALID_RESPONSE');assert.equal(reads,0);}
 const rejectedBody=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array([80,75]));controller.error(new TypeError('controlled body disconnect'));}}),{status:200,headers:{'Content-Type':mime,'X-Trace-Id':'trace-body'}});await assert.rejects(()=>client(rejectedBody).api.exportXlsx(command),e=>e.status===200&&e.code==='BODY_READ_FAILED'&&e.traceId==='trace-body');
 const offline=client(()=>{throw new TypeError('controlled fetch rejection');});await assert.rejects(()=>offline.api.exportXlsx(command),e=>e.status===0&&e.code==='NETWORK_ERROR');assert.equal(offline.requests.length,1);
});
