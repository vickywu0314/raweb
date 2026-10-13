const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {installAuthBootstrapObserver,installUnavailableAuthBootstrapObserver}=require('../fixtures/auth-bootstrap-observer.cjs');
const profile={username:'synthetic',doctorId:101,name:'医生 101',role:'研究者'};
async function fixture({identity='authenticated',status=200,code=identity==='authenticated'?'200':'401',success=identity==='authenticated',data=identity==='authenticated'?profile:null,contentType='application/json'}={}){
 let init,listener,continued=0,lastRequest;const reply={status,code,success,data,contentType};const suppliedSeed='{"doctorId":101,"username":"synthetic","name":"医生 101","role":"研究者"}';
 const state={URL,crypto:require('node:crypto').webcrypto,location:new URL('http://fixture.invalid/patient-visits.html'),sessionStorage:{getItem:()=>suppliedSeed,setItem(){assert.fail('observer cannot replace the real authenticated seed')}},document:{cookie:'real-fixture-cookie'}};state.window=state;vm.createContext(state);
 const installer=identity==='fixture-unavailable'?installUnavailableAuthBootstrapObserver:installAuthBootstrapObserver;
 const auth=await installer({addInitScript:async(fn,arg)=>init={fn,arg},on:(event,fn)=>{assert.equal(event,'response');listener=fn;}},{origin:'http://fixture.invalid',identity,profile:identity==='authenticated'?profile:undefined});
 const page={async waitForLoadState(){},async waitForFunction(fn){assert.equal(vm.runInContext('('+fn.toString()+')()',state),true);},async evaluate(fn){return JSON.parse(JSON.stringify(vm.runInContext('('+fn.toString()+')()',state)));}};
 const routeFor=(url='http://fixture.invalid/api/ra/auth/me',method='POST',body=null)=>{
  const request={url:()=>url,method:()=>method,postData:()=>body,frame:()=>page};lastRequest=request;
  return {request:()=>request,fulfill(){assert.fail('observer cannot mock real auth responses')},async continue(){continued++;await listener({request:()=>request,status:()=>reply.status,headers:()=>({'content-type':reply.contentType}),json:async()=>({success:reply.success,code:reply.code,data:reply.data})});}};
 };
 state.fetch=async(url,options)=>{assert.equal(await auth.handle(routeFor(new URL(url,state.location).href,options.method,options.body??null)),true);return {status:reply.status,json:async()=>({success:reply.success,code:reply.code,data:reply.data})};};state.arg=init.arg;vm.runInContext('('+init.fn.toString()+')(arg)',state);
 return {auth,page,state,routeFor,setReply:value=>Object.assign(reply,value),newDocument(){state.__raAuthBootstrapObserver={id:require('node:crypto').randomUUID(),calls:[],responses:0,consumed:0};},get continued(){return continued},get lastRequest(){return lastRequest},async run(){const response=await state.fetch('/api/ra/auth/me',{method:'POST',credentials:'same-origin'});await response.json();return auth.verify(page);}};
}
test('patient:bootstrap-real-session-observer',async()=>{
 const good=await fixture();await good.run();assert.equal(good.auth.isHandled(good.lastRequest),true,'only actual handled request identities are split out');await good.auth.verifyAll();assert.equal(good.continued,1);assert.equal(good.auth.requests[0].valid,true);assert.equal(good.auth.requests[0].status,200);assert.equal(good.state.document.cookie,'real-fixture-cookie');assert.equal(JSON.parse(good.state.sessionStorage.getItem('ra-auth')).doctorId,101);
 good.newDocument();if(good.auth.expectIdentity)good.auth.expectIdentity('anonymous');good.setReply({success:false,code:'401',data:null});await good.run();assert.equal(typeof good.auth.expectIdentity,'function');await good.auth.verifyAll();assert.deepEqual(good.auth.requests.map(r=>r.identity),['authenticated','anonymous'],'identity expectations are frozen per request rather than retroactively applied');
 const anonymous=await fixture({identity:'anonymous'});await anonymous.run();assert.equal(anonymous.auth.requests[0].valid,true);assert.equal(anonymous.auth.requests[0].responseBody.code,'401');assert.equal(anonymous.auth.requests[0].responseBody.data,null);
 for(const [options,reason] of [[{status:404},/404 is not authentication/],[{success:false,code:'401',data:null},/authenticated session must be accepted/],[{data:{...profile,doctorId:202}},/real doctor identity/],[{data:{...profile,role:'管理员'}},/real profile role/],[{contentType:'text/html'},/must be JSON/],[{identity:'anonymous',success:true,code:'200',data:profile},/anonymous session must be denied/],[{identity:'anonymous',code:'UNAUTHENTICATED'},/business 401/],[{identity:'anonymous',status:401},/production HTTP200/]]){
  const h=await fixture(options);await assert.rejects(()=>h.run(),reason);await assert.rejects(()=>h.auth.verifyAll(),reason,'redirected documents retain their exact auth failure evidence');assert.equal(h.auth.requests[0].valid,false);assert.equal(h.continued,1,'bad backend contract is observed as real traffic, never replaced');
 }
 await assert.rejects(()=>good.run(),/more than once/,'a repeated real bootstrap cannot be hidden');
 const none=await fixture();await none.auth.verify(none.page,{expected:0});assert.equal(none.continued,0);
 const illegal=[['http://fixture.invalid/api/ra/auth/me','GET',null],['http://fixture.invalid/api/ra/auth/me','POST','{}'],['http://fixture.invalid/api/ra/auth/me?doctorId=101','POST',null],['http://fixture.invalid/api/ra/auth/logout','POST',null],['http://other.invalid/api/ra/auth/me','POST',null]];
 const business=[];for(const input of illegal)if(!await none.auth.handle(none.routeFor(...input)))business.push(input);assert.deepEqual(business,illegal);assert.equal(none.continued,0);assert.equal(none.auth.requests.length,0);assert.equal(none.auth.isHandled(none.lastRequest),false,'malformed or other API request cannot be silently classified as auth');
});


test('patient:bootstrap-fixture-unavailable-observer',async()=>{
 const unavailable=await fixture({identity:'fixture-unavailable',status:404,contentType:'text/html'});await unavailable.run();await unavailable.auth.verifyAll();const record=unavailable.auth.requests[0];
 assert.equal(record.valid,true,'only the explicitly unavailable SQL fixture mode accepts its missing endpoint');assert.equal(record.authenticationVerified,false,'404 observation cannot claim authentication');assert.equal(record.result,'AUTH_ME_FIXTURE_UNAVAILABLE');assert.equal(record.status,404);assert.equal(record.body,null,'real auth POST remains bodyless');assert.equal(record.responseBody,undefined,'404 body is not read as session data');
 assert.throws(()=>unavailable.auth.expectIdentity('authenticated',profile),/cannot dynamically claim authentication/);
 const wrong=await fixture({identity:'fixture-unavailable',status:200});await assert.rejects(()=>wrong.run(),/observe exactly the unavailable/);assert.equal(wrong.auth.requests[0].valid,false);assert.equal(wrong.auth.requests[0].authenticationVerified,false);
 const other=await fixture({identity:'fixture-unavailable',status:404});assert.equal(await other.auth.handle(other.routeFor('http://fixture.invalid/api/ra/patient/patientDetail','POST',null)),false);assert.equal(other.continued,0);assert.equal(other.auth.requests.length,0);
});
