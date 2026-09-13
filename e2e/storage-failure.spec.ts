import { test, expect, type Page } from '@playwright/test';

/**
 * 存储不可用时的降级行为。
 *
 * IndexedDB 会失败：Safari 无痕模式、存储配额耗尽、用户禁用存储、企业策略……
 * 失败时必须**明确告诉用户**，而不是：
 *   - 抛出未处理的 Promise 异常（用户点保存毫无反应）
 *   - 把记录页显示成"暂无记录"（用户以为记录丢了）
 */

async function breakIndexedDb(page: Page) {
  await page.addInitScript(() => {
    // 让 open() 直接抛错，模拟存储不可用
    const orig = indexedDB.open.bind(indexedDB);
    void orig;
    Object.defineProperty(indexedDB, 'open', {
      configurable: true,
      value: () => {
        throw new DOMException('storage disabled', 'SecurityError');
      },
    });
  });
}

async function keypad(page: Page, key: string) {
  await page.locator(`.keypad button[data-key="${key}"]`).click();
}
async function typeNumber(page: Page, value: string) {
  for (const ch of value) await keypad(page, ch);
  await keypad(page, 'DONE');
}
async function focusRow(page: Page, label: string) {
  await page
    .locator('.field', { has: page.locator('.field-label', { hasText: label }) })
    .locator('.field-row')
    .click();
}

test('存储不可用时：计算照常，保存给出明确失败提示，且没有未处理异常', async ({ page }) => {
  const unhandled: string[] = [];
  page.on('pageerror', (e) => unhandled.push(String(e)));

  await breakIndexedDb(page);
  await page.goto('./');

  // 计算功能不依赖存储，必须照常工作
  await focusRow(page, '买入金额');
  await typeNumber(page, '40125.71');
  await focusRow(page, '持有收益');
  await typeNumber(page, '429.60');
  await focusRow(page, '持有天数');
  await typeNumber(page, '191');
  await expect(page.locator('.result-primary')).toHaveText('+2.05%');

  // 保存必须给出明确失败提示
  await page.getByRole('button', { name: '保存到记录' }).click();
  await expect(page.locator('.snackbar')).toContainText('保存失败', { timeout: 5000 });

  expect(unhandled, `出现了未处理异常：${unhandled.join(' | ')}`).toEqual([]);
});

test('存储不可用时：记录页显示错误态，而不是误导性的「暂无记录」', async ({ page }) => {
  await breakIndexedDb(page);
  await page.goto('./#/records');
  await page.waitForTimeout(600);

  await expect(page.locator('.empty')).toContainText('存储');
  await expect(page.locator('.empty')).not.toContainText('还没有记录');
});
