import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

/**
 * 多尺寸适配。
 *
 * 之前只测过 Pixel 7（412×915）一个视口，320dp 小屏与横屏完全没验证过。
 * 这里覆盖从小屏到横屏，并检查最常见的两类布局事故：
 * 横向溢出、以及数字键盘把内容挤出屏幕。
 */

const SIZES = [
  { name: '320dp 小屏', width: 320, height: 568 },
  { name: '360dp X200s', width: 360, height: 800 },
  { name: '412dp Pixel7', width: 412, height: 915 },
  { name: '横屏', width: 800, height: 360 },
];

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

/** 有没有元素撑出视口宽度 */
async function horizontalOverflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
      if (r.right > vw + 1 || r.left < -1) {
        bad.push(`${el.tagName}.${(el.className || '-').toString().slice(0, 24)} right=${Math.round(r.right)} vw=${vw}`);
      }
    }
    return bad.slice(0, 5);
  });
}

for (const size of SIZES) {
  test(`${size.name} ${size.width}×${size.height}：无横向溢出，键盘可用`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('./');

    // 首页
    expect(await horizontalOverflow(page), `${size.name} 首页横向溢出`).toEqual([]);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.segmented')).toBeVisible();
    await expect(page.locator('.bottom-nav')).toBeVisible();

    // 输入并出结果
    await focusRow(page, '买入金额');
    await typeNumber(page, '40125.71');
    await focusRow(page, '持有收益');
    await typeNumber(page, '429.60');
    await focusRow(page, '持有天数');
    await typeNumber(page, '191');
    await expect(page.locator('.result-primary')).toHaveText('+2.05%');
    expect(await horizontalOverflow(page), `${size.name} 结果态横向溢出`).toEqual([]);

    // 键盘展开：四个按键必须都在视口内且真的能点
    await focusRow(page, '买入金额');
    const keypadBox = await page.locator('.keypad').boundingBox();
    expect(keypadBox, '键盘不可见').toBeTruthy();
    expect(keypadBox!.y + keypadBox!.height).toBeLessThanOrEqual(size.height + 1);
    for (const k of ['0', '.', '±', 'DONE']) {
      const box = await page.locator(`.keypad button[data-key="${k}"]`).boundingBox();
      expect(box, `按键 ${k} 不可见`).toBeTruthy();
      expect(box!.y + box!.height, `按键 ${k} 超出视口底部`).toBeLessThanOrEqual(size.height + 1);
    }
    expect(await horizontalOverflow(page), `${size.name} 键盘展开横向溢出`).toEqual([]);

    // 关键：正在编辑的那一行必须仍可见 —— 横屏/矮屏下键盘会占掉大半屏幕，
    // 之前只查"没有横向溢出"，漏掉了"用户看不见自己在输什么"这个更严重的问题
    const activeRow = page.locator('.field-row.is-active, .field', {
      has: page.locator('.field-divider.is-active'),
    });
    await page.waitForTimeout(150); // 等一帧布局完成
    const rowBox = await activeRow.first().boundingBox();
    expect(rowBox, `${size.name} 找不到当前编辑的行`).toBeTruthy();
    expect(rowBox!.y, `${size.name} 当前编辑行被顶出视口上方`).toBeGreaterThanOrEqual(0);
    expect(
      rowBox!.y + rowBox!.height,
      `${size.name} 当前编辑行被键盘遮住`,
    ).toBeLessThanOrEqual(keypadBox!.y + 1);

    const shot = process.env.SHOT_DIR;
    if (shot) {
      writeFileSync(
        `${shot}/responsive-${size.width}x${size.height}.png`,
        await page.screenshot(),
      );
    }
  });
}

test('320dp 小屏 + 系统字体放大到 200% 仍不横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('./');
  // 浏览器级别的字号放大（模拟系统大字体）
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await page.waitForTimeout(200);

  await expect(page.locator('h1')).toBeVisible();
  // 字号放大下允许文字换行撑高，但仍不允许横向溢出
  expect(await horizontalOverflow(page), '字号 200% 时横向溢出').toEqual([]);
});
