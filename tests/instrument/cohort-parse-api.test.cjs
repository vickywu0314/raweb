const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),{readFileSync}=require('node:fs'),{resolve}=require('node:path');
const {PARTIAL}=require('../fixtures/cohort-parse.json');
function client(reply){const requests=[],context=vm.createContext({API_BASE:'',window:{},fetch:async(url,options)=>{requests.push({url,options});return typeof reply==='function'?reply():reply;}});vm.runInContext(readFileSync(resolve(__dirname,'../../js/pages/ai-cohort-api.js'),'utf8'),context);return {api:context.window.RACohortAPI,requests};}
function pageClock() {
  const nodes = new Map(), timers = new Map(), listeners = {}, pending = [];
  const selects = ['#f-sex','#f-age','#f-sero','#f-tx','#f-at','#f-act','#f-cm','#f-data'];
  function node() {return {value:'',textContent:'',dataset:{},hidden:false,disabled:false,selectedOptions:[{textContent:'不限'}],children:[],events:{},addEventListener(name,callback){this.events[name]=callback;},querySelectorAll(){return [];},replaceChildren(){this.children=[];},append(child){this.children.push(child);},setAttribute(){}};}
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

test('cohort:parse-api-contract',async()=>{
 const clock=pageClock();clock.get('#question').value='女性且吸烟';clock.get('#question-form').events.submit({preventDefault(){}});assert.equal(clock.pending.filter(r=>r.url.endsWith('/ai/parse')).length,1,'真实form必须消费parse，不能停留开发中');
 const invalid={...PARTIAL,candidateFilters:{ids:['1']}};clock.pending.at(-1).resolve(new Response(JSON.stringify({success:true,code:'200',data:invalid}),{headers:{'Content-Type':'application/json','X-Trace-Id':'trace-p05'}}));for(let i=0;i<10;i++)await Promise.resolve();assert.equal(clock.get('#parse-state').dataset.state,'error','非法候选必须拒绝，不能显示成功');assert.match(clock.get('#parse-state').textContent,/INVALID_RESPONSE/);
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
