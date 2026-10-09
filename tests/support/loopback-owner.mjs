import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import http from 'node:http';
import net from 'node:net';

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
    Object.assign(this,{repo,dir,report,event});this.controller=new AbortController();this.children=[];this.proxies=[];this.closed=false;
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
    this.report.toolchain={node:process.version,java:await this.javaVersion(),javaHome:this.javaEnv.JAVA_HOME,mavenHome:this.javaEnv.MAVEN_HOME};
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
    let buffer='';r.ready=new Promise((yes,no)=>{
      r.child.stdout.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);
        if(line.startsWith('RA_WEB_FIXTURE_EVENT ')){const data=JSON.parse(line.slice(21));r.events.push(data);if(data.type==='held-not-ready'){r.port=data.port;this.report.resources.find(x=>x.pid===r.child.pid).port=data.port;}this.event('fixture-event',{pid:r.child.pid,...data});}
        if(line.startsWith('RA_WEB_FIXTURE_READY ')){const data=JSON.parse(line.slice(21));r.port=data.port;this.report.resources.find(x=>x.pid===r.child.pid).port=data.port;
          if(!this.controller.signal.aborted&&!this.closed){this.event('fixture-ready',{pid:r.child.pid,...data});yes(data);}else this.event('late-ready-ignored',{pid:r.child.pid});}
      }});r.finished.then(result=>no(new Error(`fixture-before-ready:${result.code??result.signal}`)));
    });r.ready.catch(()=>{});return r;
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
      if(request.url==='/'&&request.method==='GET'){response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});response.end('<!doctype html><title>loopback instrument</title>');return;}
      if(request.url!=='/api/ra/ai/cohort'||request.method!=='POST'){response.writeHead(404);response.end();return;}
      try{const chunks=[];for await(const c of request)chunks.push(c);const backend=await fetch(`http://127.0.0.1:${r.port}${request.url}`,{method:'POST',headers:{'Content-Type':'application/json','X-Doctor-Id':request.headers['x-doctor-id']||'202'},body:Buffer.concat(chunks),signal:AbortSignal.any([this.controller.signal,AbortSignal.timeout(5000)])});
        response.writeHead(backend.status,{'Content-Type':backend.headers.get('content-type'),'X-Trace-Id':backend.headers.get('x-trace-id')});response.end(Buffer.from(await backend.arrayBuffer()));
      }catch(e){response.writeHead(502);response.end();}
    });this.proxies.push(server);
    await this.bounded(new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);}),5000,'proxy-start');
    this.controller.signal.throwIfAborted();const port=server.address().port;this.report.resources.push({key:'proxy',port});this.event('proxy-ready',{port,backendPort:r.port});return port;
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
    if(this.closed)return;this.closed=true;const errors=[];
    for(const server of this.proxies)try{const port=server.address()?.port;server.closeAllConnections();await new Promise((yes,no)=>server.close(e=>e?no(e):yes()));if(port&&await portOpen(port))throw new Error('proxy-listener-leaked');this.event('proxy-closed',{port});}catch(e){errors.push(e.message);}
    for(const r of [...this.children].reverse())if(r!==this.db)try{await this.stop(r);}catch(e){errors.push(e.message);}
    try{await this.stop(this.db,{database:true});}catch(e){errors.push(e.message);}
    if(errors.length){this.report.cleanupErrors=errors;this.report.cause ||= `cleanup-failed:${errors[0]}`;this.report.exit=1;}
    this.event('owner-closed',{errors});
  }
}
