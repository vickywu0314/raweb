const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readFileSync}=require('node:fs'),{resolve}=require('node:path');
const root=resolve(__dirname,'../..'),source=file=>readFileSync(resolve(root,file),'utf8');
const flush=()=>new Promise(setImmediate);
class Element {
 constructor(){this.value='';this.dataset={};this.hidden=false;this.disabled=false;this.children=[];this.events={};this.own='';this.style={setProperty(){}};this.selectedOptions=[{textContent:'不限'}];}
 set textContent(value){this.own=String(value);this.children=[];}
 get textContent(){return this.own+this.children.map(child=>child.textContent).join('');}
 append(...children){this.children.push(...children);}
 prepend(...children){this.children.unshift(...children);}
 replaceChildren(...children){this.own='';this.children=children;}
 addEventListener(type,handler){this.events[type]=handler;}
 querySelectorAll(){return [];}
 setAttribute(name,value){this[name]=value;}
 removeAttribute(name){delete this[name];}
}
function page(){
 const nodes=new Map(),pending=[],timers=new Map(),events={},copied=[],selected=[];
 const get=selector=>{if(!nodes.has(selector))nodes.set(selector,new Element());return nodes.get(selector);};get('#f-at').value='now';
 let timer=0,rangeNode=null;
 const c=vm.createContext({INITIAL_PATIENTS:[],URLSearchParams,AbortController,location:{search:'?sex=F',pathname:'/ai-cohort.html',hash:''},history:{replaceState(){}},
  localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>' {"name":"合成页面用户","role":"研究者","expires":0}'},
  document:{addEventListener:(type,handler)=>events[type]=handler,querySelector:selector=>['.sidebar','.account'].includes(selector)?null:get(selector),querySelectorAll:()=>[],createElement:()=>new Element(),createRange:()=>({selectNodeContents(node){rangeNode=node;}})},
  window:{addEventListener:(type,handler)=>events[type]=handler,navigator:{clipboard:{writeText:async value=>copied.push(value)}},getSelection:()=>({removeAllRanges(){},addRange(){selected.push(rangeNode.textContent);}})},
  fetch:(url,options)=>new Promise(resolve=>pending.push({url,body:JSON.parse(options.body),signal:options.signal,resolve})),
  setTimeout:(callback,ms)=>{timers.set(++timer,{callback,ms});return timer;},clearTimeout:id=>timers.delete(id)});
 for(const file of ['js/boot.js','js/common.js','js/pages/ai-cohort-api.js','js/pages/ai-cohort-conditions.js','js/shared/user-display.js','js/pages/ai-cohort.js'])vm.runInContext(source(file),c,{filename:file});
 return {get,pending,timers,c,copied,selected,events};
}
const failure=(status,code,trace)=>new Response(JSON.stringify({success:false,code,message:'RAW_BACKEND_DEBUG <img src=x onerror=alert(1)>',data:null}),{status,headers:{'Content-Type':'application/json',...(trace?{'X-Trace-Id':trace}:{})}});
test('display:result-size-context',async()=>{
 const display=require('../../js/shared/user-display.js');
 assert.equal(display.error({status:413,code:'RESULT_TOO_LARGE',message:'RAW_BACKEND_DEBUG'}),'分析范围过大，请缩小筛选范围后重试');
 assert.equal(display.error({status:413,code:'RESULT_TOO_LARGE'},undefined,'export'),'导出结果过大，请减少所选内容');
 assert.equal(display.error({status:503,code:'UNRECOGNIZED',message:'RAW_BACKEND_DEBUG'}),'暂时无法完成，请稍后重试');
 // VM中的window不是全局对象；补齐真实浏览器的同名全局绑定，仅实际API消费合成响应。
 const h=page();h.c.RACohortAPI=h.c.window.RACohortAPI;
 h.pending[0].resolve(new Response(JSON.stringify({success:true,code:'200',data:require('../fixtures/cohort-p02.json').U}),{headers:{'Content-Type':'application/json','X-Trace-Id':'size-context-trace'}}));await flush();
 assert.equal(h.get('#cohort-state').dataset.state,'success');h.c.openExport();const exporting=h.c.requestExport();assert.equal(h.pending[1].url,'/api/ra/export/xlsx');h.pending[1].resolve(failure(413,'RESULT_TOO_LARGE','export-size-trace'));await exporting;
 assert.equal(h.get('#export-state').textContent,'导出结果过大，请减少所选内容 ');assert.equal(h.get('#export-state').dataset.state,'error');assert.equal(h.get('#results').dataset.analysisId,require('../fixtures/cohort-p02.json').U.analysisId);assert.equal(h.pending.length,2);assert.equal(h.timers.size,0);h.events.pagehide();
});
test('cohort:failure-diagnostics',async()=>{
 const h=page(),trace='a1234567-89ab-4cde-8f01-23456789abcd';
 assert.equal(h.pending.length,1);h.pending[0].resolve(failure(503,'SERVICE_UNAVAILABLE',trace));await flush();
 assert.equal(h.get('#error-message').textContent,'服务暂不可用，请稍后重试');assert.doesNotMatch(h.get('#error-message').textContent,/RAW_|onerror|img/);
 const box=h.get('#error-trace');assert.match(box.textContent,new RegExp('诊断编号：'+trace));assert.equal(box.children.length,2);
 const copy=box.children[1];assert.equal(copy.textContent,'复制诊断编号');await copy.events.click();assert.deepEqual(h.copied,[trace]);assert.equal(copy.textContent,'已复制');assert.equal(copy.disabled,false);
 for(const clipboard of [undefined,{writeText:async()=>{throw new Error('clipboard denied');}}]){
  h.c.window.navigator.clipboard=clipboard;h.c.showError({status:503,code:'SERVICE_UNAVAILABLE',traceId:trace});const button=box.children[1];await button.events.click();assert.equal(button.disabled,false);assert.equal(button.textContent,'请复制已选编号');assert.equal(h.selected.at(-1),trace);
 }
 h.c.window.getSelection=undefined;h.c.showError({status:503,code:'SERVICE_UNAVAILABLE',traceId:trace});await box.children[1].events.click();assert.equal(box.children[1].textContent,'请选中编号手动复制');
 let release,writes=0;h.c.window.navigator.clipboard={writeText:()=>{writes++;return new Promise(resolve=>release=resolve);}};h.c.showError({status:503,code:'SERVICE_UNAVAILABLE',traceId:trace});const waitingCopy=box.children[1],copying=waitingCopy.events.click();await waitingCopy.events.click();assert.equal(writes,1,'复制等待中防重复点击');
 h.c.showError({status:503,code:'SERVICE_UNAVAILABLE'});release();await copying;assert.equal(box.textContent,'','迟到复制结果不得恢复已清除的诊断');
 for(const traceId of [null,42,'','<img src=x onerror=alert(1)>','trace\nPRIVATE','a'.repeat(129),'包含患者姓名']){
  h.c.showError({status:503,code:'SERVICE_UNAVAILABLE',message:'RAW_BACKEND_DEBUG',traceId});assert.equal(box.textContent,'');assert.equal(box.children.length,0);
 }
 h.c.analyze();assert.equal(h.pending.length,2);h.pending[1].resolve(failure(410,'ANALYSIS_EXPIRED','legacy-session-trace'));await flush();
 assert.equal(h.get('#cohort-state').dataset.state,'expired');assert.equal(h.get('#error-message').textContent,'分析结果已过期，请重新分析');assert.equal(h.get('#results').dataset.analysisId,undefined);assert.equal(h.get('#patient-rows').children.length,0);assert.equal(h.get('#more').hidden,true);assert.equal(h.get('#export').disabled,true);assert.equal(h.get('#f-sex').value,'F');assert.equal(h.pending.length,2,'失效不会自动重发分析');
 h.get('#reanalyze').events.click();assert.equal(h.pending.length,3);assert.equal(h.pending[2].body.filters.sex,'F');assert.equal(h.pending[2].url,'/api/ra/ai/cohort');h.events.pagehide();assert.equal(h.pending[2].signal.aborted,true);assert.equal(h.timers.size,0);
});
function functionSource(file,name){const text=source(file),start=text.indexOf('function '+name+'(');assert.ok(start>=0,name);let depth=0,end=start;const brace=text.indexOf('{',start);for(end=brace;end<text.length;end++){if(text[end]==='{')depth++;if(text[end]==='}'&&--depth===0)break;}return text.slice(start,end+1);}
test('performance:pagination-window',()=>{
 for(const kind of ['patients','followups']){
  const nodes=new Map(),get=selector=>{if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',querySelector:()=>({})});return nodes.get(selector);};
  const c=vm.createContext({$:get,state:{page:1,perPage:8},lastTotal:0,saveListState(){},markKpi(){},syncPick(){},updateSelectionUI(){},card(){},row(){},flashResult(){},escapeHTML:String});
  vm.runInContext("globalThis.requests=[];const from=Array.from;Array.from=function(value,...args){requests.push(value.length);if(value.length>5)throw new RangeError('pagination allocated '+value.length+' items');return from.call(this,value,...args);};",c);
  // 页码改用 common.js 的 pagerHTML（首页 / 尾页 + 当前页前后 2 页 + 省略号 + 跳页）
  vm.runInContext(functionSource('js/common.js','pagerHTML'),c);
  vm.runInContext(functionSource('js/pages/'+kind+'.js','render'),c);
  const render=(pages,page)=>{c.state.page=page;c.rows=()=>({length:pages*8,slice:()=>[]});c.render({items:[],total:pages*8,page,size:8,totalPatients:pages*8,incompleteCount:0});return get('#pagination').innerHTML;};
  for(const [pages,page,expected] of [[1,1,[1]],[3,1,[1,2,3]],[10,1,[1,2,3,4,5]],[10,2,[1,2,3,4,5]],[100,50,[48,49,50,51,52]],[100,100,[98,99,100]],[10000000,5000000,[4999998,4999999,5000000,5000001,5000002]]]){
   const html=render(pages,page),shown=[...html.matchAll(/<button type="button" data-page="(\d+)"/g)].map(m=>+m[1]);
   assert.deepEqual(shown,pages<=1?[]:[...new Set([1,...expected.filter(n=>Math.abs(n-page)<=2),pages])].sort((x,y)=>x-y),kind+'只显示首尾页和当前页前后 2 页');
   assert.equal(html.length<2000,true,kind+'输出与总页数无关');assert.ok(!c.requests.length||c.requests.at(-1)<=5,kind+'只构造可见页');
  }
 }
});
