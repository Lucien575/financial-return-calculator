import { test, expect, type Page } from '@playwright/test';

/**
 * 端到端流程测试。用真实的点击与输入走一遍用户路径，
 * 断言的都是用户看得见的文案与数字。
 */

/** 按 data-key 精确点键盘（不能用文本 includes —— "+1000" 也含 "0"）。 */
async function keypad(page: Page, key: string) {
  await page.locator(`.keypad button[data-key="${key}"]`).click();
}

async function typeNumber(page: Page, value: string) {
  for (const ch of value) await keypad(page, ch);
  await keypad(page, 'DONE');
}

async function focusRow(page: Page, label: string) {
  await page.locator('.field', { has: page.locator('.field-label', { hasText: label }) })
    .locator('.field-row')
    .click();
}

/** 行内显示的值 / 提示文案 */
async function rowValue(page: Page, label: string): Promise<string> {
  return page
    .locator('.field', { has: page.locator('.field-label', { hasText: label }) })
    .locator('.field-value')
    .innerText();
}

/** 点底部导航。必须限定在 .bottom-nav 内 —— 否则「记录」会同时匹配「保存到记录」。 */
async function navTo(page: Page, name: '计算器' | '记录') {
  await page.locator('.bottom-nav').getByRole('button', { name, exact: true }).click();
}

