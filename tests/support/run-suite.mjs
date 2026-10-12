import { spawn, fork } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const mode = process.argv[2];
const argv = process.argv.slice(3);
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
const dir = resolve(root, '../.tmp/ai-cohort-web/p00a', runId);
await mkdir(dir, { recursive: true });
const report = {runId, started: new Date().toISOString(), ended: null, command: process.argv.slice(1), mode, selection: null, probe: null, tests: 0, failed: 0, skipped: 0, exit: 1, reason: null, resources: {}, events: []};
const controller = new AbortController();
const fail = reason => { if (!controller.signal.aborted) { report.reason = reason; controller.abort(new Error(reason)); } };
const cancelled = signal => fail(`cancelled:${signal}`);
const onTerm = () => cancelled('SIGTERM'), onInt = () => cancelled('SIGINT');
process.on('SIGTERM', onTerm); process.on('SIGINT', onInt);
const suiteTimer = setTimeout(() => fail('suite-timeout:120000ms'), 120_000);
let server, runner, browser, startupTimer;
const event = (type, fields = {}) => {
  const data = {type, at: new Date().toISOString(), ...fields};
  report.events.push(data); process.send?.(data);
};
function owned(child, key) {
  report.resources[key] = child.pid;
  child.finished = new Promise(resolveExit => {
    child.once('error', error => resolveExit({code: 1, error: error.message}));
    child.once('exit', (code, signal) => resolveExit({code, signal}));
  });
  return child;
}
function abortable(promise) {
  controller.signal.throwIfAborted();
  return new Promise((yes, no) => {
    const abort = () => no(controller.signal.reason);
    controller.signal.addEventListener('abort', abort, {once: true});
    promise.then(yes, no).finally(() => controller.signal.removeEventListener('abort', abort));
  });
}
async function stopChild(child, key) {
  if (!child) return;
  if (child.exitCode === null && child.signalCode === null) {
    // Each child has its own process group; never signal an unowned process.
    try { process.kill(-child.pid, 'SIGTERM'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') event('cleanup-error', {error: e.message}); } }, 2_000);
    await child.finished; clearTimeout(timer);
  }
  event('child-closed', {owner: key, pid: child.pid});
}
try {
  let selected, probe;
  for (let i = 0; i < argv.length; i++) {
    if (!['--case', '--probe'].includes(argv[i]) || !argv[i + 1]) throw new Error('usage: [--case exact-id] [--probe assert-fail|startup-never-ready|server-start-fail|browser-start-fail|suite-timeout]');
    if (argv[i] === '--case') { if (selected) throw new Error('duplicate --case'); selected = argv[++i]; }
    else { if (probe) throw new Error('duplicate --probe'); probe = argv[++i]; }
  }
  report.selection = selected || '*'; report.probe = probe || null;
  const id = {unit: 'instrument:literal', e2e: 'instrument:page-load'}[mode];
  if (!id) throw new Error('unknown suite');
  const unitRegistry = {'patient:insight-contract':'patient-insight.test.cjs','analysis:patient-search-contract':'ai-patient-search.test.cjs','analysis:overview-contract':'ai-overview.test.cjs','patient:followup-policy-contract':'patient-followup-policy.test.cjs','patient:trusted-interactions-contract':'trusted-patient-interactions.test.cjs','patient:trusted-detail-contract':'trusted-patient-api.test.cjs','cohort:patient-entry':'cohort-patient-entry.test.cjs','cohort:entry-contract':'cohort-entry-api.test.cjs','cohort:application-api-contract':'cohort-application-api.test.cjs','cohort:export-api-contract':'cohort-export-api.test.cjs','cohort:apply-api-contract':'cohort-apply-api.test.cjs','cohort:parse-api-contract':'cohort-parse-api.test.cjs','instrument:literal':'literal.test.cjs','cohort:api-contract':'cohort-api.test.cjs','cohort:legacy-compat':'cohort-compat.test.cjs','cohort:dev-proxy':'cohort-proxy.test.cjs','cohort:conditions':'cohort-conditions.test.cjs'};
  const e2eRegistry = {'patient:insight-states':'(^| )patient:insight-states$','analysis:patient-search':'(^| )analysis:patient-search$','analysis:overview-states':'(^| )analysis:overview-states$','patient:followup-policy':'(^| )patient:followup-policy$','patient:trusted-interactions':'(^| )patient:trusted-interactions$','patient:trusted-detail-states':'(^| )patient:trusted-detail-states$','cohort:patient-entry-closed':'(^| )cohort:patient-entry-closed$','cohort:patient-return':'(^| )cohort:patient-return$','cohort:url-question':'(^| )cohort:url-question$','cohort:url-similar':'(^| )cohort:url-similar$','cohort:entry-terminal':'(^| )cohort:entry-terminal$','cohort:application-notification':'(^| )cohort:application-notification$','cohort:application-command':'(^| )cohort:application-command$','cohort:export-comparison':'(^| )cohort:export-comparison$','cohort:export-terminal':'(^| )cohort:export-terminal$','cohort:export-binary-errors':'(^| )cohort:export-binary-errors$','cohort:export-cohort':'(^| )cohort:export-cohort$','cohort:parse-apply-terminal':'(^| )cohort:parse-apply-terminal$','cohort:parse-apply-replacement':'(^| )cohort:parse-apply-replacement$','cohort:parse-preserve-errors':'(^| )cohort:parse-preserve-errors$','cohort:parse-late-isolation':'(^| )cohort:parse-late-isolation$','cohort:parse-candidates':'(^| )cohort:parse-candidates$','cohort:comparison-retained':'(^| )cohort:comparison-retained$','cohort:comparison-rows':'(^| )cohort:comparison-rows$','cohort:comparison-pending':'(^| )cohort:comparison-pending$','cohort:comparison-sources':'(^| )cohort:comparison-sources$','cohort:private-delete-replay':'(^| )cohort:private-delete-replay$','cohort:private-metadata-conflicts':'(^| )cohort:private-metadata-conflicts$','cohort:private-pending-isolation':'(^| )cohort:private-pending-isolation$','cohort:private-save-open':'(^| )cohort:private-save-open$','instrument:page-load':'(^| )instrument:page-load$','cohort:request-firstscreen':'(^| )cohort:request-firstscreen$','cohort:empty-errors':'(^| )cohort:empty-errors$','cohort:no-demo-actions':'(^| )cohort:no-demo-actions$','cohort:url-ids':'(^| )cohort:url-ids$','cohort:late-isolation':'(^| )cohort:late-isolation$','cohort:terminal-states':'(^| )cohort:terminal-states$','cohort:statistics-six':'(^| )cohort:statistics-six$','cohort:statistics-boundaries':'(^| )cohort:statistics-boundaries$','cohort:statistics-terminal':'(^| )cohort:statistics-terminal$','cohort:clinical-projection':'(^| )cohort:clinical-projection$','cohort:clinical-retained-page':'(^| )cohort:clinical-retained-page$'};
  const registry = mode === 'unit' ? unitRegistry : e2eRegistry;
  if (selected && !Object.hasOwn(registry, selected)) { report.exit = 2; throw new Error(`no-match:${selected}`); }
  if (probe && !['assert-fail', 'startup-never-ready', 'server-start-fail', 'browser-start-fail', 'suite-timeout'].includes(probe)) throw new Error('unknown probe');
  if (probe && selected && selected !== id) throw new Error('probes require original instrument case');
  if (mode === 'unit' && probe && probe !== 'assert-fail') throw new Error('startup/resource probes require e2e');
  let args, env = {...process.env, RA_RUN_DIR: dir, RA_PROBE: probe || ''};
  if (mode === 'unit') {
    let file = resolve(root, 'tests/instrument', unitRegistry[selected || id]);
    if (probe === 'assert-fail') {
      file = `${dir}/assert-fail.test.cjs`;
      await writeFile(file, `const test = require('node:test'); const assert = require('node:assert/strict'); test('instrument:literal', {timeout:30000}, () => assert.equal(2+3,6));\n`);
    }
    args = ['--test', '--test-reporter=tap', `--test-name-pattern=^${selected || id}$`, file];
  } else {
    const startupAt = Date.now();
    startupTimer = setTimeout(() => fail('startup-timeout:30000ms'), 30_000);
    server = owned(fork(fileURLToPath(new URL('./static-server.mjs', import.meta.url)), [root, probe || '', selected || ''], {detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc']}), 'serverPid');
    server.stderr.pipe(process.stderr);
    const ready = new Promise((yes, no) => {
      server.on('message', message => {
        if (message.type === 'held-not-ready') { report.resources.url = `http://127.0.0.1:${message.port}`; event('held-not-ready', message); }
        if (message.type === 'ready' && !controller.signal.aborted) yes(message);
      });
      server.finished.then(result => no(new Error(`server-start-failed:${JSON.stringify(result)}`)));
    });
    const listening = await abortable(ready);
    report.resources.url = listening.url;
    const response = await fetch(`${listening.url}/ai-cohort.html`, {signal: controller.signal});
    if (response.status !== 200) throw new Error(`static-http:${response.status}`);
    await response.arrayBuffer(); event('static-ready', {url: listening.url, http: response.status, pid: server.pid});
    browser = await chromium.launchServer({executablePath: probe === 'browser-start-fail' ? `${dir}/missing-chromium` : (process.env.RA_CHROMIUM_PATH || '/usr/bin/chromium'), timeout: Math.max(1, 30_000 - (Date.now() - startupAt)), headless: true, chromiumSandbox: true});
    report.resources.browserPid = browser.process().pid;
    controller.signal.throwIfAborted();
    clearTimeout(startupTimer);
    event('browser-ready', {pid: browser.process().pid, browser: 'dot 云端 Chromium'});
    env = {...env, RA_STATIC_URL: listening.url, RA_BROWSER_WS: browser.wsEndpoint(), RA_RAW_REPORT: `${dir}/playwright.json`};
    if (probe === 'assert-fail') {
      const source = await readFile(resolve(root, 'tests/instrument/page-load.spec.cjs'), 'utf8');
      const temporary = source.replace("require('@playwright/test')", `require(${JSON.stringify(resolve(root, 'node_modules/@playwright/test'))})`).replace('expect(2 + 3).toBe(5)', 'expect(2 + 3).toBe(6)');
      await writeFile(`${dir}/assert-fail.spec.cjs`, temporary); env.RA_PROBE_DIR = dir;
    }
    args = [resolve(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config', resolve(root, 'playwright.config.js'), '--grep', e2eRegistry[selected || id], '--output', resolve(dir, 'playwright-artifacts')];
    if (probe === 'suite-timeout') args = ['-e', 'setInterval(() => {}, 1000)'];
  }
  controller.signal.throwIfAborted();
  runner = owned(spawn(process.execPath, args, {cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe']}), 'runnerPid');
  event('runner-started', {pid: runner.pid});
  let stdout = '', stderr = '';
  runner.stdout.on('data', c => { stdout += c; process.stdout.write(c); });
  runner.stderr.on('data', c => { stderr += c; process.stderr.write(c); });
  let result;
  try { result = await abortable(runner.finished); }
  finally { await writeFile(`${dir}/stdout.log`, stdout); await writeFile(`${dir}/stderr.log`, stderr); }
  report.exit = result.code ?? 1;
  if (mode === 'unit') {
    await writeFile(`${dir}/node.tap`, stdout);
    const count = key => Number(stdout.match(new RegExp(`^# ${key} (\\d+)$`, 'm'))?.[1] ?? 0);
    report.tests = count('tests'); report.failed = count('fail'); report.skipped = count('skipped');
  } else {
    const raw = JSON.parse(await readFile(`${dir}/playwright.json`, 'utf8'));
    report.tests = raw.stats.expected + raw.stats.unexpected + raw.stats.skipped + raw.stats.flaky;
    report.failed = raw.stats.unexpected; report.skipped = raw.stats.skipped;
  }
  if (report.tests === 0 || report.skipped === report.tests) { report.exit ||= 1; report.reason ||= 'no-executed-tests'; }
  if (report.exit !== 0) report.reason ||= 'test-failed';
} catch (error) {
  report.exit ||= 1; report.reason ||= error.message;
  event('failure', {reason: report.reason});
} finally {
  clearTimeout(suiteTimer); clearTimeout(startupTimer);
  try {
    await stopChild(runner, 'runner');
    if (browser) { await browser.close(); event('browser-closed', {pid: report.resources.browserPid}); }
    await stopChild(server, 'server');
  } catch (error) { report.exit = 1; report.reason ||= `cleanup-failed:${error.message}`; event('cleanup-error', {error: error.message}); }
  report.ended = new Date().toISOString();
  await writeFile(`${dir}/summary.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(`REPORT ${dir}/summary.json`);
  process.send?.({type: 'report', path: `${dir}/summary.json`});
  process.removeListener('SIGTERM', onTerm); process.removeListener('SIGINT', onInt);
  process.exitCode = report.exit;
}
