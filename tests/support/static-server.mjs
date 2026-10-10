import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(process.argv[2]);
const probe = process.argv[3];
const fileCase=process.argv[4];
const fileControl=['cohort:export-binary-errors','cohort:export-terminal','cohort:export-comparison'].includes(fileCase);
let fileMode='hold',filePending=null,fileRequests=0;
if (probe === 'server-start-fail') throw new Error('Controlled server startup failure');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if(fileControl&&pathname==='/__p06/file-status'&&req.method==='GET'){
      res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({mode:fileMode,requests:fileRequests,pending:Boolean(filePending&&!filePending.res.destroyed),headers:Boolean(filePending?.res.headersSent)}));return;
    }
    if(fileControl&&pathname==='/__p06/file-mode'&&req.method==='POST'){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const data=JSON.parse(Buffer.concat(chunks));
      if(!['hold','partial','never','complete'].includes(data.mode)||filePending&&!filePending.res.destroyed){res.writeHead(409).end();return;}
      filePending=null;fileMode=data.mode;res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({mode:fileMode}));return;
    }
    if(fileControl&&pathname==='/__p06/file-release'&&req.method==='POST'){
      const pending=filePending;filePending=null;
      res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({released:Boolean(pending)}));
      if(pending&&!pending.res.destroyed){if(pending.mode==='partial')pending.res.destroy();else{if(!pending.res.headersSent)pending.res.writeHead(200,pending.headers);pending.res.end(pending.bytes.subarray(pending.sent));}}return;
    }
    if(fileControl&&pathname==='/api/ra/export/xlsx'&&req.method==='POST'){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const command=JSON.parse(Buffer.concat(chunks));if(command.source!=='COHORT'&&!(fileCase==='cohort:export-comparison'&&command.source==='COMPARE')){res.writeHead(400).end();return;}
      if(filePending&&!filePending.res.destroyed){res.writeHead(409).end();return;}
      const bytes=await readFile(resolve(root,'tests/fixtures/cohort-export.xlsx'));
      const headers={'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Length':bytes.length+(fileMode==='partial'?64:0),'Content-Disposition':'attachment; filename="controlled-cohort.xlsx"','Cache-Control':'no-store','X-Trace-Id':'trace-controlled-file'};
      fileRequests++;
      if(fileMode==='complete'){res.writeHead(200,headers);res.end(bytes);return;}
      const sent=fileMode==='never'?0:16;filePending={res,bytes,headers,sent,mode:fileMode};
      if(fileMode!=='never'){res.writeHead(200,headers);res.flushHeaders();res.write(bytes.subarray(0,sent));}
      return;
    }
    const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + sep) || pathname.split('/').some(s => s.startsWith('.')) || !['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(403).end(); return;
    }
    if (!(await stat(file)).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch { res.writeHead(404).end(); }
});
server.listen(0, '127.0.0.1', () => {
  if (probe !== 'startup-never-ready') process.send?.({ type: 'ready', url: `http://127.0.0.1:${server.address().port}`, pid: process.pid });
  else process.send?.({ type: 'held-not-ready', port: server.address().port, pid: process.pid });
});
process.on('SIGTERM', () => { server.closeAllConnections(); server.close(() => process.exit(0)); });
