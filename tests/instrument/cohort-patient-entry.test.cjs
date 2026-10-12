const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../../js/pages/patient-visits.js'),'utf8');
async function open(query,referrer='',length=1){
 const nodes=new Map(),requests=[],doctorReads=[],navigation=[];
 const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',hidden:false,open:false,style:{},addEventListener(type,fn){this[type]=fn;},setAttribute(key,value){this[key]=value;}});return nodes.get(selector);};
 const location=new URL('http://fixture.invalid/patient-visits.html'+query);location.assign=url=>navigation.push(url);
 const context={URL,URLSearchParams,location,history:{length,back(){navigation.push('back');}},document:{referrer,title:'',querySelector:node,querySelectorAll:()=>[]},console:{error(){}},shell(){},pageOrigin:()=>({nav:'patients',crumb:'AI 队列分析',href:'ai-cohort.html',label:'AI 队列分析'}),bindBack(){},queryParam:key=>location.searchParams.get(key),$:node,escapeHTML:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),currentDoctorId:()=>{doctorReads.push(101);return 101;},apiPost:async(url,body)=>{requests.push({url,body});throw new Error('网络边界');},setTimeout,clearTimeout,AbortController,addEventListener(){},RACohortAPI:{patientDetail:async()=>{throw Object.assign(new Error('synthetic anonymous'),{code:'UNAUTHENTICATED'})}},API_BASE:'http://fixture.invalid',alert(){}};
 context.window=context;vm.runInNewContext(source,context,{filename:'patient-visits.js'});await new Promise(resolve=>setImmediate(resolve));return {nodes,requests,doctorReads,navigation};
}
test('cohort:patient-entry',async()=>{
 const first=await open('?id=9007199254740993&from=ai-cohort');
 assert.equal(first.requests.length,0,'AI来源不得先请求旧patientDetail');
 assert.equal(first.doctorReads.length,0,'AI来源不得读取旧doctorId');
 for(const id of ['9007199254740992','9007199254740993','9223372036854775807']){
  const o=await open('?id='+id+'&from=ai-cohort');assert.equal(o.requests.length,0);assert.equal(o.doctorReads.length,0);
  assert.match(o.nodes.get('#patient-basic').innerHTML,/请先登录后重新选择患者/);assert.ok(o.nodes.get('#patient-basic').innerHTML.includes(id));
 }
 for(const query of ['?from=ai-cohort','?id=&from=ai-cohort','?id=01&from=ai-cohort','?id=0&from=ai-cohort','?id=-1&from=ai-cohort','?id=%201&from=ai-cohort','?id=1e3&from=ai-cohort','?id=9223372036854775808&from=ai-cohort','?id=1&id=2&from=ai-cohort','?id=1&from=ai-cohort&from=patients','?id=1&from=patients&from=ai-cohort','?id=1&from=ai-cohort&from=ai-cohort','?id=1&from=ai-cohort&return=https://unsafe.invalid','?id=1&from=ai-cohort&doctorId=101']){
  const o=await open(query);assert.equal(o.requests.length,0,query);assert.equal(o.doctorReads.length,0,query);assert.match(o.nodes.get('#patient-basic').innerHTML,/入口参数无效/);
 }
 for(const [referrer,length,expected] of [['http://fixture.invalid/ai-cohort.html?sex=F&ids=9007199254740993',2,'back'],['http://fixture.invalid/patients.html',2,'ai-cohort.html'],['https://unsafe.invalid/ai-cohort.html',2,'ai-cohort.html'],['',2,'ai-cohort.html'],['http://fixture.invalid/ai-cohort.html',1,'ai-cohort.html']]){
  for(const selector of ['#crumb-origin','#back-origin']){const o=await open('?id=1&from=ai-cohort',referrer,length);o.nodes.get(selector).onclick({preventDefault(){}});assert.deepEqual(o.navigation,[expected]);}
 }
 const legacy=await open('?id=11&from=patients');assert.equal(legacy.requests.length,1);assert.equal(legacy.requests[0].url,'/api/ra/patient/patientDetail');assert.equal(legacy.doctorReads.length,1);
});