async function resetApp(page: Page) {
  await page.goto('./');
  await page.evaluate(() => indexedDB.deleteDatabase('finance_calc'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

test.beforeEach(async ({ page }) => {
  await resetApp(page);
});

test('打开是空白首页，不预填任何数字', async ({ page }) => {
  await expect(page.locator('h1')).toHaveText('年化收益计算器');
  expect(await rowValue(page, '买入金额')).toBe('0.00');
  expect(await rowValue(page, '持有天数')).toBe('自动推算');
  await expect(page.locator('.result-primary')).toBeHidden();
  await expect(page.locator('.result-empty-hint')).toBeVisible();
  // 空态不能飘红字
  await expect(page.locator('.field-msg.is-error')).toHaveCount(0);
  // 空白时「清空」按钮不显示
  await expect(page.getByRole('button', { name: '清空' })).toBeHidden();
});

test('金额法：填完即出结果，与安卓版逐位一致', async ({ page }) => {
  await focusRow(page, '买入金额');
  await typeNumber(page, '40125.71');
  await focusRow(page, '持有收益');
  await typeNumber(page, '429.60');
  await focusRow(page, '持有天数');
  await typeNumber(page, '191');

  await expect(page.locator('.result-primary')).toHaveText('+2.05%');
  await expect(page.locator('.result-grid .metric-value')).toHaveText([
    '40,125.71 元',
    '429.60 元',
    '40,555.31 元',
    '191 天',
    '+1.07%',
  ]);
  await expect(page.locator('.process-steps')).toContainText('复利年化（参考）= +2.06%');
});

test('净值法：8 位小数与年化都对', async ({ page }) => {
  await page.getByRole('tab', { name: '净值计算法' }).click();
  await focusRow(page, '买入净值');
  await typeNumber(page, '1.046');
  await focusRow(page, '当前净值');
  await typeNumber(page, '1.0573');
  await focusRow(page, '持有天数');
  await typeNumber(page, '191');

  await expect(page.locator('.result-primary')).toHaveText('+2.07%');
  expect(await page.locator('.result-grid .metric-value').first().innerText()).toBe('1.04600000');
});

test('实时刷新：改一个数结果立刻变', async ({ page }) => {
  await focusRow(page, '买入金额');
  await typeNumber(page, '40125.71');
  await focusRow(page, '持有收益');
  await typeNumber(page, '429.60');
  await focusRow(page, '持有天数');
  await typeNumber(page, '191');
  await expect(page.locator('.result-primary')).toHaveText('+2.05%');

  await focusRow(page, '买入金额');
  await keypad(page, 'C');
  await typeNumber(page, '20000');
  await expect(page.locator('.result-primary')).toHaveText('+4.10%');
});

test('输入非法时行内提示、结果卡置灰并保留上次有效结果', async ({ page }) => {
  await focusRow(page, '买入金额');
  await typeNumber(page, '10000');
  await focusRow(page, '持有收益');
  await typeNumber(page, '500');
  await focusRow(page, '持有天数');
  await typeNumber(page, '365');
  const before = await page.locator('.result-primary').innerText();

  await focusRow(page, '买入金额');
  await keypad(page, 'C');
  await typeNumber(page, '0');

  await expect(
    page.locator('.field', { has: page.locator('.field-label', { hasText: '买入金额' }) }).locator('.field-msg'),
  ).toHaveText('请输入大于 0 的买入金额');
  await expect(page.locator('.result-card')).toHaveClass(/is-stale/);
  await expect(page.locator('.result-primary')).toHaveText(before);
  // 空/占位符不能被染成错误色
  await expect(page.locator('.result-note')).toContainText('上一次的有效结果');
});

test('清空按钮：有内容才出现，点了回空白', async ({ page }) => {
  await focusRow(page, '买入金额');
  await typeNumber(page, '88888');
  const clearBtn = page.getByRole('button', { name: '清空' });
  await expect(clearBtn).toBeVisible();
  await clearBtn.click();
  expect(await rowValue(page, '买入金额')).toBe('0.00');
  await expect(clearBtn).toBeHidden();
});

test('保存到记录并在记录页看到，刷新后仍在', async ({ page }) => {
  await page.getByRole('tab', { name: '净值计算法' }).click();
  await focusRow(page, '买入净值');
  await typeNumber(page, '1.046');
  await focusRow(page, '当前净值');
  await typeNumber(page, '1.0573');
  await focusRow(page, '持有天数');
  await typeNumber(page, '191');

  await page.getByRole('button', { name: '保存到记录' }).click();
  await expect(page.locator('.snackbar')).toContainText('已保存');

  await navTo(page, '记录');
  await expect(page.locator('.record')).toHaveCount(1);
  await expect(page.locator('.record-annual')).toHaveText('+2.07%');
  await expect(page.locator('.group-label')).toBeVisible();

  await page.reload();
  await expect(page.locator('.record')).toHaveCount(1);
});

test('记录：备注、并排对比、左滑删除', async ({ page }) => {
  // 造两条记录
  for (const [buy, earn, days] of [
    ['10000', '500', '365'],
    ['20000', '500', '365'],
  ]) {
    await focusRow(page, '买入金额');
    await keypad(page, 'C');
    await typeNumber(page, buy);
    await focusRow(page, '持有收益');
    await keypad(page, 'C');
    await typeNumber(page, earn);
    await focusRow(page, '持有天数');
    await keypad(page, 'C');
    await typeNumber(page, days);
    await page.getByRole('button', { name: '保存到记录' }).click();
    await page.waitForTimeout(250);
  }

  await navTo(page, '记录');
  await expect(page.locator('.record')).toHaveCount(2);

  // 备注
  await page.locator('.record-face').first().click();
  await expect(page.getByText('备注', { exact: true })).toBeVisible();
  await page.locator('.dialog input[type="text"]').fill('招行 365 天');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.locator('.record-note')).toHaveText('招行 365 天');

  // 长按多选 → 对比
  const faces = page.locator('.record-face');
  await faces.nth(0).dispatchEvent('pointerdown');
  await page.waitForTimeout(650);
  await faces.nth(0).dispatchEvent('pointerup');

  // 选中行的底色必须**不透明** —— 用半透明的话，行底下的红色删除按钮会透出来，
  // 选中一条记录整行就泛红（这个 bug 是靠肉眼看深色截图发现的）
  const bg = await faces.nth(0).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg, `选中行底色是半透明的：${bg}`).not.toMatch(/rgba\([^)]*,\s*0?\.[0-9]+\)$/);
  await faces.nth(1).click();
  await expect(page.getByText('并排对比')).toBeVisible();
  await page.getByRole('button', { name: '收起' }).click();
  await expect(page.getByText('并排对比')).toBeHidden();

  // 左滑删除。用显式指针事件驱动，避免 Playwright mouse 语义与手势实现的差异
  const first = faces.first();
  const box = (await first.boundingBox())!;
  const y = box.y + box.height / 2;
  const x0 = box.x + box.width - 24;
  await first.dispatchEvent('pointerdown', { clientX: x0, clientY: y, pointerId: 1, bubbles: true });
  await first.dispatchEvent('pointermove', { clientX: x0 - 40, clientY: y, pointerId: 1, bubbles: true });
  await first.dispatchEvent('pointermove', { clientX: x0 - 120, clientY: y, pointerId: 1, bubbles: true });
  await first.dispatchEvent('pointerup', { clientX: x0 - 120, clientY: y, pointerId: 1, bubbles: true });
  await expect(first).toHaveCSS('transform', /matrix\(1, 0, 0, 1, -96, 0\)/);
  await page.locator('.record-delete').first().click();
  await expect(page.locator('.record')).toHaveCount(1);
});

