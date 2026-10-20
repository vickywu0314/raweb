const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {installAuthBootstrapObserver,installUnavailableAuthBootstrapObserver}=require('../fixtures/auth-bootstrap-observer.cjs');
const profile={username:'synthetic',doctorId:101,name:'医生 101',role:'研究者'};
const deferred=()=>{let resolve;const promise=new Promise(yes=>resolve=yes);return {promise,resolve};};
async function fixture({identity='authenticated',status=200,code=identity==='authenticated'?'200':'401',success=identity==='authenticated',data=identity==='authenticated'?profile:null,contentType='application/json',delayCDP=false,holdAcknowledgement=false,deferResponseEvent=false,jsonError,missingBody=false}={}){
 let init,listener,continued=0,lastRequest,cdpReads=0,current;const bindings=new Map(),handlers=[],metadata=[],cdp=deferred(),ack=deferred(),bound=deferred();
 const reply={status,code,success,data,contentType},suppliedSeed='{"doctorId":101,"username":"synthetic","name":"医生 101","role":"研究者"}';
 const context={addInitScript:async(fn,arg)=>init={fn,arg},exposeBinding:async(name,callback)=>{assert.equal(bindings.has(name),false);bindings.set(name,callback);},on:(event,fn)=>{assert.equal(event,'response');listener=fn;}};
 const installer=identity==='fixture-unavailable'?installUnavailableAuthBootstrapObserver:installAuthBootstrapObserver;
 const auth=await installer(context,{origin:'http://fixture.invalid',identity,profile:identity==='authenticated'?profile:undefined});
 const body=()=>missingBody?undefined:{success:reply.success,code:reply.code,data:reply.data};
 const routeFor=(url='http://fixture.invalid/api/ra/auth/me',method='POST',payload=null,doc=current)=>{
  const request={url:()=>url,method:()=>method,postData:()=>payload,frame:()=>doc.page};lastRequest=request;
  return {request:()=>request,fulfill(){assert.fail('observer cannot mock real auth responses');},async continue(){
   continued++;
   const deliver=()=>{
    // Playwright 不等待异步 response 监听器，浏览器消费与跳页必须能独立继续。
    const pending=Promise.resolve(listener({request:()=>request,status:()=>reply.status,headers:()=>({'content-type':reply.contentType}),async json(){cdpReads++;if(delayCDP)await cdp.promise;if(doc.navigated)throw new Error('Protocol error (Network.getResponseBody): No resource with given identifier found');return body();}}));
    pending.catch(()=>{});handlers.push(pending);
   };
   if(deferResponseEvent)metadata.push(deliver);else deliver();
  }};
 };
 const newDocument=(frame=current?.page)=>{
  const doc={navigated:false},state={URL,crypto:require('node:crypto').webcrypto,location:new URL('http://fixture.invalid/patient-visits.html'),sessionStorage:{getItem:()=>suppliedSeed,setItem(){assert.fail('observer cannot replace the real authenticated seed');}},document:{cookie:'real-fixture-cookie'}};
  doc.state=state;state.window=state;vm.createContext(state);
  doc.page=frame||{async waitForLoadState(){},async waitForFunction(fn){assert.equal(vm.runInContext('('+fn.toString()+')()',this.document.state),true);},async evaluate(fn){return JSON.parse(JSON.stringify(vm.runInContext('('+fn.toString()+')()',this.document.state)));}};doc.page.document=doc;
  for(const [name,callback] of bindings)state[name]=async payload=>{const result=await callback({frame:doc.page,page:doc.page,context},structuredClone(payload));bound.resolve(payload);if(holdAcknowledgement)await ack.promise;return result;};
  state.fetch=async(url,options)=>{assert.equal(await auth.handle(routeFor(new URL(url,state.location).href,options.method,options.body??null,doc)),true);return {status:reply.status,ok:reply.status>=200&&reply.status<300,async json(){if(jsonError)throw new Error(jsonError);return body();}};};
  state.arg=init.arg;vm.runInContext('('+init.fn.toString()+')(arg)',state);current=doc;return doc;
 };
 newDocument();
 const consume=async()=>{const doc=current,response=await doc.state.fetch('/api/ra/auth/me',{method:'POST',credentials:'same-origin'});if(response.ok)await response.json();return doc;};
 return {auth,context,routeFor,newDocument,consume,bindings,bound:bound.promise,releaseAcknowledgement:()=>ack.resolve(),releaseMetadata:()=>{for(const deliver of metadata.splice(0))deliver();},setReply:value=>Object.assign(reply,value),get page(){return current.page;},get state(){return current.state;},get continued(){return continued;},get lastRequest(){return lastRequest;},get cdpReads(){return cdpReads;},async run({redirect=false}={}){
  const doc=await consume();if(redirect){doc.navigated=true;newDocument();}cdp.resolve();await Promise.all(handlers);if(redirect){await auth.verifyAll();return doc.state.__raAuthBootstrapObserver.id;}return auth.verify(doc.page);
 }};
}
test('patient:bootstrap-real-session-observer',async()=>{
 const good=await fixture();await good.run();assert.equal(good.auth.isHandled(good.lastRequest),true,'only actual handled request identities are split out');await good.auth.verifyAll();assert.equal(good.continued,1);assert.equal(good.auth.requests[0].valid,true);assert.equal(good.auth.requests[0].status,200);assert.equal(good.state.document.cookie,'real-fixture-cookie');assert.equal(JSON.parse(good.state.sessionStorage.getItem('ra-auth')).doctorId,101);
 good.newDocument();good.auth.expectIdentity('anonymous');good.setReply({success:false,code:'401',data:null});await good.run();await good.auth.verifyAll();assert.deepEqual(good.auth.requests.map(r=>r.identity),['authenticated','anonymous'],'identity expectations are frozen per request rather than retroactively applied');assert.notEqual(good.auth.requests[0].documentId,good.auth.requests[1].documentId);
 const anonymous=await fixture({identity:'anonymous'});await anonymous.run();assert.equal(anonymous.auth.requests[0].valid,true);assert.equal(anonymous.auth.requests[0].responseBody.code,'401');assert.equal(anonymous.auth.requests[0].responseBody.data,null);
 // 匿名 business401 被 common.js 消费后立即跳页，CDP body 读取仍可未完成。不能用串行 route mock 隐藏此竞态。
 const racing=await fixture({identity:'anonymous',delayCDP:true});await racing.run({redirect:true});await racing.auth.verify(racing.page,{expected:0});assert.equal(racing.auth.requests[0].result,'ANONYMOUS_DENIED');assert.equal(racing.auth.requests[0].responseBody.data,null);assert.equal(racing.cdpReads,0,'body receipt must not depend on CDP surviving the document');
 const held=await fixture({holdAcknowledgement:true});let returned=false;const consumption=held.consume().then(()=>returned=true);await held.bound;assert.equal(returned,false,'production json must wait for the exact receipt acknowledgement');assert.equal(held.state.__raAuthBootstrapObserver.consumed,0);assert.equal(held.auth.requests[0].responseBody.code,'200');const firstFrame=held.page;held.auth.expectIdentity('anonymous');held.setReply({success:false,code:'401',data:null});held.newDocument();assert.equal(held.page,firstFrame,'navigation can reuse the original frame with a fresh document');const nextConsumption=held.consume();await new Promise(resolve=>setImmediate(resolve));assert.equal(held.auth.requests.length,2);assert.deepEqual(held.auth.requests.map(r=>r.result),['AUTHENTICATED','ANONYMOUS_DENIED'],'same-frame document receipts and expectations cannot overwrite one another');held.releaseAcknowledgement();await Promise.all([consumption,nextConsumption]);await held.auth.verify(held.page);await held.auth.verifyAll();
 const reordered=await fixture({deferResponseEvent:true});const pending=reordered.consume();await new Promise(resolve=>setImmediate(resolve));assert.equal(reordered.state.__raAuthBootstrapObserver.consumed,0,'body capture cannot release production before real response metadata');reordered.releaseMetadata();await pending;await reordered.auth.verify(reordered.page);
 for(const [options,reason] of [[{status:404},/404 is not authentication/],[{success:false,code:'401',data:null},/authenticated session must be accepted/],[{data:{...profile,doctorId:202}},/real doctor identity/],[{data:{...profile,role:'管理员'}},/real profile role/],[{contentType:'text/html'},/must be JSON/],[{identity:'anonymous',success:true,code:'200',data:profile},/anonymous session must be denied/],[{identity:'anonymous',code:'UNAUTHENTICATED'},/business 401/],[{identity:'anonymous',status:401},/production HTTP200/],[{identity:'anonymous',data:{}},/null/],[{missingBody:true},/body must be an object/],[{jsonError:'Unexpected token <'},/Unexpected token </]]){
  const h=await fixture(options);await assert.rejects(()=>h.run(),reason);await assert.rejects(()=>h.auth.verifyAll(),reason,'redirected documents retain their exact auth failure evidence');assert.equal(h.auth.requests[0].valid,false);assert.equal(h.continued,1,'bad backend contract is observed as real traffic, never replaced');
 }

 const duplicate=await fixture();const response=await duplicate.state.fetch('/api/ra/auth/me',{method:'POST',credentials:'same-origin'});await response.json();await assert.rejects(()=>response.json(),/exactly once/);await assert.rejects(()=>duplicate.auth.verifyAll(),/exactly once/);
 const mismatched=await fixture();await mismatched.run();const receipt=mismatched.auth.requests[0],callback=[...mismatched.bindings.values()][0];await assert.rejects(()=>callback({frame:{}},{documentId:receipt.documentId,requestId:1,url:receipt.url,body:receipt.responseBody}),/original request frame/);await assert.rejects(()=>mismatched.auth.verifyAll(),/original request frame/);
 const unknown=await fixture();await unknown.run();await assert.rejects(()=>[...unknown.bindings.values()][0]({frame:unknown.page},{documentId:'not-an-observed-document'}),/match an observed document/);await assert.rejects(()=>unknown.auth.verifyAll(),/all auth body receipts/);
 assert.notEqual([...duplicate.bindings.keys()][0],[...unknown.bindings.keys()][0],'fresh contexts have independent bindings');
 const unread=await fixture();await unread.state.fetch('/api/ra/auth/me',{method:'POST',credentials:'same-origin'});await assert.rejects(()=>unread.auth.verifyAll(),/body did not finish/);assert.equal(unread.auth.requests[0].valid,false,'missing production JSON consumption fails closed instead of falling back to CDP');
 await assert.rejects(()=>good.run(),/more than once/,'a repeated real bootstrap cannot be hidden');
 const none=await fixture();await none.auth.verify(none.page,{expected:0});assert.equal(none.continued,0);
 const illegal=[['http://fixture.invalid/api/ra/auth/me','GET',null],['http://fixture.invalid/api/ra/auth/me','POST','{}'],['http://fixture.invalid/api/ra/auth/me?doctorId=101','POST',null],['http://fixture.invalid/api/ra/auth/logout','POST',null],['http://other.invalid/api/ra/auth/me','POST',null]];
 const business=[];for(const input of illegal)if(!await none.auth.handle(none.routeFor(...input)))business.push(input);assert.deepEqual(business,illegal);assert.equal(none.continued,0);assert.equal(none.auth.requests.length,0);assert.equal(none.auth.isHandled(none.lastRequest),false,'malformed or other API request cannot be silently classified as auth');
});

