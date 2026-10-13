import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { LoopbackOwner } from './loopback-owner.mjs';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const typed=['issue1-detail','p00-trusted','p01-overview','p03-sources','p05-chat','p06-current','p07-current'];
const profile={username:'synthetic',doctorId:101,name:'医生 101',role:'研究者'};
const authenticated=JSON.stringify({success:true,code:'200',message:'成功',data:profile});
const anonymous=JSON.stringify({success:false,code:'401',message:'请先登录',data:null});

// 这只是代理透传合同的合成上游；生产 AuthController/AuthService 另由 Java 非DB真实TCP测试证明。
async function instrument(run) {
  const calls=[];
  const upstream=http.createServer(async(request,response)=>{
    const chunks=[];for await(const chunk of request)chunks.push(chunk);
    calls.push({path:request.url,method:request.method,cookie:request.headers.cookie,body:Buffer.concat(chunks).toString()});
    if(request.url==='/api/ra/test/session') {response.writeHead(204,{'Set-Cookie':'JSESSIONID=proxy-contract; Path=/; HttpOnly'});response.end();return;}
    response.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    response.end(request.headers.cookie==='JSESSIONID=proxy-contract'?authenticated:anonymous);
  });
  await new Promise((yes,no)=>{upstream.once('error',no);upstream.listen(0,'127.0.0.1',yes);});
  const owner=new LoopbackOwner({repo,dir:repo,report:{resources:[]},event:()=>{}});
  try {await run({owner,calls,backendPort:upstream.address().port});}
  finally {await owner.close();upstream.closeAllConnections();await new Promise((yes,no)=>upstream.close(error=>error?no(error):yes()));assert.equal(owner.report.cleanupErrors,undefined);}
}

test('patient:bootstrap-proxy-contract',async()=>{
  await instrument(async({owner,calls,backendPort})=>{
    for(const scenario of typed) {
      const port=await owner.proxy({scenario,port:backendPort});const origin=`http://127.0.0.1:${port}`;
      const before=calls.length;
      const rejected=await fetch(origin+'/api/ra/auth/me',{method:'POST'});
      assert.equal(rejected.status,200,scenario);assert.equal(await rejected.text(),anonymous);assert.equal(rejected.headers.get('cache-control'),'no-store');
      const login=await fetch(origin+'/api/ra/test/session',{method:'POST'});
      assert.equal(login.status,204);assert.equal(login.headers.get('set-cookie'),'JSESSIONID=proxy-contract; Path=/; HttpOnly');
      const cookie=login.headers.get('set-cookie').split(';',1)[0];
      const me=await fetch(origin+'/api/ra/auth/me',{method:'POST',headers:{Cookie:cookie}});
      assert.equal(me.status,200);assert.equal(await me.text(),authenticated);
      assert.deepEqual(calls.slice(before),[
        {path:'/api/ra/auth/me',method:'POST',cookie:undefined,body:''},
        {path:'/api/ra/test/session',method:'POST',cookie:undefined,body:''},
        {path:'/api/ra/auth/me',method:'POST',cookie:'JSESSIONID=proxy-contract',body:''}
      ]);
      const count=calls.length;
      for(const method of ['GET','HEAD','PUT','DELETE','OPTIONS'])assert.equal((await fetch(origin+'/api/ra/auth/me',{method})).status,404,scenario+method);
      for(const path of ['/api/ra/auth/me?x=1','/api/ra/auth/me/','/api/ra/auth/login','/api/ra/auth/logout','/api/ra/auth/other'])assert.equal((await fetch(origin+path,{method:'POST'})).status,404,path);
      assert.equal(calls.length,count,'被拒绝请求不得到达上游');
    }
  });
  // 非typed场景继续拒绝auth/me，不能扩大旧场景的上游访问权限。
  await instrument(async({owner,calls,backendPort})=>{
    for(const scenario of ['default','p01b','p04','p07-entry','p07-composition','p07-composition-time']) {
      const port=await owner.proxy({scenario,port:backendPort});
      assert.equal((await fetch(`http://127.0.0.1:${port}/api/ra/auth/me`,{method:'POST',headers:{Cookie:'JSESSIONID=proxy-contract'}})).status,404,scenario);
    }
    assert.equal(calls.length,0);
  });
});
