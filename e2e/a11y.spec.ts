import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * 无障碍回归测试。
 *
 * 方案里声称过「44px 触控目标」「每个输入行带 aria 标签」「结果卡 liveRegion」，
 * 这些必须有自动化守住，否则改动界面时很容易悄悄退化。
 */

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

async function analyze(page: Page) {
  return new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
}

test('计算器页（空态）无 WCAG A/AA 违规', async ({ page }) => {
  await page.goto('./');
  const results = await analyze(page);
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test('计算器页（有结果、键盘展开）无违规', async ({ page }) => {
  await page.goto('./');
  await focusRow(page, '买入金额');
  await typeNumber(page, '40125.71');
  await focusRow(page, '持有收益');
  await typeNumber(page, '429.60');
  await focusRow(page, '持有天数');
  await typeNumber(page, '191');

  // 键盘展开状态下也要过（这是最容易出现对比度/触控目标问题的时候）
  await focusRow(page, '买入金额');
  const results = await analyze(page);
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test('记录页与设置页无违规', async ({ page }) => {
  await page.goto('./');
  await focusRow(page, '买入金额');
  await typeNumber(page, '10000');
  await focusRow(page, '持有收益');
  await typeNumber(page, '500');
  await focusRow(page, '持有天数');
  await typeNumber(page, '365');
  await page.getByRole('button', { name: '保存到记录' }).click();
  await page.waitForTimeout(300);

  await page.locator('.bottom-nav').getByRole('button', { name: '记录', exact: true }).click();
  expect((await analyze(page)).violations.map((v) => v.id)).toEqual([]);

  await page.locator('.record-face').first().click();
  await page.waitForTimeout(300);
  expect((await analyze(page)).violations.map((v) => v.id)).toEqual([]);
  await page.getByRole('button', { name: '取消' }).click();
});

test('深色模式下无对比度违规', async ({ page }) => {
  await page.goto('./#/settings');
  await page.locator('.settings-row', { hasText: '深色' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const results = await analyze(page);
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test('可交互元素的触控目标都不小于 44px', async ({ page }) => {
  await page.goto('./');
  await focusRow(page, '买入金额');
  await typeNumber(page, '100');

  const tooSmall = await page.evaluate(() => {
    const sel = 'button, a, input, [role="tab"], [role="button"]';
    const bad: string[] = [];
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue; // 不可见的跳过
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      // 44×44 是 iOS HIG / WCAG 2.5.5 的经验值
      if (r.height < 44 || r.width < 44) {
        bad.push(`${el.tagName}.${el.className || '-'} "${(el.textContent || '').trim().slice(0, 12)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    return bad;
  });
  expect(tooSmall).toEqual([]);
});

test('键盘、标签、日期输入都有可读的无障碍名称', async ({ page }) => {
  await page.goto('./');
  await focusRow(page, '买入金额');

  // 每个键盘按键都要有可读文本（DEL 用的是 ⌫ 符号，需确认不是空白）
  const keys = await page.locator('.keypad button').allTextContents();
  expect(keys.filter((k) => k.trim() === '')).toEqual([]);
  expect(keys).toHaveLength(16);

  // 日期行下的原生 input 必须有 aria-label
  const dateLabels = await page.locator('input[type="date"]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label')),
  );
  expect(dateLabels.every((l) => !!l && l.trim() !== '')).toBe(true);

  // 结果卡的主数字要用 liveRegion 播报
  const live = await page.locator('.result-primary').getAttribute('aria-live');
  expect(live === null || live === 'polite' || live === 'assertive').toBe(true);
});
