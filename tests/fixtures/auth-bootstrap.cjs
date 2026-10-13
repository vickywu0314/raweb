const assert=require('node:assert/strict');
const AUTH_PATH='/api/ra/auth/me';
const USER={doctorId:'101',name:'合成页面用户',role:'研究者',expires:0};
// 身份核验单独取证，绝不将任意 /auth/*、GET、带body或query的请求静默排除。
async function installAuthBootstrap(context,{origin=process.env.RA_STATIC_URL}={}){
 assert.equal(new URL(origin).origin,origin,'bootstrap fixture needs the exact static origin');
 const requests=[],documents=new Map();
 await context.addInitScript(({user,path})=>{
  sessionStorage.setItem('ra-auth',JSON.stringify(user));
  window.__raAuthBootstrap={id:crypto.randomUUID(),calls:[],completed:0};
  const original=window.fetch;
  window.fetch=async(...args)=>{
   const url=new URL(String(args[0]),location.href),options=args[1]||{};
   if(url.origin!==location.origin||url.pathname!==path||url.search||url.hash)return original(...args);
   const state=window.__raAuthBootstrap;
   state.calls.push({method:options.method||'GET',credentials:options.credentials||'same-origin',body:options.body??null});
   const response=await original(...args),read=response.json.bind(response);
   response.json=async()=>{const body=await read();state.completed++;return body;};
   return response;
  };
 },{user:USER,path:AUTH_PATH});
 const snapshot=page=>page.evaluate(()=>window.__raAuthBootstrap);
 const handle=async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin||url.pathname!==AUTH_PATH||url.search||url.hash||request.method()!=='POST'||request.postData()!==null)return false;
  const state=await request.frame().evaluate(()=>window.__raAuthBootstrap);
  assert.ok(state&&typeof state.id==='string'&&state.id,'bootstrap document instrumentation must exist');
  assert.equal(documents.get(state.id)||0,0,'a document must not bootstrap its session more than once');
  documents.set(state.id,1);
  requests.push({url:request.url(),path:AUTH_PATH,method:request.method(),body:null,documentId:state.id});
  await route.fulfill({status:200,contentType:'application/json',headers:{'X-Trace-Id':'synthetic-auth-bootstrap'},body:JSON.stringify({success:true,code:'200',data:{doctorId:101,name:USER.name,role:USER.role}})});
  return true;
 };
 const verify=async(page,{expected=1}={})=>{
  assert.ok(expected===0||expected===1,'bootstrap count must explicitly be zero or one');
  await page.waitForLoadState('load');
  if(expected===1)await page.waitForFunction(()=>window.__raAuthBootstrap?.completed===1);
  const state=await snapshot(page);
  assert.ok(state&&state.id,'bootstrap document instrumentation must exist');
  assert.equal(state.calls.length,expected,'actual browser bootstrap count for this document');
  assert.equal(state.completed,expected,'bootstrap JSON must be consumed exactly once');
  assert.equal(documents.get(state.id)||0,expected,'HTTP bootstrap receipt count for this document');
  assert.deepEqual(state.calls,expected?[{method:'POST',credentials:'same-origin',body:null}]:[],'session request must use POST, same-origin credentials, and no body');
  return state.id;
 };
 return {requests,handle,verify};
}
module.exports={installAuthBootstrap,AUTH_PATH,USER};
