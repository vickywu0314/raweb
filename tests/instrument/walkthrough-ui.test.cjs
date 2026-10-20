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
const {cohort}=require('../fixtures/cohort-private.json'),parse=require('../fixtures/cohort-parse.json');
const response=(data,trace='trace-private',status=200,code='200')=>new Response(JSON.stringify({success:status===200,code,message:'合成结果',data}),{status,headers:{'Content-Type':'application/json','X-Trace-Id':trace}});
const calls=(h,suffix)=>h.pending.filter(r=>r.url.endsWith('/'+suffix));
const listData=(page,total,items=[])=>({page,total,size:20,items,meta:{traceId:'trace-private'}});
const click=(h,id)=>h.get(id).events.click();
const run=(h,js)=>vm.runInContext(js,h.context);
async function ready(){const h=pageClock('');h.pending[0].resolve(response(base));await flush();return h;}
async function list(h,page,total,items=[]){run(h,`loadPrivateList(${page})`);calls(h,'list').at(-1).resolve(response(listData(page,total,items)));await flush();}
async function apply(h){h.get('#question').value='女性且吸烟';h.get('#question-form').events.submit({preventDefault(){}});calls(h,'parse').at(-1).resolve(response(parse.PARTIAL,'trace-p05'));await flush();click(h,'#parse-apply');calls(h,'applyParse').at(-1).resolve(response({...clone(parse.APPLIED_PARTIAL),filters:{...parse.APPLIED_PARTIAL.filters,ids:null}},'trace-p05-apply'));await flush();}
test('walkthrough:private-pagination',async()=>{
 const h=await ready();assert.equal(h.get('#private-next').disabled,true,'尚未加载时不能下一页');
 for(const total of [0,1,20]){await list(h,1,total,total?[cohort]:[]);assert.equal(h.get('#private-prev').disabled,true);assert.equal(h.get('#private-next').disabled,true,'空列表/首页即末页必须禁next');const n=calls(h,'list').length;click(h,'#private-next');click(h,'#private-prev');assert.equal(calls(h,'list').length,n,'handler必须独立守住边界');}
 await list(h,1,0);click(h,'#private-list-load');calls(h,'list').at(-1).resolve(response(listData(1,100,[cohort])));await flush();assert.equal(h.get('#private-next').disabled,false);click(h,'#private-next');const old=calls(h,'list').at(-1);assert.equal(old.body.page,2);assert.equal(h.get('#private-next').disabled,true);assert.equal(h.get('#private-prev').disabled,true);const before=calls(h,'list').length;click(h,'#private-next');click(h,'#private-prev');assert.equal(calls(h,'list').length,before,'loading时程序click也不能双发');
 [...h.timers.values()][0].callback();assert.equal(h.get('#private-list-state').dataset.state,'error');assert.equal(h.get('#private-next').disabled,false);click(h,'#private-next');assert.equal(calls(h,'list').at(-1).body.page,3);calls(h,'list').at(-1).resolve(response(listData(3,100,[{...cohort,name:'PAGE THREE'}])));await flush();const stable=h.get('#private-page').textContent;old.resolve(response(listData(2,100,[{...cohort,name:'OLD TWO'}])));await flush();assert.equal(h.get('#private-page').textContent,stable);assert.match(h.get('#private-items').children[0].textContent,/PAGE THREE/);
 await list(h,2,21,[cohort]);run(h,`beginPrivateEdit('${cohort.cohortId}','delete');confirmPrivateCommand()`);calls(h,'delete').at(-1).resolve(response({cohortId:cohort.cohortId,version:2,meta:{traceId:'trace-private'}}));await flush();assert.equal(calls(h,'list').at(-1).body.page,2);calls(h,'list').at(-1).resolve(response(listData(2,20)));await flush();assert.equal(calls(h,'list').at(-1).body.page,1,'删除最后一项后自动回到合法末页');calls(h,'list').at(-1).resolve(response(listData(1,20,[{...cohort,cohortId:'22222222-2222-2222-2222-222222222222'}])));await flush();assert.equal(h.get('#private-page').textContent,'第 1 页 · 每页 20 条 · 共 20 条');assert.equal(h.get('#private-next').disabled,true);
 run(h,'loadPrivateList(3)');calls(h,'list').at(-1).resolve(response(listData(3,21)));await flush();assert.equal(calls(h,'list').at(-1).body.page,2);const bounded=calls(h,'list').length;calls(h,'list').at(-1).resolve(response(listData(2,0)));await flush();assert.equal(calls(h,'list').length,bounded,'持续缩减只做一次自动回退');assert.equal(h.get('#private-list-state').dataset.state,'error');
 await list(h,1,100,[cohort]);click(h,'#private-list-load');const refreshOld=calls(h,'list').at(-1);click(h,'#private-list-load');calls(h,'list').at(-1).resolve(response(listData(1,0)));await flush();refreshOld.resolve(response(listData(1,100,[cohort])));await flush();assert.equal(h.get('#private-items').children.length,0,'显式刷新替换旧owner');
 for(const mode of ['timeout','error','identity','pagehide']){const x=await ready();await list(x,1,100,[cohort]);click(x,'#private-next');const late=calls(x,'list').at(-1);if(mode==='timeout')[...x.timers.values()][0].callback();if(mode==='error')late.resolve(response(null,'trace-private',503,'SERVICE_UNAVAILABLE'));if(mode==='identity'){x.context.sessionStorage.getItem=()=>'{"name":"其他身份","role":"研究者","expires":0}';x.listeners.focus();}if(mode==='pagehide')x.listeners.pagehide();await flush();if(['identity','pagehide'].includes(mode)){assert.equal(x.get('#private-prev').disabled,true);assert.equal(x.get('#private-next').disabled,true);}const state=x.get('#private-list-state').textContent;late.resolve(response(listData(2,100,[cohort])));await flush();assert.equal(x.get('#private-list-state').textContent,state);}
});
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
