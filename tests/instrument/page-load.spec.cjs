const { test, expect } = require('@playwright/test');
const { writeFile } = require('node:fs/promises');
test('instrument:page-load', async ({ page, context, browser }) => {
  const origin = process.env.RA_STATIC_URL;
  const allowed = [], blocked = [], pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (new URL(url).origin === origin) { allowed.push(url); await route.continue(); }
    else { blocked.push(url); await route.abort('blockedbyclient'); }
  });
  await context.addInitScript(() => sessionStorage.setItem('ra-auth', JSON.stringify({name: '仪器演示用户', role: '研究者', expires: 0})));
  try {
    const response = await page.goto(`${origin}/ai-cohort.html`, { waitUntil: 'load' });
    expect(response.status()).toBe(200);
    await expect(page).toHaveTitle('队列分析 · 中国中医风湿病注册研究信息平台');
    await expect(page.locator('h1')).toHaveText('群体智能分析 · 队列分析');
    await expect(page.locator('#question-form')).toBeVisible();
    await expect(page.locator('#question')).toBeVisible();
    await expect(page.locator('#question-form button[type="submit"]')).toBeVisible();
    expect(pageErrors).toEqual([]);
    // An explicit invalid external target proves the route rejects before network I/O.
    expect(await page.evaluate(async () => {
      try { await fetch('https://example.invalid/instrument-network-denied'); return 'allowed'; }
      catch { return 'blocked'; }
    })).toBe('blocked');
    expect(blocked).toContain('https://example.invalid/instrument-network-denied');
    expect(2 + 3).toBe(5); // Fixed instrument oracle; temporary failure probe changes only this assertion.
    await writeFile(`${process.env.RA_RUN_DIR}/browser-observation.json`, JSON.stringify({ browser: 'dot 云端 Chromium', version: browser.version(), url: page.url(), http: response.status(), title: await page.title(), h1: await page.locator('h1').textContent(), allowed, blocked, pageErrors }, null, 2));
  } finally {
    // Retain network evidence even when a controlled assertion fails.
    await writeFile(`${process.env.RA_RUN_DIR}/network.json`, JSON.stringify({allowed, blocked, pageErrors}, null, 2));
  }
});
