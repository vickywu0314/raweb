const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),{readFileSync}=require('node:fs'),{resolve}=require('node:path');
const {PARTIAL}=require('../fixtures/cohort-parse.json');
function client(reply){const requests=[],context=vm.createContext({API_BASE:'',window:{},fetch:async(url,options)=>{requests.push({url,options});return typeof reply==='function'?reply():reply;}});vm.runInContext(readFileSync(resolve(__dirname,'../../js/pages/ai-cohort-api.js'),'utf8'),context);return {api:context.window.RACohortAPI,requests};}
function pageClock(initialSearch='') {
  const nodes = new Map(), timers = new Map(), listeners = {}, pending = [];
  const selects = ['#f-sex','#f-age','#f-sero','#f-tx','#f-at','#f-act','#f-cm','#f-data'];
  function node() {
    const attributes=new Map();let text='';
    return {value:'',dataset:{},hidden:false,disabled:false,options:[],selectedOptions:[{textContent:'不限'}],children:[],events:{},style:{setProperty(){}},
      get textContent(){return text+this.children.map(child=>child.textContent).join('');},set textContent(value){text=String(value);this.children=[];},
      addEventListener(name,callback){this.events[name]=callback;},querySelectorAll(){return [];},replaceChildren(...children){text='';this.children=children;},append(...children){this.children.push(...children);},
      setAttribute(name,value){attributes.set(name,String(value));},removeAttribute(name){attributes.delete(name);},hasAttribute(name){return attributes.has(name);},getAttribute(name){return attributes.get(name)??null;}};
  }
  const get = selector => {if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);};
  for(const selector of selects)get(selector);get('#f-at').value='now';
  let timerId=0;
  const context=vm.createContext({INITIAL_PATIENTS:[],URLSearchParams,AbortController,location:{search:initialSearch,pathname:'/ai-cohort.html',hash:'',replace:()=>assert.fail('本片不应重定向')},history:{replaceState(_state,_title,path){const url=new URL(path,'http://synthetic.invalid');context.location.search=url.search;context.location.hash=url.hash;}},
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

// The harness observes production append/text/analysis-ID writes; it is not browser innerHTML.
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function consume(clock,request,data,trace='trace-p05'){
 const decoded=deferred(),response=new Response(JSON.stringify({success:true,code:'200',data}),{headers:{'Content-Type':'application/json','X-Trace-Id':trace}}),json=response.json.bind(response);
 response.json=async()=>{const value=await json();request.decoded=true;decoded.resolve();return value;};
 request.resolve(response);await decoded.promise;await new Promise(setImmediate); // JSON handshake, then drain this consumer turn; no wall-clock delay.
}
const observable=clock=>JSON.parse(JSON.stringify({url:clock.context.location.pathname+clock.context.location.search,
 values:['sex','age','sero','tx','at','act','cm','data'].map(k=>clock.get('#f-'+k).value),
 pane:['parse-state','parse-candidate','parse-details','parse-cancel','apply-cancel','parse-apply','parse-dismiss'].map(id=>({id,text:clock.get('#'+id).textContent,state:clock.get('#'+id).dataset.state,hidden:clock.get('#'+id).hidden})),note:clock.get('#parse-note').textContent,
 results:{analysisId:clock.get('#results').dataset.analysisId,n:clock.get('#cohort-n').textContent,list:clock.get('#list-count').textContent,computed:clock.get('#numeric-computed-at').textContent,read:clock.get('#display-read-at').textContent,
 rows:clock.get('#patient-rows').children.map(row=>({id:row.dataset.patientId,clinical:row.children[0].children.slice(0,3).map(child=>child.textContent),childCount:row.children.length}))}}));
const requestCounts=clock=>Object.fromEntries(['parse','applyParse','cohort'].map(path=>[path,clock.pending.filter(r=>r.url.endsWith('/ai/'+path)).length]));
async function txCompletionOrders(){
 const {U}=require('../fixtures/cohort-p02.json');
 for(const order of ['late-parse-before-current','current-before-late-parse']){
  const clock=pageClock('?sex=M&tx=TNFi&ids=1');await consume(clock,clock.pending[0],U);assert.equal(clock.get('#results').dataset.analysisId,U.analysisId);assert.equal(clock.get('#cohort-n').textContent,'6');assert.equal(clock.get('#patient-rows').children.length,6,'actual production append reached');
  clock.get('#question').value='女性且吸烟';clock.get('#question-form').events.submit({preventDefault(){}});const old=clock.pending.at(-1);assert.deepEqual(old.body,{question:'女性且吸烟'});
  clock.get('#f-tx').value='JAKi';clock.get('#f-tx').events.change();const current=clock.pending.at(-1);assert.ok(current.url.endsWith('/ai/cohort'));assert.equal(current.body.filters.tx,'JAKi');assert.equal(clock.get('#cohort-state').dataset.state,'loading');assert.equal(clock.get('#patient-rows').children.length,0);
  const questionRef=order==='late-parse-before-current'?'00000000-0000-0000-0000-000000000901':'00000000-0000-0000-0000-000000000902',analysisId=order==='late-parse-before-current'?'00000000-0000-0000-0000-000000000911':'00000000-0000-0000-0000-000000000912',data={...U,analysisId};
  const counts=requestCounts(clock);assert.deepEqual(counts,{parse:1,applyParse:0,cohort:2});
  if(order==='current-before-late-parse')await consume(clock,current,data);
  const stable=observable(clock);await consume(clock,old,{...PARTIAL,questionRef});assert.ok(old.decoded);assert.deepEqual(observable(clock),stable,'old parse alone changes no observed face');assert.deepEqual(requestCounts(clock),counts);
  if(order==='late-parse-before-current'){
   await consume(clock,current,data);
   const published=observable(clock);assert.notDeepEqual(published.results,stable.results,'current cohort is a separate legitimate producer');
   for(const face of ['pane','note','url','values'])assert.deepEqual(published[face],stable[face],face+' belongs to the same current condition context');
  }
  assert.equal(clock.get('#results').dataset.analysisId,analysisId);assert.equal(clock.get('#cohort-n').textContent,'6');assert.equal(clock.get('#list-count').textContent,'6 位患者 · 已显示 6 位');assert.deepEqual(clock.get('#patient-rows').children.map(row=>row.dataset.patientId),['5','4','3','2','1','6']);assert.equal(clock.get('#patient-rows').children[0].children[0].children[0].textContent,'合成患者5');assert.equal(clock.get('#cohort-state').dataset.state,'success');assert.equal(clock.timers.size,0,'both independent owners retired their timers');assert.deepEqual(requestCounts(clock),counts);
  console.log('P04a completion order='+order+' parse='+questionRef+' cohort='+analysisId+' decoded=true renderedRows=6 counts='+JSON.stringify(counts)+' timers=0');
 }
}

test('cohort:parse-api-contract',async()=>{
 await txCompletionOrders();
 const clock=pageClock();clock.get('#question').value='女性且吸烟';clock.get('#question-form').events.submit({preventDefault(){}});assert.equal(clock.pending.filter(r=>r.url.endsWith('/ai/parse')).length,1,'真实form必须消费parse，不能停留开发中');
 const invalid={...PARTIAL,candidateFilters:{ids:['1']}};clock.pending.at(-1).resolve(new Response(JSON.stringify({success:true,code:'200',data:invalid}),{headers:{'Content-Type':'application/json','X-Trace-Id':'trace-p05'}}));for(let i=0;i<10;i++)await Promise.resolve();assert.equal(clock.get('#parse-state').dataset.state,'error','非法候选必须拒绝，不能显示成功');assert.match(clock.get('#parse-state').textContent,/返回的数据不完整或无法识别/);
 const late=pageClock(),emit=question=>{late.get('#question').value=question;late.get('#question-form').events.submit({preventDefault(){}});return late.pending.at(-1);},a=emit('女性且吸烟'),b=emit('女性');
 const respond=data=>new Response(JSON.stringify({success:true,code:'200',data}),{headers:{'Content-Type':'application/json','X-Trace-Id':'trace-p05'}});b.resolve(respond(require('../fixtures/cohort-parse.json').OK));for(let i=0;i<10;i++)await Promise.resolve();const apply=late.pending.filter(r=>r.url.endsWith('/ai/applyParse')).at(-1);assert.ok(apply,'OK候选由明确form消费apply');assert.equal(late.pending.filter(r=>r.url.endsWith('/ai/cohort')).length,1,'apply成功前仍只有旧cohort');apply.resolve(new Response(JSON.stringify({success:true,code:'200',data:{...require('../fixtures/cohort-parse.json').APPLIED_OK,filters:{...require('../fixtures/cohort-parse.json').APPLIED_OK.filters,ids:null}}}),{headers:{'Content-Type':'application/json','X-Trace-Id':'trace-p05-apply'}}));for(let i=0;i<10;i++)await Promise.resolve();assert.equal(late.pending.filter(r=>r.url.endsWith('/ai/cohort')).length,2,'服务端完整filters后才新cohort');const fresh=late.get('#parse-details').textContent;a.resolve(respond(PARTIAL));for(let i=0;i<10;i++)await Promise.resolve();assert.equal(late.get('#parse-details').textContent,fresh,'A真实JSON迟到不能覆盖B');
 for(const terminal of ['cancel','timeout','edit','condition','compare']){
  const owner=pageClock();owner.get('#question').value='女性且吸烟';owner.get('#question-form').events.submit({preventDefault(){}});const request=owner.pending.at(-1);assert.equal(owner.timers.size,2);
  if(terminal==='cancel')owner.get('#parse-cancel').events.click();else if(terminal==='timeout')Array.from(owner.timers.values()).at(-1).callback();else if(terminal==='edit')owner.get('#question').events.input();else if(terminal==='condition'){owner.get('#f-sex').value='F';owner.get('#f-sex').events.change();}else owner.get('#compare-current-a').events.click();
  const stable=owner.get('#parse-state').textContent;request.resolve(respond(PARTIAL));for(let i=0;i<10;i++)await Promise.resolve();assert.equal(owner.get('#parse-details').textContent,'',terminal+'迟到没有候选');assert.equal(owner.get('#parse-state').textContent,stable);assert.equal(owner.timers.size,1,'仅原分析timer保留');
 }
 const c=client(new Response(JSON.stringify({success:true,code:'200',data:PARTIAL}),{headers:{'Content-Type':'application/json','X-Trace-Id':'trace-p05'}})),controller=new AbortController();
 const result=await c.api.parse('女性且吸烟',{signal:controller.signal});assert.equal(c.requests[0].url,'/api/ra/ai/parse');assert.equal(c.requests[0].options.body,'{"question":"女性且吸烟"}');assert.equal(c.requests[0].options.credentials,'same-origin');assert.equal(c.requests[0].options.signal,controller.signal);assert.deepEqual(Object.keys(c.requests[0].options.headers),['Content-Type']);assert.equal(result.status,200);assert.equal(result.traceId,'trace-p05');assert.deepEqual(JSON.parse(JSON.stringify(result.data)),PARTIAL);
 for(const question of ['','  ','😀'.repeat(200),'😀'.repeat(201)]){const wire=client(new Response(JSON.stringify({success:true,code:'200',data:PARTIAL}),{headers:{'Content-Type':'application/json'}}));await wire.api.parse(question);assert.equal(wire.requests[0].options.body,JSON.stringify({question}));}
 for(const [status,code] of [[400,'INVALID_REQUEST'],[400,'INVALID_FILTER'],[401,'UNAUTHENTICATED'],[413,'LIMIT_EXCEEDED'],[503,'SERVICE_UNAVAILABLE']]){const bad=client(new Response(JSON.stringify({success:false,code,message:'安全错误',data:null}),{status,headers:{'Content-Type':'application/json','X-Trace-Id':'trace-p05'}}));await assert.rejects(()=>bad.api.parse('原问题'),e=>e.status===status&&e.code===code&&e.traceId==='trace-p05'&&e.data===null);assert.equal(bad.requests.length,1);}
 const html=client(new Response('bad',{status:503,headers:{'Content-Type':'text/html','X-Trace-Id':'trace-p05'}}));await assert.rejects(()=>html.api.parse('女性'),e=>e.code==='INVALID_RESPONSE'&&e.traceId==='trace-p05');
 const offline=client(()=>{throw new TypeError('offline');});await assert.rejects(()=>offline.api.parse('女性'),e=>e.code==='NETWORK_ERROR');
});
