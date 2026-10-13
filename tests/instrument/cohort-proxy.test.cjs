const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const {resolve,join} = require('node:path');
const {tmpdir} = require('node:os');
const {pathToFileURL} = require('node:url');
const {mkdtemp,writeFile,symlink,unlink,rmdir} = require('node:fs/promises');
test('cohort:dev-proxy', async () => {
  const {startDevServer} = await import(pathToFileURL(resolve(__dirname,'../../scripts/dev-server.mjs')));
  const requests = [];
  const upstream = http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    requests.push({url:req.url,headers:req.headers,body});
    if(req.url==='/api/ra/export/xlsx'){res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="ordinary-cohort.xlsx"','Cache-Control':'no-store','X-Trace-Id':'proxy-file'});res.end(Buffer.from([0,255,128,80,75,13,10]));return;}
    res.writeHead(401,{'Content-Type':'application/json','X-Trace-Id':'proxy-401'});res.end('{"success":false,"code":"UNAUTHENTICATED","message":"失效","data":null}');
  });
  await new Promise(yes=>upstream.listen(0,'127.0.0.1',yes));
  let server;
  const link=resolve(__dirname,`p01a-outside-link-${process.pid}`);
  let canaryDir,canaryFile;
  try {
    canaryDir=await mkdtemp(join(tmpdir(),'raweb-proxy-canary-'));
    canaryFile=join(canaryDir,'outside-root.txt');
    await writeFile(canaryFile,'synthetic outside-root canary');
    server=await startDevServer({port:0,upstream:`http://127.0.0.1:${upstream.address().port}`});
    const origin=`http://127.0.0.1:${server.port}`;
    assert.equal((await fetch(origin+'/ai-cohort.html')).status,200);
    assert.equal((await fetch(origin+'/js/common.js',{method:'HEAD'})).status,200);
    await symlink(canaryFile,link);
    for(const path of [`/tests/instrument/p01a-outside-link-${process.pid}`,'/.hidden','/%2ehidden','/%2e%2e/AGENTS.md','/%5coutside','/%zz'])assert.equal((await fetch(origin+path)).status,404,path);
    const response=await fetch(origin+'/api/ra/ai/cohort',{method:'POST',headers:{'Content-Type':'application/json','X-Doctor-Id':'101','X-Upstream':'http://example.invalid'},body:'{"filters":{"studyCode":"RA","sex":"F"}}'});
    assert.equal(response.status,401);assert.equal(response.headers.get('x-trace-id'),'proxy-401');assert.equal((await response.json()).code,'UNAUTHENTICATED');
    assert.equal(requests.length,1);assert.equal(requests[0].headers['x-doctor-id'],undefined);assert.equal(requests[0].headers['x-upstream'],undefined);assert.equal(requests[0].headers.host,`127.0.0.1:${upstream.address().port}`);
    assert.equal(requests[0].body,'{"filters":{"studyCode":"RA","sex":"F"}}');
    // 原始HTTP path，不能让fetch在到代理前替产品规范化。
    const rawRequest=path=>new Promise((yes,no)=>{
      const peer=http.request({hostname:'127.0.0.1',port:server.port,path,method:'GET',agent:false},res=>{res.resume();res.once('end',()=>yes(res.statusCode));});
      peer.once('error',no);peer.end();
    });
    const status=await rawRequest('/api/%2e%2e/admin');
    assert.deepEqual({status,upstreamRequests:requests.length},{status:404,upstreamRequests:1},'encoded API traversal must be rejected before upstream IO');
    for(const path of ['/api/%2E%2E/admin','/api/.%2e/admin','/api/%2e./admin','/api/../admin','/api/ra/../../admin','/api/%2e%2e%2fadmin','/api/..%2fadmin','/api/%252e%252e/admin','/api/%5c..%5cadmin','/api/%zz']) {
      const status=await rawRequest(path);
      assert.deepEqual({status,upstreamRequests:requests.length},{status:404,upstreamRequests:1},path);
    }
    assert.equal(await rawRequest('/api/ra/ai/cohort?return=%2e%2e%2fadmin&word=%E5%90%88%E6%88%90'),401);
    assert.equal(requests.length,2);assert.equal(requests[1].url,'/api/ra/ai/cohort?return=%2e%2e%2fadmin&word=%E5%90%88%E6%88%90');
    assert.equal(requests[1].headers.host,`127.0.0.1:${upstream.address().port}`);
    for(const invalid of ['http://example.invalid:8065','https://127.0.0.1:8065','http://user@127.0.0.1:8065','http://127.0.0.1:8065/path'])await assert.rejects(()=>startDevServer({port:0,upstream:invalid}),/loopback/);
    const file=await fetch(origin+'/api/ra/export/xlsx',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"source":"COHORT","analysisId":"11111111-1111-1111-1111-111111111111"}'});
    assert.equal(file.status,200);assert.equal(file.headers.get('content-type'),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');assert.equal(file.headers.get('content-disposition'),'attachment; filename="ordinary-cohort.xlsx"');assert.equal(file.headers.get('cache-control'),'no-store');assert.equal(file.headers.get('x-trace-id'),'proxy-file');assert.deepEqual(Buffer.from(await file.arrayBuffer()),Buffer.from([0,255,128,80,75,13,10]));assert.equal(requests.length,3);assert.equal(requests[2].url,'/api/ra/export/xlsx');
    await new Promise(yes=>upstream.close(yes));
    assert.equal((await fetch(origin+'/api/ra/ai/cohort',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,502);
    await applicationBudgets(startDevServer);
    const port=server.port;await server.close();server=null;
    await assert.rejects(()=>new Promise((yes,no)=>{const s=net.connect(port,'127.0.0.1');s.once('connect',()=>{s.destroy();yes();});s.once('error',no);}),/ECONNREFUSED/);
  } finally {
    await unlink(link).catch(()=>{});
    if(canaryFile)await unlink(canaryFile).catch(()=>{});
    if(canaryDir)await rmdir(canaryDir).catch(()=>{});
    await server?.close();
    await new Promise(yes=>upstream.close(yes));
  }
});

// 同一受控慢peer证明新申请预算与原5秒路独立，无全局timeout放宽。
async function applicationBudgets(startDevServer){
 const {LoopbackOwner}=await import(pathToFileURL(resolve(__dirname,'../support/loopback-owner.mjs'))),received=[],timers=new Set();
 const upstream=http.createServer(async(req,res)=>{for await(const chunk of req){}received.push(req.url);const timer=setTimeout(()=>{timers.delete(timer);if(!res.destroyed){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"success":true,"code":"200","data":null}');}},6100);timers.add(timer);});
 await new Promise(yes=>upstream.listen(0,'127.0.0.1',yes));const report={resources:[],events:[]},owner=new LoopbackOwner({repo:resolve(__dirname,'../../..'),dir:resolve(__dirname,'../../../.tmp/ai-cohort-web/p06c'),report,event:(type,fields)=>report.events.push({type,...fields})});let dev;
 try{
  dev=await startDevServer({port:0,upstream:`http://127.0.0.1:${upstream.address().port}`});const loopback=await owner.proxy({scenario:'p06-application-replay',port:upstream.address().port});
  const request=(port,path)=>fetch(`http://127.0.0.1:${port}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(async r=>{await r.arrayBuffer();return r.status;});
  const statuses=await Promise.all([dev.port,loopback].flatMap(port=>['/api/ra/export/applyAnalysis','/api/ra/export/retryNotification','/api/ra/ai/cohort'].map(path=>request(port,path))));
  assert.deepEqual(statuses.slice(0,3),[200,200,200],'merged dev-server accepts 6.1s real-library responses under the 60s budget');
  assert.deepEqual(statuses.slice(3),[200,200,502],'LoopbackOwner fixture retains its independent 15s/5s route budgets');assert.equal(received.length,6);
  assert.equal((await request(loopback,'/api/ra/export/applyAnalysis/')).valueOf(),404,'不得扩到非准确路');
 }finally{for(const timer of timers)clearTimeout(timer);await dev?.close();for(const server of owner.proxies){server.closeAllConnections();await new Promise(yes=>server.close(yes));}upstream.closeAllConnections();await new Promise(yes=>upstream.close(yes));}
}