test('patient:bootstrap-fixture-unavailable-observer',async()=>{
 const unavailable=await fixture({identity:'fixture-unavailable',status:404,contentType:'text/html'});await unavailable.run();await unavailable.auth.verifyAll();const record=unavailable.auth.requests[0];
 assert.equal(record.valid,true,'only the explicitly unavailable SQL fixture mode accepts its missing endpoint');assert.equal(record.authenticationVerified,false,'404 observation cannot claim authentication');assert.equal(record.result,'AUTH_ME_FIXTURE_UNAVAILABLE');assert.equal(record.status,404);assert.equal(record.body,null,'real auth POST remains bodyless');assert.equal(record.responseBody,undefined,'404 body is not read as session data');assert.equal(unavailable.cdpReads,0);
 assert.throws(()=>unavailable.auth.expectIdentity('authenticated',profile),/cannot dynamically claim authentication/);
 const wrong=await fixture({identity:'fixture-unavailable',status:200});await assert.rejects(()=>wrong.run(),/observe exactly the unavailable/);assert.equal(wrong.auth.requests[0].valid,false);assert.equal(wrong.auth.requests[0].authenticationVerified,false);
 const other=await fixture({identity:'fixture-unavailable',status:404});assert.equal(await other.auth.handle(other.routeFor('http://fixture.invalid/api/ra/patient/patientDetail','POST',null)),false);assert.equal(other.continued,0);assert.equal(other.auth.requests.length,0);
});
