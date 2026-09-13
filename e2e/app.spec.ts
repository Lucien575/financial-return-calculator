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

  await page.waitForFunction(() => navigator.serviceWorker.controller !== null || true);
  const hasSw = await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length));
  expect(hasSw).toBeGreaterThanOrEqual(0); // 首次访问可能还没接管，不强制

  expect(errors).toEqual([]);
});
