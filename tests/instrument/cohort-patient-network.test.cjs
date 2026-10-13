const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
async function loadPatientSetup(){
 const routes=[],init=[];const context={addInitScript:async(fn,arg)=>init.push({fn,arg}),route:async(pattern,fn)=>routes.push(fn)};
 const page={on(){}};const contextVM={require(name){if(name==='@playwright/test')return {test(){},expect:null};return require(name.startsWith('.')?path.resolve(__dirname,name):name);},process:{env:{RA_STATIC_URL:'http://fixture.invalid'}},structuredClone,URL,module:{exports:{}},console};
 vm.createContext(contextVM);vm.runInContext(fs.readFileSync(path.join(root,'tests/instrument/cohort-patient.spec.cjs'),'utf8')+'\nmodule.exports={setup};',contextVM);
 const o=await contextVM.module.exports.setup({page,context,browser:{version:()=> 'node-boundary'}},'node-auth-oracle');
 const answers=[];const frame={evaluate:async()=>({id:'document-a',calls:[{method:'POST',credentials:'same-origin',body:null}],completed:1})};
 const request={url:()=> 'http://fixture.invalid/api/ra/auth/me',method:()=> 'POST',headers:()=>({}),postDataJSON:()=>null,postData:()=>null,frame:()=>frame};
 await routes[0]({request:()=>request,fulfill:async response=>answers.push(response)});
 return {o,answers,init};
}
test('patient:bootstrap-network-oracle',async()=>{
 const {o,answers}=await loadPatientSetup();
 assert.equal(answers[0].status,200,'legal session bootstrap gets its own response, never an unexpected patient response');
 assert.equal(o.requests.length,0,'bootstrap must not consume the protected business zero-request budget');
 assert.equal(o.auth.requests.length,1,'bootstrap is independently recorded rather than silently dropped');
 assert.equal(JSON.parse(answers[0].body).data.doctorId,101);
});

function browserFixture(init,auth){
 const storage=new Map();let value;
 const context={URL,crypto:require('node:crypto').webcrypto,location:new URL('http://fixture.invalid/ai-cohort.html'),sessionStorage:{setItem:(k,v)=>storage.set(k,v)},args:init.arg};context.window=context;
 vm.createContext(context);
 const page={async waitForLoadState(){},async waitForFunction(fn){assert.equal(vm.runInContext('('+fn.toString()+')()',context),true,'completed actual synthetic HTTP response must be observable');},async evaluate(fn){return JSON.parse(JSON.stringify(vm.runInContext('('+fn.toString()+')()',context)));}};
 const routeFor=(url='http://fixture.invalid/api/ra/auth/me',method='POST',body=null)=>({request:()=>({url:()=>url,method:()=>method,postData:()=>body,frame:()=>page}),fulfill:async response=>value=response});
 context.fetch=async(url,options={})=>{
  const handled=await auth.handle(routeFor(new URL(url,context.location).href,options.method||'GET',options.body??null));
  assert.equal(handled,true,'normal bootstrap must reach exact HTTP response handler');
  return {json:async()=>JSON.parse(value.body)};
 };
 vm.runInContext('('+init.fn.toString()+')(args)',context);
 return {page,context,routeFor,storage,async fetch(){const r=await context.fetch('/api/ra/auth/me',{method:'POST',credentials:'same-origin'});return r.json();}};
}

test('patient:bootstrap-network-boundaries',async()=>{
 const {installAuthBootstrap,USER}=require('../fixtures/auth-bootstrap.cjs');let init;
 const auth=await installAuthBootstrap({addInitScript:async(fn,arg)=>init={fn,arg}},{origin:'http://fixture.invalid'});
 const first=browserFixture(init,auth);const payload=await first.fetch();assert.equal(payload.data.doctorId,101);assert.deepEqual(JSON.parse(first.storage.get('ra-auth')),USER);
 const id=await auth.verify(first.page);assert.equal(auth.requests.length,1);
 // A new document gets a new exact receipt; history's repeated pageshow gets none.
 const next=browserFixture(init,auth);await next.fetch();const nextId=await auth.verify(next.page);assert.notEqual(id,nextId);assert.equal(auth.requests.length,2);await auth.verify(next.page);assert.equal(auth.requests.length,2);
 await assert.rejects(()=>next.fetch(),/more than once/,'duplicate bootstrap is a failure rather than excluded traffic');
 const withoutCommon=browserFixture(init,auth);await auth.verify(withoutCommon.page,{expected:0});
 const illegal=[['http://fixture.invalid/api/ra/auth/me','GET',null],['http://fixture.invalid/api/ra/auth/me','POST',''],['http://fixture.invalid/api/ra/auth/me','POST','{}'],['http://fixture.invalid/api/ra/auth/me?doctorId=101','POST',null],['http://fixture.invalid/api/ra/auth/logout','POST',null],['http://fixture.invalid/api/ra/patient/patientDetail','POST',null],['http://other.invalid/api/ra/auth/me','POST',null],['http://fixture.invalid/api/ra/auth/me/','POST',null]];
 const business=[];for(const entry of illegal){if(!await auth.handle(withoutCommon.routeFor(...entry)))business.push(entry);}
 assert.deepEqual(business,illegal,'every malformed auth and other API remains in its business/forbidden-request oracle');assert.equal(auth.requests.length,2,'malformed/other API cannot receive a trusted auth receipt');
 const wrongCredentials=browserFixture(init,auth);const response=await wrongCredentials.context.fetch('/api/ra/auth/me',{method:'POST',credentials:'omit'});await response.json();await assert.rejects(()=>auth.verify(wrongCredentials.page),/same-origin credentials/);
});

