import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { LoopbackOwner } from './loopback-owner.mjs';
import { cases, browserCases, browserRegistry } from '../instrument/loopback-cases.mjs';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const runId=`${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}`;
const dir=resolve(repo,'.tmp/ai-cohort-web/p00b',runId);await mkdir(dir,{recursive:true});
let tap='';const stdout=process.stdout.write.bind(process.stdout);process.stdout.write=(chunk,...args)=>{tap+=chunk.toString();return stdout(chunk,...args);};
process.on('exit',()=>writeFileSync(`${dir}/node.tap`,tap));
const report={runId,started:new Date().toISOString(),ended:null,command:process.argv.slice(1),case:null,probe:null,tests:0,failed:0,skipped:0,exit:1,cause:null,resources:[],events:[],http:[],preparation:null,suite:null,selectedIds:[],expectedIds:[],executedIds:[],browser:[]};
const event=(type,fields={})=>{const e={type,at:new Date().toISOString(),...fields};report.events.push(e);process.send?.(e);};
const owner=new LoopbackOwner({repo,dir,report,event});
const onTerm=()=>owner.fail('cancelled:SIGTERM'),onInt=()=>owner.fail('cancelled:SIGINT');process.on('SIGTERM',onTerm);process.on('SIGINT',onInt);
let suiteTimer;
try {
  const argv=process.argv.slice(2);let selection,probe;
  for(let i=0;i<argv.length;i++){if(!['--case','--probe'].includes(argv[i])||!argv[i+1])throw new Error('usage: --case exact-id --probe assert-fail');const key=argv[i++];if(key==='--case'){if(selection)throw new Error('duplicate-case');selection=argv[i];}else{if(probe)throw new Error('duplicate-probe');probe=argv[i];}}
  report.case=selection||'*';report.probe=probe||null;
  const registry={...cases,...browserRegistry};
  if(selection&&!Object.hasOwn(registry,selection)){report.exit=2;throw new Error(`no-match:${selection}`);}
  if(probe&&!['assert-fail','startup-never-ready','ignore-stop','partial-start-fail','suite-timeout','browser-start-fail','browser-pending','browser-suite-timeout'].includes(probe))throw new Error('unknown-probe');
  if(probe&&selection!=='instrument:cohort-loopback'&&!browserCases.includes(selection))throw new Error('probe-requires-cohort-case');
  if(probe?.startsWith('browser-')&&!browserCases.includes(selection))throw new Error('browser-probe-requires-browser-case');
  report.selectedIds=selection?[selection]:Object.keys(cases);report.expectedIds=[...report.selectedIds];
  report.preparation={started:new Date().toISOString()};await owner.prepare();await owner.startMysql();report.preparation.ended=new Date().toISOString();
  report.suite={started:new Date().toISOString()};suiteTimer=setTimeout(()=>owner.fail('suite-timeout:120000ms'),120000);
  for(const id of report.selectedIds){
    owner.controller.signal.throwIfAborted();await test(id,async()=>{report.tests++;report.executedIds.push(id);try{await registry[id](owner,probe);}catch(e){report.failed++;owner.fail(e.message);throw e;}});
    if(owner.controller.signal.aborted)break;
  }
  report.suite.ended=new Date().toISOString();report.exit=report.failed?1:0;if(!report.tests){report.exit=1;report.cause ||= 'no-executed-tests';}
}catch(e){report.cause ||= e.message;report.exit ||= 1;owner.fail(report.cause);event('failure',{cause:report.cause});}
finally {
  clearTimeout(suiteTimer);await owner.close();if(owner.controller.signal.aborted)report.exit ||= 1;
  if(report.preparation&&!report.preparation.ended)report.preparation.ended=new Date().toISOString();
  if(report.suite&&!report.suite.ended)report.suite.ended=new Date().toISOString();
  report.ended=new Date().toISOString();await writeFile(`${dir}/summary.json`,JSON.stringify(report,null,2)+'\n');
  process.removeListener('SIGTERM',onTerm);process.removeListener('SIGINT',onInt);console.log(`REPORT ${dir}/summary.json`);process.send?.({type:'report',path:`${dir}/summary.json`});process.exitCode=report.exit;
}