test('深色模式：切换即时生效且刷新后保留', async ({ page }) => {
  await page.goto('./#/settings');
  await page.locator('.settings-row', { hasText: '深色' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(11, 15, 26)');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('PWA 基础：manifest 可解析、SW 已注册、无控制台报错', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('./');
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
    const res = await fetch(link.href);
    return res.json() as Promise<{ display: string; start_url: string; scope: string }>;
  });
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/financial-return-calculator/');
  expect(manifest.scope).toBe('/financial-return-calculator/');

  await page.waitForFunction(
    () => navigator.serviceWorker.getRegistrations().then((r) => r.length > 0),
    null,
    { timeout: 20_000 },
  );
  const scopes = await page.evaluate(() =>
    navigator.serviceWorker.getRegistrations().then((r) => r.map((x) => x.scope)),
  );
  // 不写死地址：同一套测试要能跑在本地预览与线上部署上
  const expectedScope = new URL('.', page.url().split('#')[0]).href;
  expect(scopes).toEqual([expectedScope]);

  expect(errors).toEqual([]);
});

/**
 * 离线能力的前置条件（确定性）。
 *
 * 这里**只**断言"离线需要的东西都已经被缓存"，不做真实的断网重载 ——
 * headless Chrome 下 Playwright 的 setOffline 与 Service Worker 组合不稳定，
 * 实测约 40% 的失败率且 3 次重试都不通过。留一个随机变红的测试比没有测试更糟，
 * 所以真实离线行为改为真机/手工验收（见 README 的验收清单）。
 */
test('离线前置条件：SW 已接管，且 shell 与构建产物都进了缓存', async ({ page }) => {
  await page.goto('./');

  await page.waitForFunction(
    () => navigator.serviceWorker.getRegistrations().then((r) => r.length > 0),
    null,
    { timeout: 20_000 },
  );
  if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null))) {
    await page.reload();
  }
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 20_000,
  });

  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cache = await caches.open(keys[0]);
    return (await cache.keys()).map((r) => r.url);
  });

  expect(cached.some((u) => u.endsWith('/index.html')), 'index.html 未入缓存').toBe(true);
  expect(cached.some((u) => u.endsWith('.js')), 'JS 构建产物未入缓存').toBe(true);
  expect(cached.some((u) => u.endsWith('.css')), 'CSS 构建产物未入缓存').toBe(true);
  expect(cached.some((u) => u.endsWith('manifest.webmanifest')), 'manifest 未入缓存').toBe(true);
  // 缓存名带构建号：产物一变缓存就作废，避免旧 shell 引用已删除的资源
  expect(await page.evaluate(() => caches.keys())).toHaveLength(1);
});

test('不发任何网络请求（零联网承诺）', async ({ page }) => {
  const external: string[] = [];
  const failed: string[] = [];
  // 用「页面自身的 origin」作基准，这样本地预览和线上部署都能跑
  let selfOrigin = '';
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (!selfOrigin) return; // 第一个请求就是页面本身，等它确定 origin
    if (url.origin !== selfOrigin) external.push(r.url());
  });
  page.on('requestfailed', (r) => failed.push(r.url()));

  await page.goto('./');
  selfOrigin = new URL(page.url()).origin;
  await focusRow(page, '买入金额');
  await typeNumber(page, '40125.71');
  await focusRow(page, '持有收益');
  await typeNumber(page, '429.60');
  await focusRow(page, '持有天数');
  await typeNumber(page, '191');
  await page.getByRole('button', { name: '保存到记录' }).click();
  await page.waitForTimeout(500);

  expect(external, `出现了外部请求: ${external.join(', ')}`).toEqual([]);
  expect(failed, `有请求失败: ${failed.join(', ')}`).toEqual([]);
});
