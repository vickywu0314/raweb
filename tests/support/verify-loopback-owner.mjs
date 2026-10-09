// 所有自动资源后置条件先观察，fallback最后执行且仅操作本检测创建/记录的对象。
import { fork } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { LoopbackOwner, pidLive, portOpen, sleep } from './loopback-owner.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const scenario=process.argv[2]==='--scenario'?process.argv[3]:null;
const valid=['normal','assert-fail','partial-start-fail','startup-never-ready','cancel','cancel-startup','suite-timeout','ignore-stop','existing-db','fixture-close','browser-cancel','browser-suite-timeout','browser-start-fail'];
if(!valid.includes(scenario)||process.argv.length!==4)throw new Error(`--scenario ${valid.join('|')}`);
const runId=`owner-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}`;
const dir=resolve(root,'.tmp/ai-cohort-web/p00b',runId);await mkdir(dir,{recursive:true});
const report={runId,started:new Date().toISOString(),command:process.argv.slice(1),scenario,tests:0,failed:0,skipped:0,exit:0,before:null,after:null};
let runner,summaryPath,stdout='',stderr='',dbOwner,fixture,trigger;const pids=new Set(),ports=new Set();
const helperReport={resources:[],http:[],events:[],toolchain:{},exit:0,cause:null};
const event=(type,fields={})=>helperReport.events.push({type,...fields});
async function waitExit(child,ms){let timer;try{return await Promise.race([new Promise((yes,no)=>{child.once('exit',(code,signal)=>yes({code,signal}));child.once('error',no);}),new Promise((_,no)=>{timer=setTimeout(()=>no(new Error('independent-owner-observation-timeout')),ms);})]);}finally{clearTimeout(timer);}}
await test(`owner:${scenario}`,async()=>{report.tests++;try{
  if(scenario==='existing-db'||scenario==='fixture-close'){
    dbOwner=new LoopbackOwner({repo:root,dir,report:helperReport,event});
    if(scenario==='fixture-close')await dbOwner.prepare();else dbOwner.mysqlEnv=await dbOwner.environment(process.env.RA_MYSQL_ENV||resolve(root,'../toolchains/mysql/env.sh'));
    await dbOwner.startMysql();
  }
  if(scenario==='fixture-close'){
    fixture=await dbOwner.fixture(['--identity=synthetic']);await dbOwner.ready(fixture,200);
    report.before={pid:fixture.child.pid,pidLive:await pidLive(fixture.child.pid),port:fixture.port,portLive:await portOpen(fixture.port)};
    await dbOwner.stop(fixture);
    report.after={pidLive:await pidLive(fixture.child.pid),portLive:await portOpen(fixture.port),beforeFallback:true};
    assert.equal(report.after.pidLive,false,'automatic fixture cleanup leaked owned JVM before fallback');assert.equal(report.after.portLive,false,'automatic fixture cleanup leaked listener before fallback');return;
  }
  const browserScenario=scenario.startsWith('browser-');
  const browserProbe={'browser-cancel':'browser-pending','browser-suite-timeout':'browser-suite-timeout','browser-start-fail':'browser-start-fail'}[scenario];
  const probe=browserScenario?browserProbe:['normal','cancel','existing-db'].includes(scenario)?null:scenario==='cancel-startup'?'startup-never-ready':scenario;
  const args=['--case',browserScenario?'instrument:browser-cohort-loopback':'instrument:cohort-loopback',...(probe?['--probe',probe]:[])];
  runner=fork(fileURLToPath(new URL('./run-integration.mjs',import.meta.url)),args,{cwd:resolve(root,'raweb'),execArgv:['--test-reporter=tap'],stdio:['ignore','pipe','pipe','ipc']});pids.add(runner.pid);
  let reportArrived;const reportReady=new Promise(yes=>{reportArrived=yes;});
  runner.stdout.on('data',c=>stdout+=c);runner.stderr.on('data',c=>stderr+=c);
  runner.on('message',message=>{
    if(message.pid&&message.type!=='existing-db-refused')pids.add(message.pid);if(message.port)ports.add(message.port);if(message.type==='report'){summaryPath=message.path;reportArrived();}
    if(message.type==='browser-pending'){
      trigger=Promise.all([pidLive(message.pid),portOpen(message.port),pidLive(runner.pid)]).then(([pid,port,node])=>{report.before={pidLive:pid,portLive:port,nodeLive:node,pageOpen:message.pageOpen,peer:message.peer,at:new Date().toISOString()};});
      if(scenario==='browser-cancel')trigger.then(()=>runner.kill('SIGTERM'));
    }
    if(message.type==='held-not-ready'||message.type==='http-ready'){
      trigger=Promise.all([pidLive(message.pid),portOpen(message.port)]).then(([pid,port])=>{report.before={pidLive:pid,portLive:port,at:new Date().toISOString()};});
      if((scenario==='cancel-startup'&&message.type==='held-not-ready')||(scenario==='cancel'&&message.type==='http-ready'))trigger.then(()=>runner.kill('SIGTERM'));
    }
  });
  const result=await Promise.race([waitExit(runner,390000),reportReady.then(()=>waitExit(runner,10000))]);if(trigger)await trigger;
  assert.ok(summaryPath,'owner writes fresh summary');const owner=JSON.parse(await readFile(summaryPath,'utf8'));report.ownerReport=summaryPath;report.owner=owner;
  for(const r of owner.resources){if(r.pid)pids.add(r.pid);if(r.port)ports.add(r.port);}
  report.after={pids:await Promise.all([...pids].map(async pid=>({pid,live:await pidLive(pid)}))),ports:await Promise.all([...ports].map(async port=>({port,live:await portOpen(port)}))),beforeFallback:true};
  assert.ok(report.after.pids.every(x=>!x.live),'owned live PID survived before fallback');
  // Existing DB belongs to this detector, not the declined integration attempt.
  const inherited=scenario==='existing-db'?43306:null;
  assert.ok(report.after.ports.filter(x=>x.port!==inherited).every(x=>!x.live),'owned listener survived before fallback');
  if(scenario==='normal'){assert.equal(result.code,0);assert.equal(owner.tests,1);assert.equal(owner.failed,0);}
  else{assert.notEqual(result.code,0);assert.notEqual(owner.exit,0);}
  if(browserScenario){
    assert.ok(owner.events.some(e=>e.type==='proxy-ready'));
    const terminal=owner.events.findIndex(e=>e.type==='terminal');
    assert.ok(!owner.events.slice(terminal+1).some(e=>['page-created','browser-ready','proxy-ready','fixture-ready'].includes(e.type)),'terminal fence disallows late progress');
    if(scenario==='browser-start-fail'){assert.ok(!owner.events.some(e=>e.type==='browser-ready'));assert.ok(owner.cause.includes('missing-chromium'));}
    else{assert.ok(owner.events.some(e=>e.type==='browser-ready'));assert.ok(owner.events.some(e=>e.type==='browser-pending'&&e.pageOpen&&e.peer==='never-completes'));assert.equal(report.before?.pageOpen,true);assert.equal(report.before?.nodeLive,true);assert.ok(owner.events.some(e=>e.type==='browser-closed'&&e.live===false));}
    if(scenario==='browser-cancel')assert.equal(owner.cause,'cancelled:SIGTERM');
    if(scenario==='browser-suite-timeout')assert.equal(owner.cause,'suite-timeout:120000ms');
  }
  if(scenario==='assert-fail'){assert.equal(owner.tests,1);assert.equal(owner.failed,1);assert.ok(owner.cause.includes('temporary wrong literal'));assert.ok(owner.http.some(x=>x.status===200));}
  if(scenario==='cancel'||scenario==='cancel-startup')assert.equal(owner.cause,'cancelled:SIGTERM');
  if(scenario==='startup-never-ready'||scenario==='cancel-startup'){
    assert.ok(!owner.events.some(e=>e.type==='proxy-ready'||e.type==='http-ready'));
    assert.ok(owner.events.some(e=>e.type==='late-ready-ignored'),'late READY is fenced after terminal selection');
  }
  if(scenario==='startup-never-ready')assert.equal(owner.cause,'fixture-ready-timeout:30000ms');
  if(scenario==='suite-timeout')assert.equal(owner.cause,'suite-timeout:120000ms');
  if(scenario==='ignore-stop')assert.ok(owner.cause.includes('forced-child-termination'));
  if(scenario==='partial-start-fail'){assert.ok(owner.events.some(e=>e.type==='schema-ready'));assert.ok(!owner.events.some(e=>e.type==='fixture-ready'));assert.deepEqual(owner.events.filter(e=>e.type==='table-released').map(e=>e.table),['ra_ai_analysis_run','patient_comorbidity','patient_follow_up_history','patient_relation_doctor','patient_basic_info']);assert.ok(owner.events.some(e=>e.type==='closed'&&e.clean===true));}
  if(scenario==='existing-db'){
    report.existingBeforeFallback={pid:dbOwner.db.child.pid,pidLive:await pidLive(dbOwner.db.child.pid),portLive:await portOpen(43306)};
    assert.equal(owner.cause,'existing-mysql-refuse-ownership');assert.equal(owner.tests,0);assert.equal(report.existingBeforeFallback.pidLive,true);assert.equal(report.existingBeforeFallback.portLive,true);assert.ok(!owner.resources.some(r=>r.key==='mysqld'));
  }else if(scenario!=='partial-start-fail'){assert.equal(report.before?.pidLive,true);assert.equal(report.before?.portLive,true);}
}catch(e){report.failed++;report.exit=1;report.error=e.stack;
  if(summaryPath&&!report.owner){report.ownerReport=summaryPath;report.owner=JSON.parse(await readFile(summaryPath,'utf8'));for(const r of report.owner.resources){if(r.pid)pids.add(r.pid);if(r.port)ports.add(r.port);}}
  if(!report.after)report.after={pids:await Promise.all([...pids].map(async pid=>({pid,live:await pidLive(pid)}))),ports:await Promise.all([...ports].map(async port=>({port,live:await portOpen(port)}))),beforeFallback:true};
  throw e;}});
try {
  // Fallback is deliberately after all assertions and does not substantiate the guarantee.
  if(fixture&&!fixture.ended){fixture.child.stdin.write('STOP\n');fixture.child.stdin.end();await fixture.finished;}
  for(const pid of pids)if(await pidLive(pid)){
    try{process.kill(pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')throw e;}
    const deadline=Date.now()+2000;while(await pidLive(pid)&&Date.now()<deadline)await sleep(25);
    if(await pidLive(pid)){try{process.kill(pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')throw e;}}
  }
  if(dbOwner)await dbOwner.close();
}finally{
  await writeFile(`${dir}/stdout.log`,stdout);await writeFile(`${dir}/stderr.log`,stderr);report.helper=helperReport;report.ended=new Date().toISOString();
  await writeFile(`${dir}/summary.json`,JSON.stringify(report,null,2)+'\n');console.log(`OWNER_REPORT ${dir}/summary.json`);process.exitCode=report.exit;
}
