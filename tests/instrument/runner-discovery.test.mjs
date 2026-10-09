// 真实CLI回归：只发现原页面用例或执行无browser字面fixture，不启动浏览器/服务。
import test from 'node:test';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, symlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function inputState(file) {
  try { return { exists: true, sha256: hash(await readFile(file)) }; }
  catch (error) { if (error.code === 'ENOENT') return { exists: false, sha256: null }; throw error; }
}
async function fixture() {
  const runner = await readFile(resolve(root, 'tests/support/run-suite.mjs'), 'utf8');
  const lines = runner.split('\n').filter(line => line.includes("args = [resolve(root, 'node_modules/@playwright/test/cli.js')"));
  assert.equal(lines.length, 1, '必须找到唯一真实Playwright参数行');
  assert.match(lines[0], /'--grep', e2eRegistry\[selected \|\| id\]/);
  const registryLine = runner.split('\n').find(line => line.includes('const e2eRegistry ='));
  const registry = vm.runInNewContext('(' + registryLine.trim().replace('const e2eRegistry =', '').replace(/;$/, '') + ')');
  const grep = registry['instrument:page-load'];
  assert.ok(grep, '真实参数行必须声明grep');
  const output = lines[0].match(/'--output', resolve\(dir, '([^']+)'\)/)?.[1];
  assert.equal(lines[0].includes("'--output'"), Boolean(output), '拒绝无法提取的output参数');
  if (output) assert.equal(output, 'playwright-artifacts', '输出仅限本次artifacts子目录');
  assert.equal(JSON.parse(await readFile(resolve(root, 'node_modules/@playwright/test/package.json'), 'utf8')).version, '1.64.0');
  const base = resolve(root, '../.tmp/ai-cohort-web/p00c');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(resolve(base, 'run-'));
  const project = resolve(directory, 'raweb');
  await mkdir(resolve(project, 'tests/instrument'), { recursive: true });
  await symlink(resolve(root, 'node_modules'), resolve(project, 'node_modules'), 'dir');
  const config = await readFile(resolve(root, 'playwright.config.js'));
  const original = await readFile(resolve(root, 'tests/instrument/page-load.spec.cjs'), 'utf8');
  await writeFile(resolve(project, 'playwright.config.js'), config);
  const normalSpec = resolve(project, 'tests/instrument/page-load.spec.cjs');
  await writeFile(normalSpec, original);
  const manifest = { node: process.version, playwright: '1.64.0', runnerSha256: hash(runner), configSha256: hash(config), pageSpecSha256: hash(original), parameterLine: lines[0].trim(), grep, output: output || null, observations: [] };
  console.log(`MANIFEST ${resolve(directory, 'manifest.json')}`);
  const save = () => writeFile(resolve(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await save();
  async function cli(name, { pattern = grep, list = false, input = normalSpec, runDir = resolve(directory, name), probeDir, isolated = true } = {}) {
    await mkdir(runDir, { recursive: true });
    const rawReport = resolve(directory, `${name}.json`);
    const args = [resolve(project, 'node_modules/@playwright/test/cli.js'), 'test', '--config', resolve(project, 'playwright.config.js'), '--grep', pattern];
    if (isolated && output) args.push('--output', resolve(runDir, output));
    if (list) args.push('--list', '--reporter', 'list');
    const env = { ...process.env, RA_RUN_DIR: runDir, RA_PROBE_DIR: probeDir || resolve(project, 'tests/instrument'), RA_RAW_REPORT: rawReport, RA_BROWSER_WS: 'ws://127.0.0.1:1/not-connected' };
    const before = await inputState(input);
    let stdout = '', stderr = '', timedOut = false;
    const result = await new Promise((yes, no) => {
      const child = spawn(process.execPath, args, { cwd: project, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const timer = setTimeout(() => {
        timedOut = true;
        try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') no(error); }
      }, 10_000);
      child.stdout.on('data', bytes => { stdout += bytes; });
      child.stderr.on('data', bytes => { stderr += bytes; });
      child.once('error', error => { clearTimeout(timer); no(error); });
      child.once('close', (code, signal) => { clearTimeout(timer); yes({ code, signal }); });
    });
    // 先观察输入；不重建被清理的spec，不以fallback制造“保留”。
    const after = await inputState(input);
    await writeFile(resolve(directory, `${name}.stdout.log`), stdout);
    await writeFile(resolve(directory, `${name}.stderr.log`), stderr);
    const raw = list ? null : JSON.parse(await readFile(rawReport, 'utf8'));
    const tests = list ? Number(stdout.match(/Total: (\d+) tests?/)?.[1] ?? -1) : raw.stats.expected + raw.stats.unexpected + raw.stats.skipped + raw.stats.flaky;
    const observation = { name, command: [process.execPath, ...args], cwd: project, environment: { RA_RUN_DIR: env.RA_RUN_DIR, RA_PROBE_DIR: env.RA_PROBE_DIR, RA_RAW_REPORT: rawReport }, input, before, after, exit: result.code, signal: result.signal, timedOut, tests, failed: raw?.stats.unexpected ?? null, skipped: raw?.stats.skipped ?? null, rawReport: list ? null : rawReport };
    manifest.observations.push(observation); await save();
    assert.equal(timedOut, false, `${name} CLI超过10秒`);
    return { ...observation, stdout, stderr, raw };
  }
  return { directory, project, original, grep, output, cli };
}

test('真实发现：主线grep选择唯一原页面用例', async () => {
  const { cli } = await fixture();
  const baseline = await cli('old-grep', { pattern: '^instrument:page-load$', list: true });
  assert.equal(baseline.exit, 1); assert.equal(baseline.tests, 0); assert.match(baseline.stdout + baseline.stderr, /No tests found/);
  const actual = await cli('actual-normal', { list: true });
  assert.equal(actual.tests, 1, '主线实际grep必须发现1例');
  assert.equal(actual.exit, 0, actual.stderr);
});

async function pureFixture(context, name, expected = 5, isolated = true) {
  const runDir = resolve(context.directory, name);
  await mkdir(runDir);
  const input = resolve(runDir, 'literal.spec.cjs');
  await writeFile(input, `const {test,expect}=require(${JSON.stringify(resolve(context.project, 'node_modules/@playwright/test'))}); test('instrument:page-load',()=>expect(2+3).toBe(${expected}));\n`);
  return context.cli(name, { input, runDir, probeDir: runDir, isolated });
}

test('输入保留：主线output隔离实际执行且不清spec', async () => {
  const context = await fixture();
  const baseline = await pureFixture(context, 'old-output', 5, false);
  assert.equal(baseline.exit, 1); assert.equal(baseline.tests, 0);
  assert.equal(baseline.after.exists, false);
  assert.match(JSON.stringify(baseline.raw), /No tests found/);
  const actual = await pureFixture(context, 'actual-output');
  assert.equal(actual.after.exists, true, '主线实际output必须保留输入spec');
  assert.equal(actual.after.sha256, actual.before.sha256);
  assert.equal(actual.exit, 0, actual.stderr);
  assert.deepEqual([actual.tests, actual.failed, actual.skipped], [1, 0, 0]);
});

test('发现边界：原runner的临时失败副本及完整标题只选精确ID', async () => {
  const { directory, project, original, grep, cli } = await fixture();
  assert.equal(original.split('expect(2 + 3).toBe(5)').length, 2, '原spec必须有唯一固定字面断言');
  const temporary = resolve(directory, 'assert-fail-input');
  await mkdir(temporary);
  const input = resolve(temporary, 'assert-fail.spec.cjs');
  const diagnostic = original.replace("require('@playwright/test')", `require(${JSON.stringify(resolve(project, 'node_modules/@playwright/test'))})`).replace('expect(2 + 3).toBe(5)', 'expect(2 + 3).toBe(6)');
  await writeFile(input, diagnostic);
  const actual = await cli('actual-diagnostic-list', { list: true, input, probeDir: temporary });
  assert.equal(actual.exit, 0, actual.stderr); assert.equal(actual.tests, 1);
  assert.deepEqual(actual.after, actual.before);
  const selector = new RegExp(grep);
  for (const title of ['instrument:page-load', 'page-load.spec.cjs instrument:page-load', 'project file group instrument:page-load']) assert.equal(selector.test(title), true, title);
  for (const title of ['notinstrument:page-load', 'instrument:page-load-extra', 'instrument:page-load:other', 'instrument:other', 'page-load']) assert.equal(selector.test(title), false, title);
});

test('失败传播：纯fixture实际到达5与6断言并保留输入', async () => {
  const context = await fixture();
  const actual = await pureFixture(context, 'actual-assert-fail', 6);
  assert.equal(actual.exit, 1);
  assert.deepEqual([actual.tests, actual.failed, actual.skipped], [1, 1, 0]);
  assert.deepEqual(actual.after, actual.before);
  assert.deepEqual(actual.raw.errors, [], '不能用发现或启动错误替代断言失败');
  const specs = actual.raw.suites.flatMap(suite => suite.specs);
  assert.equal(specs.length, 1); assert.equal(specs[0].title, 'instrument:page-load');
  const results = specs[0].tests.flatMap(entry => entry.results);
  assert.equal(results.length, 1); assert.equal(results[0].status, 'failed');
  const errors = results[0].errors;
  assert.equal(errors.length, 1);
  const message = stripVTControlCharacters(errors[0].message);
  assert.match(message, /Expected:\s*6/);
  assert.match(message, /Received:\s*5/);
  assert.equal(errors[0].location.file, actual.input);
  assert.equal(errors[0].location.line, 1);
});
