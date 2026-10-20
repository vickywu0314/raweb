const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readFileSync}=require('node:fs'),{resolve}=require('node:path');
const root=resolve(__dirname,'../..');
function renderSidebar(demoPatients,demoStore){
 const nodes=new Map(),noop=()=>{},node=()=>({classList:{add:noop,toggle:noop,contains:()=>false},setAttribute:noop,addEventListener:noop,focus:noop,contains:()=>false});
 const sidebar={innerHTML:'',querySelector(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector)},querySelectorAll:()=>[]};
 let requests=0;
 const context={INITIAL_PATIENTS:demoPatients,localStorage:{getItem:key=>key==='ra-demo-store-v1'?JSON.stringify(demoStore):null},sessionStorage:{getItem:()=>null},location:{pathname:'/login.html'},document:{querySelector:s=>s==='.sidebar'?sidebar:null,querySelectorAll:()=>[],addEventListener:noop},addEventListener:noop,URLSearchParams,fetch(){requests++;throw new Error('shell must not request global counts')}};
 context.window=context;vm.createContext(context);
 for(const file of ['js/boot.js','js/common.js'])vm.runInContext(readFileSync(resolve(root,file),'utf8'),context,{filename:file});
 vm.runInContext("shell('patients')",context);
 return {html:sidebar.innerHTML,requests};
}
test('shell:real-data-metadata',()=>{
 for(const count of [3,9]){
  const demo=Array.from({length:count},(_,id)=>({id:'DEMO-'+id,abnormal:true}));
  const result=renderSidebar(demo,{added:[{id:'LOCAL-DEMO',abnormal:true}]});
  const current=result.html.match(/<a class="study-item is-current"[\s\S]*?<\/a>/)?.[0];
  assert.ok(current,'current study remains reachable');assert.match(current,/href="projects.html"/);
  const metadata=current.match(/<em class="study-meta">([\s\S]*?)<\/em>/)?.[1];
  assert.equal(metadata,'统计见项目总览','global shell must not present INITIAL_PATIENTS or localStorage as real counts');
  assert.doesNotMatch(metadata,/\d|患者|异常检验/);assert.equal(result.requests,0);
  assert.match(result.html,/data-nav="ai" href="ai-analysis.html"/);assert.match(result.html,/data-nav="patients" href="patients.html"/);
 }
});