test('patient:bootstrap-identity-fence',async()=>{
 const {harness}=require('../fixtures/issue1-patient-detail.cjs');
 const same=harness();same.eval('window.__authEvents=0;window.addEventListener("ra-auth-changed",()=>window.__authEvents++)');await same.domReady();const index=same.requests.findIndex(r=>r.url.endsWith('/auth/me'));assert.ok(index>=0);
 await same.answer(index,{doctorId:101,name:'Synthetic',role:'研究者'});assert.equal(same.eval('window.__authEvents'),0,'String-equivalent authenticated doctor must not emit a replacement event');assert.equal(same.eval('String(currentUser().doctorId)'),'101');await same.event('pagehide');
 const late=harness();await late.domReady();const lateIndex=late.requests.findIndex(r=>r.url.endsWith('/auth/me'));late.eval("signIn({doctorId:'202',name:'Next',role:'研究者'},false)");await late.answer(lateIndex,{doctorId:101,name:'Old',role:'研究者'});assert.equal(late.eval('String(currentUser().doctorId)'),'202','late old bootstrap cannot restore replaced identity');await late.event('pagehide');
});

test('patient:bootstrap-identity-stability',async()=>{
 const {harness,detail}=require('../fixtures/issue1-patient-detail.cjs');
 const observe=h=>h.eval('window.__authEvents=0;window.addEventListener("ra-auth-changed",()=>window.__authEvents++)');
 const start=async h=>{await h.domReady();const index=h.requests.findIndex(r=>r.url.endsWith('/auth/me'));assert.ok(index>=0,'production DOMContentLoaded really started session HTTP');return index;};
 const same=harness();same.eval("sessionStorage.setItem('ra-auth',JSON.stringify({doctorId:'101',name:'Synthetic',role:'研究者',at:123,expires:0}))");observe(same);same.eval('window.__storageWrites=0;const authStorageSet=sessionStorage.setItem;sessionStorage.setItem=(...args)=>{window.__storageWrites++;return authStorageSet(...args)}');
 const cohortSource=fs.readFileSync(path.join(root,'js/pages/ai-cohort.js'),'utf8'),guard=cohortSource.match(/function checkIdentity\(\)\{[\s\S]*?\n\}/)[0];same.eval('let identity=JSON.stringify(currentUser());function identityKey(){return JSON.stringify(currentUser())}window.__ownerRevoked=0;function clearPrivate(){}function invalidate(){window.__ownerRevoked++};'+guard);const before=same.eval('JSON.stringify(currentUser())'),meIndex=await start(same);
 await same.answer(meIndex,{doctorId:101,name:'Synthetic',role:'研究者'});assert.equal(same.eval('JSON.stringify(currentUser())'),before,'same authenticated details must preserve the entire owner identity snapshot and metadata');assert.equal(same.eval('window.__authEvents'),0);assert.equal(same.eval('authGeneration'),0);assert.equal(same.eval('window.__storageWrites'),0,'unchanged bootstrap cannot rewrite storage');assert.equal(same.eval('checkIdentity()'),false,'actual cohort guard still owns first flight');assert.equal(same.eval('checkIdentity()'),false,'a second user action does not mistake metadata refresh for a new identity');assert.equal(same.eval('window.__ownerRevoked'),0);await same.event('pagehide');
 const remembered=harness();remembered.eval("sessionStorage.setItem('ra-auth',JSON.stringify({doctorId:'101',name:'Synthetic',role:'研究者',at:123,expires:Date.now()+60000}))");const rememberedBefore=remembered.eval('JSON.stringify(currentUser())'),rememberedIndex=await start(remembered);await remembered.answer(rememberedIndex,{doctorId:101,name:'Synthetic',role:'研究者'});assert.equal(remembered.eval('JSON.stringify(currentUser())'),rememberedBefore,'bootstrap cannot silently renew remembered expiry');await remembered.event('pagehide');
 for(const [change,value] of [['role','管理员'],['name','Renamed'],['doctorId',202]]){
  const h=harness();observe(h);const index=await start(h);const detailIndex=h.requests.findIndex(r=>r.url.endsWith('/patient/patientDetail'));if(detailIndex>=0)await h.answer(detailIndex,detail());
  await h.answer(index,{doctorId:101,name:'Synthetic',role:'研究者',[change]:value});assert.equal(h.eval('window.__authEvents'),1,'material '+change+' refresh revokes exactly once');assert.equal(h.eval('String(currentUser()['+JSON.stringify(change)+'])'),String(value));
  if(change!=='doctorId')assert.equal(h.eval('typeof currentUser().doctorId'),'string','same doctor refresh keeps previous ID representation');
  assert.equal(h.node('#patient-basic').attributes['data-state'],'cancelled','material profile refresh cancels displayed clinical owner');await h.event('pagehide');
 }
 const denied=harness();observe(denied);await denied.answer(await start(denied),null,401,'UNAUTHENTICATED');assert.equal(denied.eval('currentUser()'),null);assert.equal(denied.eval('window.__authEvents'),1);assert.match(denied.navigation.at(-1),/login.html\?next=/);await denied.event('pagehide');
 const late=harness();const lateIndex=await start(late);late.eval("signIn({doctorId:'202',name:'Next',role:'研究者'},false)");const latest=late.eval('JSON.stringify(currentUser())');await late.answer(lateIndex,{doctorId:101,name:'Old',role:'管理员'});assert.equal(late.eval('JSON.stringify(currentUser())'),latest,'generation fence keeps a stale me from changing role or identity');await late.event('pagehide');
});
