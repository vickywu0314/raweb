// 仅本地开发：固定静态root、显式loopback上游、无身份注入。
import http from 'node:http';
import {realpath,stat,readFile} from 'node:fs/promises';
import {resolve,dirname,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function startDevServer({port=8090,upstream='http://127.0.0.1:8065'}={}) {
  const target=new URL(upstream);
  if(target.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(target.hostname)||target.username||target.password||target.pathname!=='/'||target.search||target.hash)throw new Error('upstream must be explicit loopback HTTP origin');
  if(!Number.isInteger(Number(port))||Number(port)<0||Number(port)>65535)throw new Error('invalid loopback port');
  const staticRoot=await realpath(root),sockets=new Set(),outgoing=new Set(),agent=new http.Agent({keepAlive:false});
  let closing=false;
  const fail=(response,status=502)=>{if(response.destroyed)return;if(response.headersSent){response.destroy();return;}if(!response.headersSent)response.writeHead(status,{'Content-Type':'application/json;charset=UTF-8'});response.end(JSON.stringify({success:false,code:'SERVICE_UNAVAILABLE',message:'本地代理无法连接服务',data:null}));};
  const server=http.createServer(async(request,response)=>{
    if(closing){fail(response,503);return;}
    if(request.url.startsWith('/api/')) {
      let destination;
      try {
        destination=new URL(request.url,target);
        const pathname=decodeURIComponent(destination.pathname);
        if(pathname.includes('\\')||pathname.includes('\0')||!destination.pathname.startsWith('/api/')||!new URL(pathname,target).pathname.startsWith('/api/'))throw new Error('api-path-escape');
      }catch{response.writeHead(404);response.end();return;}
      const headers={};
      for(const name of ['content-type','content-length','cookie','accept'])if(request.headers[name])headers[name]=request.headers[name];
      const peer=http.request(destination,{method:request.method,headers,agent},backend=>{
        const resultHeaders={};for(const name of ['content-type','content-disposition','cache-control','x-trace-id','set-cookie'])if(backend.headers[name])resultHeaders[name]=backend.headers[name];
        response.writeHead(backend.statusCode,resultHeaders);backend.pipe(response);
        backend.once('aborted',()=>response.destroy());backend.once('error',()=>response.destroy());
      });
      outgoing.add(peer);const budget=['/api/ra/export/applyAnalysis','/api/ra/export/retryNotification'].includes(request.url)?15000:5000;const timer=setTimeout(()=>peer.destroy(new Error('proxy-timeout')),budget);
      peer.once('close',()=>{clearTimeout(timer);outgoing.delete(peer);});peer.once('error',()=>fail(response));
      request.once('aborted',()=>peer.destroy());response.once('close',()=>{if(!response.writableEnded)peer.destroy();});
      request.pipe(peer);return;
    }
    try {
      if(!['GET','HEAD'].includes(request.method)||!request.url.startsWith('/')||request.url.startsWith('//'))throw new Error('invalid-method-path');
      const raw=request.url.split('?')[0],pathname=decodeURIComponent(raw);
      if(pathname.includes('\\')||pathname.includes('\0')||pathname.split('/').some(part=>part.startsWith('.')))throw new Error('hidden-or-traversal');
      const file=resolve(staticRoot,`.${pathname==='/'?'/index.html':pathname}`),canonical=await realpath(file);
      if(!file.startsWith(staticRoot+sep)||!canonical.startsWith(staticRoot+sep)||!(await stat(canonical)).isFile())throw new Error('static-root-escape');
      const types={'.html':'text/html;charset=UTF-8','.js':'text/javascript;charset=UTF-8','.css':'text/css;charset=UTF-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.json':'application/json'};
      const bytes=request.method==='HEAD'?undefined:await readFile(canonical);
      response.writeHead(200,{'Content-Type':types[extname(canonical)]||'application/octet-stream','Cache-Control':'no-store'});response.end(bytes);
    }catch{response.writeHead(404);response.end();}
  });
  server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
  server.requestTimeout=5000;server.headersTimeout=5000;
  await new Promise((yes,no)=>{server.once('error',no);server.listen(Number(port),'127.0.0.1',yes);});
  let closed;
  return {port:server.address().port,close:()=>closed ||= (async()=>{
    closing=true;for(const peer of outgoing)peer.destroy(new Error('proxy-closing'));agent.destroy();
    const done=new Promise(yes=>server.close(yes));for(const socket of sockets)socket.destroy();await done;
  })()};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const argv=process.argv.slice(2),options={};
  for(let i=0;i<argv.length;i++){const key=argv[i++];if(!['--port','--upstream'].includes(key)||!argv[i])throw new Error('usage: --port loopback-port --upstream loopback-origin');options[key.slice(2)]=key==='--port'?Number(argv[i]):argv[i];}
  const server=await startDevServer(options);console.log(`RA dev: http://127.0.0.1:${server.port}`);
  const close=async()=>{await server.close();};process.once('SIGTERM',close);process.once('SIGINT',close);
}
