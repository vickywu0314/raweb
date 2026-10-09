const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const {resolve} = require('node:path');
const {pathToFileURL} = require('node:url');
const {symlink,unlink} = require('node:fs/promises');
test('cohort:dev-proxy', async () => {
  const {startDevServer} = await import(pathToFileURL(resolve(__dirname,'../../scripts/dev-server.mjs')));
  const requests = [];
  const upstream = http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    requests.push({url:req.url,headers:req.headers,body});
    res.writeHead(401,{'Content-Type':'application/json','X-Trace-Id':'proxy-401'});res.end('{"success":false,"code":"UNAUTHENTICATED","message":"失效","data":null}');
  });
  await new Promise(yes=>upstream.listen(0,'127.0.0.1',yes));
  let server;
  const link=resolve(__dirname,`../../node_modules/p01a-outside-link-${process.pid}`);
  try {
    server=await startDevServer({port:0,upstream:`http://127.0.0.1:${upstream.address().port}`});
    const origin=`http://127.0.0.1:${server.port}`;
    assert.equal((await fetch(origin+'/ai-cohort.html')).status,200);
    assert.equal((await fetch(origin+'/js/common.js',{method:'HEAD'})).status,200);
    await symlink(resolve(__dirname,'../../../AGENTS.md'),link);
    for(const path of [`/node_modules/p01a-outside-link-${process.pid}`,'/.hidden','/%2ehidden','/%2e%2e/AGENTS.md','/%5coutside','/%zz'])assert.equal((await fetch(origin+path)).status,404,path);
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
    await new Promise(yes=>upstream.close(yes));
    assert.equal((await fetch(origin+'/api/ra/ai/cohort',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,502);
    const port=server.port;await server.close();server=null;
    await assert.rejects(()=>new Promise((yes,no)=>{const s=net.connect(port,'127.0.0.1');s.once('connect',()=>{s.destroy();yes();});s.once('error',no);}),/ECONNREFUSED/);
  } finally {await unlink(link).catch(()=>{});await server?.close();await new Promise(yes=>upstream.close(yes));}
});
