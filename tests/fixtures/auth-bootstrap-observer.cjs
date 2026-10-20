const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const PATH='/api/ra/auth/me';
// 真后端链只观察；不设置身份、不触碰 Cookie，也不伪造 /auth/me 的响应。
async function installAuthBootstrapObserver(context,{origin,identity='authenticated',profile}={}){
 assert.equal(new URL(origin).origin,origin,'observer needs the exact fixture origin');
 assert.ok(['authenticated','anonymous','fixture-unavailable'].includes(identity),'observer identity must be explicit');
 if(identity==='authenticated')assert.ok(profile&&profile.doctorId!=null,'authenticated observer needs the real server profile');
 let expectedIdentity=identity,expectedProfile=profile;
 const expectIdentity=(next,nextProfile=expectedProfile)=>{
  assert.notEqual(identity,'fixture-unavailable','SQL fixture-unavailable mode cannot dynamically claim authentication');
  assert.ok(['authenticated','anonymous'].includes(next),'real session expectation must be explicit');
  if(next==='authenticated')assert.ok(nextProfile&&nextProfile.doctorId!=null,'authenticated expectation needs the real server profile');
  expectedIdentity=next;expectedProfile=nextProfile;
 };
 const requests=[],receipts=new Map(),documents=new Map(),documentReceipts=new Map(),bindingErrors=[];
 const bindingName='__raAuthBootstrapReceipt_'+randomUUID().replaceAll('-','');
 const fail=(entry,error)=>{entry.authenticationVerified=false;entry.valid=false;entry.error=error.message;entry.resolve();};
 const validate=entry=>{
  if(!entry.metadataReady||entry.valid===false)return;
  try{
   if(entry.identity==='fixture-unavailable'){
    assert.equal(entry.status,404,'explicit non-typed SQL fixture mode must observe exactly the unavailable auth/me endpoint');
    entry.authenticationVerified=false;entry.result='AUTH_ME_FIXTURE_UNAVAILABLE';entry.valid=true;entry.resolve();return;
   }
   assert.equal(entry.status,200,'real auth/me must reach the production HTTP200 response contract; 404 is not authentication');
   assert.match(entry.contentType,/^application\/json\b/i,'auth/me response must be JSON');
   if(!entry.bodyReady)return;
   const body=entry.responseBody;
   assert.ok(body&&typeof body==='object'&&!Array.isArray(body),'real auth/me body must be an object');
   if(entry.identity==='authenticated'){
    assert.equal(body.success,true,'authenticated session must be accepted by production AuthService');assert.equal(String(body.code),'200');
    assert.ok(body.data&&typeof body.data==='object');assert.deepEqual(Object.keys(body.data).sort(),Object.keys(entry.profile).sort(),'real auth profile fields');
    for(const key of Object.keys(entry.profile))if(key==='doctorId')assert.equal(String(body.data[key]),String(entry.profile[key]),'real doctor identity');else assert.deepEqual(body.data[key],entry.profile[key],'real profile '+key);
   }else{
    assert.equal(body.success,false,'anonymous session must be denied');assert.equal(String(body.code),'401','production anonymous auth/me uses a business 401');assert.equal(body.data,null);
   }
   entry.authenticationVerified=true;entry.result=entry.identity==='authenticated'?'AUTHENTICATED':'ANONYMOUS_DENIED';entry.valid=true;entry.resolve();
  }catch(error){fail(entry,error);}
 };
 // 先留存生产实际消费的 JSON，再确认回执，避免匿名跳页销毁 CDP response body。
 // Binding 归 BrowserContext 所有，每次安装使用唯一名称；旧文档回执只能匹配原 frame/document。
 await context.exposeBinding(bindingName,async(source,payload)=>{
  let entry;
  try{
   entry=documentReceipts.get(payload.documentId);
   assert.ok(entry,'auth body receipt must match an observed document');
   assert.equal(source.frame,entry.frame,'auth body receipt must match the original request frame');
   assert.equal(payload.url,entry.url,'auth body receipt must match the real request URL');
   assert.equal(payload.requestId,1,'auth body receipt must match the document bootstrap request');
   entry.bodyReads=(entry.bodyReads||0)+1;assert.equal(entry.bodyReads,1,'production auth/me JSON must be read exactly once');
   assert.equal(payload.error,undefined,'real auth/me JSON read failed: '+payload.error);
   if(entry.identity!=='fixture-unavailable'){entry.responseBody=payload.body;entry.bodyReady=true;}
   validate(entry);await entry.settled;assert.equal(entry.valid,true,entry.error||'real auth response must be validated');
  }catch(error){if(entry)fail(entry,error);else bindingErrors.push(error.message);throw error;}
 });
 await context.addInitScript(({path,origin,bindingName})=>{
  const state=window.__raAuthBootstrapObserver={id:crypto.randomUUID(),calls:[],responses:0,consumed:0};
  const original=window.fetch;
  window.fetch=async(...args)=>{
   const url=new URL(String(args[0]),location.href),options=args[1]||{};
   if(url.origin!==origin||url.pathname!==path||url.search||url.hash)return original(...args);
   state.calls.push({method:options.method||'GET',credentials:options.credentials||'same-origin',body:options.body??null});
   const requestId=state.calls.length,response=await original(...args);state.responses++;const read=response.json.bind(response);
   response.json=async()=>{
    let body;
    try{body=await read();}catch(error){await window[bindingName]({documentId:state.id,requestId,url:url.href,error:error.message});throw error;}
    await window[bindingName]({documentId:state.id,requestId,url:url.href,body});state.consumed++;return body;
   };return response;
  };
 },{path:PATH,origin,bindingName});
 context.on('response',response=>{
  const entry=receipts.get(response.request());if(!entry)return;
  try{
   assert.notEqual(entry.metadataReady,true,'real auth/me response metadata must be observed once');
   entry.status=response.status();entry.contentType=response.headers()['content-type']||'';entry.metadataReady=true;validate(entry);
  }catch(error){fail(entry,error);}
 });
 const handle=async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin||url.pathname!==PATH||url.search||url.hash||request.method()!=='POST'||request.postData()!==null)return false;
  const expectation={identity:expectedIdentity,profile:structuredClone(expectedProfile)};
  const state=await request.frame().evaluate(()=>window.__raAuthBootstrapObserver);
  assert.ok(state&&state.id,'real auth bootstrap document instrumentation must exist');
  assert.equal(documents.get(state.id)||0,0,'a document must not bootstrap its real session more than once');
  assert.deepEqual(state.calls,[{method:'POST',credentials:'same-origin',body:null}],'real bootstrap credentials and method must be observed before a possible login redirect');
  documents.set(state.id,1);let settle;
  const entry={url:request.url(),path:PATH,method:'POST',body:null,documentId:state.id,identity:expectation.identity};
  Object.defineProperty(entry,'profile',{value:expectation.profile});Object.defineProperty(entry,'frame',{value:request.frame()});
  Object.defineProperty(entry,'settled',{value:new Promise(resolve=>settle=resolve)});Object.defineProperty(entry,'resolve',{value:settle});
  requests.push(entry);receipts.set(request,entry);documentReceipts.set(state.id,entry);await route.continue();return true;
 };
 const verifyReceipt=async entry=>{
  let timer;try{await Promise.race([entry.settled,new Promise(resolve=>{timer=setTimeout(()=>{fail(entry,new Error('real auth response body did not finish within 5000ms'));resolve();},5000);})]);}
  finally{clearTimeout(timer);}
  assert.equal(entry.valid,true,entry.error||'real auth response must be validated');
 };
 const verifyBindings=()=>assert.deepEqual(bindingErrors,[],'all auth body receipts must match an observed document');
 const verifyAll=async()=>{verifyBindings();for(const entry of requests)await verifyReceipt(entry);verifyBindings();};
 const verify=async(page,{expected=1}={})=>{
  verifyBindings();assert.ok(expected===0||expected===1,'real bootstrap count must explicitly be zero or one');await page.waitForLoadState('load');
  if(expected===1)await page.waitForFunction(()=>window.__raAuthBootstrapObserver?.responses>=1);
  const state=await page.evaluate(()=>window.__raAuthBootstrapObserver);assert.ok(state&&state.id);
  assert.equal(state.calls.length,expected,'actual real-backend browser bootstrap calls per document');assert.equal(state.responses,expected,'actual browser bootstrap HTTP responses per document');assert.equal(documents.get(state.id)||0,expected,'real route receipts per document');
  assert.deepEqual(state.calls,expected?[{method:'POST',credentials:'same-origin',body:null}]:[],'real session request must use POST, same-origin credentials, and no body');
  const own=requests.filter(entry=>entry.documentId===state.id);assert.equal(own.length,expected);
  for(const entry of own)await verifyReceipt(entry);
  if(own.some(entry=>entry.identity==='authenticated')){
   await page.waitForFunction(()=>window.__raAuthBootstrapObserver?.consumed>=1);
   const consumed=await page.evaluate(()=>window.__raAuthBootstrapObserver);assert.equal(consumed.id,state.id,'authenticated bootstrap must remain in its original document');assert.equal(consumed.consumed,1,'production common.js must consume real authenticated me JSON exactly once');
  }
  return state.id;
 };
 return {requests,handle,verify,verifyAll,expectIdentity,isHandled:request=>receipts.has(request)};
}
// 只用于已明确缺少生产认证挂载的旧 SQL fixture；此模式永不代表认证通过。
const installUnavailableAuthBootstrapObserver=(context,{origin}={})=>installAuthBootstrapObserver(context,{origin,identity:'fixture-unavailable'});
module.exports={installAuthBootstrapObserver,installUnavailableAuthBootstrapObserver};
