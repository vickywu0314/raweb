const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),{readFileSync}=require('node:fs'),{resolve}=require('node:path');
function pageClock(search="?sex=M&tx=TNFi&ids=1,2,3,9223372036854775807") {
  const nodes = new Map(), timers = new Map(), listeners = {}, pending = [];
  const selects = ['#f-sex','#f-age','#f-sero','#f-tx','#f-at','#f-act','#f-cm','#f-data'];
  function node() {return {value:'',textContent:'',dataset:{},hidden:false,disabled:false,selectedOptions:[{textContent:'不限'}],children:[],style:{setProperty(){}},events:{},addEventListener(name,callback){this.events[name]=callback;},querySelectorAll(){return [];},replaceChildren(){this.children=[];},append(child){this.children.push(child);},setAttribute(){}};}
  const get = selector => {if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);};
  for(const selector of selects)get(selector);get('#f-at').value='now';
  let timerId=0;
  let aborts=0;class InertAbortController extends AbortController {abort(){aborts++;}}
  const context=vm.createContext({crypto:require('node:crypto').webcrypto,INITIAL_PATIENTS:[],URLSearchParams,AbortController:InertAbortController,location:{search,pathname:'/ai-cohort.html',hash:'',replace:()=>assert.fail('本片不应重定向')},history:{replaceState(a,b,url){context.location.href=url;}},
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
  return {get,timers,pending,listeners,context,getAborts:()=>aborts};
}
const clone=x=>JSON.parse(JSON.stringify(x)),flush=()=>new Promise(setImmediate);
const {U:base,EMPTY:empty}=require('../fixtures/cohort-p02.json');
const parse=require('../fixtures/cohort-parse.json');
const response=(data,trace='trace-private',status=200,code='200')=>new Response(JSON.stringify({success:status===200,code,message:'合成结果',data}),{status,headers:{'Content-Type':'application/json','X-Trace-Id':trace}});
const calls=(h,suffix)=>h.pending.filter(r=>r.url.endsWith('/'+suffix));
const click=(h,id)=>h.get(id).events.click();
const run=(h,js)=>vm.runInContext(js,h.context);
async function ready(){const h=pageClock('');h.pending[0].resolve(response(base));await flush();return h;}
async function apply(h){h.get('#question').value='女性且吸烟';h.get('#question-form').events.submit({preventDefault(){}});calls(h,'parse').at(-1).resolve(response(parse.PARTIAL,'trace-p05'));await flush();click(h,'#parse-apply');calls(h,'applyParse').at(-1).resolve(response({...clone(parse.APPLIED_PARTIAL),filters:{...parse.APPLIED_PARTIAL.filters,ids:null}},'trace-p05-apply'));await flush();}
test('walkthrough:parse-state',async()=>{
 for(const terminal of ['success','empty','error','timeout','cancel','new-owner']){const h=await ready();await apply(h);assert.equal(h.get('#parse-state').textContent,'候选已应用','解析区不冒领分析进度');assert.doesNotMatch(h.get('#parse-details').textContent,/确认前不会应用|尚未应用|请确认后/);assert.equal(h.get('#parse-note-context').textContent,'解析时说明（应用前）');const current=calls(h,'cohort').at(-1);if(terminal==='success')current.resolve(response(base));if(terminal==='empty')current.resolve(response(empty));if(terminal==='error')current.resolve(response(null,'t',503,'SERVICE_UNAVAILABLE'));if(terminal==='timeout')[...h.timers.values()][0].callback();if(terminal==='cancel')click(h,'#cancel-analysis');if(terminal==='new-owner'){h.get('#f-sex').value='M';h.get('#f-sex').events.change();calls(h,'cohort').at(-1).resolve(response(base));}await flush();assert.doesNotMatch(h.get('#parse-state').textContent,/正在.*分析/);const state=h.get('#cohort-state').textContent,parseState=h.get('#parse-state').textContent;current.resolve(response(base));await flush();assert.equal(h.get('#cohort-state').textContent,state);assert.equal(h.get('#parse-state').textContent,parseState);if(['error','timeout','cancel'].includes(terminal)){click(h,'#reanalyze');calls(h,'cohort').at(-1).resolve(response(base));await flush();assert.equal(h.get('#cohort-state').dataset.state,'success');}assert.equal(h.timers.size,0);}
});

test('walkthrough:notification-copy',async()=>{
 const h=await ready();for(const reason of ['NOT_CONFIGURED','PRE_DATA_IO_FAILED']){run(h,`showApplicationReceipt({receipt:{applicationId:'9223372036854775807',notification:{mailStatus:'FAILED',smtpAccepted:false,statusConfirmed:true,reason:'${reason}'}}})`);assert.match(h.get('#application-receipt').textContent,/申请 #9223372036854775807 已记录/);assert.match(h.get('#application-receipt').textContent,/邮件服务尚未受理，送达待确认/);assert.match(h.get('#application-receipt').textContent,reason==='NOT_CONFIGURED'?/通知未发送，尚未配置/:/通知发送失败/);if(reason==='NOT_CONFIGURED')assert.doesNotMatch(h.get('#application-receipt').textContent,/发送失败/);}
});

test('walkthrough:pagination-characterization',async()=>{
 const h=await ready();click(h,'#more');assert.equal(calls(h,'cohortPatients').length,0,'无cursor时handler零请求');
 const data=clone(base);data.n=11;data.studyTotal=11;data.patients={total:11,returnedCount:10,hasMore:true,nextCursor:'opaque.10',items:Array.from({length:10},(_,i)=>({...clone(base.patients.items[0]),patientId:String(i+1)}))};click(h,'#reanalyze');calls(h,'cohort').at(-1).resolve(response(data));await flush();assert.equal(h.get('#more').hidden,false);click(h,'#more');click(h,'#more');assert.equal(calls(h,'cohortPatients').length,1,'分页已有owner时防双点');calls(h,'cohortPatients')[0].resolve(response({analysisId:base.analysisId,patients:{total:11,returnedCount:1,hasMore:false,nextCursor:null,items:[{...clone(base.patients.items[0]),patientId:'11'}]},meta:{displayReadCompletedAt:'2026-10-16T01:00:00Z'}}));await flush();assert.equal(h.get('#more').hidden,true);assert.equal(h.get('#patient-rows').children.length,11);click(h,'#more');assert.equal(calls(h,'cohortPatients').length,1,'最后游标已消费后零请求');
});
