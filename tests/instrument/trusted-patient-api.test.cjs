const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const checks=[];
const check=(name,run)=>checks.push({name,run});
const root=path.resolve(__dirname,'../..');
const detail=(id='9007199254740993')=>({patientId:id,name:'synthetic-patient-odd',studyNo:'RA-ODD',hasCardNo:true,cardNoMasked:'synthetic-masked',visits:[{visitId:'9007199254741003',doctorId:'101',visitDate:'2026-10-01',visitType:'基线访视'}],latestDas28:null,comorbidities:[]});
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
async function flush(){for(let i=0;i<12;i++)await Promise.resolve();}
function harness(query='?id=9007199254740993&from=ai-cohort'){
 const nodes=new Map(),requests=[],events=new Map(),timers=new Map(),navigation=[];let now=0,seq=0;
 const node=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',textContent:'',hidden:false,open:false,attributes:{},style:{},setAttribute(k,v){this.attributes[k]=String(v)},getAttribute(k){return this.attributes[k]},removeAttribute(k){delete this.attributes[k];delete this[k]},querySelector(selector){return selector.startsWith('#')?node(selector):null},addEventListener(){},removeEventListener(){}});return nodes.get(s)};
 const location=new URL('http://fixture.invalid/patient-visits.html'+query);location.assign=x=>navigation.push(x);
 const context={URL,URLSearchParams,AbortController,location,history:{length:1,back(){navigation.push('back')}},document:{referrer:'',title:'',getElementById:()=>null,querySelector:node,querySelectorAll:()=>[]},console:{error(){}},shell(){},$:node,pageOrigin:()=>({nav:'patients',crumb:'患者管理',href:'patients.html',label:'患者列表'}),bindBack(){},queryParam:key=>location.searchParams.get(key),escapeHTML:x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),badge:x=>`<span>${x}</span>`,cycleLabel:()=>'',COMORBIDITY_INFO:{},TODAY:new Date('2026-10-12'),icon:()=>'',API_BASE:'http://fixture.invalid',apiPost(){throw Error('legacy read forbidden')},currentDoctorId(){throw Error('legacy identity forbidden')},alert(){},setTimeout(fn,ms){const id=++seq;timers.set(id,{fn,at:now+ms});return id},clearTimeout(id){timers.delete(id)},addEventListener(type,fn){if(!events.has(type))events.set(type,[]);events.get(type).push(fn)},fetch(url,options){const peer=deferred();requests.push({url,options,peer});return peer.promise}};
 context.window=context;vm.createContext(context);
 for(const file of ['js/pages/ai-cohort-api.js','js/shared/patient-basic.js','js/pages/patient-visits.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
 return {nodes,requests,timers,navigation,context,event(type,value={}){for(const fn of events.get(type)||[])fn(value)},async advance(ms){now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn()}await flush()},async answer(index,data,status=200,code='200'){requests[index].peer.resolve({ok:status===200,status,headers:{get:k=>k==='Content-Type'?'application/json':k==='X-Trace-Id'?'trace-patient':null},json:async()=>({success:status===200,code,message:'synthetic-response',data})});await flush()}};
}
check('patient:trusted-detail-contract real page consumes exact string IDs through trusted transport',async()=>{
 const h=harness();await flush();assert.equal(h.requests.length,1,'valid AI entry starts trusted HTTP');
 assert.equal(h.requests[0].url,'http://fixture.invalid/api/ra/ai/patientDetail');assert.deepEqual(JSON.parse(h.requests[0].options.body),{patientId:'9007199254740993'});assert.equal(h.requests[0].options.credentials,'same-origin');
 await h.answer(0,detail());const html=h.nodes.get('#patient-basic').innerHTML;assert.match(html,/synthetic-patient-odd/);assert.match(html,/9007199254740993/);assert.match(html,/RA-ODD/);assert.match(h.nodes.get('#visit-list').innerHTML,/2026-10-01/);assert.match(h.nodes.get('#visit-list').innerHTML,/9007199254741003/);assert.equal(h.nodes.get('#patient-basic').attributes['data-state'],'success');assert.equal(h.timers.size,0);assert.match(html,/identity-toggle/);assert.doesNotMatch(html,/patient-edit/);assert.equal(h.requests.length,1,'render must not read sensitive or audit data');assert.equal(h.nodes.get('#patient-insight-link').href,'patient-insight.html?id=9007199254740993&from=ai-cohort');assert.match(vm.runInContext('patientBasicGridHTML({hasCardNo:true})',h.context),/identity-toggle/);
});
module.exports={harness,detail,flush};
check('patient:trusted-detail-contract pending request exits at deadline before teardown',async()=>{
 const h=harness();await flush();assert.equal(h.requests.length,1,'peer genuinely started');assert.equal(h.nodes.get('#patient-basic').attributes['data-state'],'loading');
 await h.advance(29999);assert.equal(h.nodes.get('#patient-basic').attributes['data-state'],'loading');
 await h.advance(1);assert.equal(h.nodes.get('#patient-basic').attributes['data-state'],'timeout');assert.equal(h.timers.size,0);assert.equal(h.requests[0].options.signal.aborted,true);assert.equal(h.nodes.get('#visit-list').innerHTML,'');
 await h.answer(0,detail());assert.equal(h.nodes.get('#patient-basic').attributes['data-state'],'timeout');assert.doesNotMatch(h.nodes.get('#patient-basic').innerHTML,/synthetic-patient-odd/);
});
check('patient:trusted-detail-contract page exit and identity signals fence late success and error from new flight',async()=>{
 for(const trigger of ['pagehide','storage','ra-auth-changed'])for(const late of ['success','error']){
  const h=harness();await flush();assert.equal(h.requests.length,1);
  h.event(trigger,{key:'ra-auth'});assert.equal(h.nodes.get('#patient-basic').attributes['data-state'],'cancelled');assert.equal(h.timers.size,0);assert.equal(h.requests[0].options.signal.aborted,true);
  h.event('pageshow',{persisted:true});await flush();assert.equal(h.requests.length,2);assert.equal(h.timers.size,1);
  if(late==='success')await h.answer(0,{...detail(),name:'OLD-DOCTOR'});else{h.requests[0].peer.reject(Error('late'));await flush()}
  assert.equal(h.nodes.get('#patient-basic').attributes['data-state'],'loading');assert.equal(h.timers.size,1,'old callback cannot detach new timer');assert.equal(h.requests[1].options.signal.aborted,false);
  await h.answer(1,{...detail(),name:'CURRENT-DOCTOR'});assert.equal(h.nodes.get('#patient-basic').attributes['data-state'],'success');assert.match(h.nodes.get('#patient-basic').innerHTML,/CURRENT-DOCTOR/);assert.doesNotMatch(h.nodes.get('#patient-basic').innerHTML,/OLD-DOCTOR/);assert.equal(h.timers.size,0);
  h.event('pagehide');assert.doesNotMatch(h.nodes.get('#patient-basic').innerHTML,/CURRENT-DOCTOR/);
 }
});
check('patient:trusted-detail-contract errors and invalid IDs clear data while empty visits stay successful',async()=>{
 for(const [status,code,message] of [[401,'UNAUTHENTICATED','请先登录'],[404,'RESOURCE_NOT_FOUND','患者资料不可用'],[503,'SERVICE_UNAVAILABLE','患者资料暂不可用']]){const h=harness();await h.answer(0,null,status,code);assert.equal(h.nodes.get('#patient-basic').attributes['data-state'],'error');assert.match(h.nodes.get('#patient-basic').innerHTML,new RegExp(message));assert.equal(h.nodes.get('#visit-list').innerHTML,'');assert.equal(h.timers.size,0)}
 for(const mutate of [d=>d.patientId='9007199254740992',d=>d.patientId=9007199254740993,d=>d.patientId='9223372036854775808',d=>d.visits[0].visitId=9007199254741003,d=>d.visits[0].doctorId=101,d=>d.visits[0].visitId='01',d=>d.visits[0].doctorId='9223372036854775808']){const h=harness(),d=detail();mutate(d);await h.answer(0,d);assert.equal(h.nodes.get('#patient-basic').attributes['data-state'],'error');assert.doesNotMatch(h.nodes.get('#patient-basic').innerHTML,/synthetic-patient/);assert.equal(h.nodes.get('#visit-list').innerHTML,'')}
 const max=harness('?id=9223372036854775807&from=ai-cohort');await max.answer(0,{...detail('9223372036854775807'),name:'synthetic-patient-max',visits:[]});assert.equal(max.nodes.get('#patient-basic').attributes['data-state'],'success');assert.match(max.nodes.get('#visit-list').innerHTML,/暂无随访记录/);
 for(const query of ['?id=0&from=ai-cohort','?id=01&from=ai-cohort','?id=1e1&from=ai-cohort','?id=9223372036854775808&from=ai-cohort','?id=1&id=2&from=ai-cohort','?id=1&from=patients&from=ai-cohort','?id=1&from=ai-cohort&return=https://unsafe.invalid']){const h=harness(query);await flush();assert.equal(h.requests.length,0);assert.equal(h.nodes.get('#patient-basic').attributes['data-state'],'invalid')}
});

check('homepage source reaches same trusted detail and preserves source timeline',async()=>{
 const h=harness('?id=9007199254740993&from=ai-analysis');await flush();assert.equal(h.requests.length,1);await h.answer(0,detail());assert.equal(h.nodes.get('#patient-basic').attributes['data-state'],'success');assert.match(h.nodes.get('#visit-list').innerHTML,/from=ai-analysis/);assert.equal(h.nodes.get('#back-origin').href,'ai-analysis.html');assert.equal(h.nodes.get('#patient-insight-link').href,'patient-insight.html?id=9007199254740993&from=ai-analysis');assert.match(h.nodes.get('#back-origin').textContent,/AI 智能分析/);
 for(const query of ['?id=1&from=ai-analysis&from=ai-cohort','?id=1&from=patients&from=ai-analysis','?id=1&from=ai-analysis&from=ai-analysis','?id=1&from=ai-analysis&return=x']){const invalid=harness(query);await flush();assert.equal(invalid.requests.length,0);assert.equal(invalid.nodes.get('#patient-basic').attributes['data-state'],'invalid')}
});
test('patient:trusted-detail-contract',async()=>{for(const {name,run} of checks){try{await run()}catch(error){error.message=name+': '+error.message;throw error}}});
