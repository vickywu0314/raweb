import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile, realpath, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { chromium } from '@playwright/test';
import { browserLoopbackScenario } from '../instrument/loopback-browser.mjs';

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function portOpen(port) {
  return new Promise((yes, no) => {
    const socket = net.connect({host:'127.0.0.1',port});
    socket.once('connect',()=>{socket.destroy();yes(true);});
    socket.once('error',e=>{socket.destroy();if(e.code==='ECONNREFUSED')yes(false);else no(e);});
    socket.setTimeout(1000,()=>{socket.destroy();no(new Error('port-observation-timeout'));});
  });
}
export async function pidLive(pid) {
  try { const s=await readFile(`/proc/${pid}/stat`,'utf8');return s.slice(s.lastIndexOf(')')+2).split(' ')[0]!=='Z'; }
  catch(e){if(e.code==='ENOENT')return false;throw e;}
}
export class LoopbackOwner {
  constructor({repo,dir,report,event}) {
    Object.assign(this,{repo,dir,report,event});this.controller=new AbortController();this.children=[];this.proxies=[];this.closed=false;this.browserRecords=[];
  }
  fail(cause) {if(!this.controller.signal.aborted){this.report.cause ||= cause;this.controller.abort(new Error(cause));this.event('terminal',{cause});}}
  async bounded(promise,ms,label) {
    this.controller.signal.throwIfAborted();let timer,abort;
    try {return await Promise.race([promise,new Promise((_,no)=>{timer=setTimeout(()=>{this.fail(`${label}-timeout:${ms}ms`);no(this.controller.signal.reason);},ms);abort=()=>no(this.controller.signal.reason);this.controller.signal.addEventListener('abort',abort,{once:true});})]);}
    finally {clearTimeout(timer);if(abort)this.controller.signal.removeEventListener('abort',abort);}
  }
  child(command,args,options,key) {
    this.controller.signal.throwIfAborted();if(this.closed)throw new Error('owner-already-closed');
    const child=spawn(command,args,{...options,detached:true,stdio:['pipe','pipe','pipe',...(options?.ipc?['ipc']:[])]});
    delete options?.ipc;
    const record={child,key,port:null,stdout:'',stderr:'',events:[],ended:false};this.children.push(record);
    record.finished=new Promise((yes)=>{child.once('error',e=>{record.ended=true;yes({code:1,error:e.message});});child.once('close',(code,signal)=>{record.ended=true;yes({code,signal});});});
    child.stdout.on('data',chunk=>{record.stdout+=chunk;});child.stderr.on('data',chunk=>{record.stderr+=chunk;});
    this.report.resources.push({key,pid:child.pid});this.event('child-started',{key,pid:child.pid});return record;
  }
  async command(command,args,options,key,ms) {
    const r=this.child(command,args,options,key);r.child.stdin.end();
    const result=await this.bounded(r.finished,ms,key);if(key!=='environment')await this.save(r);
    if(result.code!==0)throw new Error(`${key}-failed:${result.code??result.signal}`);
    return r.stdout;
  }
  async save(r){await writeFile(`${this.dir}/${r.key}-${r.child.pid}.stdout.log`,r.stdout);await writeFile(`${this.dir}/${r.key}-${r.child.pid}.stderr.log`,r.stderr);}
  async environment(script) {
    // Explicit local environment scripts; never write or print the returned credentials.
    const raw=await this.command('bash',['-c','source "$1"; "$2" -e "process.stdout.write(JSON.stringify(process.env))"','loopback',script,process.execPath],{cwd:this.repo},'environment',5000);
    const env=JSON.parse(raw);const r=this.children[this.children.length-1];r.stdout='';r.stderr='';return env;
  }
  async prepare() {
    const tools=resolve(this.repo,'../toolchains');
    this.javaEnv=await this.environment(process.env.RA_JAVA_ENV||`${tools}/env.sh`);
    this.mysqlEnv=await this.environment(process.env.RA_MYSQL_ENV||`${tools}/mysql/env.sh`);
    const source=resolve(this.repo,'raapi');this.classpathFile=`${this.dir}/java-test-classpath.txt`;
    await this.command('mvn',['-B','test-compile'],{cwd:source,env:this.javaEnv},'test-compile',120000);
    await this.command('mvn',['-B','org.apache.maven.plugins:maven-dependency-plugin:3.8.1:build-classpath','-DincludeScope=test',`-Dmdep.outputFile=${this.classpathFile}`],{cwd:source,env:this.javaEnv},'build-classpath',120000);
    this.classpath=`${source}/target/test-classes:${source}/target/classes:${(await readFile(this.classpathFile,'utf8')).trim()}`;
    if(!this.classpath.includes('tomcat-embed-core'))throw new Error('test-classpath-missing-provided-tomcat');
    this.report.toolchain={node:process.version,java:await this.javaVersion(),maven:(await this.command('mvn',['-version'],{cwd:source,env:this.javaEnv},'maven-version',5000)).trim(),javaHome:this.javaEnv.JAVA_HOME,mavenHome:this.javaEnv.MAVEN_HOME};
    this.event('prepared',{providedTomcat:true});
  }
  async javaVersion() {await this.command(`${this.javaEnv.JAVA_HOME}/bin/java`,['-version'],{env:this.javaEnv},'java-version',5000);return this.children[this.children.length-1].stderr.trim();}
  async mysqlQuery(sql) {
    const env={...this.mysqlEnv,MYSQL_PWD:this.mysqlEnv.RA_TEST_MYSQL_PASSWORD};
    return await this.command(`${env.MYSQL_HOME}/bin/mysql`,['--no-defaults','--protocol=TCP','--host=127.0.0.1','--port=43306',`--user=${env.RA_TEST_MYSQL_USER}`,'--silent','--skip-column-names','--execute',sql],{env,cwd:this.repo},'mysql-query',5000);
  }
  async startMysql() {
    const pidFile=`${this.mysqlEnv.RA_MYSQL_HOME}/run/mysql.pid`;
    let pid;try{pid=Number((await readFile(pidFile,'utf8')).trim());}catch(e){if(e.code!=='ENOENT')throw e;}
    if((pid&&await pidLive(pid))||await portOpen(43306)){this.event('existing-db-refused',{pid:pid||null,port:43306});throw new Error('existing-mysql-refuse-ownership');}
    const env=this.mysqlEnv;
    this.db=this.child(`${env.MYSQL_HOME}/bin/mysqld`,[`--defaults-file=${env.RA_MYSQL_HOME}/my.cnf`,`--init-file=${env.RA_MYSQL_HOME}/run/bootstrap.sql`],{env,cwd:this.repo},'mysqld');
    this.db.port=43306;
    await this.bounded((async()=>{
      while(!this.db.ended){if(await portOpen(43306)){
        const recordedPid=Number((await readFile(pidFile,'utf8')).trim());if(recordedPid!==this.db.child.pid)throw new Error('mysql-child-identity-mismatch');
        const version=(await this.mysqlQuery('SELECT VERSION()')).trim();this.report.toolchain.mysql=version;this.event('database-ready',{pid:this.db.child.pid,port:43306,version});return;
      }await sleep(100);this.controller.signal.throwIfAborted();}throw new Error('mysqld-start-failed');
    })(),30000,'database-start');
  }
  async fixture(args=[],envOverrides={}) {
    const base=`${this.dir}/tomcat-${this.children.length}`;await mkdir(base,{recursive:true});
    const env={...this.javaEnv,...this.mysqlEnv,RA_WEB_FIXTURE_DIR:base,...envOverrides};
    const r=this.child(`${this.javaEnv.JAVA_HOME}/bin/java`,['-cp',this.classpath,'com.wenwen.ai.cohort.WebLoopbackApiFixture',...args],{env,cwd:this.repo},'fixture');
    r.scenario=args.includes('--scenario=p05-chat')?'p05-chat':args.includes('--scenario=p03-sources')?'p03-sources':args.includes('--scenario=p01-overview')?'p01-overview':args.includes('--scenario=p00-trusted')?'p00-trusted':args.includes('--scenario=p07-composition')?'p07-composition':args.includes('--scenario=p07-composition-time')?'p07-composition-time':args.includes('--scenario=p07-entry')?'p07-entry':args.includes('--scenario=p06-application-replay')?'p06-application-replay':args.includes('--scenario=p06-application-retry')?'p06-application-retry':args.includes('--scenario=p06-application-unknown')?'p06-application-unknown':args.includes('--scenario=p06-comparison')?'p06-comparison':args.includes('--scenario=p06-cohort')?'p06-cohort':args.includes('--scenario=p05-apply-rule')?'p05-apply-rule':args.includes('--scenario=p05-apply-safety')?'p05-apply-safety':args.includes('--scenario=p05-rule')?'p05-rule':args.includes('--scenario=p05-safety')?'p05-safety':args.includes('--scenario=p04')?'p04':args.includes('--scenario=p03')?'p03':args.includes('--scenario=p01b')?'p01b':'default';
    let buffer='';r.ready=new Promise((yes,no)=>{
      r.child.stdout.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);
        if(line.startsWith('RA_WEB_FIXTURE_EVENT ')){const data=JSON.parse(line.slice(21));r.events.push(data);if(data.type==='held-not-ready'){r.port=data.port;this.report.resources.find(x=>x.pid===r.child.pid).port=data.port;}this.event('fixture-event',{pid:r.child.pid,...data});}
        if(line.startsWith('RA_WEB_FIXTURE_READY ')){const data=JSON.parse(line.slice(21));r.port=data.port;this.report.resources.find(x=>x.pid===r.child.pid).port=data.port;
          if(!this.controller.signal.aborted&&!this.closed){this.event('fixture-ready',{pid:r.child.pid,...data});yes(data);}else this.event('late-ready-ignored',{pid:r.child.pid});}
      }});r.finished.then(result=>no(new Error(`fixture-before-ready:${result.code??result.signal}`)));
    });r.ready.catch(()=>{});return r;
  }
  async control(r,command) {
    this.controller.signal.throwIfAborted();
    if(this.closed||r.ended||!this.children.includes(r)||r.key!=='fixture'||!['p05-chat','p07-composition','p07-composition-time','p01b','p03','p04','p05-safety','p05-apply-safety','p06-application-replay','p06-application-retry','p06-application-unknown'].includes(r.scenario)||!r.port)throw new Error('control-requires-live-owned-p01b-p03-or-p04-fixture');
    if(!(r.scenario==='p05-chat'?['CHAT_PATIENT_SEED','CHAT_VISIT','CHAT_COURSE','CHAT_AGGREGATE']:['p07-composition','p07-composition-time'].includes(r.scenario)?['REBUILD_GLOBAL_OFF','REBUILD_BOTH_OFF','REBUILD_FILE_OFF','REBUILD_ENABLED','IDENTITY_ANONYMOUS','IDENTITY_101','SMTP_SUCCESS','SMTP_UNKNOWN','SMTP_ASSERT','SNAPSHOT_ROWS','CLOCK_DAY_BEFORE','CLOCK_DAY_AFTER','CLOCK_EXACT_EXPIRY','ADVANCE_TTL','SOURCE_SCOPE_CHANGE']:r.scenario?.startsWith('p06-application-')?['SMTP_ASSERT',...(r.scenario==='p06-application-retry'?['SMTP_SUCCESS']:[])]:['p05-safety','p05-apply-safety'].includes(r.scenario)?['PARSE_PEER_ASSERT']:['IDENTITY_101','IDENTITY_202','IDENTITY_ANONYMOUS','ADVANCE_TTL']).includes(command))throw new Error('unknown-fixture-control');
    if(r.controlFlight)throw new Error('fixture-control-already-pending');
    const seq=(r.controlSeq||0)+1;r.controlSeq=seq;r.controlFlight=seq;let buffer='',receive;
    const ack=new Promise((yes,no)=>{
      receive=chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(!line.startsWith('RA_WEB_FIXTURE_EVENT '))continue;
        let event;try{event=JSON.parse(line.slice(21));}catch{no(new Error('invalid-fixture-control-ack'));return;}
        if(event.type==='control-ack'&&event.seq===seq){if(event.command!==command||event.accepted!==true)no(new Error('fixture-control-rejected'));else yes(event);}
      }};
      r.child.stdout.on('data',receive);r.finished.then(()=>no(new Error('fixture-exited-before-control-ack')));
      this.controller.signal.throwIfAborted();if(this.closed||r.ended){no(new Error('control-after-owner-fence'));return;}
      r.child.stdin.write(`CONTROL ${seq} ${command}\n`,error=>{if(error)no(error);});
    });
    try{return await this.bounded(ack,5000,'fixture-control');}
    finally{r.child.stdout.removeListener('data',receive);if(r.controlFlight===seq)r.controlFlight=null;}
  }
  async ready(r,status) {
    const deadline=Date.now()+30000;const data=await this.bounded(r.ready,30000,'fixture-ready');
    if(data.host!=='127.0.0.1'||data.fixtureVersion!=='p00b-v1'||!Number.isInteger(data.port)||data.port<=0)throw new Error('invalid-ready-protocol');
    const response=await this.post(r.port,{},r,deadline);if(response.status!==status)throw new Error(`ready-http-status:${response.status}`);
    const expected=status===200?'200':status===401?'UNAUTHENTICATED':'SERVICE_UNAVAILABLE';
    if(response.json.code!==expected||response.json.success!==(status===200)||(status!==200&&response.json.data!==null))throw new Error('ready-http-envelope');
    this.event('http-ready',{pid:r.child.pid,port:r.port,status});return response;
  }
  async post(port,body={},r=null,deadline=Infinity) {
    this.controller.signal.throwIfAborted();if(Date.now()>=deadline)throw new Error('fixture-ready-http-timeout:30000ms');const count=r?.events.filter(e=>e.type==='http-observation').length||0;
    const response=await fetch(`http://127.0.0.1:${port}/api/ra/ai/cohort`,{method:'POST',headers:{'Content-Type':'application/json','X-Doctor-Id':'202'},body:JSON.stringify(body),signal:AbortSignal.any([this.controller.signal,AbortSignal.timeout(Math.max(1,Math.min(5000,deadline-Date.now())))])});
    const text=await response.text();if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('non-json-http');
    const result={status:response.status,trace:response.headers.get('x-trace-id'),json:JSON.parse(text),port};
    if(r)await this.bounded((async()=>{while(r.events.filter(e=>e.type==='http-observation').length<=count){if(r.ended)throw new Error('fixture-ended-before-observation');await sleep(5);this.controller.signal.throwIfAborted();}})(),Math.max(1,Math.min(5000,deadline-Date.now())),'http-observation');
    this.report.http.push(result);this.event('http-observed',{port,status:response.status,trace:result.trace});return result;
  }
  async proxy(r) {
    this.controller.signal.throwIfAborted();if(this.closed)throw new Error('owner-already-closed');
    const server=http.createServer(async(request,response)=>{
      if(['GET','HEAD'].includes(request.method)){
        try {
          if(!request.url.startsWith('/')||request.url.startsWith('//'))throw new Error('invalid-static-path');
          const pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname);
          if(pathname.split('/').some(part=>part.startsWith('.'))||pathname.includes('\\'))throw new Error('hidden-or-traversal');
          const root=await realpath(resolve(this.repo,'raweb')),file=resolve(root,`.${pathname==='/'?'/ai-cohort.html':pathname}`);
          const canonical=await realpath(file);if(!file.startsWith(root+sep)||!canonical.startsWith(root+sep))throw new Error('static-root-escape');
          if(!(await stat(canonical)).isFile())throw new Error('not-static-file');
          const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.ico':'image/x-icon'};
          response.writeHead(200,{'Content-Type':types[extname(canonical)]||'application/octet-stream','Cache-Control':'no-store'});response.end(request.method==='HEAD'?undefined:await readFile(canonical));
        }catch{response.writeHead(404);response.end();}return;
      }
      const paths=r.scenario==='p05-chat'?['/api/ra/ai/patientDetail','/api/ra/ai/visitDetail','/api/ra/ai/patientInsight','/api/ra/ai/patientSearch','/api/ra/ai/chat','/api/ra/ai/cohort','/api/ra/ai/cohortPatients','/api/ra/test/session','/api/ra/test/logout']:['p01-overview','p03-sources'].includes(r.scenario)?['/api/ra/ai/overview','/api/ra/ai/cohort','/api/ra/ai/cohortPatients','/api/ra/test/session','/api/ra/test/logout',...(r.scenario==='p03-sources'?['/api/ra/ai/patientInsight','/api/ra/ai/patientDetail','/api/ra/ai/visitDetail','/api/ra/ai/resolveEntry']:[])]:r.scenario==='p00-trusted'?['/api/ra/ai/patientSearch','/api/ra/ai/overview','/api/ra/ai/cohort','/api/ra/ai/cohortPatients','/api/ra/ai/patientDetail','/api/ra/ai/visitDetail','/api/ra/ai/patientSensitive','/api/ra/ai/patientAuditLogs','/api/ra/test/session','/api/ra/test/logout']:['p07-composition','p07-composition-time'].includes(r.scenario)?['ai/cohort','ai/cohortPatients','ai/resolveEntry','ai/parse','ai/applyParse','ai/compare','ai/compareResult','cohort/save','cohort/list','cohort/open','cohort/rename','cohort/delete','export/xlsx','export/applyAnalysis','export/retryNotification'].map(path=>'/api/ra/'+path):r.scenario==='p07-entry'?['/api/ra/ai/cohort','/api/ra/ai/cohortPatients','/api/ra/ai/parse','/api/ra/ai/applyParse','/api/ra/ai/resolveEntry']:r.scenario?.startsWith('p06-application-')?['/api/ra/ai/cohort','/api/ra/ai/cohortPatients','/api/ra/export/xlsx','/api/ra/export/applyAnalysis','/api/ra/export/retryNotification']:r.scenario==='p06-comparison'?['/api/ra/ai/cohort','/api/ra/ai/cohortPatients','/api/ra/cohort/save','/api/ra/cohort/list','/api/ra/ai/compare','/api/ra/ai/compareResult','/api/ra/export/xlsx']:['/api/ra/ai/cohort','/api/ra/ai/cohortPatients','/api/ra/cohort/save','/api/ra/cohort/list','/api/ra/cohort/open',...(['p03','p04'].includes(r.scenario)?['/api/ra/cohort/rename','/api/ra/cohort/delete']:[]),...(r.scenario==='p06-cohort'?['/api/ra/export/xlsx']:[]),...(r.scenario==='p04'?['/api/ra/ai/compare','/api/ra/ai/compareResult']:[]),...(['p05-rule','p05-safety','p05-apply-rule','p05-apply-safety'].includes(r.scenario)?['/api/ra/ai/parse']:[]),...(['p05-rule','p05-safety','p05-apply-rule','p05-apply-safety'].includes(r.scenario)?['/api/ra/ai/applyParse']:[])];
      if(!paths.includes(request.url)||request.method!=='POST'){response.writeHead(404);response.end();return;}
      try{const chunks=[];for await(const c of request)chunks.push(c);const backend=await fetch(`http://127.0.0.1:${r.port}${request.url}`,{method:'POST',headers:{'Content-Type':'application/json','X-Doctor-Id':request.headers['x-doctor-id']||'202',...(['p00-trusted','p01-overview','p03-sources','p05-chat'].includes(r.scenario)&&request.headers.cookie?{Cookie:request.headers.cookie}:{})},body:Buffer.concat(chunks),signal:AbortSignal.any([this.controller.signal,AbortSignal.timeout(['/api/ra/export/applyAnalysis','/api/ra/export/retryNotification'].includes(request.url)?15000:5000)])});
        const headers={};for(const name of ['content-type','content-disposition','cache-control','x-trace-id'])if(backend.headers.has(name))headers[name]=backend.headers.get(name);if(['p00-trusted','p01-overview','p03-sources','p05-chat'].includes(r.scenario)&&backend.headers.has('set-cookie'))headers['set-cookie']=backend.headers.getSetCookie();const bytes=Buffer.from(await backend.arrayBuffer());
        if(r.scenario?.startsWith('p06-application-')&&['/api/ra/export/applyAnalysis','/api/ra/export/retryNotification'].includes(request.url)){let data;try{data=JSON.parse(bytes.toString()).data;}catch{}const lost=request.url==='/api/ra/export/applyAnalysis'&&r.applicationDropResponseOnce===true;r.applicationDropResponseOnce=false;this.event('application-proxy-observed',{path:request.url,status:backend.status,completeBody:true,applicationId:data?.applicationId||null,mailStatus:data?.notification?.mailStatus||null,lostResponse:lost});if(lost){response.writeHead(backend.status,{...headers,'Content-Length':String(bytes.length)});response.flushHeaders();response.write(bytes.subarray(0,1),()=>response.destroy());return;}}
        response.writeHead(backend.status,headers);response.end(bytes);
      }catch(e){response.writeHead(502);response.end();}
    });this.proxies.push(server);
    await this.bounded(new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);}),5000,'proxy-start');
    this.controller.signal.throwIfAborted();const port=server.address().port;this.report.resources.push({key:'proxy',port});this.event('proxy-ready',{port,backendPort:r.port});return port;
  }
  async browserScenario(port,identity,probe,scenario=browserLoopbackScenario) {
    this.controller.signal.throwIfAborted();if(this.closed)throw new Error('owner-already-closed');
    const record={server:null,browser:null,context:null,pid:null};this.browserRecords.push(record);
    record.launching=chromium.launchServer({executablePath:probe==='browser-start-fail'?`${this.dir}/missing-chromium`:chromium.executablePath(),headless:true,chromiumSandbox:true,timeout:30000});
    record.launching.catch(()=>{});
    record.acquiring=(async()=>{
      record.server=await record.launching;
      record.pid=record.server.process().pid;this.report.resources.push({key:'browser',pid:record.pid});
      if(this.closed||this.controller.signal.aborted){this.event('late-browser-fenced',{pid:record.pid});throw this.controller.signal.reason||new Error('owner-already-closed');}
      record.browser=await chromium.connect(record.server.wsEndpoint(),{timeout:5000});
      this.controller.signal.throwIfAborted();if(this.closed)throw new Error('owner-already-closed');
      record.context=await record.browser.newContext({serviceWorkers:'block'});
      this.controller.signal.throwIfAborted();if(this.closed)throw new Error('owner-already-closed');
      this.report.browser.push({pid:record.pid,version:record.browser.version(),executablePath:chromium.executablePath(),chromiumSandbox:true});
      this.event('browser-ready',{pid:record.pid,port,version:record.browser.version()});
      return record.context;
    })();record.acquiring.catch(()=>{});
    const context=await this.bounded(record.acquiring,30000,'browser-start');
    return this.bounded(scenario(context,port,identity,this,probe,record.pid),['browser-pending','browser-suite-timeout'].includes(probe)?120000:30000,'browser-case');
  }
  async cleanupWait(promise,ms,label) {
    let timer;try{return await Promise.race([promise,new Promise((_,no)=>{timer=setTimeout(()=>no(new Error(`${label}-timeout:${ms}ms`)),ms);})]);}finally{clearTimeout(timer);}
  }
  async closeBrowser(record) {
    // If launch resolves late, close that exact server before waiting on its context RPC.
    try{record.server ||= await this.cleanupWait(record.launching,31000,'browser-launch-settle');}catch(e){if(!record.server){if(e.message.startsWith('browser-launch-settle-timeout:'))throw e;return;}}
    record.pid ||= record.server.process().pid;const errors=[];let forced=false;
    if(record.context)try{await this.cleanupWait(record.context.close(),5000,'context-close');this.event('context-closed',{pid:record.pid});}catch(e){errors.push(e.message);}
    if(record.browser)try{await this.cleanupWait(record.browser.close(),5000,'browser-disconnect');}catch(e){errors.push(e.message);}
    try{await this.cleanupWait(record.server.close(),5000,'browser-close');}catch(e){errors.push(e.message);forced=true;try{await this.cleanupWait(record.server.kill(),2000,'browser-kill');}catch(k){errors.push(k.message);}}
    try{await this.cleanupWait(record.acquiring.catch(()=>{}),2000,'browser-acquisition-settle');}catch(e){errors.push(e.message);}
    const live=await pidLive(record.pid);this.event('browser-closed',{pid:record.pid,live,forced});if(live)errors.push('browser-pid-leaked');
    if(errors.length)throw new Error(`browser-cleanup-failed:${errors.join(';')}`);
  }
  signal(r,signal) {
    if(['test-compile','build-classpath','environment'].includes(r.key)) {
      try {process.kill(-r.child.pid,signal);}catch(e){if(e.code!=='ESRCH')throw e;}
    }else r.child.kill(signal);
  }
  async stop(r,{database=false}={}) {
    if(!r)return;let forced=false;
    if(!r.ended){if(database)this.signal(r,'SIGTERM');else{r.child.stdin.write('STOP\n');r.child.stdin.end();}
      const wait=async(ms)=>{let timer;try{return await Promise.race([r.finished.then(()=>true),new Promise(yes=>{timer=setTimeout(()=>yes(false),ms);})]);}finally{clearTimeout(timer);}};
      if(database){if(!await wait(28000)){forced=true;this.signal(r,'SIGKILL');if(!await wait(2000))throw new Error('database-kill-timeout');}}
      else if(!await wait(5000)){forced=true;this.signal(r,'SIGTERM');if(!await wait(2000)){this.signal(r,'SIGKILL');if(!await wait(2000))throw new Error('child-kill-timeout');}}
    }
    await this.save(r);
    const live=await pidLive(r.child.pid),listening=r.port?await portOpen(r.port):false;
    this.event('child-closed',{key:r.key,pid:r.child.pid,port:r.port,live,listening,forced});
    if(live||listening)throw new Error('owned-child-or-port-leaked');
    if(forced)throw new Error('forced-child-termination');
    if(r.events.some(e=>e.type==='closed'&&e.clean===false))throw new Error('fixture-cleanup-failed');
  }
  async close() {
    if(this.closed)return;this.closed=true;const errors=[...(this.report.cleanupErrors||[])];
    for(const record of this.browserRecords)try{await this.closeBrowser(record);}catch(e){errors.push(e.message);}
    for(const server of this.proxies)try{const port=server.address()?.port;server.closeAllConnections();await new Promise((yes,no)=>server.close(e=>e?no(e):yes()));if(port&&await portOpen(port))throw new Error('proxy-listener-leaked');this.event('proxy-closed',{port});}catch(e){errors.push(e.message);}
    for(const r of [...this.children].reverse())if(r!==this.db)try{await this.stop(r);}catch(e){errors.push(e.message);}
    try{await this.stop(this.db,{database:true});}catch(e){errors.push(e.message);}
    if(errors.length){this.report.cleanupErrors=errors;this.report.cause ||= `cleanup-failed:${errors[0]}`;this.report.exit=1;}
    this.event('owner-closed',{errors});
  }
}
