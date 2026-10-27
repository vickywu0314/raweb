const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),{readFileSync}=require('node:fs'),{resolve}=require('node:path');
const plain=value=>JSON.parse(JSON.stringify(value));
function codec(){const c=vm.createContext({window:{},URLSearchParams});vm.runInContext(readFileSync(resolve(__dirname,'../../js/pages/ai-cohort-conditions.js'),'utf8'),c);return c.window.RACohortConditions;}
function pageClock(search="") {
  const nodes = new Map(), timers = new Map(), listeners = {}, pending = [];
  const selects = ['#f-sex','#f-age','#f-sero','#f-tx','#f-at','#f-act','#f-cm','#f-data'];
  function node() {return {value:'',textContent:'',dataset:{},hidden:false,disabled:false,selectedOptions:[{textContent:'不限'}],children:[],events:{},addEventListener(name,callback){this.events[name]=callback;},querySelectorAll(){return [];},replaceChildren(){this.children=[];},append(child){this.children.push(child);},setAttribute(){}};}
  const get = selector => {if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);};
  for(const selector of selects)get(selector);get('#f-at').value='now';
  let timerId=0;
  const context=vm.createContext({INITIAL_PATIENTS:[],URLSearchParams,AbortController,location:{search,pathname:'/ai-cohort.html',hash:'',replace:()=>assert.fail('本片不应重定向')},history:{replaceState(){}},
    localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>'{"name":"合成页面用户","role":"研究者","expires":0}'},
    document:{addEventListener:(name,callback)=>listeners[name]=callback,querySelector:selector=>['.sidebar','.account'].includes(selector)?null:get(selector),querySelectorAll:()=>[],createElement:node},
    window:{addEventListener:(name,callback)=>listeners[name]=callback},
    fetch:(url,options)=>new Promise(resolve=>pending.push({url,body:JSON.parse(options.body),filters:JSON.parse(options.body).filters,signal:options.signal,resolve})),
    setTimeout:(callback,ms)=>{const id=++timerId;timers.set(id,{callback,ms});return id;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(readFileSync(resolve(__dirname,'../../js/boot.js'),'utf8'),context);
  vm.runInContext(readFileSync(resolve(__dirname,'../../js/common.js'),'utf8'),context);
  vm.runInContext(readFileSync(resolve(__dirname,'../../js/pages/ai-cohort-api.js'),'utf8'),context);
  vm.runInContext(readFileSync(resolve(__dirname,'../../js/pages/ai-cohort-conditions.js'),'utf8'),context);
  vm.runInContext(readFileSync(resolve(__dirname,'../../js/shared/user-display.js'),'utf8'),context);
  vm.runInContext(readFileSync(resolve(__dirname,'../../js/pages/ai-cohort.js'),'utf8'),context);
  return {get,timers,pending,listeners,context};
}

test('cohort:entry-contract',async()=>{
 const c=codec(),decode=c.decodeEntry||c.decode;
 const entry=decode('?q=%E5%A5%B3%E6%80%A7&sex=M&tx=TNFi&ids=9223372036854775807');
 assert.equal(entry.kind,'QUESTION');assert.equal(entry.question,'女性');
 assert.deepEqual(plain(entry.filters),{studyCode:'RA',sex:'M',age:'',sero:'',tx:'TNFi',at:'now',act:'',cm:'',data:'',ids:['9223372036854775807']});
 assert.equal(decode('?q=   ').question,'   ');
 assert.deepEqual(plain(decode('?preset=similar&id=9223372036854775807')),{kind:'SIMILAR',indexPatientId:'9223372036854775807'});
 for(const query of ['?q=a&q=b','?preset=similar','?id=1','?preset=similar&id=0','?preset=similar&id=01','?preset=similar&id=9223372036854775808','?preset=similar&id=1&id=2','?preset=similar&preset=similar&id=1','?preset=similar&id=1&q=x','?preset=similar&id=1&ids=','?preset=similar&id=1&sex=','?preset=similar&id=1&at=now','?similar=1','?q=x&host=','?q=x&doctorId=101','?q=x&analysisId=x','?q=x&cursor=x','?q=x&sex=F&sex=M','?q=x&ids=1,0'])assert.throws(()=>decode(query),undefined,query);
 assert.equal(decode('').kind,'FILTERS');assert.equal(decode('?ids=').filters.ids.length,0);assert.equal(decode('?ids=9223372036854775807').filters.ids[0],'9223372036854775807');
 const requests=[],context=vm.createContext({window:{},API_BASE:'',fetch:async(url,options)=>{requests.push({url,options});return new Response(JSON.stringify({success:true,code:'200',data:{source:'SIMILAR'}}),{headers:{'Content-Type':'application/json','X-Trace-Id':'entry-trace'}});}});
 vm.runInContext(readFileSync(resolve(__dirname,'../../js/pages/ai-cohort-api.js'),'utf8'),context);
 const signal=new AbortController().signal,result=await context.window.RACohortAPI.resolveEntry('9223372036854775807',{signal});
 assert.equal(requests[0].url,'/api/ra/ai/resolveEntry');assert.deepEqual(JSON.parse(requests[0].options.body),{source:'SIMILAR',indexPatientId:'9223372036854775807'});assert.equal(requests[0].options.signal,signal);assert.equal(requests[0].options.credentials,'same-origin');assert.deepEqual(Object.keys(requests[0].options.headers),['Content-Type']);assert.equal(result.status,200);assert.equal(result.traceId,'entry-trace');
 const owner=pageClock('?q=%E5%A5%B3%E6%80%A7&sex=M&tx=TNFi&ids=9223372036854775807');assert.equal(owner.pending.length,1);assert.equal(owner.pending[0].url,'/api/ra/ai/parse','URL问题必须一次parse而非默认cohort');assert.deepEqual(owner.pending[0].body,{question:'女性'});assert.equal(owner.get('#f-sex').value,'M');assert.equal(owner.get('#f-tx').value,'TNFi');
 const f=require('../fixtures/cohort-entry.json'),respond=(data,trace)=>new Response(JSON.stringify({success:true,code:'200',data}),{headers:{'Content-Type':'application/json','X-Trace-Id':trace}}),flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};owner.pending[0].resolve(respond(f.OK,'trace-entry'));await flush();assert.equal(owner.pending[1].url,'/api/ra/ai/applyParse');assert.equal(owner.pending[1].body.currentFilters.sex,'M');assert.equal(owner.pending[1].body.currentFilters.tx,'TNFi');assert.deepEqual(owner.pending[1].body.currentFilters.ids,['9223372036854775807']);owner.pending[1].resolve(respond(f.APPLIED,'trace-entry-apply'));await flush();assert.equal(owner.pending[2].url,'/api/ra/ai/cohort');assert.deepEqual(owner.pending[2].body.filters,f.APPLIED.filters,'URL问题必须完整消费服务端filters');
 const similar=pageClock('?preset=similar&id=9223372036854775807');assert.equal(similar.pending.length,1);assert.equal(similar.pending[0].url,'/api/ra/ai/resolveEntry');assert.deepEqual(similar.pending[0].body,{source:'SIMILAR',indexPatientId:'9223372036854775807'});similar.pending[0].resolve(respond(f.READY,'trace-entry'));await flush();assert.equal(similar.pending.length,2);assert.deepEqual(similar.pending[1].body.filters,f.READY.filters);assert.equal(similar.get('#f-age').value,'35-45');
 for(const key of ['PARTIAL_BASIS','NO_BASIS','UNSUPPORTED_BASIS']){const item=pageClock('?preset=similar&id=11');item.pending[0].resolve(respond(f[key],'trace-entry'));await flush();assert.equal(item.pending.length,key==='PARTIAL_BASIS'?2:1,key);assert.equal(item.get('#entry-state').dataset.state,key==='PARTIAL_BASIS'?'success':'empty');}
 for(const cut of ['cancel','timeout','condition','pagehide','identity','successor']){const item=pageClock('?preset=similar&id=11'),request=item.pending[0];if(cut==='cancel')item.get('#entry-cancel').events.click();else if(cut==='timeout')[...item.timers.values()][0].callback();else if(cut==='condition'){item.get('#f-sex').value='M';item.get('#f-sex').events.change();}else if(cut==='pagehide')item.listeners.pagehide();else if(cut==='identity'){item.context.sessionStorage.getItem=()=>'{"name":"新合成用户","expires":0}';item.listeners.focus();}else{item.context.location.search='?ids=';item.listeners.popstate();}const count=item.pending.length,state=item.get('#entry-state').textContent;request.resolve(respond(f.READY,'trace-entry'));await flush();assert.equal(item.pending.length,count,cut+'迟到不得cohort');assert.equal(item.get('#entry-state').textContent,state,cut+'迟到不得UI');if(!['condition','successor'].includes(cut))assert.equal(item.timers.size,0,cut+'本地owner已关闭');}
 const partial=pageClock('?q=女性且吸烟&sex=M&tx=TNFi&ids=');partial.pending[0].resolve(respond(require('../fixtures/cohort-parse.json').PARTIAL,'trace-p05'));await flush();assert.equal(partial.pending.length,1);partial.get('#parse-apply').events.click();assert.equal(partial.pending[1].body.confirmPartial,true);assert.deepEqual(partial.pending[1].body.currentFilters.ids,[]);
 for(const [status,code] of [[400,'INVALID_REQUEST'],[401,'UNAUTHENTICATED'],[404,'RESOURCE_NOT_FOUND'],[413,'LIMIT_EXCEEDED'],[503,'SERVICE_UNAVAILABLE']]){context.fetch=async()=>new Response(JSON.stringify({success:false,code,message:'入口安全错误',data:{safe:'fact'}}),{status,headers:{'Content-Type':'application/json','X-Trace-Id':'entry-error'}});await assert.rejects(()=>context.window.RACohortAPI.resolveEntry('11'),e=>e.status===status&&e.code===code&&e.data.safe==='fact'&&e.traceId==='entry-error');}
 context.fetch=async()=>new Response('bad',{status:503,headers:{'Content-Type':'text/html','X-Trace-Id':'entry-nonjson'}});await assert.rejects(()=>context.window.RACohortAPI.resolveEntry('11'),e=>e.code==='INVALID_RESPONSE'&&e.traceId==='entry-nonjson');context.fetch=async()=>{throw new TypeError('offline');};await assert.rejects(()=>context.window.RACohortAPI.resolveEntry('11'),e=>e.status===0&&e.code==='NETWORK_ERROR');

});
