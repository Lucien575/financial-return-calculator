import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { calculate } from '../src/core/annualized-calculator';
import type { CalcOutcome } from '../src/core/calc-models';

/**
 * 与原网页实现的逐位比对。
 *
 * 期望值不是手算的，而是把存档的原版 HTML 放进无头 Chrome，
 * 真实调用它自己的 calculateMethod1 / calculateMethod2 后从 DOM 抓下来的。
 * 同一份 JSON 也被安卓版的 OriginalWebParityTest 使用 —— 这是
 * 「安卓和 iPhone 算出来一模一样」的唯一可验证保障。
 */

const here = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = resolve(here, '../docs/reference/golden-values.json');

interface AmountCase {
  buy: string;
  earn: string;
  days: string;
  currentTotal: string;
  returnRate: string;
  annual: string;
  compound: string;
  daysText: string;
}
interface NavCase {
  buyNav: string;
  currentNav: string;
  days: string;
  buyNavText: string;
  currentNavText: string;
  returnRate: string;
  annual: string;
  daysText: string;
}
interface Golden {
  amount: AmountCase[];
  nav: NavCase[];
}

const golden: Golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf-8'));

function metric(outcome: CalcOutcome, label: string): string {
  if (!outcome.ok) throw new Error(`预期算出结果，实际校验失败: ${outcome.error}`);
  const m = outcome.result.metrics.find((x) => x.label === label);
  if (!m) throw new Error(`找不到指标「${label}」`);
  return m.value;
}

describe('原网页黄金值比对', () => {
  it('fixture 覆盖两个算法且数量足够', () => {
    expect(golden.amount.length).toBeGreaterThanOrEqual(9);
    expect(golden.nav.length).toBeGreaterThanOrEqual(6);
  });

  it.each(golden.amount)(
    '金额法 $buy / $earn / $days 天 逐格一致',
    (c) => {
      const outcome = calculate({
        kind: 'amount',
        buyAmount: c.buy,
        earnAmount: c.earn,
        buyDate: null,
        currentDate: null,
        daysInput: c.days,
      });
      const where = ` [金额法 买入=${c.buy} 收益=${c.earn} 天数=${c.days}]`;

      expect(metric(outcome, '当前总额'), `当前总额${where}`).toBe(c.currentTotal);
      expect(metric(outcome, '区间收益率'), `区间收益率${where}`).toBe(c.returnRate);
      expect(metric(outcome, '持有天数'), `持有天数${where}`).toBe(c.daysText);
      if (!outcome.ok) throw new Error('unreachable');
      expect(outcome.result.primaryAnnual, `折合年化${where}`).toBe(c.annual);
      expect(outcome.result.compoundAnnual, `复利年化${where}`).toBe(c.compound);
    },
  );

  it.each(golden.nav)(
    '净值法 $buyNav → $currentNav / $days 天 逐格一致',
    (c) => {
      const outcome = calculate({
        kind: 'nav',
        buyNav: c.buyNav,
        currentNav: c.currentNav,
        buyDate: null,
        currentDate: null,
        daysInput: c.days,
      });
      const where = ` [净值法 买入=${c.buyNav} 当前=${c.currentNav} 天数=${c.days}]`;

      expect(metric(outcome, '买入净值'), `买入净值展示${where}`).toBe(c.buyNavText);
      expect(metric(outcome, '当前净值'), `当前净值展示${where}`).toBe(c.currentNavText);
      expect(metric(outcome, '区间收益率'), `区间收益率${where}`).toBe(c.returnRate);
      expect(metric(outcome, '持有天数'), `持有天数${where}`).toBe(c.daysText);
      if (!outcome.ok) throw new Error('unreachable');
      expect(outcome.result.primaryAnnual, `折合年化${where}`).toBe(c.annual);
    },
  );
});
