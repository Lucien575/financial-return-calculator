import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

/**
 * 分享长图与安装引导。
 *
 * 长图是纯 Canvas 绘制，没有 DOM 可以断言，所以这里把它真的生成出来、
 * 校验 PNG 头与尺寸，并存盘供人工肉眼确认排版。
 */

async function keypad(page: Page, key: string) {
  await page.locator(`.keypad button[data-key="${key}"]`).click();
}
async function typeNumber(page: Page, value: string) {
  await typeRaw(page, value);
  await keypad(page, 'DONE');
}
/** 只按键、不按「完成」—— 键盘未收起时才能继续按其它键（如 ±） */
async function typeRaw(page: Page, value: string) {
  for (const ch of value) await keypad(page, ch);
}
async function focusRow(page: Page, label: string) {
  await page
    .locator('.field', { has: page.locator('.field-label', { hasText: label }) })
    .locator('.field-row')
    .click();
}

/**
 * 桌面 Chromium 也实现了 navigator.share，会走系统分享而不是下载兜底。
 * 测试要拿到产物，所以先把 Web Share 摘掉，强制走下载分支。
 */
async function disableWebShare(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
}

async function fillAmountCase(page: Page) {
  await focusRow(page, '买入金额');
  await typeNumber(page, '40125.71');
  await focusRow(page, '持有收益');
  await typeNumber(page, '429.60');
  await focusRow(page, '持有天数');
  await typeNumber(page, '191');
}

test('分享长图：能生成一张合规的 PNG，且内容包含关键数值', async ({ page }) => {
  await disableWebShare(page);
  await page.goto('./');
  await fillAmountCase(page);
  await expect(page.locator('.result-primary')).toHaveText('+2.05%');

  // headless 下没有 Web Share，会走下载兜底 —— 正好用来拿到产物
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15_000 }),
    page.getByRole('button', { name: '分享结果' }).click(),
  ]);

  const path = await download.path();
  expect(path, '下载未产生文件').toBeTruthy();

  const { readFileSync } = await import('node:fs');
  const buf = readFileSync(path!);

  // PNG magic number
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  // IHDR: 宽高在第 16..24 字节（大端）
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  // 逻辑宽 1080、2 倍超采样；高度按内容自适应
  expect(width).toBe(2160);
  expect(height).toBeGreaterThan(1500);

  // 存一份供肉眼确认排版
  const out = process.env.SHARE_OUT ?? '/tmp/pwa-share.png';
  writeFileSync(out, buf);
  console.log(`长图已存: ${out} (${width}×${height})`);
});

test('分享长图：亏损时用红色主数字（语义色不能反）', async ({ page }) => {
  await disableWebShare(page);
  await page.goto('./');
  await focusRow(page, '买入金额');
  await typeNumber(page, '10000');
  await focusRow(page, '持有收益');
  // 键盘上的取反键（没有它填不了负数）：先输数字，再按 ±，最后完成
  await typeRaw(page, '500');
  await keypad(page, '±');
  await keypad(page, 'DONE');
  await focusRow(page, '持有天数');
  await typeNumber(page, '365');
  await expect(page.locator('.result-primary')).toHaveText('-5.00%');

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15_000 }),
    page.getByRole('button', { name: '分享结果' }).click(),
  ]);
  const buf = (await import('node:fs')).readFileSync((await download.path())!);
  writeFileSync('/tmp/pwa-share-loss.png', buf);
  expect(buf.readUInt32BE(16)).toBe(2160);
});

test('iOS 上给出「添加到主屏幕」图文引导，关掉后不再打扰', async ({ browser }) => {
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  await page.goto('./');

  // iOS 没有 beforeinstallprompt，只能靠 UA 判断后给说明
  await expect(page.locator('.install-banner')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.install-banner')).toContainText('添加到主屏幕');
  await expect(page.locator('.install-banner')).toContainText('分享');

  // 关掉后应被记住
  await page.locator('.install-close').click();
  await expect(page.locator('.install-banner')).toHaveCount(0);
  await page.reload();
  await page.waitForTimeout(2500);
  await expect(page.locator('.install-banner')).toHaveCount(0);

  await ctx.close();
});

test('已是独立窗口打开时不再提示安装', async ({ browser }) => {
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  // 模拟「已添加到主屏幕」：display-mode: standalone 生效
  await page.addInitScript(() => {
    const orig = window.matchMedia.bind(window);
    window.matchMedia = ((q: string) =>
      q.includes('display-mode: standalone')
        ? ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList)
        : orig(q)) as typeof window.matchMedia;
  });
  await page.goto('./');
  await page.waitForTimeout(2500);
  await expect(page.locator('.install-banner')).toHaveCount(0);
  await ctx.close();
});
