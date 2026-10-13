const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),{readFileSync}=require('node:fs'),{resolve}=require('node:path');
const source=file=>readFileSync(resolve(__dirname,'../../js',file),'utf8');
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function detailHarness(reply,search='?id=21'){
 const events={},requests=[],clears=[],published=[],timers=new Map();let serial=0,revoked=0;
 const c=vm.createContext({window:{addEventListener:(name,fn)=>events[name]=fn},location:{search},URLSearchParams,AbortController,API_BASE:'',currentDoctorId:()=>101,clearAuth:()=>revoked++,fetch:async(url,options)=>{requests.push({url,options});if(reply instanceof Error)throw reply;return reply;},setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(source('shared/patient-detail.js'),c);const api=c.window.RAPatientDetail;return{api,requests,clears,published,timers,events,get revoked(){return revoked},owner:()=>api.owner({clear:(...args)=>clears.push(args),publish:value=>published.push(value)})};
}
const response=(status,code,data=null,contentType='application/json',badJson=false)=>({status,ok:status>=200&&status<300,headers:{get:()=>contentType},json:async()=>{if(badJson)throw new SyntaxError('unexpected internal token');return{success:code==='200',code,message:'INTERNAL_BACKEND_DETAIL',data}}});
test('display:user-facing-errors',async()=>{
 const listeners={},node={hidden:true,textContent:''},storage={getItem:()=>null,removeItem(){},setItem(){}};
 const c=vm.createContext({window:{addEventListener:(name,fn)=>listeners[name]=fn},document:{getElementById:id=>id==='app-load-status'?node:null},localStorage:storage,sessionStorage:storage,location:{pathname:'/login.html'}});vm.runInContext(source('boot.js'),c);
 assert.equal(node.hidden,true);listeners.error();assert.equal(node.hidden,false);assert.equal(node.textContent,'页面暂时无法正常显示，请刷新重试；如仍有问题，请联系管理员。');assert.doesNotMatch(node.textContent,/css|js|img|目录|文件一起保存/);
 for(const [reply,code,message] of [
  [response(200,'200',null,'text/html'),'DECODE','患者资料服务响应异常，请刷新重试；如仍有问题，请联系管理员。'],
  [response(200,'200',null,'application/json',true),'DECODE','患者资料服务响应异常，请刷新重试；如仍有问题，请联系管理员。'],
  [response(401,'x',null,'text/plain',true),'UNAUTHENTICATED','请先登录后重新打开患者资料'],
  [response(503,'SERVICE_UNAVAILABLE'),'SERVICE_UNAVAILABLE','患者资料服务暂不可用，请稍后重试。'],
  [response(403,'FORBIDDEN'),'FORBIDDEN','当前账号无权查看该患者资料，请返回患者列表。'],
  [response(404,'RESOURCE_NOT_FOUND'),'RESOURCE_NOT_FOUND','患者资料不存在或当前不可访问，请返回患者列表重新选择。'],
  [response(500,'INTERNAL_FAILURE'),'INTERNAL_FAILURE','患者资料暂时无法加载，请稍后重试；如仍有问题，请联系管理员。'],
  [response(200,'200',null),'INVALID_RESPONSE','患者资料不完整，请重新读取；如仍有问题，请联系管理员。'],
  [new TypeError('socket failure'),'NETWORK','网络连接失败，请检查连接后重试。']
 ]){const h=detailHarness(reply);await assert.rejects(()=>h.api.read('/api/ra/patient/patientDetail',{patientId:'21'}),e=>{assert.equal(e.code,code);assert.equal(e.message,message);assert.doesNotMatch(e.message,/JSON|HTTP|DECODE|INTERNAL_|503|403/);return true});assert.equal(h.requests.length,1);assert.equal(h.requests[0].options.method,'POST');assert.equal(h.requests[0].options.credentials,'same-origin');assert.equal(h.requests[0].options.body,'patientId=21');}
 for(const [data,message] of [[{patientId:'22',visits:[]},'返回的患者资料与当前选择不一致，请返回患者列表重新选择。'],[{patientId:'21',visits:[{visitId:1,doctorId:'101'}]},'访视记录暂时无法识别，请返回随访列表重新选择。']]){const h=detailHarness(response(200,'200',data)),o=h.owner();o.load('21');await flush();assert.equal(o.state,'error');assert.deepEqual(h.clears.at(-1),['error',message,'INVALID_RESPONSE']);assert.equal(h.published.length,0);assert.equal(h.timers.size,0);}
 const invalid=detailHarness(response(200,'200',{}),'?id=0'),o=invalid.owner();o.load('0');await flush();assert.deepEqual(invalid.clears.at(-1),['error','患者或访视入口无效，请返回患者列表重新选择。','INVALID_REQUEST']);assert.equal(invalid.requests.length,0);assert.equal(invalid.timers.size,0);
 const denied=detailHarness(response(401,'x')),d=denied.owner();d.load('21');await flush();assert.equal(denied.revoked,1);assert.equal(d.state,'error');assert.equal(denied.published.length,0);assert.equal(denied.clears.at(-1)[2],'UNAUTHENTICATED');
});
