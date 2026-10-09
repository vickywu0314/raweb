// External observation precedes fallback cleanup. This is an instrument test, not a business oracle.
import { fork } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import assert from 'node:assert/strict';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const scenario = process.argv[2] === '--scenario' ? process.argv[3] : undefined;
const valid = ['normal', 'assert-fail', 'cancel', 'cancel-startup', 'startup-never-ready', 'server-start-fail', 'browser-start-fail', 'suite-timeout'];
if (!valid.includes(scenario) || process.argv.length !== 4) throw new Error(`--scenario ${valid.join('|')}`);
const runId = `owner-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}`;
const dir = resolve(root, '../.tmp/ai-cohort-web/p00a', runId);
await mkdir(dir, {recursive: true});
const report = {runId, started: new Date().toISOString(), scenario, tests: 1, failed: 0, skipped: 0, exit: 0, before: null, after: null};
async function live(pid) {
  try { const s = await readFile(`/proc/${pid}/stat`, 'utf8'); return s.slice(s.lastIndexOf(')')+2).split(' ')[0] !== 'Z'; }
  catch (e) { if (e.code === 'ENOENT') return false; throw e; }
}
function portOpen(url) {
  const target = new URL(url);
  return new Promise((yes, no) => {
    const socket = net.connect({host: target.hostname, port: Number(target.port)});
    socket.once('connect', () => { socket.destroy(); yes(true); });
    socket.once('error', e => { socket.destroy(); if (e.code === 'ECONNREFUSED') yes(false); else no(e); });
    socket.setTimeout(1000, () => { socket.destroy(); no(new Error('port observation timed out')); });
  });
}
const args = ['e2e', ...(scenario === 'normal' || scenario === 'cancel' ? [] : ['--probe', scenario === 'cancel-startup' ? 'startup-never-ready' : scenario])];
const owner = fork(fileURLToPath(new URL('./run-suite.mjs', import.meta.url)), args, {cwd: root, detached: true, stdio: ['ignore','pipe','pipe','ipc']});
const pids = new Set([owner.pid]);
let url, summaryPath, stdout = '', stderr = '', trigger = null;
owner.stdout.on('data', c => stdout += c); owner.stderr.on('data', c => stderr += c);
owner.on('message', message => {
  if (message.pid) pids.add(message.pid);
  if (message.url) url = message.url;
  if (message.port) url = `http://127.0.0.1:${message.port}`;
  if (message.type === 'report') summaryPath = message.path;
  if (message.type === 'static-ready' || message.type === 'held-not-ready') {
    trigger = Promise.all([live(message.pid), portOpen(url)]).then(([pidLive, portLive]) => {report.before = {pidLive, portLive, observed: new Date().toISOString()};});
  }
  if ((scenario === 'cancel' && message.type === 'runner-started') || (scenario === 'cancel-startup' && message.type === 'held-not-ready')) {
    Promise.resolve(trigger).then(() => owner.kill('SIGTERM'));
  }
});
let watchdog;
try {
  const result = await new Promise((yes, no) => {
    watchdog = setTimeout(() => no(new Error('owner exceeded independent 130s observation bound')), 130_000);
    owner.once('error', no); owner.once('exit', (code, signal) => yes({code, signal}));
  });
  clearTimeout(watchdog); if (trigger) await trigger;
  assert.ok(summaryPath, 'owner must write its own new summary');
  const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
  report.ownerReport = summaryPath; report.owner = summary;
  if (summary.resources.url) url = summary.resources.url;
  for (const [key, value] of Object.entries(summary.resources)) if (key.endsWith('Pid')) pids.add(value);
  // No fallback signals or test teardown have happened at this observation point.
  const observed = await Promise.all([...pids].map(async pid => ({pid, live: await live(pid)})));
  const portLive = url ? await portOpen(url) : false;
  report.after = {observed: new Date().toISOString(), portLive, pids: observed, beforeFallback: true};
  assert.equal(portLive, false, 'owner leaked static listener before fallback');
  assert.ok(observed.every(item => !item.live), 'owner leaked owned live process before fallback');
  if (scenario === 'normal') { assert.equal(result.code, 0); assert.equal(summary.tests, 1); assert.equal(summary.failed, 0); }
  else { assert.notEqual(result.code, 0); assert.notEqual(summary.exit, 0); }
  if (scenario === 'assert-fail') { assert.equal(summary.tests, 1); assert.equal(summary.failed, 1); assert.equal(summary.reason, 'test-failed'); }
  if (scenario === 'cancel' || scenario === 'cancel-startup') assert.equal(summary.reason, 'cancelled:SIGTERM');
  if (scenario === 'startup-never-ready') { assert.equal(summary.reason, 'startup-timeout:30000ms'); assert.equal(summary.tests, 0); assert.ok(!summary.events.some(e => e.type === 'browser-ready' || e.type === 'runner-started')); }
  if (scenario === 'suite-timeout') { assert.equal(summary.reason, 'suite-timeout:120000ms'); assert.equal(summary.tests, 0); }
  if (scenario !== 'server-start-fail') { assert.equal(report.before?.pidLive, true); assert.equal(report.before?.portLive, true); }
} catch (error) { report.failed = 1; report.exit = 1; report.error = error.stack; }
finally {
  clearTimeout(watchdog);
  // Only if the owner violated cleanup: release this test's recorded children after asserting.
  for (const pid of pids) if (await live(pid)) { try { process.kill(pid, 'SIGTERM'); } catch (e) { if (e.code !== 'ESRCH') throw e; } }
  await writeFile(`${dir}/stdout.log`, stdout); await writeFile(`${dir}/stderr.log`, stderr);
  report.ended = new Date().toISOString(); await writeFile(`${dir}/summary.json`, JSON.stringify(report,null,2)+'\n');
  console.log(`OWNER_REPORT ${dir}/summary.json tests=1 failed=${report.failed} exit=${report.exit}`);
  process.exitCode = report.exit;
}
