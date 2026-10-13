const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const source=p=>readFileSync(resolve(__dirname,'../../',p),'utf8');
function data(n=6,status='OK') {return {studyTotal:n,targetRate:{value:status==='NO_DATA'?0:.4,meta:{numerator:status==='NO_DATA'?0:2,denominator:status==='NO_DATA'?0:5,unknownN:status==='NO_DATA'?n:n-5,status,displayText:status==='NO_DATA'?'0%':'40%'}},modHighN:3,fmN:3,missingN:2,meta:{studyCode:'RA',at:'now',asOfDate:'2026-10-07',readStartedAt:'2026-10-07T02:00:00Z',readCompletedAt:'2026-10-07T02:00:00Z',traceId:'overview-trace',policyVersions:{drugDictionary:'dev-drug-dict-v01'}}};}
function response(d=data(),status=200,code='200'){return new Response(JSON.stringify({success:status===200,code,message:'安全错误',data:status===200?d:null}),{status,headers:{'Content-Type':'application/json','X-Trace-Id':'overview-trace'}});}
function client(reply) {
 const requests=[],context=vm.createContext({API_BASE:'',window:{},fetch:async(url,options)=>{requests.push({url,options});return typeof reply==='function'?reply():reply;}});
 vm.runInContext(source('js/pages/ai-cohort-api.js'),context);return {api:context.window.RACohortAPI,requests};
}
function page() {
 const nodes=new Map(),listeners={},pending=[],timers=new Map();let timerId=0;
 const node=()=>({value:'',textContent:'',innerHTML:'',dataset:{},hidden:false,disabled:false,events:{},children:[],addEventListener(name,fn){this.events[name]=fn;},setAttribute(){},querySelectorAll(){return[];},replaceChildren(){this.children=[];this.innerHTML='';},append(n){this.children.push(n);}});
 const get=selector=>{if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);};
 const context=vm.createContext({Response,URLSearchParams,AbortController,location:{search:'',href:'',pathname:'/ai-analysis.html'},history:{replaceState(){}},localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>' {"name":"合成页面用户","role":"研究者","expires":0}'},document:{querySelector:s=>['.sidebar','.account'].includes(s)?null:get(s),querySelectorAll:s=>s==='.study-meta'?[get('.study-meta')]:[],addEventListener(){},createElement:node},window:{addEventListener:(name,fn)=>listeners[name]=fn},fetch:(url,options)=>new Promise(resolve=>pending.push({url,options,signal:options.signal,resolve})),setTimeout:(callback,ms)=>{const id=++timerId;timers.set(id,{callback,ms});return id;},clearTimeout:id=>timers.delete(id)});
 for(const p of [...source('ai-analysis.html').matchAll(/<script src="([^"?]+)(?:\?[^"]*)?" defer/g)].map(m=>m[1]))vm.runInContext(source(p),context,{filename:p});
 return {context,get,listeners,pending,timers};
}
const flush=()=>new Promise(setImmediate);
test('analysis:overview-contract',async()=>{
 const h=page();assert.equal(h.pending.length,1,'首页须实际开始真实概览请求');h.pending[0].resolve(response());await flush();assert.match(h.get('#overview').innerHTML,/40%/);
 for(const href of ['ai-cohort.html"','ai-cohort.html?act=target','ai-cohort.html?act=mod-high','ai-cohort.html?cm=FM','ai-cohort.html?data=missing'])assert.ok(h.get('#overview').innerHTML.includes(href));
 assert.match(h.get('#overview-source').textContent,/2026-10-07/);assert.match(h.get('#overview-source').textContent,/统计口径仍待医学核验/);assert.match(h.get('.study-meta').textContent,/当前人数/);assert.equal(h.get('#picker').disabled,false);assert.equal(typeof h.get('#patient-search-form').events.submit,'function');assert.equal(h.get('#patient-search-state').dataset.state,'idle');
 const no=page();no.pending[0].resolve(response({...data(6,'NO_DATA'),modHighN:0}));await flush();assert.match(no.get('#overview').innerHTML,/暂无可评估患者/);assert.match(no.get('#overview').innerHTML,/有效 0 人 · 未知 6 人/);assert.doesNotMatch(no.get('#overview').innerHTML,/>0%/);
 const zero=page(),z={...data(),targetRate:{value:0,meta:{numerator:0,denominator:5,unknownN:1,status:'OK',displayText:'0%'}},modHighN:5};zero.pending[0].resolve(response(z));await flush();assert.match(zero.get('#overview').innerHTML,/>0%/);assert.doesNotMatch(zero.get('#overview').innerHTML,/暂无可评估/);
 const empty=page();empty.pending[0].resolve(response({...data(0,'NO_DATA'),fmN:0,modHighN:0,missingN:0}));await flush();assert.equal(empty.get('#overview-state').dataset.state,'success');assert.match(empty.get('#overview').innerHTML,/当前研究库为空/);
 for(const [status,code] of [[401,'UNAUTHENTICATED'],[503,'SERVICE_UNAVAILABLE'],[400,'INVALID_REQUEST']]){const e=page();e.pending[0].resolve(response(null,status,code));await flush();assert.equal(e.get('#overview-state').dataset.state,'error');assert.equal(e.get('#overview').innerHTML,'');assert.match(e.get('#overview-state').textContent,new RegExp(({UNAUTHENTICATED:'登录已失效，请重新登录',SERVICE_UNAVAILABLE:'服务暂不可用，请稍后重试',INVALID_REQUEST:'输入内容不符合要求，请检查后重试',NOT_FOUND:'所需记录不存在或当前账号无法访问'})[code]));assert.doesNotMatch(e.get('#overview-state').textContent,/overview-trace|SERVICE_UNAVAILABLE|UNAUTHENTICATED|INVALID_REQUEST/);}
 const question='  女性患者 & 原文  ';h.get('#ask-input').value=question;h.get('#ask-form').events.submit({preventDefault(){}});assert.equal(h.context.location.href,'ai-cohort.html?q='+encodeURIComponent(question));h.context.location.href='';h.get('#ask-input').value='  ';h.get('#ask-form').events.submit({preventDefault(){}});assert.equal(h.context.location.href,'');assert.match(h.get('#ask-message').textContent,/请输入/);
 assert.doesNotMatch(source('js/pages/ai-analysis.js'),/\b(?:patients|AI_DATA|demoStats|cohortStats|applyFilters|bindPatientPicker)\b/);assert.doesNotMatch(source('ai-analysis.html'),/shared\/ai-analytics\.js|演示版|自动发现|FM抬高/);
 const stale=page();assert.equal(stale.pending.length,1,'旧请求已实际开始');stale.context.loadOverview();assert.equal(stale.pending.length,2);stale.pending[1].resolve(response(data(9)));await flush();assert.match(stale.get('#overview').innerHTML,/>9<small/);stale.pending[0].resolve(response());await flush();assert.match(stale.get('#overview').innerHTML,/>9<small/,'已开始旧请求迟到不得覆盖新卡');
 const timeout=page();assert.equal(timeout.pending.length,1,'永久pending请求确已started');const deadline=[...timeout.timers.values()].find(t=>t.ms===30000);assert.ok(deadline,'owner须注册30秒deadline');deadline.callback();assert.equal(timeout.pending[0].signal.aborted,true,'永久pending到期必须自动abort');assert.equal(timeout.get('#overview-state').dataset.state,'error');assert.match(timeout.get('#overview-state').textContent,/超时/);timeout.pending[0].resolve(response());await flush();assert.equal(timeout.get('#overview').innerHTML,'','超时迟到零发布');assert.equal(timeout.timers.size,0);
 for(const event of ['pagehide','storage','ra-auth-changed'])for(const settled of [false,true]){
   const p=page();assert.equal(p.pending.length,1);if(settled){p.pending[0].resolve(response());await flush();assert.match(p.get('#overview').innerHTML,/40%/);}
   assert.equal(typeof p.listeners[event],'function',event+'必须关闭pending及已成功展示');p.listeners[event]({key:'ra-auth'});assert.equal(p.get('#overview').innerHTML,'');assert.equal(p.get('#overview-source').textContent,'');assert.equal(p.get('#overview-state').dataset.state,'cancelled');assert.equal(p.timers.size,0);
   if(!settled){assert.equal(p.pending[0].signal.aborted,true);p.pending[0].resolve(response());await flush();assert.equal(p.get('#overview').innerHTML,'');}
   if(event==='pagehide'){const count=p.pending.length;p.context.loadOverview();assert.equal(p.pending.length,count,'离页不能重新赋发布权');p.listeners.pageshow({persisted:true});assert.equal(p.pending.length,count+1);assert.equal(p.get('#overview').innerHTML,'');p.pending.at(-1).resolve(response(data(8)));await flush();assert.match(p.get('#overview').innerHTML,/>8<small/);}
 }
 const invalid=page();invalid.pending[0].resolve(response({...data(),fmN:'bad'}));await flush();assert.equal(invalid.get('#overview-state').dataset.state,'error');assert.equal(invalid.get('#overview').innerHTML,'');assert.equal(invalid.timers.size,0);assert.match(invalid.get('#overview-state').textContent,/返回的数据不完整或无法识别，请重新读取/);
 const irrelevant=page();irrelevant.listeners.storage({key:'other-key'});assert.equal(irrelevant.pending[0].signal.aborted,false);
 const c=client(response());assert.equal(typeof c.api.overview,'function');
 const controller=new AbortController(),r=await c.api.overview({signal:controller.signal});
 assert.equal(c.requests[0].url,'/api/ra/ai/overview');assert.equal(c.requests[0].options.body,'{}');assert.equal(c.requests[0].options.credentials,'same-origin');assert.equal(c.requests[0].options.signal,controller.signal);assert.equal(r.traceId,'overview-trace');assert.equal(r.data.studyTotal,6);
 for(const broken of [{...data(),studyTotal:-1},{...data(),fmN:1.5},{...data(),missingN:'2'},{...data(),targetRate:{value:.4,meta:{numerator:2,denominator:5,unknownN:1,status:'BOGUS',displayText:'40%'}}}])await assert.rejects(()=>client(response(broken)).api.overview(),e=>e.code==='INVALID_RESPONSE'&&e.traceId==='overview-trace');
});
