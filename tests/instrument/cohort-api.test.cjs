const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
function client(reply, base = '') {
  const requests = [];
  const context = vm.createContext({API_BASE:base,window:{},fetch:async(url,options)=>{requests.push({url,options});return typeof reply==='function'?reply(options):reply;}});
  vm.runInContext(readFileSync(resolve(__dirname,'../../js/pages/ai-cohort-api.js'),'utf8'),context);
  return {api:context.window.RACohortAPI,requests};
}
function pageClock() {
  const nodes = new Map(), timers = new Map(), listeners = {}, pending = [];
  const selects = ['#f-sex','#f-age','#f-sero','#f-tx','#f-at','#f-act','#f-cm','#f-data'];
  function node() {return {value:'',textContent:'',dataset:{},hidden:false,disabled:false,selectedOptions:[{textContent:'不限'}],children:[],addEventListener(){},querySelectorAll(){return [];},replaceChildren(){this.children=[];},append(child){this.children.push(child);},setAttribute(){}};}
  const get = selector => {if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);};
  for(const selector of selects)get(selector);get('#f-at').value='now';
  let timerId=0;
  const context=vm.createContext({INITIAL_PATIENTS:[],URLSearchParams,AbortController,location:{search:'',pathname:'/ai-cohort.html',hash:'',replace:()=>assert.fail('本片不应重定向')},history:{replaceState(){}},
    localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>'{"name":"合成页面用户","role":"研究者","expires":0}'},
    document:{addEventListener:(name,callback)=>listeners[name]=callback,querySelector:selector=>['.sidebar','.account'].includes(selector)?null:get(selector),querySelectorAll:()=>[],createElement:node},
    window:{addEventListener:(name,callback)=>listeners[name]=callback},
    fetch:(url,options)=>new Promise(resolve=>pending.push({url,filters:JSON.parse(options.body).filters,signal:options.signal,resolve})),
    setTimeout:(callback,ms)=>{const id=++timerId;timers.set(id,{callback,ms});return id;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(readFileSync(resolve(__dirname,'../../js/boot.js'),'utf8'),context);
  vm.runInContext(readFileSync(resolve(__dirname,'../../js/common.js'),'utf8'),context);
  vm.runInContext(readFileSync(resolve(__dirname,'../../js/pages/ai-cohort-api.js'),'utf8'),context);
  vm.runInContext(readFileSync(resolve(__dirname,'../../js/pages/ai-cohort-conditions.js'),'utf8'),context);
  vm.runInContext(readFileSync(resolve(__dirname,'../../js/pages/ai-cohort.js'),'utf8'),context);
  return {get,timers,pending,listeners,context};
}
test('cohort:api-contract', async () => {
  const controller = new AbortController();
  const envelope = {success:true,code:'200',message:'成功',data:{...require('../fixtures/cohort-p02.json').U,n:12,studyTotal:20,patients:{items:[{...require('../fixtures/cohort-p02.json').CLINICAL.patients.items[0],patientId:'9223372036854775807'}]}}};
  const success = client(()=>new Response(JSON.stringify(envelope),{status:200,headers:{'Content-Type':'application/json','X-Trace-Id':'trace-success'}}));
  const result = await success.api.cohort({studyCode:'RA',at:'now',sex:'F'},{signal:controller.signal});
  assert.equal(success.requests[0].url,'/api/ra/ai/cohort');
  assert.equal(success.requests[0].options.body,'{"filters":{"studyCode":"RA","at":"now","sex":"F"}}');
  assert.equal(success.requests[0].options.credentials,'same-origin');
  assert.equal(success.requests[0].options.signal,controller.signal);
  assert.deepEqual(Object.keys(success.requests[0].options.headers),['Content-Type']);
  assert.equal(success.requests[0].options.headers['Content-Type'],'application/json;charset=UTF-8');
  assert.equal(result.status,200); assert.equal(result.traceId,'trace-success');
  assert.deepEqual(JSON.parse(JSON.stringify(result.data)),envelope.data);
  assert.deepEqual(Object.keys(success.api),['exportXlsx','applyAnalysis','retryNotification','parse','applyParse','cohort','cohortPatients','save','list','open','rename','delete','compare','compareResult']);
  await success.api.cohortPatients('11111111-1111-1111-1111-111111111111','opaque.A.10',{signal:controller.signal});
  assert.equal(success.requests[1].url,'/api/ra/ai/cohortPatients');
  assert.equal(success.requests[1].options.body,'{"analysisId":"11111111-1111-1111-1111-111111111111","cursor":"opaque.A.10"}');
  assert.equal(success.requests[1].options.signal,controller.signal);assert.equal(success.requests[1].options.credentials,'same-origin');
  assert.deepEqual(Object.keys(success.requests[1].options.headers),['Content-Type']);
  await success.api.cohort({studyCode:'RA',at:'now',ids:null});assert.equal(success.requests[2].options.body,'{"filters":{"studyCode":"RA","at":"now"}}');
  const command={name:'  Trial  ',note:'',filters:{studyCode:'RA',at:'now',act:'target',ids:['9223372036854775807']},requestId:'00000000-0000-0000-0000-000000000001'};
  for(const [method,body] of [['save',command],['list',{page:1,size:20}],['open',{cohortId:'00000000-0000-0000-0000-000000000100'}],['rename',{cohortId:'00000000-0000-0000-0000-000000000100',version:1,requestId:command.requestId,name:'\u00a0Trial2\u00a0'}],['rename',{cohortId:'00000000-0000-0000-0000-000000000100',version:2,requestId:command.requestId,note:null}],['rename',{cohortId:'00000000-0000-0000-0000-000000000100',version:3,requestId:command.requestId,note:''}],['delete',{cohortId:'00000000-0000-0000-000000000100',version:4,requestId:command.requestId}]]){
    const wire=client(()=>new Response(JSON.stringify(envelope),{status:200,headers:{'Content-Type':'application/json','X-Trace-Id':'private-trace'}}),'http://127.0.0.1:9000');
    const reply=await wire.api[method](body,{signal:controller.signal});
    assert.equal(wire.requests[0].url,'http://127.0.0.1:9000/api/ra/cohort/'+method);assert.deepEqual(JSON.parse(wire.requests[0].options.body),body);assert.equal(wire.requests[0].options.credentials,'same-origin');assert.equal(wire.requests[0].options.signal,controller.signal);assert.deepEqual(Object.keys(wire.requests[0].options.headers),['Content-Type']);assert.equal(reply.traceId,'private-trace');
    for(const [status,code] of [[400,'INVALID_REQUEST'],[401,'UNAUTHENTICATED'],[404,'RESOURCE_NOT_FOUND'],[409,'NAME_CONFLICT'],[409,'VERSION_CONFLICT'],[409,'IDEMPOTENCY_CONFLICT'],[413,'LIMIT_EXCEEDED'],[503,'SERVICE_UNAVAILABLE']]){
      const failed=client(new Response(JSON.stringify({success:false,code,message:'私有安全错误',data:null}),{status,headers:{'Content-Type':'application/json','X-Trace-Id':'private-error'}}));
      await assert.rejects(()=>failed.api[method](body),e=>e.status===status&&e.code===code&&e.traceId==='private-error'&&e.data===null);assert.equal(failed.requests.length,1);
    }
    const nonjson=client(new Response('<html>bad',{status:503,headers:{'Content-Type':'text/html','X-Trace-Id':'private-nonjson'}}));await assert.rejects(()=>nonjson.api[method](body),e=>e.code==='INVALID_RESPONSE'&&e.traceId==='private-nonjson');
    const offline=client(()=>{throw new TypeError('disconnected');});await assert.rejects(()=>offline.api[method](body),e=>e.code==='NETWORK_ERROR'&&e.status===0);
  }
  for(const a of [{source:'FILTERS',filters:{at:'now',ids:null}},{source:'SAVED',cohortId:command.requestId}])for(const b of [{source:'FILTERS',filters:{at:'now',ids:[]}},{source:'SAVED',cohortId:command.requestId}]){
    const body={a,b,excludeOverlap:false},wire=client(()=>new Response(JSON.stringify(envelope),{status:200,headers:{'Content-Type':'application/json','X-Trace-Id':'compare-trace'}}));
    await wire.api.compare(body,{signal:controller.signal});assert.equal(wire.requests[0].url,'/api/ra/ai/compare');assert.deepEqual(JSON.parse(wire.requests[0].options.body),body);assert.equal(wire.requests[0].options.signal,controller.signal);assert.equal(wire.requests[0].options.credentials,'same-origin');assert.deepEqual(Object.keys(wire.requests[0].options.headers),['Content-Type']);
    for(const [status,code] of [[400,'INVALID_REQUEST'],[401,'UNAUTHENTICATED'],[404,'RESOURCE_NOT_FOUND'],[409,'SCOPE_CHANGED'],[410,'COMPARE_EXPIRED'],[413,'LIMIT_EXCEEDED'],[503,'SERVICE_UNAVAILABLE']]){
      const bad=client(new Response(JSON.stringify({success:false,code,message:'比较失败',data:null}),{status,headers:{'Content-Type':'application/json','X-Trace-Id':'compare-error'}}));await assert.rejects(()=>bad.api.compare(body),e=>e.status===status&&e.code===code&&e.traceId==='compare-error');assert.equal(bad.requests.length,1);
    }
  }
  const longCompare=client(()=>new Response(JSON.stringify(envelope),{status:200,headers:{'Content-Type':'application/json'}}));await longCompare.api.compare({a:{source:'FILTERS',filters:{ids:['9223372036854775807']}},b:{source:'FILTERS',filters:{ids:[]}},excludeOverlap:true});assert.equal(JSON.parse(longCompare.requests[0].options.body).a.filters.ids[0],'9223372036854775807');
  const readId='00000000-0000-0000-0000-000000000401';
  const retainedClient=client(()=>new Response(JSON.stringify(envelope),{status:200,headers:{'Content-Type':'application/json','X-Trace-Id':'retained-trace'}}),'http://127.0.0.1:9000');
  const retainedReply=await retainedClient.api.compareResult(readId,{signal:controller.signal});
  assert.equal(retainedClient.requests[0].url,'http://127.0.0.1:9000/api/ra/ai/compareResult');assert.deepEqual(JSON.parse(retainedClient.requests[0].options.body),{compareResultId:readId});assert.equal(retainedClient.requests[0].options.signal,controller.signal);assert.equal(retainedClient.requests[0].options.credentials,'same-origin');assert.equal(retainedReply.traceId,'retained-trace');
  for(const [status,code] of [[400,'INVALID_REQUEST'],[401,'UNAUTHENTICATED'],[404,'RESOURCE_NOT_FOUND'],[409,'SCOPE_CHANGED'],[410,'COMPARE_EXPIRED'],[413,'LIMIT_EXCEEDED'],[503,'SERVICE_UNAVAILABLE']]){
   const failed=client(new Response(JSON.stringify({success:false,code,message:'重读失败',data:null}),{status,headers:{'Content-Type':'application/json','X-Trace-Id':'retained-error'}}));await assert.rejects(()=>failed.api.compareResult(readId),error=>error.status===status&&error.code===code&&error.traceId==='retained-error'&&error.data===null);assert.equal(failed.requests.length,1);
  }
  const brokenRead=client(new Response('<html>',{status:200,headers:{'Content-Type':'text/html','X-Trace-Id':'broken-read'}}));await assert.rejects(()=>brokenRead.api.compareResult(readId),error=>error.code==='INVALID_RESPONSE'&&error.traceId==='broken-read');
  const offlineRead=client(()=>{throw new TypeError('disconnected');});await assert.rejects(()=>offlineRead.api.compareResult(readId),error=>error.code==='NETWORK_ERROR');assert.equal(offlineRead.requests.length,1);
  const rejected = client(new Response(JSON.stringify({success:false,code:'UNAUTHENTICATED',message:'会话<失效>',data:null}),{status:401,headers:{'Content-Type':'application/json','X-Trace-Id':'trace-401'}}));
  await assert.rejects(()=>rejected.api.cohort({studyCode:'RA',at:'now'}),error=>{
    assert.equal(error.status,401);assert.equal(error.success,false);assert.equal(error.code,'UNAUTHENTICATED');assert.equal(error.message,'会话<失效>');assert.equal(error.data,null);assert.equal(error.traceId,'trace-401');return true;
  });
  assert.equal(rejected.requests.length,1,'失败不能隐藏重发');
  for (const [status,code] of [[503,'SERVICE_UNAVAILABLE'],[400,'INVALID_ARGUMENT'],[200,'BUSINESS_FAILURE']]) {
    const failed = client(new Response(JSON.stringify({success:false,code,message:'安全错误',data:{detail:'保留'}}),{status,headers:{'Content-Type':'application/json','X-Trace-Id':'trace-failure'}}));
    await assert.rejects(()=>failed.api.cohort({studyCode:'RA',at:'now'}),error=>error.status===status&&error.code===code&&error.data.detail==='保留'&&error.traceId==='trace-failure');
  }
  const configured = client(new Response(JSON.stringify(envelope),{headers:{'Content-Type':'application/json'}}),'http://127.0.0.1:9000');
  await configured.api.cohort({studyCode:'RA',at:'now'});assert.equal(configured.requests[0].url,'http://127.0.0.1:9000/api/ra/ai/cohort');
  const disconnected = client(()=>{throw new TypeError('socket disconnected');});
  await assert.rejects(()=>disconnected.api.cohort({studyCode:'RA',at:'now'}),error=>error.status===0&&error.code==='NETWORK_ERROR'&&error.data===null);
  assert.equal(disconnected.requests.length,1);
  const nonJson = client(new Response('broken<html>',{status:200,headers:{'Content-Type':'text/html','X-Trace-Id':'trace-nonjson'}}));
  await assert.rejects(()=>nonJson.api.cohort({studyCode:'RA',at:'now'}),error=>error.status===200&&error.code==='INVALID_RESPONSE'&&error.traceId==='trace-nonjson');
  const sourceClock=pageClock(),selectedDefinition=require('../fixtures/cohort-comparison.json').definition;
  sourceClock.context.selectComparison('b',{source:'SAVED',cohortId:selectedDefinition.cohortId,item:selectedDefinition});assert.ok(sourceClock.get('#compare-source-b').textContent.includes(selectedDefinition.cohortId),'显式SAVED来源摘要须标明选中的独立定义ID');assert.equal(sourceClock.pending.length,1,'选择来源不能暗open或计数');
  const comparisonClock=pageClock(),comparisonFixture=require('../fixtures/cohort-comparison.json').before;
  comparisonClock.context.selectComparison('a',{source:'FILTERS',filters:comparisonFixture.a.filters});comparisonClock.context.selectComparison('b',{source:'FILTERS',filters:comparisonFixture.b.filters});comparisonClock.get('#compare-exclude').checked=false;comparisonClock.context.startComparison();
  assert.equal(comparisonClock.pending.length,2);assert.equal(comparisonClock.pending[1].url,'/api/ra/ai/compare');assert.equal(comparisonClock.get('#compare-state').dataset.state,'loading');
  comparisonClock.pending[1].resolve(new Response('non-json',{status:200,headers:{'Content-Type':'text/html','X-Trace-Id':'compare-unknown'}}));await new Promise(setImmediate);
  assert.equal(comparisonClock.get('#compare-state').dataset.state,'error');assert.match(comparisonClock.get('#compare-state').textContent,/INVALID_RESPONSE/);assert.ok(comparisonClock.get('#compare-state').textContent.includes('不能确定是否已提交'));assert.equal(comparisonClock.context.window.RACohortComparison.getResource(),null);assert.equal(comparisonClock.pending.length,2,'未知提交不能隐藏重发');assert.equal(comparisonClock.timers.size,1,'比较结束不能释放仍合法的独立分析等待');
  const clock = pageClock();
  assert.equal(clock.pending.length,1);assert.equal(clock.get('#cohort-state').dataset.state,'loading');assert.equal(clock.get('#f-sex').disabled,false);
  const timer = [...clock.timers.values()][0];assert.equal(timer.ms,30000);
  timer.callback();
  assert.equal(clock.pending[0].signal.aborted,true);assert.equal(clock.get('#cohort-state').dataset.state,'error');assert.equal(clock.get('#f-sex').disabled,false);assert.equal(clock.timers.size,0);assert.equal(clock.pending.length,1);
  assert.match(clock.get('#error-message').textContent,/REQUEST_TIMEOUT/);
  clock.pending[0].resolve(new Response(JSON.stringify({success:true,code:'200',data:{n:12,studyTotal:20,patients:{items:[{patientId:'9',name:'迟到'}]}}}),{headers:{'Content-Type':'application/json'}}));await new Promise(setImmediate);
  assert.equal(clock.get('#cohort-n').textContent,'—');assert.equal(clock.get('#patient-rows').children.length,0);assert.equal(clock.get('#cohort-state').dataset.state,'error');
  clock.context.analyze();assert.equal(clock.pending.length,2);clock.listeners.pagehide();
  assert.equal(clock.pending[1].signal.aborted,true);assert.equal(clock.timers.size,0);
  clock.pending[1].resolve(new Response(JSON.stringify({success:true,code:'200',data:{n:1,studyTotal:20,patients:{items:[{patientId:'9',name:'离页迟到'}]}}}),{headers:{'Content-Type':'application/json'}}));await new Promise(setImmediate);
  assert.equal(clock.get('#cohort-n').textContent,'—');assert.equal(clock.get('#patient-rows').children.length,0);clock.context.analyze();assert.equal(clock.pending.length,2);
});
